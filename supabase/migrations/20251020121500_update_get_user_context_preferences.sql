/*
  # Extend get_user_context

  Returns conversational user preferences and unresolved follow-up questions
  alongside existing profile metadata so runtime agents can honor them.
*/

CREATE OR REPLACE FUNCTION public.get_user_context(p_user uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'profile', (
      SELECT to_jsonb(cp)
      FROM public.company_profiles cp
      WHERE cp.user_id = p_user
    ),
    'custom_criteria', COALESCE((
      SELECT jsonb_agg(cc ORDER BY cc.display_order)
      FROM public.user_custom_criteria cc
      WHERE cc.user_id = p_user
    ), '[]'::jsonb),
    'signals', COALESCE((
      SELECT jsonb_agg(sp ORDER BY sp.created_at DESC)
      FROM public.user_signal_preferences sp
      WHERE sp.user_id = p_user
    ), '[]'::jsonb),
    'disqualifiers', COALESCE((
      SELECT jsonb_agg(dc ORDER BY dc.created_at DESC)
      FROM public.user_disqualifying_criteria dc
      WHERE dc.user_id = p_user
    ), '[]'::jsonb),
    'prompt_config', (
      SELECT to_jsonb(pc)
      FROM public.user_prompt_config pc
      WHERE pc.user_id = p_user
    ),
    'report_preferences', COALESCE((
      SELECT jsonb_agg(rp ORDER BY rp.updated_at DESC)
      FROM public.user_report_preferences rp
      WHERE rp.user_id = p_user
        AND COALESCE(rp.is_active, FALSE)
    ), '[]'::jsonb),
    'preferences', COALESCE((
      SELECT jsonb_agg(up ORDER BY up.updated_at DESC)
      FROM public.user_preferences up
      WHERE up.user_id = p_user
    ), '[]'::jsonb),
    'open_questions', COALESCE((
      SELECT jsonb_agg(oq ORDER BY oq.asked_at ASC)
      FROM public.open_questions oq
      WHERE oq.user_id = p_user
        AND oq.resolved_at IS NULL
    ), '[]'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_user_context(uuid) TO authenticated;
