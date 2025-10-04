import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ProfileUpdate {
  company_name?: string;
  company_url?: string;
  linkedin_url?: string;
  industry?: string;
  icp_definition?: string;
  user_role?: string;
  use_case?: string;
  target_titles?: string[];
  seniority_levels?: string[];
  target_departments?: string[];
  competitors?: string[];
  research_focus?: string[];
}

interface CustomCriterion {
  field_name: string;
  field_type: 'text' | 'number' | 'boolean' | 'list';
  importance: 'critical' | 'important' | 'optional';
  hints?: string[];
}

interface SignalPreference {
  signal_type: string;
  importance: 'critical' | 'important' | 'nice_to_have';
  lookback_days?: number;
  config?: Record<string, any>;
}

interface DisqualifyingCriterion {
  criterion: string;
}

interface UpdateRequest {
  profile?: ProfileUpdate;
  custom_criteria?: CustomCriterion[];
  signal_preferences?: SignalPreference[];
  disqualifying_criteria?: DisqualifyingCriterion[];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
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

    const updateData: UpdateRequest = await req.json();

    const results: any = {
      profile: null,
      custom_criteria: [],
      signal_preferences: [],
      disqualifying_criteria: []
    };

    // Update profile
    if (updateData.profile) {
      const { data: existingProfile } = await supabase
        .from('company_profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (existingProfile) {
        const { data, error } = await supabase
          .from('company_profiles')
          .update({
            ...updateData.profile,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', user.id)
          .select()
          .single();

        if (error) throw error;
        results.profile = data;
      } else {
        const { data, error } = await supabase
          .from('company_profiles')
          .insert({
            user_id: user.id,
            ...updateData.profile
          })
          .select()
          .single();

        if (error) throw error;
        results.profile = data;
      }
    }

    // Update custom criteria
    if (updateData.custom_criteria && updateData.custom_criteria.length > 0) {
      // Delete existing
      await supabase
        .from('user_custom_criteria')
        .delete()
        .eq('user_id', user.id);

      // Insert new
      const criteriaToInsert = updateData.custom_criteria.map((c, idx) => ({
        user_id: user.id,
        field_name: c.field_name,
        field_type: c.field_type,
        importance: c.importance,
        hints: c.hints || [],
        display_order: idx + 1
      }));

      const { data, error } = await supabase
        .from('user_custom_criteria')
        .insert(criteriaToInsert)
        .select();

      if (error) throw error;
      results.custom_criteria = data;
    }

    // Update signal preferences
    if (updateData.signal_preferences && updateData.signal_preferences.length > 0) {
      // Delete existing
      await supabase
        .from('user_signal_preferences')
        .delete()
        .eq('user_id', user.id);

      // Insert new
      const signalsToInsert = updateData.signal_preferences.map(s => ({
        user_id: user.id,
        signal_type: s.signal_type,
        importance: s.importance,
        lookback_days: s.lookback_days || 90,
        config: s.config || {}
      }));

      const { data, error } = await supabase
        .from('user_signal_preferences')
        .insert(signalsToInsert)
        .select();

      if (error) throw error;
      results.signal_preferences = data;
    }

    // Update disqualifying criteria
    if (updateData.disqualifying_criteria && updateData.disqualifying_criteria.length > 0) {
      // Delete existing
      await supabase
        .from('user_disqualifying_criteria')
        .delete()
        .eq('user_id', user.id);

      // Insert new
      const disqualifiersToInsert = updateData.disqualifying_criteria.map(d => ({
        user_id: user.id,
        criterion: d.criterion
      }));

      const { data, error } = await supabase
        .from('user_disqualifying_criteria')
        .insert(disqualifiersToInsert)
        .select();

      if (error) throw error;
      results.disqualifying_criteria = data;
    }

    return new Response(
      JSON.stringify({ success: true, data: results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error updating profile:", error);
    return new Response(
      JSON.stringify({ error: String(error?.message || error) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});