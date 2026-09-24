import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

type WithdrawalRow = {
  id: string;
  user_id: string;
  amount: number;
  phone_number: string;
  status: string;
};

/*
 * IMPORTANT:
 * This version is configured for DARaja SANDBOX.
 *
 * Flow:
 * Website -> this function -> Daraja B2C
 * Daraja -> this function (?callback=1)
 * Callback -> withdrawal becomes completed/failed
 */

const DARAJA_AUTH_URL =
  "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials";

const DARAJA_B2C_URL =
  "https://sandbox.safaricom.co.ke/mpesa/b2c/v1/paymentrequest";

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const consumerKey = Deno.env.get("MPESA_CONSUMER_KEY");
    const consumerSecret = Deno.env.get("MPESA_CONSUMER_SECRET");
    const shortcode = Deno.env.get("MPESA_SHORTCODE");

    // B2C uses these two credentials.
    const initiatorName = Deno.env.get("MPESA_INITIATOR_NAME");
    const securityCredential = Deno.env.get("MPESA_SECURITY_CREDENTIAL");

    if (
      !supabaseUrl ||
      !serviceRoleKey ||
      !consumerKey ||
      !consumerSecret ||
      !shortcode ||
      !initiatorName ||
      !securityCredential
    ) {
      return jsonResponse(
        {
          error:
            "Missing required M-Pesa or Supabase environment secrets.",
        },
        500
      );
    }

    const supabase = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
        },
      }
    );

    /*
     * ============================================================
     * SAFARICOM CALLBACK
     * ============================================================
     *
     * Safaricom calls this URL after processing the B2C request:
     *
     * /mpesa-withdraw?callback=1
     */

    const url = new URL(req.url);
    const isCallback = url.searchParams.get("callback") === "1";

    if (isCallback) {
      if (req.method !== "POST") {
        return jsonResponse(
          { error: "Callback must use POST" },
          405
        );
      }

      const callbackBody = await req.json();

      console.log(
        "M-Pesa B2C callback:",
        JSON.stringify(callbackBody)
      );

      const result =
        callbackBody?.Result ||
        callbackBody?.result ||
        callbackBody;

      const resultCode = Number(
        result?.ResultCode ??
          result?.resultCode ??
          -1
      );

      const resultDescription =
        result?.ResultDesc ??
        result?.ResultDescription ??
        result?.resultDesc ??
        "Unknown M-Pesa result";

      /*
       * Try to identify our withdrawal.
       *
       * We put the withdrawal ID into Remarks when submitting
       * the B2C request.
       */
      const remarks =
        result?.ResultParameters?.ResultParameter?.find(
          (p: any) =>
            p?.Key === "TransactionReceipt" ||
            p?.Key === "ConversationID" ||
            p?.Key === "OriginatorConversationID"
        );

      /*
       * We also search processing withdrawals using the
       * conversation IDs supplied by Safaricom.
       */
      const conversationId =
        result?.ConversationID ||
        result?.conversationID ||
        result?.OriginatorConversationID ||
        result?.originatorConversationID;

      let withdrawal = null;

      if (conversationId) {
        const { data } = await supabase
          .from("withdrawals")
          .select(
            "id, user_id, amount, phone_number, status"
          )
          .eq("status", "processing")
          .eq("mpesa_reference", conversationId)
          .maybeSingle();

        withdrawal = data;
      }

      /*
       * If we cannot identify the withdrawal, acknowledge
       * the callback without modifying an unknown record.
       */
      if (!withdrawal) {
        console.warn(
          "Could not match M-Pesa callback to a withdrawal.",
          {
            conversationId,
            resultCode,
            resultDescription,
          }
        );

        return jsonResponse({
          ResultCode: 0,
          ResultDesc: "Callback received",
        });
      }

      /*
       * ResultCode 0 means successful B2C transaction.
       */
      if (resultCode === 0) {
        const transactionReceipt =
          result?.ResultParameters?.ResultParameter?.find(
            (p: any) =>
              p?.Key === "TransactionReceipt"
          )?.Value;

        await supabase
          .from("withdrawals")
          .update({
            status: "completed",
            mpesa_reference:
              transactionReceipt ||
              conversationId ||
              withdrawal.id,
            processed_at:
              new Date().toISOString(),
            failure_reason: "",
          })
          .eq("id", withdrawal.id)
          .eq("status", "processing");

        console.log(
          `Withdrawal ${withdrawal.id} completed`
        );
      } else {
        await supabase
          .from("withdrawals")
          .update({
            status: "failed",
            failure_reason:
              `M-Pesa result ${resultCode}: ${resultDescription}`,
            processed_at:
              new Date().toISOString(),
          })
          .eq("id", withdrawal.id)
          .eq("status", "processing");

        console.log(
          `Withdrawal ${withdrawal.id} failed`
        );
      }

      /*
       * Safaricom expects a successful acknowledgement.
       */
      return jsonResponse({
        ResultCode: 0,
        ResultDesc: "Callback received successfully",
      });
    }

    /*
     * ============================================================
     * WITHDRAWAL REQUEST
     * ============================================================
     */

    if (req.method !== "POST") {
      return jsonResponse(
        { error: "Method not allowed" },
        405
      );
    }

    const body = await req.json();
    const withdrawalId = body?.withdrawal_id;

    if (!withdrawalId) {
      return jsonResponse(
        { error: "Missing withdrawal_id" },
        400
      );
    }

    /*
     * Get withdrawal.
     */
    const { data: withdrawal, error: fetchError } =
      await supabase
        .from("withdrawals")
        .select(
          "id, user_id, amount, phone_number, status"
        )
        .eq("id", withdrawalId)
        .single();

    if (fetchError || !withdrawal) {
      return jsonResponse(
        { error: "Withdrawal not found" },
        404
      );
    }

    const w = withdrawal as WithdrawalRow;

    /*
     * Only pending withdrawals can be started.
     */
    if (w.status !== "pending") {
      return jsonResponse(
        {
          error:
            `Withdrawal already processed. Current status: ${w.status}`,
        },
        409
      );
    }

    /*
     * Validate phone number.
     */
    if (!/^254\d{9}$/.test(w.phone_number)) {
      await supabase
        .from("withdrawals")
        .update({
          status: "failed",
          failure_reason:
            "Invalid Kenyan M-Pesa phone number.",
          processed_at:
            new Date().toISOString(),
        })
        .eq("id", w.id);

      return jsonResponse(
        {
          error:
            "Invalid M-Pesa phone number. Use format 2547XXXXXXXX.",
        },
        400
      );
    }

    /*
     * Check available balance.
     *
     * IMPORTANT:
     * Your withdrawals.amount is currently documented as USD.
     * Daraja B2C expects KES.
     *
     * Therefore we do NOT perform a USD -> KES conversion here
     * until we establish the exchange-rate/business rule.
     *
     * For now, the database amount is treated as the amount
     * being sent to the Sandbox.
     */
    const { data: balance, error: balanceError } =
      await supabase.rpc(
        "get_available_balance",
        {
          p_user_id: w.user_id,
        }
      );

    if (balanceError) {
      return jsonResponse(
        {
          error: "Failed to verify available balance.",
        },
        500
      );
    }

    const availableBalance = Number(balance);
    const withdrawalAmount = Number(w.amount);

    if (
      !Number.isFinite(availableBalance) ||
      !Number.isFinite(withdrawalAmount) ||
      withdrawalAmount <= 0
    ) {
      return jsonResponse(
        {
          error: "Invalid withdrawal amount or balance.",
        },
        400
      );
    }

    if (availableBalance < withdrawalAmount) {
      await supabase
        .from("withdrawals")
        .update({
          status: "failed",
          failure_reason:
            "Insufficient available balance.",
          processed_at:
            new Date().toISOString(),
        })
        .eq("id", w.id)
        .eq("status", "pending");

      return jsonResponse(
        {
          error: "Insufficient available balance.",
          available_balance: availableBalance,
        },
        400
      );
    }

    /*
     * Lock the withdrawal before sending money.
     */
    const { data: locked, error: lockError } =
      await supabase
        .from("withdrawals")
        .update({
          status: "processing",
        })
        .eq("id", w.id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();

    if (lockError || !locked) {
      return jsonResponse(
        {
          error:
            "Withdrawal is already being processed.",
        },
        409
      );
    }

    /*
     * ============================================================
     * DARaja AUTHORIZATION
     * ============================================================
     */

    const basicAuth = btoa(
      `${consumerKey}:${consumerSecret}`
    );

    const oauthResponse = await fetch(
      DARAJA_AUTH_URL,
      {
        method: "GET",
        headers: {
          Authorization: `Basic ${basicAuth}`,
        },
      }
    );

    if (!oauthResponse.ok) {
      const errorText =
        await oauthResponse.text();

      await supabase
        .from("withdrawals")
        .update({
          status: "failed",
          failure_reason:
            `M-Pesa authentication failed (${oauthResponse.status}).`,
          processed_at:
            new Date().toISOString(),
        })
        .eq("id", w.id)
        .eq("status", "processing");

      console.error(
        "Daraja OAuth error:",
        errorText
      );

      return jsonResponse(
        {
          error:
            "Failed to authenticate with M-Pesa Sandbox.",
        },
        502
      );
    }

    const oauthData =
      await oauthResponse.json();

    const accessToken =
      oauthData?.access_token;

    if (!accessToken) {
      await supabase
        .from("withdrawals")
        .update({
          status: "failed",
          failure_reason:
            "M-Pesa did not return an access token.",
          processed_at:
            new Date().toISOString(),
        })
        .eq("id", w.id)
        .eq("status", "processing");

      return jsonResponse(
        {
          error:
            "M-Pesa authorization failed.",
        },
        502
      );
    }

    /*
     * ============================================================
     * DARaja B2C REQUEST
     * ============================================================
     */

    const callbackUrl =
      `${supabaseUrl}/functions/v1/mpesa-withdraw?callback=1`;

    const b2cPayload = {
      InitiatorName: initiatorName,
      SecurityCredential: securityCredential,
      CommandID: "BusinessPayment",

      /*
       * Daraja B2C Amount is KES.
       */
      Amount: Math.round(withdrawalAmount),

      PartyA: shortcode,
      PartyB: w.phone_number,

      Remarks: `Withdrawal ${w.id}`,
      QueueTimeOutURL: callbackUrl,
      ResultURL: callbackUrl,
      Occasion: "Withdrawal",
    };

    console.log(
      "Sending B2C request for withdrawal:",
      w.id
    );

    const b2cResponse = await fetch(
      DARAJA_B2C_URL,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(b2cPayload),
      }
    );

    const responseText =
      await b2cResponse.text();

    let b2cData: any = {};

    try {
      b2cData = JSON.parse(responseText);
    } catch {
      b2cData = {
        rawResponse: responseText,
      };
    }

    console.log(
      "Daraja B2C response:",
      JSON.stringify(b2cData)
    );

    /*
     * Daraja accepted the request.
     *
     * IMPORTANT:
     * This does NOT mean the user has received the money yet.
     * We remain "processing" until the callback arrives.
     */
    if (
      !b2cResponse.ok ||
      String(b2cData?.ResponseCode) !== "0"
    ) {
      const failReason =
        b2cData?.errorMessage ||
        b2cData?.ResponseDescription ||
        b2cData?.rawResponse ||
        `HTTP ${b2cResponse.status}`;

      await supabase
        .from("withdrawals")
        .update({
          status: "failed",
          failure_reason:
            `M-Pesa B2C request failed: ${failReason}`,
          processed_at:
            new Date().toISOString(),
        })
        .eq("id", w.id)
        .eq("status", "processing");

      return jsonResponse(
        {
          error:
            `M-Pesa B2C request failed: ${failReason}`,
        },
        502
      );
    }

    /*
     * Save the Daraja conversation ID while waiting
     * for the callback.
     */
    const conversationId =
      b2cData?.OriginatorConversationID ||
      b2cData?.ConversationID ||
      `PENDING-${w.id}`;

    await supabase
      .from("withdrawals")
      .update({
        status: "processing",
        mpesa_reference: conversationId,
      })
      .eq("id", w.id)
      .eq("status", "processing");

    return jsonResponse({
      success: true,
      withdrawal_id: w.id,
      status: "processing",
      amount: withdrawalAmount,
      phone_number: w.phone_number,
      mpesa_reference: conversationId,
      message:
        "M-Pesa withdrawal request accepted and is being processed.",
    });
  } catch (error) {
    console.error(
      "mpesa-withdraw error:",
      error
    );

    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : "Internal server error",
      },
      500
    );
  }
});