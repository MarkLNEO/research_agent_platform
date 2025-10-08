-- Aggregated user context for chat prompts
create or replace function public.get_user_context(p_user uuid)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'profile', (
      select to_jsonb(cp)
      from public.company_profiles cp
      where cp.user_id = p_user
    ),
    'custom_criteria', coalesce((
      select jsonb_agg(cc order by cc.display_order)
      from public.user_custom_criteria cc
      where cc.user_id = p_user
    ), '[]'::jsonb),
    'signals', coalesce((
      select jsonb_agg(sp)
      from public.user_signal_preferences sp
      where sp.user_id = p_user
    ), '[]'::jsonb),
    'disqualifiers', coalesce((
      select jsonb_agg(dc)
      from public.user_disqualifying_criteria dc
      where dc.user_id = p_user
    ), '[]'::jsonb),
    'prompt_config', (
      select to_jsonb(pc)
      from public.user_prompt_config pc
      where pc.user_id = p_user
    ),
    'report_preferences', coalesce((
      select jsonb_agg(rp)
      from public.user_report_preferences rp
      where rp.user_id = p_user
        and coalesce(rp.is_active, false)
    ), '[]'::jsonb)
  );
$$;

-- Allow authenticated users to call for their own context
grant execute on function public.get_user_context(uuid) to authenticated;
