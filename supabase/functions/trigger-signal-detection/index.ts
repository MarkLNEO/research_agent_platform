import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Manual trigger endpoint for signal detection
// This allows testing without waiting for the cron job
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // Get the authorization header from the request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Authorization required');
    }

    // Call the detect-signals function
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const detectSignalsUrl = `${supabaseUrl}/functions/v1/detect-signals`;

    const response = await fetch(detectSignalsUrl, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Signal detection failed: ${response.statusText} - ${errorText}`);
    }

    const result = await response.json();

    console.log('Manual signal detection completed:', result);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Signal detection completed successfully',
        result,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error: any) {
    console.error("Error in trigger-signal-detection:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error?.message || String(error),
        timestamp: new Date().toISOString(),
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