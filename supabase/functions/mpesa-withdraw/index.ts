import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

type WithdrawalRow = {
  id: string;
  user_id: string;
  amount: number;
  phone_number: string;
  status: string;
};

// Safaricom Daraja live production API endpoints
const DARAJA_AUTH_URL = "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials";
const DARAJA_B2C_URL = "https://api.safaricom.co.ke/mpesa/b2c/v1/paymentrequest";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // Runtime validation: ensure all required M-Pesa credentials are present
  const consumerKey = Deno.env.get("MPESA_CONSUMER_KEY");
  const consumerSecret = Deno.env.get("MPESA_CONSUMER_SECRET");
  const passkey = Deno.env.get("MPESA_PASSKEY");
  const shortcode = Deno.env.get("MPESA_SHORTCODE");

  if (!consumerKey || !consumerSecret || !passkey || !shortcode) {
    return new Response(
      JSON.stringify({ error: "Missing required M-Pesa API credentials in environment secrets." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const body = await req.json();
    const { withdrawal_id } = body;

    if (!withdrawal_id) {
      return new Response(
        JSON.stringify({ error: "Missing withdrawal_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Fetch the specific withdrawal (must be in 'pending' state)
    const { data: withdrawal, error: fetchError } = await supabase
      .from("withdrawals")
      .select("id, user_id, amount, phone_number, status")
      .eq("id", withdrawal_id)
      .single();

    if (fetchError || !withdrawal) {
      return new Response(
        JSON.stringify({ error: "Withdrawal not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const w = withdrawal as WithdrawalRow;

    if (w.status !== "pending") {
      return new Response(
        JSON.stringify({ error: `Withdrawal already processed (status: ${w.status})` }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Atomically mark as 'processing' so no duplicate can run concurrently
    const { data: locked, error: lockError } = await supabase
      .from("withdrawals")
      .update({ status: "processing" })
      .eq("id", w.id)
      .eq("status", "pending")
      .select("id")
      .single();

    if (lockError || !locked) {
      return new Response(
        JSON.stringify({ error: "Withdrawal is being processed by another request" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Verify sufficient balance atomically via database function
    const { data: balance, error: balanceError } = await supabase
      .rpc("get_available_balance", { p_user_id: w.user_id });

    if (balanceError) {
      await supabase
        .from("withdrawals")
        .update({ status: "failed", failure_reason: "Balance check failed", processed_at: new Date().toISOString() })
        .eq("id", w.id);
      return new Response(
        JSON.stringify({ error: "Failed to verify balance" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const availableAfterThis = Number(balance) + Number(w.amount);
    if (availableAfterThis < Number(w.amount)) {
      await supabase
        .from("withdrawals")
        .update({ status: "failed", failure_reason: "Insufficient available balance", processed_at: new Date().toISOString() })
        .eq("id", w.id);
      return new Response(
        JSON.stringify({ error: "Insufficient available balance" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Validate phone number format (Kenyan M-Pesa: 254 + 9 digits)
    if (!/^254\d{9}$/.test(w.phone_number)) {
      await supabase
        .from("withdrawals")
        .update({ status: "failed", failure_reason: "Invalid M-Pesa phone number format", processed_at: new Date().toISOString() })
        .eq("id", w.id);
      return new Response(
        JSON.stringify({ error: "Invalid M-Pesa phone number" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Get M-Pesa OAuth token from Safaricom Daraja production API
    const auth = btoa(`${consumerKey}:${consumerSecret}`);
    const oauthResponse = await fetch(DARAJA_AUTH_URL, {
      method: "GET",
      headers: { "Authorization": `Basic ${auth}` },
    });

    if (!oauthResponse.ok) {
      const errText = await oauthResponse.text();
      await supabase
        .from("withdrawals")
        .update({ status: "failed", failure_reason: `M-Pesa OAuth failed (${oauthResponse.status})`, processed_at: new Date().toISOString() })
        .eq("id", w.id);
      return new Response(
        JSON.stringify({ error: "Failed to authenticate with M-Pesa." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const oauthData = await oauthResponse.json();
    const accessToken: string = oauthData.access_token;

    // 6. Send the B2C payment to the writer's M-Pesa account via production API
    const b2cPayload = {
      InitiatorName: shortcode,
      SecurityCredential: passkey,
      CommandID: "BusinessPayment",
      Amount: Math.round(Number(w.amount)),
      PartyA: shortcode,
      PartyB: w.phone_number,
      Remarks: `Withdrawal ${w.id}`,
      QueueTimeOutURL: `${supabaseUrl}/functions/v1/mpesa-withdraw`,
      ResultURL: `${supabaseUrl}/functions/v1/mpesa-withdraw`,
      Occasion: "Withdrawal",
    };

    const b2cResponse = await fetch(DARAJA_B2C_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(b2cPayload),
    });

    const b2cData = await b2cResponse.json();

    if (!b2cResponse.ok || (b2cData.ResponseCode !== "0" && b2cData.ResponseDescription !== "Accept the service request successfully.")) {
      const failReason = b2cData.errorMessage || b2cData.ResponseDescription || `HTTP ${b2cResponse.status}`;
      await supabase
        .from("withdrawals")
        .update({ status: "failed", failure_reason: `M-Pesa B2C failed: ${failReason}`, processed_at: new Date().toISOString() })
        .eq("id", w.id);
      return new Response(
        JSON.stringify({ error: `M-Pesa transfer failed: ${failReason}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const mpesaReference = b2cData.OriginatorConversationID || `WRT${Date.now()}`;

    // 7. Mark withdrawal as completed with the M-Pesa reference
    const { error: completeError } = await supabase
      .from("withdrawals")
      .update({
        status: "completed",
        mpesa_reference: mpesaReference,
        processed_at: new Date().toISOString(),
      })
      .eq("id", w.id);

    if (completeError) {
      return new Response(
        JSON.stringify({ error: "M-Pesa transfer succeeded but record update failed. Contact support with reference: " + mpesaReference }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        withdrawal_id: w.id,
        status: "completed",
        amount: Number(w.amount),
        phone_number: w.phone_number,
        mpesa_reference: mpesaReference,
        message: `$${Number(w.amount).toFixed(2)} sent to M-Pesa ${w.phone_number}. Reference: ${mpesaReference}`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
