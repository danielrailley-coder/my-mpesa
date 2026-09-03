import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

type WithdrawalRow = {
  id: string;
  user_id: string;
  amount: number;
  phone_number: string;
  status: string;
  mpesa_reference: string | null;
};

const DARAJA_AUTH_URL =
  "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials";

const DARAJA_B2C_URL =
  "https://sandbox.safaricom.co.ke/mpesa/b2c/v1/paymentrequest";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      { error: "Only POST requests are allowed" },
      405
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    const consumerKey = Deno.env.get("MPESA_CONSUMER_KEY");
    const consumerSecret = Deno.env.get("MPESA_CONSUMER_SECRET");
    const initiatorName = Deno.env.get("MPESA_INITIATOR_NAME");
    const securityCredential = Deno.env.get("MPESA_SECURITY_CREDENTIAL");
    const shortcode = Deno.env.get("MPESA_SHORTCODE");
    const usdToKesRate = Deno.env.get("MPESA_USD_TO_KES_RATE");

    if (
      !supabaseUrl ||
      !serviceRoleKey ||
      !anonKey ||
      !consumerKey ||
      !consumerSecret ||
      !initiatorName ||
      !securityCredential ||
      !shortcode ||
      !usdToKesRate
    ) {
      return jsonResponse(
        {
          error:
            "Missing required Supabase or M-Pesa environment secrets.",
        },
        500
      );
    }

    const rate = Number(usdToKesRate);

    if (!Number.isFinite(rate) || rate <= 0) {
      return jsonResponse(
        {
          error: "MPESA_USD_TO_KES_RATE must be a positive number.",
        },
        500
      );
    }

    /*
     * Service-role client.
     * Used only on the server side for database operations.
     */
    const admin = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
        },
      }
    );

    /*
     * ---------------------------------------------------------
     * SAFARICOM CALLBACK
     * ---------------------------------------------------------
     *
     * Safaricom does not send the user's Supabase JWT.
     * Therefore callback requests are handled separately.
     */
    const body = await req.json();

    if (body?.Result?.ResultCode !== undefined) {
      return await handleMpesaCallback(
        admin,
        body
      );
    }

    /*
     * ---------------------------------------------------------
     * NORMAL WITHDRAWAL REQUEST
     * ---------------------------------------------------------
     */

    const authHeader = req.headers.get("Authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse(
        { error: "Missing authorization token." },
        401
      );
    }

    const jwt = authHeader.replace("Bearer ", "").trim();

    /*
     * User client used only to verify the user's JWT.
     */
    const userClient = createClient(
      supabaseUrl,
      anonKey,
      {
        global: {
          headers: {
            Authorization: `Bearer ${jwt}`,
          },
        },
        auth: {
          persistSession: false,
        },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return jsonResponse(
        { error: "Invalid or expired authentication token." },
        401
      );
    }

    const withdrawalId = body?.withdrawal_id;

    if (!withdrawalId) {
      return jsonResponse(
        { error: "Missing withdrawal_id." },
        400
      );
    }

    /*
     * Fetch withdrawal using service role.
     */
    const {
      data: withdrawal,
      error: fetchError,
    } = await admin
      .from("withdrawals")
      .select(
        "id, user_id, amount, phone_number, status, mpesa_reference"
      )
      .eq("id", withdrawalId)
      .single();

    if (fetchError || !withdrawal) {
      return jsonResponse(
        { error: "Withdrawal not found." },
        404
      );
    }

    const w = withdrawal as WithdrawalRow;

    /*
     * IMPORTANT:
     * Make sure the logged-in user owns this withdrawal.
     */
    if (w.user_id !== user.id) {
      return jsonResponse(
        {
          error:
            "You are not authorized to process this withdrawal.",
        },
        403
      );
    }

    if (w.status !== "pending") {
      return jsonResponse(
        {
          error:
            `Withdrawal cannot be processed because its status is "${w.status}".`,
        },
        409
      );
    }

    const usdAmount = Number(w.amount);

    if (!Number.isFinite(usdAmount) || usdAmount <= 0) {
      return jsonResponse(
        { error: "Invalid withdrawal amount." },
        400
      );
    }

    /*
     * ---------------------------------------------------------
     * BALANCE CHECK
     * ---------------------------------------------------------
     *
     * get_available_balance excludes this pending withdrawal.
     * Therefore add this withdrawal back before checking
     * whether the writer has enough money for it.
     */
    const {
      data: balance,
      error: balanceError,
    } = await admin.rpc(
      "get_available_balance",
      {
        p_user_id: w.user_id,
      }
    );

    if (balanceError) {
      console.error("Balance check error:", balanceError);

      await admin
        .from("withdrawals")
        .update({
          status: "failed",
          failure_reason: "Balance verification failed.",
          processed_at: new Date().toISOString(),
        })
        .eq("id", w.id)
        .eq("status", "pending");

      return jsonResponse(
        { error: "Unable to verify available balance." },
        500
      );
    }

    const availableBeforeThisWithdrawal =
      Number(balance) + usdAmount;

    if (availableBeforeThisWithdrawal < usdAmount) {
      await admin
        .from("withdrawals")
        .update({
          status: "failed",
          failure_reason: "Insufficient available balance.",
          processed_at: new Date().toISOString(),
        })
        .eq("id", w.id)
        .eq("status", "pending");

      return jsonResponse(
        {
          error: "Insufficient available balance.",
          available_balance_usd:
            availableBeforeThisWithdrawal,
          requested_amount_usd: usdAmount,
        },
        400
      );
    }

    /*
     * ---------------------------------------------------------
     * PHONE NUMBER VALIDATION
     * ---------------------------------------------------------
     */

    if (!/^254\d{9}$/.test(w.phone_number)) {
      await admin
        .from("withdrawals")
        .update({
          status: "failed",
          failure_reason:
            "Invalid Kenyan M-Pesa phone number.",
          processed_at: new Date().toISOString(),
        })
        .eq("id", w.id)
        .eq("status", "pending");

      return jsonResponse(
        {
          error:
            "Invalid M-Pesa phone number. Use 2547XXXXXXXX.",
        },
        400
      );
    }

    /*
     * ---------------------------------------------------------
     * USD -> KES
     * ---------------------------------------------------------
     *
     * Example:
     *
     * $10 × 129 = KES 1,290
     */
    const kesAmount = Math.round(
      usdAmount * rate
    );

    if (!Number.isInteger(kesAmount) || kesAmount <= 0) {
      return jsonResponse(
        { error: "Invalid converted KES amount." },
        400
      );
    }

    /*
     * ---------------------------------------------------------
     * ATOMICALLY LOCK WITHDRAWAL
     * ---------------------------------------------------------
     *
     * Prevent two requests from processing the same
     * withdrawal simultaneously.
     */
    const {
      data: locked,
      error: lockError,
    } = await admin
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
     * ---------------------------------------------------------
     * GET DARAJA ACCESS TOKEN
     * ---------------------------------------------------------
     */

    const auth = btoa(
      `${consumerKey}:${consumerSecret}`
    );

    const oauthResponse = await fetch(
      DARAJA_AUTH_URL,
      {
        method: "GET",
        headers: {
          Authorization: `Basic ${auth}`,
        },
      }
    );

    if (!oauthResponse.ok) {
      const errorText =
        await oauthResponse.text();

      console.error(
        "Daraja OAuth error:",
        oauthResponse.status,
        errorText
      );

      await admin
        .from("withdrawals")
        .update({
          status: "failed",
          failure_reason:
            `Daraja authentication failed (${oauthResponse.status}).`,
          processed_at:
            new Date().toISOString(),
        })
        .eq("id", w.id)
        .eq("status", "processing");

      return jsonResponse(
        {
          error:
            "Failed to authenticate with M-Pesa.",
        },
        502
      );
    }

    const oauthData =
      await oauthResponse.json();

    const accessToken =
      oauthData.access_token;

    if (!accessToken) {
      await admin
        .from("withdrawals")
        .update({
          status: "failed",
          failure_reason:
            "Daraja did not return an access token.",
          processed_at:
            new Date().toISOString(),
        })
        .eq("id", w.id)
        .eq("status", "processing");

      return jsonResponse(
        {
          error:
            "M-Pesa authentication failed.",
        },
        502
      );
    }

    /*
     * ---------------------------------------------------------
     * SEND B2C REQUEST
     * ---------------------------------------------------------
     *
     * IMPORTANT:
     *
     * SecurityCredential is the encrypted B2C credential.
     * It is NOT the STK Push passkey.
     */
    const callbackUrl =
      `${supabaseUrl}/functions/v1/mpesa-withdraw`;

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
      Occasion: "Writer Withdrawal",
    };

    console.log(
      "Sending B2C request:",
      {
        withdrawal_id: w.id,
        usd_amount: usdAmount,
        exchange_rate: rate,
        kes_amount: kesAmount,
        phone_number: w.phone_number,
      }
    );

    const b2cResponse = await fetch(
      DARAJA_B2C_URL,
      {
        method: "POST",
        headers: {
          Authorization:
            `Bearer ${accessToken}`,
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify(
          b2cPayload
        ),
      }
    );

    const b2cData =
      await b2cResponse.json();

    console.log(
      "Daraja B2C response:",
      b2cData
    );

    /*
     * Daraja accepted the request.
     *
     * IMPORTANT:
     * This does NOT mean the money has reached
     * the recipient yet.
     *
     * Keep status = processing.
     */
    if (
      !b2cResponse.ok ||
      String(b2cData.ResponseCode) !== "0"
    ) {
      const reason =
        b2cData.errorMessage ||
        b2cData.ResponseDescription ||
        `HTTP ${b2cResponse.status}`;

      await admin
        .from("withdrawals")
        .update({
          status: "failed",
          failure_reason:
            `M-Pesa B2C failed: ${reason}`,
          processed_at:
            new Date().toISOString(),
        })
        .eq("id", w.id)
        .eq("status", "processing");

      return jsonResponse(
        {
          error:
            `M-Pesa transfer request failed: ${reason}`,
        },
        502
      );
    }

    /*
     * Store OriginatorConversationID temporarily
     * in mpesa_reference so the callback can locate
     * this withdrawal.
     */
    const conversationId =
      b2cData.OriginatorConversationID ||
      b2cData.ConversationID ||
      "";

    const { error: referenceError } =
      await admin
        .from("withdrawals")
        .update({
          mpesa_reference:
            conversationId,
        })
        .eq("id", w.id)
        .eq("status", "processing");

    if (referenceError) {
      console.error(
        "Failed to store B2C reference:",
        referenceError
      );

      /*
       * Do NOT mark failed here.
       * Safaricom may still process the payment.
       */
    }

    return jsonResponse(
      {
        success: true,
        withdrawal_id: w.id,
        status: "processing",
        amount_usd: usdAmount,
        exchange_rate:
          rate,
        amount_kes: kesAmount,
        phone_number:
          w.phone_number,
        mpesa_reference:
          conversationId,
        message:
          `Withdrawal request accepted. $${usdAmount.toFixed(
            2
          )} = KES ${kesAmount.toLocaleString()}. Waiting for M-Pesa result.`,
      },
      200
    );
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
            : "Internal server error.",
      },
      500
    );
  }
});


/*
 * ============================================================
 * M-PESA B2C CALLBACK
 * ============================================================
 */

async function handleMpesaCallback(
  admin: ReturnType<typeof createClient>,
  body: any
) {
  try {
    const result = body?.Result;

    if (!result) {
      return jsonResponse(
        {
          ResultCode: 0,
          ResultDesc: "Accepted",
        },
        200
      );
    }

    const resultCode =
      Number(result.ResultCode);

    const resultDescription =
      result.ResultDesc ||
      "No result description";

    const conversationId =
      result.ConversationID ||
      "";

    const originatorConversationId =
      result.OriginatorConversationID ||
      "";

    /*
     * Try to locate the withdrawal using
     * OriginatorConversationID first.
     */
    let withdrawal = null;

    if (originatorConversationId) {
      const { data } = await admin
        .from("withdrawals")
        .select(
          "id, user_id, amount, phone_number, status, mpesa_reference"
        )
        .eq(
          "mpesa_reference",
          originatorConversationId
        )
        .maybeSingle();

      withdrawal = data;
    }

    /*
     * Fallback to ConversationID.
     */
    if (!withdrawal && conversationId) {
      const { data } = await admin
        .from("withdrawals")
        .select(
          "id, user_id, amount, phone_number, status, mpesa_reference"
        )
        .eq(
          "mpesa_reference",
          conversationId
        )
        .maybeSingle();

      withdrawal = data;
    }

    if (!withdrawal) {
      console.error(
        "Could not match M-Pesa callback to withdrawal.",
        {
          resultCode,
          conversationId,
          originatorConversationId,
        }
      );

      /*
       * Acknowledge callback so Safaricom does not
       * repeatedly retry it.
       */
      return jsonResponse(
        {
          ResultCode: 0,
          ResultDesc: "Accepted",
        },
        200
      );
    }

    /*
     * If already completed/failed, don't process
     * the callback again.
     */
    if (
      withdrawal.status === "completed" ||
      withdrawal.status === "failed"
    ) {
      return jsonResponse(
        {
          ResultCode: 0,
          ResultDesc: "Accepted",
        },
        200
      );
    }

    /*
     * ---------------------------------------------------------
     * SUCCESS
     * ---------------------------------------------------------
     */

    if (resultCode === 0) {
      const transactionId =
        extractParameter(
          result,
          "TransactionReceipt"
        ) ||
        result.TransactionID ||
        "";

      const { error } =
        await admin
          .from("withdrawals")
          .update({
            status: "completed",
            mpesa_reference:
              transactionId ||
              originatorConversationId ||
              conversationId,
            processed_at:
              new Date().toISOString(),
            failure_reason: "",
          })
          .eq(
            "id",
            withdrawal.id
          )
          .eq(
            "status",
            "processing"
          );

      if (error) {
        console.error(
          "Failed to mark withdrawal completed:",
          error
        );
      }

      console.log(
        "M-Pesa withdrawal completed:",
        {
          withdrawal_id:
            withdrawal.id,
          transaction_id:
            transactionId,
        }
      );
    } else {
      /*
       * -------------------------------------------------------
       * FAILURE
       * -------------------------------------------------------
       */

      const { error } =
        await admin
          .from("withdrawals")
          .update({
            status: "failed",
            failure_reason:
              `M-Pesa failed (${resultCode}): ${resultDescription}`,
            processed_at:
              new Date().toISOString(),
          })
          .eq(
            "id",
            withdrawal.id
          )
          .eq(
            "status",
            "processing"
          );

      if (error) {
        console.error(
          "Failed to mark withdrawal failed:",
          error
        );
      }

      console.log(
        "M-Pesa withdrawal failed:",
        {
          withdrawal_id:
            withdrawal.id,
          resultCode,
          resultDescription,
        }
      );
    }

    /*
     * Acknowledge Safaricom callback.
     */
    return jsonResponse(
      {
        ResultCode: 0,
        ResultDesc: "Accepted",
      },
      200
    );
  } catch (error) {
    console.error(
      "Callback processing error:",
      error
    );

    /*
     * Still acknowledge the callback.
     */
    return jsonResponse(
      {
        ResultCode: 0,
        ResultDesc: "Accepted",
      },
      200
    );
  }
}


/*
 * Extract a value from Safaricom's ResultParameters.
 */
function extractParameter(
  result: any,
  parameterName: string
): string {
  const parameters =
    result?.ResultParameters
      ?.ResultParameter;

  if (!Array.isArray(parameters)) {
    return "";
  }

  const parameter =
    parameters.find(
      (item: any) =>
        item?.Key === parameterName
    );

  if (!parameter) {
    return "";
  }

  return String(
    parameter.Value ?? ""
  );
}


/*
 * Standard JSON response helper.
 */
function jsonResponse(
  data: unknown,
  status = 200
) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type":
          "application/json",
      },
    }
  );
}