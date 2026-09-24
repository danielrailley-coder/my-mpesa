import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
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
      JSON.stringify({
        error: "Method not allowed",
      }),
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
        },
      },
    );

    const body = await req.json();

    console.log(
      "M-Pesa B2C callback:",
      JSON.stringify(body),
    );

    const result = body?.Result;

    if (!result) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing Result object.",
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

    const originatorConversationId =
      result.OriginatorConversationID;

    const conversationId = result.ConversationID;

    const resultCode = Number(result.ResultCode);

    const resultDescription =
      result.ResultDesc || "Unknown M-Pesa result";

    const resultParameters =
      result.ResultParameters?.ResultParameter || [];

    let transactionReceipt = "";

    if (Array.isArray(resultParameters)) {
      const receiptParameter = resultParameters.find(
        (parameter: any) =>
          parameter.Key === "TransactionReceipt",
      );

      if (receiptParameter) {
        transactionReceipt = String(
          receiptParameter.Value || "",
        );
      }
    }

    // Find the withdrawal using the conversation ID
    let withdrawal = null;

    if (originatorConversationId) {
      const { data } = await supabase
        .from("withdrawals")
        .select("id, status, mpesa_reference")
        .eq(
          "mpesa_reference",
          originatorConversationId,
        )
        .maybeSingle();

      withdrawal = data;
    }

    // Fallback to ConversationID
    if (!withdrawal && conversationId) {
      const { data } = await supabase
        .from("withdrawals")
        .select("id, status, mpesa_reference")
        .eq(
          "mpesa_reference",
          conversationId,
        )
        .maybeSingle();

      withdrawal = data;
    }

    if (!withdrawal) {
      console.error(
        "Withdrawal not found for callback",
        {
          originatorConversationId,
          conversationId,
        },
      );

      return new Response(
        JSON.stringify({
          success: false,
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

    // Successful transaction
    if (resultCode === 0) {
      const reference =
        transactionReceipt ||
        conversationId ||
        originatorConversationId ||
        `MPESA-${Date.now()}`;

      const { error } = await supabase
        .from("withdrawals")
        .update({
          status: "completed",
          mpesa_reference: reference,
          processed_at: new Date().toISOString(),
          failure_reason: "",
        })
        .eq("id", withdrawal.id);

      if (error) {
        console.error(
          "Failed to update completed withdrawal:",
          error,
        );

        return new Response(
          JSON.stringify({
            success: false,
            error: "Database update failed.",
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

      console.log(
        `Withdrawal ${withdrawal.id} completed successfully.`,
      );

      return new Response(
        JSON.stringify({
          success: true,
          status: "completed",
          withdrawal_id: withdrawal.id,
          mpesa_reference: reference,
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    // Failed transaction
    const { error } = await supabase
      .from("withdrawals")
      .update({
        status: "failed",
        failure_reason:
          `M-Pesa ResultCode ${resultCode}: ${resultDescription}`,
        processed_at: new Date().toISOString(),
      })
      .eq("id", withdrawal.id);

    if (error) {
      console.error(
        "Failed to update failed withdrawal:",
        error,
      );

      return new Response(
        JSON.stringify({
          success: false,
          error: "Database update failed.",
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

    console.log(
      `Withdrawal ${withdrawal.id} failed: ${resultDescription}`,
    );

    return new Response(
      JSON.stringify({
        success: true,
        status: "failed",
        withdrawal_id: withdrawal.id,
        reason: resultDescription,
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
    console.error("Callback error:", error);

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