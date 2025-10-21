import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../../supabase/types.js';

export interface SaveProfilePayload {
  action: 'save_profile';
  profile?: Record<string, any> | null;
  custom_criteria?: any[] | null;
  signal_preferences?: any[] | null;
  disqualifying_criteria?: any[] | null;
  prompt_config?: Record<string, any> | null;
}

export interface SaveProfileResult {
  summary: string[];
  profile: Record<string, any> | null;
  customCriteria: any[];
  signalPreferences: any[];
  disqualifyingCriteria: any[];
  promptConfig: Record<string, any> | null;
}

type SupabaseDb = SupabaseClient<Database>;

const INDICATOR_LABEL_KEYS = [
  'indicator_label',
  'indicators_label',
  'signal_label',
  'signals_label',
  'indicatorTerminology',
  'signalTerminology',
  'buying_signal_label',
  'buyingSignalsLabel',
  'watch_label',
  'watchlist_label',
];

const INDICATOR_CHOICE_KEYS = [
  'indicator_choices',
  'indicatorChoices',
  'watch_list',
  'watchList',
  'watchlist',
  'watch_items',
  'watchItems',
  'watchlist_items',
  'buying_signals',
  'buyingSignals',
];

const TARGET_TITLE_KEYS = [
  'target_titles',
  'targetTitles',
  'targets',
  'target_roles',
  'targetRoles',
  'target_titles_list',
];

const COMPETITOR_KEYS = [
  'competitors',
  'competitors_list',
  'competitor_list',
  'competitorsToWatch',
];

const RESEARCH_FOCUS_KEYS = [
  'research_focus',
  'researchFocus',
  'focus_areas',
  'focusAreas',
  'focus',
];

const COMPANY_NAME_KEYS = [
  'company_name',
  'organization',
  'company',
  'org',
];

const COMPANY_URL_KEYS = [
  'company_url',
  'website',
  'site',
  'url',
];

const INDUSTRY_KEYS = [
  'industry',
  'sector',
];

const ICP_KEYS = [
  'icp_definition',
  'icp',
  'ideal_customer_profile',
];

const ROLE_KEYS = [
  'user_role',
  'role',
];

const USE_CASE_KEYS = [
  'use_case',
  'primary_use_case',
  'usecase',
];

function owns(obj: Record<string, any>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function coerceStringArray(value: unknown): string[] {
  const results: string[] = [];
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'string' || typeof item === 'number') {
        const trimmed = String(item).trim();
        if (trimmed) results.push(trimmed);
      }
    }
  } else if (typeof value === 'string') {
    const pieces = value
      .split(/[\n,;]+/)
      .map(piece => piece.trim())
      .filter(Boolean);
    results.push(...pieces);
  }
  const deduped = Array.from(new Set(results.map(item => item.replace(/\s+/g, ' ').trim())));
  return deduped.filter(Boolean);
}

function coercePreferredTerms(raw: unknown): Record<string, string> | null {
  if (!raw || typeof raw !== 'object') return null;
  const entries = Object.entries(raw as Record<string, unknown>)
    .map(([key, value]) => {
      if (typeof value === 'string' && value.trim()) {
        return [String(key).trim(), value.trim()] as [string, string];
      }
      return null;
    })
    .filter((entry): entry is [string, string] => Array.isArray(entry));
  if (!entries.length) return null;
  return entries.reduce<Record<string, string>>((acc, [key, val]) => {
    acc[key] = val;
    return acc;
  }, {});
}

function normalizeIndicatorLabel(raw: Record<string, any>): { label: string | null; touched: boolean } {
  let label: string | null = null;
  let touched = false;

  if (raw.preferred_terms && typeof raw.preferred_terms === 'object') {
    const preferred = raw.preferred_terms as Record<string, any>;
    if (owns(preferred, 'indicators_label') && typeof preferred.indicators_label === 'string') {
      label = preferred.indicators_label.trim() || null;
      touched = true;
    } else if (owns(preferred, 'indicator_label') && typeof preferred.indicator_label === 'string') {
      label = preferred.indicator_label.trim() || null;
      touched = true;
    } else {
      for (const key of INDICATOR_LABEL_KEYS) {
        if (owns(preferred, key) && typeof preferred[key] === 'string') {
          label = preferred[key].trim() || null;
          touched = true;
          break;
        }
      }
    }
  }

  if (!label) {
    for (const key of INDICATOR_LABEL_KEYS) {
      if (owns(raw, key) && typeof raw[key] === 'string') {
        label = raw[key].trim() || null;
        touched = true;
        break;
      }
    }
  }

  return { label, touched };
}

function extractIndicatorChoices(raw: Record<string, any>): { values: string[]; touched: boolean } {
  let touched = false;
  const choices: string[] = [];
  for (const key of INDICATOR_CHOICE_KEYS) {
    if (!owns(raw, key)) continue;
    touched = true;
    choices.push(...coerceStringArray(raw[key]));
  }
  const deduped = Array.from(new Set(choices.map(choice => choice.trim()).filter(Boolean)));
  if (!deduped.length && touched) {
    return { values: [], touched: true };
  }
  return { values: deduped, touched };
}

function coerceProfileString(raw: Record<string, any>, keys: string[]): { value: string | null; touched: boolean } {
  for (const key of keys) {
    if (owns(raw, key) && typeof raw[key] === 'string') {
      const value = raw[key].trim();
      return { value: value || null, touched: true };
    }
  }
  return { value: null, touched: keys.some(key => owns(raw, key)) };
}

interface ProfileSanitization {
  values: Record<string, any>;
  summary: string[];
}

function sanitizeProfile(rawProfile: Record<string, any> | null | undefined): ProfileSanitization {
  if (!rawProfile || typeof rawProfile !== 'object') {
    return { values: {}, summary: [] };
  }

  const profile: Record<string, any> = {};
  const summary: string[] = [];

  const companyName = coerceProfileString(rawProfile, COMPANY_NAME_KEYS);
  if (companyName.value) {
    profile.company_name = companyName.value;
    summary.push(`Company → ${companyName.value}`);
  }

  const companyUrl = coerceProfileString(rawProfile, COMPANY_URL_KEYS);
  if (companyUrl.value) {
    profile.company_url = companyUrl.value;
    summary.push(`Website → ${companyUrl.value}`);
  } else if (companyUrl.touched && companyUrl.value === null) {
    profile.company_url = null;
  }

  const industry = coerceProfileString(rawProfile, INDUSTRY_KEYS);
  if (industry.value) {
    profile.industry = industry.value;
    summary.push(`Industry → ${industry.value}`);
  } else if (industry.touched && industry.value === null) {
    profile.industry = null;
  }

  const icp = coerceProfileString(rawProfile, ICP_KEYS);
  if (icp.value) {
    profile.icp_definition = icp.value;
    summary.push(`ICP → ${icp.value}`);
  } else if (icp.touched && icp.value === null) {
    profile.icp_definition = null;
  }

  const role = coerceProfileString(rawProfile, ROLE_KEYS);
  if (role.value) {
    profile.user_role = role.value;
    summary.push(`Role → ${role.value}`);
  } else if (role.touched && role.value === null) {
    profile.user_role = null;
  }

  const useCase = coerceProfileString(rawProfile, USE_CASE_KEYS);
  if (useCase.value) {
    profile.use_case = useCase.value;
    summary.push(`Use case → ${useCase.value}`);
  } else if (useCase.touched && useCase.value === null) {
    profile.use_case = null;
  }

  if (owns(rawProfile, 'notes') && typeof rawProfile.notes === 'string') {
    profile.notes = rawProfile.notes.trim();
  }

  if (owns(rawProfile, 'metadata') && typeof rawProfile.metadata === 'object') {
    profile.metadata = rawProfile.metadata;
  }

  const targetTitles = TARGET_TITLE_KEYS.map(key => owns(rawProfile, key) ? coerceStringArray(rawProfile[key]) : null)
    .filter((value): value is string[] => Array.isArray(value) && value.length > 0)
    .flat();
  if (targetTitles.length) {
    profile.target_titles = Array.from(new Set(targetTitles));
    summary.push(`Target titles → ${profile.target_titles.join(', ')}`);
  } else if (TARGET_TITLE_KEYS.some(key => owns(rawProfile, key))) {
    profile.target_titles = [];
    summary.push('Target titles cleared');
  }

  const competitors = COMPETITOR_KEYS.map(key => owns(rawProfile, key) ? coerceStringArray(rawProfile[key]) : null)
    .filter((value): value is string[] => Array.isArray(value) && value.length > 0)
    .flat();
  if (competitors.length) {
    profile.competitors = Array.from(new Set(competitors));
    summary.push(`Competitors → ${profile.competitors.join(', ')}`);
  } else if (COMPETITOR_KEYS.some(key => owns(rawProfile, key))) {
    profile.competitors = [];
    summary.push('Competitors cleared');
  }

  const focusAreas = RESEARCH_FOCUS_KEYS.map(key => owns(rawProfile, key) ? coerceStringArray(rawProfile[key]) : null)
    .filter((value): value is string[] => Array.isArray(value) && value.length > 0)
    .flat();
  if (focusAreas.length) {
    profile.research_focus = Array.from(new Set(focusAreas));
    summary.push(`Research focus → ${profile.research_focus.join(', ')}`);
  } else if (RESEARCH_FOCUS_KEYS.some(key => owns(rawProfile, key))) {
    profile.research_focus = [];
    summary.push('Research focus cleared');
  }

  const preferredTerms = coercePreferredTerms(rawProfile.preferred_terms);
  const indicatorMeta = normalizeIndicatorLabel(rawProfile);
  if (indicatorMeta.label) {
    if (!preferredTerms) {
      profile.preferred_terms = { indicators_label: indicatorMeta.label };
    } else {
      profile.preferred_terms = { ...preferredTerms, indicators_label: indicatorMeta.label };
    }
    summary.push(`Signals label → ${indicatorMeta.label}`);
  } else if (preferredTerms) {
    profile.preferred_terms = preferredTerms;
  }
  if (!indicatorMeta.label && indicatorMeta.touched && !preferredTerms) {
    // Explicit request to clear label
    profile.preferred_terms = { indicators_label: null };
    summary.push('Signals label cleared');
  }

  const indicatorChoices = extractIndicatorChoices(rawProfile);
  if (indicatorChoices.touched) {
    profile.indicator_choices = indicatorChoices.values;
    if (indicatorChoices.values.length) {
      summary.push(`Watch list → ${indicatorChoices.values.join(', ')}`);
    } else {
      summary.push('Watch list cleared');
    }
  }

  return { values: profile, summary };
}

function sanitizeCustomCriteria(raw: any[] | null | undefined): Array<{
  field_name: string;
  field_type: string;
  importance: string;
  hints: string[];
}> {
  if (!Array.isArray(raw)) return [];
  const rows: Array<{
    field_name: string;
    field_type: string;
    importance: string;
    hints: string[];
  }> = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const fieldName = typeof item.field_name === 'string' ? item.field_name.trim() :
      typeof item.name === 'string' ? item.name.trim() : '';
    if (!fieldName) continue;
    const fieldTypeRaw = typeof item.field_type === 'string' ? item.field_type.trim() : '';
    const fieldType = fieldTypeRaw || 'text';
    const importanceRaw = typeof item.importance === 'string' ? item.importance.trim().toLowerCase() : '';
    const importance = ['critical', 'important', 'optional'].includes(importanceRaw)
      ? importanceRaw
      : 'important';
    const hints = coerceStringArray(item.hints || []);
    rows.push({
      field_name: fieldName,
      field_type: fieldType,
      importance,
      hints,
    });
  }
  return rows;
}

function sanitizeSignalPreferences(raw: any[] | null | undefined): Array<{
  signal_type: string;
  importance: string;
  lookback_days: number | null;
  config: Record<string, any>;
}> {
  if (!Array.isArray(raw)) return [];
  const rows: Array<{
    signal_type: string;
    importance: string;
    lookback_days: number | null;
    config: Record<string, any>;
  }> = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const signalType = typeof item.signal_type === 'string'
      ? item.signal_type.trim()
      : typeof item.type === 'string'
        ? item.type.trim()
        : '';
    if (!signalType) continue;
    const importanceRaw = typeof item.importance === 'string' ? item.importance.trim().toLowerCase() : '';
    const importance = ['critical', 'important', 'nice_to_have'].includes(importanceRaw)
      ? importanceRaw
      : 'important';
    let lookback: number | null = null;
    if (typeof item.lookback_days === 'number') {
      lookback = item.lookback_days;
    } else if (typeof item.lookback_days === 'string') {
      const parsed = parseInt(item.lookback_days, 10);
      lookback = Number.isFinite(parsed) ? parsed : null;
    }
    if (lookback === null) lookback = 90;
    const config = (item.config && typeof item.config === 'object')
      ? (item.config as Record<string, any>)
      : {};
    rows.push({
      signal_type: signalType,
      importance,
      lookback_days: lookback,
      config,
    });
  }
  return rows;
}

function sanitizeDisqualifiers(raw: any[] | null | undefined): Array<{ criterion: string }> {
  if (!Array.isArray(raw)) return [];
  const rows: Array<{ criterion: string }> = [];
  for (const item of raw) {
    if (!item) continue;
    const value = typeof item === 'string' ? item.trim()
      : typeof item.criterion === 'string' ? item.criterion.trim()
      : '';
    if (!value) continue;
    rows.push({ criterion: value });
  }
  return rows;
}

function sanitizePromptConfig(raw: Record<string, any> | null | undefined): Record<string, any> | null {
  if (!raw || typeof raw !== 'object') return null;
  const allowedKeys = new Set([
    'preferred_research_type',
    'default_output_brevity',
    'default_tone',
    'always_tldr',
  ]);
  const config: Record<string, any> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!allowedKeys.has(key)) continue;
    if (value === undefined) continue;
    config[key] = value;
  }
  return Object.keys(config).length ? config : null;
}

function normalizePayload(candidate: any): SaveProfilePayload | null {
  if (!candidate || typeof candidate !== 'object') return null;
  if (candidate.action === 'save_profile') {
    return {
      action: 'save_profile',
      profile: candidate.profile ?? null,
      custom_criteria: Array.isArray(candidate.custom_criteria) ? candidate.custom_criteria : candidate.custom_criteria ?? null,
      signal_preferences: Array.isArray(candidate.signal_preferences) ? candidate.signal_preferences : candidate.signal_preferences ?? null,
      disqualifying_criteria: Array.isArray(candidate.disqualifying_criteria) ? candidate.disqualifying_criteria : candidate.disqualifying_criteria ?? null,
      prompt_config: typeof candidate.prompt_config === 'object' ? candidate.prompt_config : null,
    };
  }
  if (candidate.save_profile && typeof candidate.save_profile === 'object') {
    return normalizePayload({ action: 'save_profile', ...candidate.save_profile });
  }
  return null;
}

export function extractSaveProfilePayloads(raw: string, limit = 4): SaveProfilePayload[] {
  if (typeof raw !== 'string' || !raw.includes('save_profile')) return [];
  const payloads: SaveProfilePayload[] = [];
  const seen = new Set<string>();

  const codeBlock = /```json\s*([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;
  while ((match = codeBlock.exec(raw)) !== null && payloads.length < limit) {
    const candidate = match[1] ? match[1].trim() : '';
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    try {
      const parsed = JSON.parse(candidate);
      const normalized = normalizePayload(parsed);
      if (normalized) payloads.push(normalized);
    } catch {
      // ignore parse errors inside code block
    }
  }

  if (payloads.length >= limit) return payloads;

  const inlineRegex = /\{[\s\S]{0,4000}?"action"\s*:\s*"save_profile"[\s\S]{0,4000}?\}/gi;
  let inlineMatch: RegExpExecArray | null;
  while ((inlineMatch = inlineRegex.exec(raw)) !== null && payloads.length < limit) {
    const candidate = inlineMatch[0]?.trim();
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    try {
      const parsed = JSON.parse(candidate);
      const normalized = normalizePayload(parsed);
      if (normalized) payloads.push(normalized);
    } catch {
      // swallow error and continue
    }
  }

  if (payloads.length === 0) {
    try {
      const parsed = JSON.parse(raw);
      const normalized = normalizePayload(parsed);
      if (normalized) payloads.push(normalized);
    } catch {
      // ignore
    }
  }

  return payloads;
}

async function applySinglePayload(
  supabase: SupabaseDb,
  userId: string,
  payload: SaveProfilePayload
): Promise<SaveProfileResult> {
  const summary: string[] = [];
  let profileRow: Record<string, any> | null = null;
  let customCriteria: any[] = [];
  let signalPreferences: any[] = [];
  let disqualifiers: any[] = [];
  let promptConfig: Record<string, any> | null = null;

  if (payload.profile && typeof payload.profile === 'object') {
    const { data: existingProfile, error: fetchError } = await supabase
      .from('company_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (fetchError) throw fetchError;

    const sanitized = sanitizeProfile(payload.profile);
    const updatePayload: Record<string, any> = { ...sanitized.values };

    if (existingProfile) {
      if (Array.isArray(updatePayload.indicator_choices)) {
        if (updatePayload.indicator_choices.length === 0) {
          updatePayload.indicator_choices = [];
        } else {
          const existing = Array.isArray(existingProfile.indicator_choices)
            ? existingProfile.indicator_choices.map((entry: any) => typeof entry === 'string' ? entry.trim() : '').filter(Boolean)
            : [];
          const merged = new Set<string>();
          for (const value of [...existing, ...updatePayload.indicator_choices]) {
            if (typeof value === 'string' && value.trim()) {
              merged.add(value.trim());
            }
          }
          updatePayload.indicator_choices = Array.from(merged);
        }
      }
      if (updatePayload.preferred_terms) {
        const existingTerms = existingProfile.preferred_terms || {};
        updatePayload.preferred_terms = {
          ...(typeof existingTerms === 'object' && existingTerms ? existingTerms : {}),
          ...updatePayload.preferred_terms,
        };
      }
      updatePayload.updated_at = new Date().toISOString();
      const { data, error } = await supabase
        .from('company_profiles')
        .update(updatePayload)
        .eq('user_id', userId)
        .select()
        .single();
      if (error) throw error;
      profileRow = data;
    } else if (Object.keys(updatePayload).length > 0) {
      const insertPayload = {
        user_id: userId,
        ...updatePayload,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from('company_profiles')
        .insert(insertPayload)
        .select()
        .single();
      if (error) throw error;
      profileRow = data;
    }
    summary.push(...sanitized.summary);
  }

  if (payload.custom_criteria !== undefined) {
    const sanitizedCriteria = sanitizeCustomCriteria(payload.custom_criteria || []);
    const { error: deleteError } = await supabase
      .from('user_custom_criteria')
      .delete()
      .eq('user_id', userId);
    if (deleteError) throw deleteError;
    if (sanitizedCriteria.length > 0) {
      const rowsWithOrder = sanitizedCriteria.map((row, index) => ({
        user_id: userId,
        field_name: row.field_name,
        field_type: row.field_type,
        importance: row.importance,
        hints: row.hints,
        display_order: index + 1,
      }));
      const { data, error } = await supabase
        .from('user_custom_criteria')
        .insert(rowsWithOrder)
        .select();
      if (error) throw error;
      customCriteria = data || [];
      summary.push(`Custom criteria → ${rowsWithOrder.map(row => row.field_name).join(', ')}`);
    } else {
      customCriteria = [];
      summary.push('Custom criteria cleared');
    }
  }

  if (payload.signal_preferences !== undefined) {
    const sanitizedSignals = sanitizeSignalPreferences(payload.signal_preferences || []);
    const { error: deleteError } = await supabase
      .from('user_signal_preferences')
      .delete()
      .eq('user_id', userId);
    if (deleteError) throw deleteError;
    if (sanitizedSignals.length > 0) {
      const rows = sanitizedSignals.map(row => ({
        user_id: userId,
        signal_type: row.signal_type,
        importance: row.importance,
        lookback_days: row.lookback_days,
        config: row.config,
      }));
      const { data, error } = await supabase
        .from('user_signal_preferences')
        .insert(rows)
        .select();
      if (error) throw error;
      signalPreferences = data || [];
      summary.push(`Signal alerts → ${rows.map(row => row.signal_type).join(', ')}`);
    } else {
      signalPreferences = [];
      summary.push('Signal alerts cleared');
    }
  }

  if (payload.disqualifying_criteria !== undefined) {
    const sanitizedDisqualifiers = sanitizeDisqualifiers(payload.disqualifying_criteria || []);
    const { error: deleteError } = await supabase
      .from('user_disqualifying_criteria')
      .delete()
      .eq('user_id', userId);
    if (deleteError) throw deleteError;
    if (sanitizedDisqualifiers.length > 0) {
      const rows = sanitizedDisqualifiers.map(row => ({
        user_id: userId,
        criterion: row.criterion,
      }));
      const { data, error } = await supabase
        .from('user_disqualifying_criteria')
        .insert(rows)
        .select();
      if (error) throw error;
      disqualifiers = data || [];
      summary.push(`Disqualifiers → ${rows.map(row => row.criterion).join(', ')}`);
    } else {
      disqualifiers = [];
      summary.push('Disqualifiers cleared');
    }
  }

  if (payload.prompt_config !== undefined) {
    const sanitizedConfig = sanitizePromptConfig(payload.prompt_config);
    if (sanitizedConfig) {
      const { data: existingConfig } = await supabase
        .from('user_prompt_config')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();
      if (existingConfig) {
        const { error } = await supabase
          .from('user_prompt_config')
          .update({ ...sanitizedConfig, updated_at: new Date().toISOString() })
          .eq('user_id', userId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('user_prompt_config')
          .insert({ user_id: userId, ...sanitizedConfig });
        if (error) throw error;
      }
      promptConfig = sanitizedConfig;
      summary.push('Prompt configuration updated');
    }
  }

  return {
    summary,
    profile: profileRow,
    customCriteria,
    signalPreferences,
    disqualifyingCriteria: disqualifiers,
    promptConfig,
  };
}

export async function applySaveProfilePayloads(
  supabase: SupabaseDb,
  userId: string,
  payloads: SaveProfilePayload[]
): Promise<SaveProfileResult> {
  const aggregateSummary: string[] = [];
  let finalProfile: Record<string, any> | null = null;
  let finalCriteria: any[] = [];
  let finalSignals: any[] = [];
  let finalDisqualifiers: any[] = [];
  let finalPromptConfig: Record<string, any> | null = null;

  for (const payload of payloads) {
    const result = await applySinglePayload(supabase, userId, payload);
    aggregateSummary.push(...result.summary);
    if (result.profile) finalProfile = result.profile;
    if (payload.custom_criteria !== undefined) finalCriteria = result.customCriteria;
    if (payload.signal_preferences !== undefined) finalSignals = result.signalPreferences;
    if (payload.disqualifying_criteria !== undefined) finalDisqualifiers = result.disqualifyingCriteria;
    if (payload.prompt_config !== undefined) finalPromptConfig = result.promptConfig;
  }

  return {
    summary: aggregateSummary,
    profile: finalProfile,
    customCriteria: finalCriteria,
    signalPreferences: finalSignals,
    disqualifyingCriteria: finalDisqualifiers,
    promptConfig: finalPromptConfig,
  };
}
