import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const DARAJA_AUTH_URL =
  "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials";

const DARAJA_B2C_URL =
  "https://sandbox.safaricom.co.ke/mpesa/b2c/v1/paymentrequest";

type WithdrawalRow = {
  id: string;
  user_id: string;
  amount: number;
  phone_number: string;
  status: string;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }

  try {
    // --------------------------------------------------
    // 1. Check M-Pesa secrets
    // --------------------------------------------------

    const consumerKey = Deno.env.get("MPESA_CONSUMER_KEY");
    const consumerSecret = Deno.env.get("MPESA_CONSUMER_SECRET");
    const shortcode = Deno.env.get("MPESA_SHORTCODE");
    const initiatorName = Deno.env.get("MPESA_INITIATOR_NAME");
    const securityCredential = Deno.env.get("MPESA_SECURITY_CREDENTIAL");
    const usdToKesRate = Deno.env.get("MPESA_USD_TO_KES_RATE");

    if (
      !consumerKey ||
      !consumerSecret ||
      !shortcode ||
      !initiatorName ||
      !securityCredential ||
      !usdToKesRate
    ) {
      return new Response(
        JSON.stringify({
          error: "Missing required M-Pesa configuration.",
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const rate = Number(usdToKesRate);

    if (!Number.isFinite(rate) || rate <= 0) {
      return new Response(
        JSON.stringify({
          error: "Invalid MPESA_USD_TO_KES_RATE.",
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    // --------------------------------------------------
    // 2. Verify logged-in user
    // --------------------------------------------------

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      return new Response(
        JSON.stringify({
          error: "Missing Authorization header.",
        }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      auth: {
        persistSession: false,
      },
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({
          error: "Unauthorized.",
        }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    // Service-role client for server-side database operations
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
      },
    });

    // --------------------------------------------------
    // 3. Get withdrawal ID
    // --------------------------------------------------

    const body = await req.json();
    const withdrawalId = body.withdrawal_id;

    if (!withdrawalId) {
      return new Response(
        JSON.stringify({
          error: "Missing withdrawal_id.",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    // --------------------------------------------------
    // 4. Get withdrawal
    // --------------------------------------------------

    const { data: withdrawal, error: withdrawalError } =
      await supabase
        .from("withdrawals")
        .select(
          "id, user_id, amount, phone_number, status",
        )
        .eq("id", withdrawalId)
        .single();

    if (withdrawalError || !withdrawal) {
      return new Response(
        JSON.stringify({
          error: "Withdrawal not found.",
        }),
        {
          status: 404,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const w = withdrawal as WithdrawalRow;

    // Make sure this withdrawal belongs to the logged-in user
    if (w.user_id !== user.id) {
      return new Response(
        JSON.stringify({
          error: "You are not authorized to process this withdrawal.",
        }),
        {
          status: 403,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    if (w.status !== "pending") {
      return new Response(
        JSON.stringify({
          error: `Withdrawal cannot be processed. Current status: ${w.status}`,
        }),
        {
          status: 409,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    // --------------------------------------------------
    // 5. Lock withdrawal by changing pending -> processing
    // --------------------------------------------------

    const { data: locked, error: lockError } =
      await supabase
        .from("withdrawals")
        .update({
          status: "processing",
        })
        .eq("id", w.id)
        .eq("status", "pending")
        .select("id")
        .single();

    if (lockError || !locked) {
      return new Response(
        JSON.stringify({
          error: "Withdrawal is already being processed.",
        }),
        {
          status: 409,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    // --------------------------------------------------
    // 6. Check available USD balance
    // --------------------------------------------------

    const { data: balance, error: balanceError } =
      await supabase.rpc("get_available_balance", {
        p_user_id: w.user_id,
      });

    if (balanceError) {
      await supabase
        .from("withdrawals")
        .update({
          status: "failed",
          failure_reason: "Balance check failed.",
          processed_at: new Date().toISOString(),
        })
        .eq("id", w.id);

      return new Response(
        JSON.stringify({
          error: "Failed to verify balance.",
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const availableBalance = Number(balance);

    // The database function includes this withdrawal
    // because it is now in processing status.
    if (
      !Number.isFinite(availableBalance) ||
      availableBalance < 0
    ) {
      await supabase
        .from("withdrawals")
        .update({
          status: "failed",
          failure_reason: "Insufficient available balance.",
          processed_at: new Date().toISOString(),
        })
        .eq("id", w.id);

      return new Response(
        JSON.stringify({
          error: "Insufficient available balance.",
          available_balance: availableBalance,
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    // --------------------------------------------------
    // 7. Validate Kenyan M-Pesa phone number
    // --------------------------------------------------

    if (!/^254\d{9}$/.test(w.phone_number)) {
      await supabase
        .from("withdrawals")
        .update({
          status: "failed",
          failure_reason: "Invalid M-Pesa phone number format.",
          processed_at: new Date().toISOString(),
        })
        .eq("id", w.id);

      return new Response(
        JSON.stringify({
          error:
            "Invalid M-Pesa phone number. Use format 2547XXXXXXXX.",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    // --------------------------------------------------
    // 8. Convert USD -> KES
    // --------------------------------------------------

    const usdAmount = Number(w.amount);
    const kesAmount = Math.round(usdAmount * rate);

    if (!Number.isFinite(kesAmount) || kesAmount <= 0) {
      await supabase
        .from("withdrawals")
        .update({
          status: "failed",
          failure_reason: "Invalid withdrawal amount.",
          processed_at: new Date().toISOString(),
        })
        .eq("id", w.id);

      return new Response(
        JSON.stringify({
          error: "Invalid withdrawal amount.",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    // --------------------------------------------------
    // 9. Get Daraja access token
    // --------------------------------------------------

    const basicAuth = btoa(
      `${consumerKey}:${consumerSecret}`,
    );

    const authResponse = await fetch(DARAJA_AUTH_URL, {
      method: "GET",
      headers: {
        Authorization: `Basic ${basicAuth}`,
      },
    });

    const authText = await authResponse.text();

    let authData: any;

    try {
      authData = JSON.parse(authText);
    } catch {
      authData = {};
    }

    if (!authResponse.ok || !authData.access_token) {
      await supabase
        .from("withdrawals")
        .update({
          status: "failed",
          failure_reason:
            `M-Pesa authentication failed (${authResponse.status}).`,
          processed_at: new Date().toISOString(),
        })
        .eq("id", w.id);

      return new Response(
        JSON.stringify({
          error: "Failed to authenticate with M-Pesa Sandbox.",
        }),
        {
          status: 502,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const accessToken = authData.access_token;

    // --------------------------------------------------
    // 10. Send B2C request
    // --------------------------------------------------

    const callbackUrl =
      `${supabaseUrl}/functions/v1/mpesa-withdraw-callback`;

    const b2cPayload = {
      InitiatorName: initiatorName,
      SecurityCredential: securityCredential,
      CommandID: "BusinessPayment",
      Amount: kesAmount,
      PartyA: shortcode,
      PartyB: w.phone_number,
      Remarks: `Withdrawal ${w.id}`,
      QueueTimeOutURL: callbackUrl,
      ResultURL: callbackUrl,
      Occasion: "Withdrawal",
    };

    const b2cResponse = await fetch(DARAJA_B2C_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(b2cPayload),
    });

    const b2cText = await b2cResponse.text();

    let b2cData: any;

    try {
      b2cData = JSON.parse(b2cText);
    } catch {
      b2cData = {};
    }

    if (!b2cResponse.ok || b2cData.ResponseCode !== "0") {
      const reason =
        b2cData.errorMessage ||
        b2cData.ResponseDescription ||
        `HTTP ${b2cResponse.status}`;

      await supabase
        .from("withdrawals")
        .update({
          status: "failed",
          failure_reason: `M-Pesa B2C failed: ${reason}`,
          processed_at: new Date().toISOString(),
        })
        .eq("id", w.id);

      return new Response(
        JSON.stringify({
          error: `M-Pesa transfer failed: ${reason}`,
        }),
        {
          status: 502,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    // --------------------------------------------------
    // 11. Save the Safaricom conversation ID
    // --------------------------------------------------

    const conversationId =
      b2cData.OriginatorConversationID ||
      b2cData.ConversationID;

    if (!conversationId) {
      await supabase
        .from("withdrawals")
        .update({
          status: "failed",
          failure_reason:
            "M-Pesa accepted request but returned no conversation ID.",
          processed_at: new Date().toISOString(),
        })
        .eq("id", w.id);

      return new Response(
        JSON.stringify({
          error:
            "M-Pesa accepted the request but no conversation ID was returned.",
        }),
        {
          status: 502,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    // IMPORTANT:
    // Do NOT mark the withdrawal completed here.
    // Safaricom will call the callback after processing.
    const { error: updateError } = await supabase
      .from("withdrawals")
      .update({
        status: "processing",
        mpesa_reference: conversationId,
      })
      .eq("id", w.id);

    if (updateError) {
      return new Response(
        JSON.stringify({
          error:
            "M-Pesa accepted the request, but the withdrawal record could not be updated.",
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        withdrawal_id: w.id,
        status: "processing",
        usd_amount: usdAmount,
        exchange_rate: rate,
        kes_amount: kesAmount,
        phone_number: w.phone_number,
        message:
          "M-Pesa withdrawal request accepted. Waiting for Safaricom callback.",
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    console.error("Withdrawal error:", error);

    return new Response(
      JSON.stringify({
        error:
          error instanceof Error
            ? error.message
            : "Internal server error.",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
});