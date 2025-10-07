import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Filter, Plus, Settings2, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../components/ToastProvider';
import {
  BUILT_IN_SIGNALS,
  deleteSignalPreference,
  listSignalPreferences,
  upsertSignalPreference,
  type UserSignalPreference,
} from '../services/signalService';

interface EditablePreference extends UserSignalPreference {
  isNew?: boolean;
}

const IMPORTANCE_OPTIONS: Array<{ value: UserSignalPreference['importance']; label: string }> = [
  { value: 'critical', label: 'Critical' },
  { value: 'important', label: 'Important' },
  { value: 'nice_to_have', label: 'Nice to have' },
];

export function SignalSettings() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [preferences, setPreferences] = useState<EditablePreference[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('all');
  const [nlText, setNlText] = useState('');
  const [extracting, setExtracting] = useState(false);

  const hasPreferences = preferences.length > 0;
  const hasUnsavedChanges = preferences.some(pref => pref.isNew || !pref.id);

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    try {
      setLoading(true);
      const existing = await listSignalPreferences();
      setPreferences(existing);
    } catch (error) {
      console.error('Failed to load signal preferences', error);
      addToast({
        title: 'Failed to load signal preferences',
        description: error instanceof Error ? error.message : String(error),
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const addPreference = (signalType?: string) => {
    const defaultSignal = BUILT_IN_SIGNALS.find((signal) => signal.id === signalType) ?? BUILT_IN_SIGNALS[0];
    const newPref: EditablePreference = {
      signal_type: defaultSignal.id,
      importance: defaultSignal.defaultImportance,
      lookback_days: defaultSignal.defaultLookback,
      config: {},
      isNew: true,
    };
    setPreferences((prev) => [newPref, ...prev]);
  };

  const updatePreference = (index: number, updates: Partial<EditablePreference>) => {
    setPreferences((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      return next;
    });
  };

  const removePreference = async (pref: EditablePreference, index: number) => {
    if (!pref.id) {
      setPreferences((prev) => prev.filter((_, idx) => idx !== index));
      return;
    }

    try {
      await deleteSignalPreference(pref.id);
      setPreferences((prev) => prev.filter((_, idx) => idx !== index));
      addToast({ title: 'Preference removed', type: 'info' });
    } catch (error) {
      console.error('Failed to delete signal preference', error);
      addToast({
        title: 'Failed to delete preference',
        description: error instanceof Error ? error.message : String(error),
        type: 'error',
      });
    }
  };

  const savePreferences = async () => {
    try {
      setSaving(true);
      for (const pref of preferences) {
        await upsertSignalPreference(pref);
      }
      addToast({ title: 'Signal preferences saved', type: 'success' });
      await loadPreferences();
    } catch (error) {
      console.error('Failed to save signal preferences', error);
      addToast({
        title: 'Failed to save preferences',
        description: error instanceof Error ? error.message : String(error),
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const filteredPreferences = useMemo(() => {
    if (filter === 'all') return preferences;
    if (filter === 'custom') {
      return preferences.filter((pref) => !BUILT_IN_SIGNALS.some((signal) => signal.id === pref.signal_type));
    }
    return preferences.filter((pref) => pref.importance === filter);
  }, [preferences, filter]);

  const renderSignalOptionLabel = (signalType: string) => {
    const builtin = BUILT_IN_SIGNALS.find((signal) => signal.id === signalType);
    return builtin ? builtin.label : `Custom: ${signalType.replace(/_/g, ' ')}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white" data-testid="signal-settings">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <button
            onClick={() => navigate('/settings')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Signal Settings</h1>
            <p className="text-sm text-gray-600">Control which buying signals the agent should monitor.</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Filter className="w-4 h-4" />
            <span>{filteredPreferences.length} of {preferences.length} signals showing</span>
          </div>
        <div className="flex items-center gap-2">
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All signals</option>
              <option value="custom">Custom only</option>
              {IMPORTANCE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          <button
            type="button"
            onClick={() => addPreference()}
            className="inline-flex items-center gap-2 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add signal
          </button>
        </div>
      </div>

      {/* Conversational Extraction */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <div>
          <label htmlFor="signal-extract" className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
            Describe a signal you care about
          </label>
          <textarea
            id="signal-extract"
            value={nlText}
            onChange={(e) => setNlText(e.target.value)}
            placeholder="Example: Alert me when aerospace companies announce a new CISO or experience a security breach."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-describedby="signal-extract-help"
          />
          <p id="signal-extract-help" className="mt-2 text-xs text-gray-500">
            I will translate natural language into a structured monitoring rule you can tweak before saving.
          </p>
        </div>
        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-500">Need inspiration? Try "Funding rounds in defense startups" or "Leadership changes for CIO/CTO".</div>
          <button
            disabled={extracting || !nlText.trim()}
            onClick={async () => {
              try {
                setExtracting(true);
                const { data: session } = await (await import('../lib/supabase')).supabase.auth.getSession();
                const auth = session?.session?.access_token;
                const resp = await fetch('/api/signals/extract', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', ...(auth ? { 'Authorization': `Bearer ${auth}` } : {}) },
                  body: JSON.stringify({ text: nlText })
                });
                const json = await resp.json();
                if (!resp.ok) throw new Error(json?.error || 'Extraction failed');
                const p = json.preference || {};
                if (!p.signal_type) {
                  addToast({ type: 'error', title: 'No preference extracted' });
                  return;
                }
                setPreferences(prev => [{
                  signal_type: p.signal_type,
                  importance: p.importance || 'important',
                  lookback_days: Math.max(7, Math.min(365, Number(p.lookback_days) || 90)),
                  config: p.config || {},
                  isNew: true,
                }, ...prev]);
                addToast({ type: 'success', title: 'Extracted preference', description: 'Review and save.' });
              } catch (e: any) {
                addToast({ type: 'error', title: 'Failed to extract', description: e?.message || String(e) });
              } finally {
                setExtracting(false);
              }
            }}
            className="px-3 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-blue-300"
          >
            {extracting ? 'Extracting…' : 'Extract from text'}
          </button>
        </div>
      </div>

        {!hasPreferences ? (
          <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-6 text-sm text-gray-700">
            <p className="font-medium text-gray-900 mb-3">Start with a recommended signal</p>
            <div className="flex flex-wrap gap-2">
              {BUILT_IN_SIGNALS.slice(0, 4).map((signal) => (
                <button
                  key={signal.id}
                  onClick={() => addPreference(signal.id)}
                  className="px-3 py-1.5 text-xs bg-white border border-gray-300 rounded-full hover:border-blue-400 hover:bg-blue-50"
                >
                  {signal.label}
                </button>
              ))}
            </div>
            <p className="mt-4 text-xs text-gray-500">You can add more at any time. I’ll alert you every time these signals fire on your tracked accounts.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredPreferences.map((pref, index) => {
              const globalIndex = preferences.indexOf(pref);
              return (
                <div
                  key={`${pref.id ?? pref.signal_type}-${index}`}
                  className="border border-gray-200 rounded-xl p-4 flex flex-col gap-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center">
                        <Settings2 className="w-4 h-4 text-blue-700" />
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900 text-sm">
                          {renderSignalOptionLabel(pref.signal_type)}
                        </div>
                        <div className="text-xs text-gray-500">
                          {pref.isNew ? 'New signal preference' : pref.id ? 'Saved preference' : 'Unsaved preference'}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removePreference(pref, globalIndex)}
                      className="text-sm text-red-600 hover:text-red-800 inline-flex items-center gap-1"
                    >
                      <Trash2 className="w-4 h-4" />
                      Remove
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
                    <div className="md:col-span-1">
                      <label className="block text-xs font-medium text-gray-600 mb-1">Signal type</label>
                      <select
                        value={pref.signal_type}
                        onChange={(event) => updatePreference(globalIndex, { signal_type: event.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {BUILT_IN_SIGNALS.map((signal) => (
                          <option key={signal.id} value={signal.id}>
                            {signal.label}
                          </option>
                        ))}
                        {!BUILT_IN_SIGNALS.some((signal) => signal.id === pref.signal_type) && (
                          <option value={pref.signal_type}>{pref.signal_type}</option>
                        )}
                      </select>
                    </div>

                    <div className="md:col-span-1">
                      <label className="block text-xs font-medium text-gray-600 mb-1">Importance</label>
                      <select
                        value={pref.importance}
                        onChange={(event) => updatePreference(globalIndex, { importance: event.target.value as UserSignalPreference['importance'] })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {IMPORTANCE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="md:col-span-1">
                      <label className="block text-xs font-medium text-gray-600 mb-1">Lookback (days)</label>
                      <input
                        type="number"
                        min={7}
                        max={365}
                        value={pref.lookback_days}
                        onChange={(event) => updatePreference(globalIndex, { lookback_days: Number(event.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div className="md:col-span-1">
                      <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                      <input
                        type="text"
                        value={pref.config?.notes ?? ''}
                        onChange={(event) => updatePreference(globalIndex, {
                          config: { ...pref.config, notes: event.target.value },
                        })}
                        placeholder="Optional configuration hints"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={() => navigate('/settings')}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={savePreferences}
            disabled={saving || !hasPreferences}
            className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            {saving ? 'Saving...' : hasUnsavedChanges ? 'Save changes' : 'Nothing to save'}
          </button>
        </div>
      </div>
    </div>
  );
}
