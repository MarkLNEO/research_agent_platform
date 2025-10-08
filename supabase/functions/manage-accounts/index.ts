import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface AddAccountRequest {
  action: 'add';
  company_name: string;
  company_url?: string;
  industry?: string;
  employee_count?: number;
}

interface BulkAddRequest {
  action: 'bulk_add';
  accounts: Array<{
    company_name: string;
    company_url?: string;
    industry?: string;
    employee_count?: number;
  }>;
}

interface ListAccountsRequest {
  action: 'list';
  filter?: 'all' | 'hot' | 'warm' | 'stale';
}

interface UpdateAccountRequest {
  action: 'update';
  account_id: string;
  updates: {
    notes?: string;
    last_contacted_at?: string;
    monitoring_enabled?: boolean;
  };
}

interface DeleteAccountRequest {
  action: 'delete';
  account_id: string;
}

type AccountRequest = AddAccountRequest | BulkAddRequest | ListAccountsRequest | UpdateAccountRequest | DeleteAccountRequest;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const request: AccountRequest = await req.json();

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Authorization header required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Authentication failed");

    switch (request.action) {
      case 'add': {
        // Add single account
        const { data: existingAccount } = await supabase
          .from('tracked_accounts')
          .select('id')
          .eq('user_id', user.id)
          .eq('company_name', request.company_name)
          .maybeSingle();

        if (existingAccount) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Account already tracked',
              account_id: existingAccount.id,
            }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        const { data: newAccount, error: insertError } = await supabase
          .from('tracked_accounts')
          .insert({
            user_id: user.id,
            company_name: request.company_name,
            company_url: request.company_url,
            industry: request.industry,
            employee_count: request.employee_count,
            monitoring_enabled: true,
          })
          .select()
          .single();

        if (insertError) throw insertError;

        return new Response(
          JSON.stringify({
            success: true,
            account: newAccount,
            message: `${request.company_name} added to tracking`,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      case 'bulk_add': {
        // Add multiple accounts from CSV upload
        const results = {
          added: [] as any[],
          skipped: [] as string[],
          errors: [] as string[],
        };

        for (const accountData of request.accounts) {
          try {
            // Check if already exists
            const { data: existing } = await supabase
              .from('tracked_accounts')
              .select('id')
              .eq('user_id', user.id)
              .eq('company_name', accountData.company_name)
              .maybeSingle();

            if (existing) {
              results.skipped.push(accountData.company_name);
              continue;
            }

            // Insert
            const { data: newAccount, error: insertError } = await supabase
              .from('tracked_accounts')
              .insert({
                user_id: user.id,
                ...accountData,
                monitoring_enabled: true,
              })
              .select()
              .single();

            if (insertError) {
              results.errors.push(`${accountData.company_name}: ${insertError.message}`);
            } else {
              results.added.push(newAccount);
            }
          } catch (error: any) {
            results.errors.push(`${accountData.company_name}: ${error.message}`);
          }
        }

        return new Response(
          JSON.stringify({
            success: true,
            ...results,
            summary: {
              added: results.added.length,
              skipped: results.skipped.length,
              errors: results.errors.length,
            },
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      case 'list': {
        // List accounts with optional filtering
        let query = supabase
          .from('tracked_accounts')
          .select(`
            *,
            latest_research:research_outputs(
              id,
              created_at,
              executive_summary
            ),
            recent_signals:account_signals(
              id,
              signal_type,
              severity,
              description,
              signal_date,
              viewed,
              score
            )
          `)
          .eq('user_id', user.id)
          .order('priority', { ascending: false })
          .order('updated_at', { ascending: false });

        // Apply filters
        switch (request.filter) {
          case 'hot':
            query = query.eq('priority', 'hot');
            break;
          case 'warm':
            query = query.eq('priority', 'warm');
            break;
          case 'stale':
            query = query.or(`last_researched_at.lt.${new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()},last_researched_at.is.null`);
            break;
        }

        const { data: accounts, error: listError } = await query;

        if (listError) throw listError;

        // Calculate statistics
        const stats = {
          total: accounts?.length || 0,
          hot: accounts?.filter(a => a.priority === 'hot').length || 0,
          warm: accounts?.filter(a => a.priority === 'warm').length || 0,
          standard: accounts?.filter(a => a.priority === 'standard').length || 0,
          with_signals: accounts?.filter(a => a.recent_signals && a.recent_signals.length > 0).length || 0,
          stale: accounts?.filter(a => {
            if (!a.last_researched_at) return true;
            const daysSince = Math.floor((Date.now() - new Date(a.last_researched_at).getTime()) / (1000 * 60 * 60 * 24));
            return daysSince > 14;
          }).length || 0,
        };

        return new Response(
          JSON.stringify({
            success: true,
            accounts: accounts || [],
            stats,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      case 'update': {
        // Update account
        const { data: updated, error: updateError } = await supabase
          .from('tracked_accounts')
          .update(request.updates)
          .eq('id', request.account_id)
          .eq('user_id', user.id)
          .select()
          .single();

        if (updateError) throw updateError;

        return new Response(
          JSON.stringify({
            success: true,
            account: updated,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      case 'delete': {
        // Delete account
        const { error: deleteError } = await supabase
          .from('tracked_accounts')
          .delete()
          .eq('id', request.account_id)
          .eq('user_id', user.id);

        if (deleteError) throw deleteError;

        return new Response(
          JSON.stringify({
            success: true,
            message: 'Account removed from tracking',
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      default:
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid action' }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
    }
  } catch (error: any) {
    console.error("Error in manage-accounts function:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: String(error?.message || error),
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
