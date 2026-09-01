import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Safaricom Daraja SANDBOX endpoints (not live)
const DARAJA_SANDBOX_AUTH_URL =
  "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials";
const DARAJA_SANDBOX_STK_URL =
  "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest";

type StkPaymentRow = {
  id: string;
  phone_number: string;
  amount: number;
  status: string;
};

function normalizePhone(input: string): string | null {
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("254")) {
    digits = digits.slice(3);
  } else if (digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  if (/^7\d{8}$/.test(digits)) {
    return `254${digits}`;
  }
  return null;
}

function timestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  );
}

function buildPassword(shortcode: string, passkey: string, ts: string): string {
  return btoa(`${shortcode}${passkey}${ts}`);
}

async function getSandboxToken(consumerKey: string, consumerSecret: string): Promise<string> {
  const auth = btoa(`${consumerKey}:${consumerSecret}`);
  const res = await fetch(DARAJA_SANDBOX_AUTH_URL, {
    method: "GET",
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) {
    throw new Error(`Daraja sandbox OAuth failed (${res.status})`);
  }
  const data = await res.json();
  return data.access_token as string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // Sandbox credentials (distinct from the live MPESA_* secrets used by mpesa-withdraw)
  const consumerKey = Deno.env.get("MPESA_SANDBOX_CONSUMER_KEY");
  const consumerSecret = Deno.env.get("MPESA_SANDBOX_CONSUMER_SECRET");
  const passkey = Deno.env.get("MPESA_SANDBOX_PASSKEY");
  const shortcode = Deno.env.get("MPESA_SANDBOX_SHORTCODE");

  if (!consumerKey || !consumerSecret || !passkey || !shortcode) {
    return new Response(
      JSON.stringify({ error: "Missing required M-Pesa sandbox credentials in environment secrets." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  try {
    const body = await req.json();

    // Safaricom callbacks arrive as { Body: { stkCallback: { ... } } } with no
    // "mode" field. Detect that shape BEFORE checking mode, otherwise the
    // callback falls through to the "invalid mode" branch and the payment
    // stays pending forever.
    const isCallback = !!body?.Body?.stkCallback;

    // ------------------------------------------------------------------
    // CALLBACK — Safaricom calls this with the final payment result
    // ------------------------------------------------------------------
    if (isCallback || body.mode === "callback") {
      const callback = body.Body.stkCallback;
      const checkoutRequestId = callback.CheckoutRequestID;
      const resultCode = callback.ResultCode;
      const resultDesc = callback.ResultDesc;

      // Find the matching payment row
      const { data: payment } = await supabase
        .from("mpesa_payments")
        .select("id, phone_number, amount, status")
        .eq("checkout_request_id", checkoutRequestId)
        .maybeSingle();

      if (!payment) {
        // Safaricom still expects a 200 even if we can't find the row
        return new Response(
          JSON.stringify({ received: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const p = payment as StkPaymentRow;

      if (p.status !== "pending") {
        // Already processed (duplicate callback) — acknowledge and exit.
        // This also prevents a duplicate from reverting a completed payment.
        return new Response(
          JSON.stringify({ received: true, already_processed: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Success: ResultCode 0 means the customer completed the payment
      if (resultCode === 0) {
        // Extract the M-Pesa receipt number from the callback metadata
        const metadata = callback.CallbackMetadata?.Item || [];
        const receiptItem = metadata.find((it: { Name: string }) => it.Name === "MpesaReceiptNumber");
        const receipt = receiptItem?.Value || "";

        await supabase
          .from("mpesa_payments")
          .update({
            status: "completed",
            mpesa_receipt: receipt,
            completed_at: new Date().toISOString(),
          })
          .eq("id", p.id);

        return new Response(
          JSON.stringify({ received: true, status: "completed" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Any non-zero ResultCode is a failure (timeout, cancelled, wrong PIN, etc.)
      await supabase
        .from("mpesa_payments")
        .update({
          status: "failed",
          failure_reason: resultDesc || `ResultCode ${resultCode}`,
          completed_at: new Date().toISOString(),
        })
        .eq("id", p.id);

      return new Response(
        JSON.stringify({ received: true, status: "failed" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ------------------------------------------------------------------
    // STK — initiate an STK Push prompt to the customer's phone
    // ------------------------------------------------------------------
    if (body.mode === "stk" || !body.mode) {
      const { amount, phone_number } = body;

      if (!amount || !phone_number) {
        return new Response(
          JSON.stringify({ error: "Missing amount or phone_number" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Normalize common Kenyan formats (0712…, +254712…, 254712…) to 2547XXXXXXXX
      const normalizedPhone = normalizePhone(phone_number);
      if (!normalizedPhone) {
        return new Response(
          JSON.stringify({ error: "Invalid M-Pesa phone number. Use format 2547XXXXXXXX." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // M-Pesa only accepts whole shillings; reject fractional amounts so the
      // stored amount always matches what the customer is actually charged.
      const numericAmount = Number(amount);
      if (!Number.isFinite(numericAmount) || numericAmount <= 0 || !Number.isInteger(numericAmount)) {
        return new Response(
          JSON.stringify({ error: "Amount must be a positive whole number (in KES)." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 1. Insert a pending payment row so we can reconcile it in the callback
      const { data: paymentRow, error: insertError } = await supabase
        .from("mpesa_payments")
        .insert({
          phone_number: normalizedPhone,
          amount: numericAmount,
          status: "pending",
        })
        .select("id")
        .single();

      if (insertError || !paymentRow) {
        return new Response(
          JSON.stringify({ error: "Failed to create payment record." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 2. Get sandbox OAuth token
      let token: string;
      try {
        token = await getSandboxToken(consumerKey, consumerSecret);
      } catch (err) {
        await supabase
          .from("mpesa_payments")
          .update({ status: "failed", failure_reason: (err as Error).message })
          .eq("id", paymentRow.id);
        return new Response(
          JSON.stringify({ error: "Failed to authenticate with M-Pesa sandbox." }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 3. Build and send the STK Push request
      const ts = timestamp();
      const password = buildPassword(shortcode, passkey, ts);
      const callbackUrl = `${supabaseUrl}/functions/v1/mpesa-stk-push`;

      const stkPayload = {
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: ts,
        TransactionType: "CustomerPayBillOnline",
        Amount: numericAmount,
        PartyA: normalizedPhone,
        PartyB: shortcode,
        PhoneNumber: normalizedPhone,
        CallBackURL: callbackUrl,
        AccountReference: `PAY-${paymentRow.id.slice(0, 8)}`,
        TransactionDesc: "Customer payment",
      };

      // Wrap the network call so a throw (timeout, DNS, non-JSON body) marks
      // the payment failed instead of leaving it pending forever.
      let stkData: { ResponseCode?: string; errorMessage?: string; ResponseDescription?: string; MerchantRequestID?: string; CheckoutRequestID?: string };
      try {
        const stkRes = await fetch(DARAJA_SANDBOX_STK_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(stkPayload),
        });

        stkData = await stkRes.json();

        if (!stkRes.ok || stkData.ResponseCode !== "0") {
          const reason = stkData.errorMessage || stkData.ResponseDescription || `HTTP ${stkRes.status}`;
          await supabase
            .from("mpesa_payments")
            .update({ status: "failed", failure_reason: `STK Push failed: ${reason}` })
            .eq("id", paymentRow.id);
          return new Response(
            JSON.stringify({ error: `STK Push request failed: ${reason}` }),
            { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } catch (err) {
        await supabase
          .from("mpesa_payments")
          .update({ status: "failed", failure_reason: `STK Push request error: ${(err as Error).message}` })
          .eq("id", paymentRow.id);
        return new Response(
          JSON.stringify({ error: "STK Push request failed due to a network error." }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 4. Store the request IDs so the callback can reconcile
      const merchantRequestId = stkData.MerchantRequestID;
      const checkoutRequestId = stkData.CheckoutRequestID;

      await supabase
        .from("mpesa_payments")
        .update({ merchant_request_id: merchantRequestId, checkout_request_id: checkoutRequestId })
        .eq("id", paymentRow.id);

      return new Response(
        JSON.stringify({
          success: true,
          payment_id: paymentRow.id,
          merchant_request_id: merchantRequestId,
          checkout_request_id: checkoutRequestId,
          message: "STK Push sent. Check your phone to enter your M-Pesa PIN.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid mode. Use 'stk' or 'callback'." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
