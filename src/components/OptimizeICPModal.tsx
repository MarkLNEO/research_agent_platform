import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from './ToastProvider';

interface OptimizeICPModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Importance = 'critical' | 'important' | 'optional';

interface CriterionRow {
  id?: string;
  field_name: string;
  field_type: 'text' | 'number' | 'boolean' | 'list';
  importance: Importance;
  hints: string[];
}

export function OptimizeICPModal({ isOpen, onClose }: OptimizeICPModalProps) {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<CriterionRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          setError('Not authenticated');
          setLoading(false);
          return;
        }
        const { data, error } = await supabase
          .from('user_custom_criteria')
          .select('id, field_name, field_type, importance, hints')
          .eq('user_id', session.user.id)
          .order('display_order');
        if (error) throw error;
        const initial: CriterionRow[] = (data || []).map((r: any) => ({
          id: r.id,
          field_name: r.field_name,
          field_type: (r.field_type || 'text') as CriterionRow['field_type'],
          importance: (r.importance || 'important') as Importance,
          hints: Array.isArray(r.hints) ? r.hints : [],
        }));
        setRows(initial);
      } catch (e: any) {
        setError(e?.message || 'Failed to load criteria');
      } finally {
        setLoading(false);
      }
    })();
  }, [isOpen]);

  const addRow = () => {
    setRows(prev => ([...prev, {
      field_name: '',
      field_type: 'text',
      importance: 'important',
      hints: []
    }]));
  };

  const removeRow = (idx: number) => {
    setRows(prev => prev.filter((_, i) => i !== idx));
  };

  const canSave = useMemo(() => {
    if (rows.length === 0) return true; // allow clearing
    return rows.every(r => r.field_name.trim().length >= 2);
  }, [rows]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error('Not authenticated');
      // Replace existing rows to keep order simple
      await supabase.from('user_custom_criteria').delete().eq('user_id', session.user.id);
      if (rows.length > 0) {
        const payload = rows.map((r, idx) => ({
          user_id: session.user.id,
          field_name: r.field_name.trim(),
          field_type: r.field_type,
          importance: r.importance,
          hints: r.hints,
          display_order: idx + 1,
        }));
        const { error } = await supabase.from('user_custom_criteria').insert(payload);
        if (error) throw error;
      }
      addToast({ type: 'success', title: 'ICP updated', description: 'Your ICP criteria have been saved.' });
      try {
        window.dispatchEvent(new CustomEvent('profile:updated', { detail: { userId: session.user.id } }));
      } catch {}
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Save failed');
      addToast({ type: 'error', title: 'Save failed', description: e?.message || 'Try again.' });
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-6" onClick={onClose}>
      <div className="w-full max-w-lg bg-white border border-gray-200 rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="text-base font-semibold text-gray-900">Optimize ICP</div>
          <div className="text-xs text-gray-600 mt-0.5">Adjust criteria importance and hints. Changes apply to future runs.</div>
        </div>
        <div className="p-5 max-h-[70vh] overflow-y-auto">
          {loading ? (
            <div className="text-sm text-gray-600">Loading…</div>
          ) : (
            <div className="space-y-3">
              {rows.map((r, idx) => (
                <div key={idx} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <input
                      className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm"
                      value={r.field_name}
                      onChange={(e) => setRows(prev => prev.map((row, i) => i===idx ? { ...row, field_name: e.target.value } : row))}
                      placeholder="Criterion name (e.g., Has dedicated CISO)"
                    />
                    <select
                      className="border border-gray-300 rounded px-2 py-1 text-sm"
                      value={r.importance}
                      onChange={(e) => setRows(prev => prev.map((row, i) => i===idx ? { ...row, importance: e.target.value as Importance } : row))}
                    >
                      <option value="critical">Critical</option>
                      <option value="important">Important</option>
                      <option value="optional">Optional</option>
                    </select>
                    <button className="text-xs text-gray-600 hover:text-red-700" onClick={() => removeRow(idx)}>Remove</button>
                  </div>
                  <div className="mt-2">
                    <label className="text-xs text-gray-600">Hints (comma-separated keywords)</label>
                    <input
                      className="mt-1 w-full border border-gray-300 rounded px-2 py-1 text-sm"
                      value={r.hints.join(', ')}
                      onChange={(e) => {
                        const parts = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                        setRows(prev => prev.map((row,i)=> i===idx ? { ...row, hints: parts } : row));
                      }}
                      placeholder="e.g., CISO, Chief Information Security Officer"
                    />
                  </div>
                </div>
              ))}
              <button className="text-xs text-blue-700 hover:text-blue-900" onClick={addRow}>+ Add criterion</button>
              {error && <div className="text-xs text-red-600">{error}</div>}
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-end gap-2">
          <button className="text-sm text-gray-700" onClick={onClose} disabled={saving}>Cancel</button>
          <button
            className={`text-sm text-white rounded px-3 py-1.5 ${canSave ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-400 cursor-not-allowed'}`}
            onClick={save}
            disabled={!canSave || saving}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

