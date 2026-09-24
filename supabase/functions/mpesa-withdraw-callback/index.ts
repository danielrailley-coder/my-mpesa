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
  mpesa_reference: string;
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

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  try {
    const body = await req.json();

    // Safaricom B2C callback structure:
    // { Result: { ResultType, ResultCode, ResultDesc, OriginatorConversationID,
    //             ConversationID, TransactionID, ResultParameters: { ... } } }
    const result = body?.Result;

    if (!result) {
      return new Response(
        JSON.stringify({ error: "Invalid callback payload" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const resultCode = result.ResultCode;
    const resultDesc = result.ResultDesc;
    const conversationId =
      result.OriginatorConversationID || result.ConversationID;
    const transactionId = result.TransactionID;

    // Match the withdrawal by the conversation ID stored in mpesa_reference
    const { data: withdrawal, error: fetchError } = await supabase
      .from("withdrawals")
      .select("id, user_id, amount, phone_number, status, mpesa_reference")
      .eq("mpesa_reference", conversationId)
      .maybeSingle();

    if (fetchError || !withdrawal) {
      // Safaricom still expects a 200 even if we can't find the row
      return new Response(
        JSON.stringify({ received: true }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const w = withdrawal as WithdrawalRow;

    // Prevent duplicate callbacks from reverting a finalized withdrawal
    if (w.status !== "processing") {
      return new Response(
        JSON.stringify({ received: true, already_processed: true }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    // ResultCode 0 means the B2C payment succeeded
    if (resultCode === 0) {
      const updatePayload: Record<string, unknown> = {
        status: "completed",
        failure_reason: "",
        processed_at: new Date().toISOString(),
      };

      // Prefer the actual M-Pesa transaction ID from the callback
      if (transactionId) {
        updatePayload.mpesa_reference = transactionId;
      }

      await supabase
        .from("withdrawals")
        .update(updatePayload)
        .eq("id", w.id);

      return new Response(
        JSON.stringify({ received: true, status: "completed" }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    // Any non-zero ResultCode is a failure (timeout, insufficient funds, etc.)
    await supabase
      .from("withdrawals")
      .update({
        status: "failed",
        failure_reason: resultDesc || `ResultCode ${resultCode}`,
        processed_at: new Date().toISOString(),
      })
      .eq("id", w.id);

    return new Response(
      JSON.stringify({ received: true, status: "failed" }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    console.error("Withdrawal callback error:", error);

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
