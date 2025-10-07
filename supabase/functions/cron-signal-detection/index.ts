import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// This function is designed to be called by a cron job every 6 hours
// It triggers the signal detection process for all tracked accounts
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // Get the authorization header from the cron request
    const authHeader = req.headers.get('Authorization');

    // Call the detect-signals function
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const detectSignalsUrl = `${supabaseUrl}/functions/v1/detect-signals`;

    const response = await fetch(detectSignalsUrl, {
      method: 'POST',
      headers: {
        'Authorization': authHeader || '',
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Signal detection failed: ${response.statusText}`);
    }

    const result = await response.json();

    console.log('Signal detection completed:', result);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Signal detection triggered successfully',
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
    console.error("Error in cron-signal-detection:", error);
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