import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Loader2, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useToast } from './ToastProvider';

type FieldType = 'text' | 'number' | 'boolean' | 'list';
type Importance = 'critical' | 'important' | 'optional';

interface OptimizeICPModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface CriterionDraft {
  id?: string;
  field_name: string;
  field_type: FieldType;
  importance: Importance;
  hintsText: string;
}

const EMPTY_CRITERION: CriterionDraft = {
  field_name: '',
  field_type: 'text',
  importance: 'important',
  hintsText: '',
};

const FIELD_TYPE_OPTIONS: Array<{ value: FieldType; label: string; helper: string }> = [
  { value: 'text', label: 'Text insight', helper: 'Free-form notes or narrative context' },
  { value: 'number', label: 'Numeric metric', helper: 'Headcount, revenue, budget, etc.' },
  { value: 'boolean', label: 'Yes / No check', helper: 'Presence of role, initiative, requirement' },
  { value: 'list', label: 'List of items', helper: 'Tech stacks, compliance frameworks, partners' },
];

const IMPORTANCE_OPTIONS: Array<{ value: Importance; label: string; helper: string }> = [
  { value: 'critical', label: 'Critical (must have)', helper: 'Deal breaker signals. Highlight prominently.' },
  { value: 'important', label: 'Important (strong signal)', helper: 'High-impact qualifier that influences outreach.' },
  { value: 'optional', label: 'Optional (nice to know)', helper: 'Contextual enrichment, use if time allows.' },
];

const MAX_CRITERIA = 8;

export function OptimizeICPModal({ isOpen, onClose }: OptimizeICPModalProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [criteriaDraft, setCriteriaDraft] = useState<CriterionDraft[]>([]);
  const [touched, setTouched] = useState(false);

  const userId = user?.id;

  const loadCriteria = useCallback(async () => {
    if (!userId) {
      setCriteriaDraft([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('user_custom_criteria')
        .select('id, field_name, field_type, importance, hints')
        .eq('user_id', userId)
        .order('display_order', { ascending: true });

      if (fetchError) throw fetchError;

      const mapped = (data || []).map((item) => ({
        id: item.id,
        field_name: item.field_name || '',
        field_type: (item.field_type || 'text') as FieldType,
        importance: (item.importance || 'important') as Importance,
        hintsText: Array.isArray(item.hints) ? item.hints.join(', ') : '',
      }));

      if (mapped.length > 0) {
        setCriteriaDraft(mapped);
      } else {
        setCriteriaDraft([EMPTY_CRITERION]);
      }
      setTouched(false);
    } catch (err) {
      console.error('Failed to load custom criteria', err);
      setError('Could not load your qualifying criteria. Please try again.');
      setCriteriaDraft([EMPTY_CRITERION]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    void loadCriteria();
  }, [isOpen, loadCriteria]);

  useEffect(() => {
    if (!isOpen) {
      setError(null);
    }
  }, [isOpen]);

  const updateCriterion = (index: number, patch: Partial<CriterionDraft>) => {
    if (error) setError(null);
    setCriteriaDraft((prev) => prev.map((item, idx) => (idx === index ? { ...item, ...patch } : item)));
    setTouched(true);
  };

  const addCriterion = () => {
    if (criteriaDraft.length >= MAX_CRITERIA) {
      setError(`You can track up to ${MAX_CRITERIA} criteria. Remove one to add another.`);
      return;
    }
    setCriteriaDraft((prev) => [...prev, { ...EMPTY_CRITERION }]);
    setTouched(true);
    setError(null);
  };

  const removeCriterion = (index: number) => {
    setError(null);
    setCriteriaDraft((prev) => {
      const next = [...prev];
      next.splice(index, 1);
      if (next.length === 0) {
        next.push({ ...EMPTY_CRITERION });
      }
      return next;
    });
    setTouched(true);
  };

  const moveCriterion = (index: number, direction: -1 | 1) => {
    setError(null);
    setCriteriaDraft((prev) => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      const temp = next[targetIndex];
      next[targetIndex] = next[index];
      next[index] = temp;
      return next;
    });
    setTouched(true);
  };

  const normalizedCriteria = useMemo(() => {
    return criteriaDraft
      .map((item) => ({
        ...item,
        field_name: item.field_name.trim(),
        hintsArray: item.hintsText
          .split(',')
          .map((hint) => hint.trim())
          .filter((hint) => hint.length > 0),
      }))
      .filter((item) => item.field_name.length > 0);
  }, [criteriaDraft]);

  const hasDuplicateNames = useMemo(() => {
    const seen = new Set<string>();
    for (const criterion of normalizedCriteria) {
      const key = criterion.field_name.toLowerCase();
      if (seen.has(key)) return true;
      seen.add(key);
    }
    return false;
  }, [normalizedCriteria]);

  const saveDisabled = loading || saving || hasDuplicateNames || !touched;

  const handleSave = async () => {
    if (!userId) {
      setError('You need to be signed in to update your ICP preferences.');
      return;
    }

    const invalid = normalizedCriteria.filter((item) => item.field_name.length < 3);
    if (invalid.length > 0) {
      setError('Each criterion should be at least 3 characters long.');
      return;
    }

    if (hasDuplicateNames) {
      setError('Each criterion must have a unique name.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const { error: deleteError } = await supabase
        .from('user_custom_criteria')
        .delete()
        .eq('user_id', userId);

      if (deleteError) throw deleteError;

      if (normalizedCriteria.length > 0) {
        const payload = normalizedCriteria.map((item, idx) => ({
          user_id: userId,
          field_name: item.field_name,
          field_type: item.field_type,
          importance: item.importance,
          hints: item.hintsArray,
          display_order: idx + 1,
        }));

        const { error: insertError } = await supabase
          .from('user_custom_criteria')
          .insert(payload);

        if (insertError) throw insertError;
      }

      const detail = normalizedCriteria.map((item, idx) => ({
        id: item.id,
        field_name: item.field_name,
        field_type: item.field_type,
        importance: item.importance,
        hints: item.hintsArray,
        display_order: idx + 1,
      }));

      window.dispatchEvent(new CustomEvent('icp:criteria-updated', { detail: { criteria: detail } }));
      addToast({
        type: 'success',
        title: 'Criteria updated',
        description: normalizedCriteria.length
          ? 'I will optimize future research around these signals.'
          : 'Removed all custom criteria. I will lean on your ICP defaults.',
      });
      setTouched(false);
      onClose();
    } catch (err) {
      console.error('Failed to save custom criteria', err);
      setError('Could not save your changes. Please try again.');
      addToast({
        type: 'error',
        title: 'Save failed',
        description: 'I was unable to update your custom criteria.',
      });
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div
        className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="optimize-icp-title"
      >
        <div className="flex items-start justify-between border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
              <Sparkles className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 id="optimize-icp-title" className="text-lg font-semibold text-gray-900">
                Optimize ICP Fit Criteria
              </h2>
              <p className="text-sm text-gray-600">
                Tell me what matters most so I can score every account with your playbook in mind.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!saving) onClose();
            }}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close Optimize ICP modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5">
          <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-sm text-blue-900">
            <p className="font-medium">Tip: Start with the signals that make an account a no-brainer.</p>
            <p className="mt-1 text-blue-800">
              Examples: “Has they had a security breach recently?”, “Who is the CISO?”, “What compliance frameworks are they chasing?”
            </p>
          </div>

          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="mt-5 space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-gray-500">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Loading your criteria…
              </div>
            ) : (
              criteriaDraft.map((criterion, index) => (
                <div
                  key={criterion.id ?? `criterion-${index}`}
                  className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-blue-200"
                >
                  <div className="flex flex-col gap-3 border-b border-gray-100 pb-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-blue-700">
                        {index + 1}
                      </span>
                      Priority Criterion
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => moveCriterion(index, -1)}
                        disabled={index === 0 || saving}
                        className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-xs ${
                          index === 0 || saving
                            ? 'cursor-not-allowed border-gray-200 text-gray-300'
                            : 'border-gray-300 text-gray-600 hover:border-blue-300 hover:text-blue-600'
                        }`}
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                        Up
                      </button>
                      <button
                        type="button"
                        onClick={() => moveCriterion(index, 1)}
                        disabled={index === criteriaDraft.length - 1 || saving}
                        className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-xs ${
                          index === criteriaDraft.length - 1 || saving
                            ? 'cursor-not-allowed border-gray-200 text-gray-300'
                            : 'border-gray-300 text-gray-600 hover:border-blue-300 hover:text-blue-600'
                        }`}
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                        Down
                      </button>
                      <button
                        type="button"
                        onClick={() => removeCriterion(index)}
                        disabled={criteriaDraft.length === 1 || saving}
                        className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-xs ${
                          criteriaDraft.length === 1 || saving
                            ? 'cursor-not-allowed border-gray-200 text-gray-300'
                            : 'border-red-200 text-red-600 hover:border-red-400 hover:text-red-700'
                        }`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remove
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 space-y-4">
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                        What should I look for?
                      </label>
                      <input
                        type="text"
                        value={criterion.field_name}
                        onChange={(event) => updateCriterion(index, { field_name: event.target.value })}
                        placeholder="e.g. Have they experienced a security incident in the last 12 months?"
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        disabled={saving}
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                          How should I evaluate it?
                        </label>
                        <select
                          value={criterion.field_type}
                          onChange={(event) =>
                            updateCriterion(index, { field_type: event.target.value as FieldType })
                          }
                          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          disabled={saving}
                        >
                          {FIELD_TYPE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <p className="mt-1 text-xs text-gray-500">
                          {FIELD_TYPE_OPTIONS.find((opt) => opt.value === criterion.field_type)?.helper}
                        </p>
                      </div>

                      <div>
                        <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                          Importance
                        </label>
                        <select
                          value={criterion.importance}
                          onChange={(event) =>
                            updateCriterion(index, { importance: event.target.value as Importance })
                          }
                          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          disabled={saving}
                        >
                          {IMPORTANCE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <p className="mt-1 text-xs text-gray-500">
                          {IMPORTANCE_OPTIONS.find((opt) => opt.value === criterion.importance)?.helper}
                        </p>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                        Search hints (comma separated)
                      </label>
                      <input
                        type="text"
                        value={criterion.hintsText}
                        onChange={(event) => updateCriterion(index, { hintsText: event.target.value })}
                        placeholder="breach, ransomware, incident, security incident"
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        disabled={saving}
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        Helps me find better sources. Separate phrases with commas.
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={addCriterion}
              disabled={saving || loading || criteriaDraft.length >= MAX_CRITERIA}
              className="inline-flex items-center gap-2 rounded-lg border border-dashed border-blue-300 px-3 py-2 text-sm font-medium text-blue-700 hover:border-blue-400 hover:text-blue-800 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400"
            >
              <Plus className="h-4 w-4" />
              Add another criterion
            </button>
            <div className="text-xs text-gray-500">
              {criteriaDraft.length}/{MAX_CRITERIA} criteria configured
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-gray-200 px-6 py-4 bg-gray-50">
          <div className="text-xs text-gray-500">
            {touched ? 'Unsaved changes' : 'All changes saved'}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (!saving) onClose();
              }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saveDisabled}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition ${
                saveDisabled ? 'cursor-not-allowed bg-blue-300' : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save criteria
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
