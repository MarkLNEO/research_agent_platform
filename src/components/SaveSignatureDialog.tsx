import { useEffect, useState } from 'react';
import { useToast } from './ToastProvider';

interface SaveSignatureDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  defaultName?: string;
  defaultTitle?: string;
  defaultCompany?: string;
  defaultSignature?: string;
}

export function SaveSignatureDialog({ open, onClose, onSaved, defaultName = '', defaultTitle = 'Account Executive', defaultCompany = '', defaultSignature = '' }: SaveSignatureDialogProps) {
  const { addToast } = useToast();
  const [name, setName] = useState(defaultName);
  const [title, setTitle] = useState(defaultTitle);
  const [company, setCompany] = useState(defaultCompany);
  const [signature, setSignature] = useState(defaultSignature);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(defaultName);
      setTitle(defaultTitle);
      setCompany(defaultCompany);
      setSignature(defaultSignature || buildDefault(defaultName, defaultTitle, defaultCompany));
    }
  }, [open, defaultName, defaultTitle, defaultCompany, defaultSignature]);

  const buildDefault = (n?: string, t?: string, c?: string) => {
    const parts = [
      'Best,',
      n?.trim() || '[Your Name]',
      [t?.trim() || 'Account Executive', c?.trim()].filter(Boolean).join(', ')
    ];
    return parts.join('\n');
  };

  const save = async () => {
    try {
      setSaving(true);
      const token = (window as any).__supabase_session_token || null;
      // We fetch token from supabase-js indirectly via window if set; fall back to local call
      let authHeader: string | null = null;
      try {
        const mod = await import('../lib/supabase');
        const { supabase } = (mod as any);
        const { data: { session } } = await supabase.auth.getSession();
        authHeader = session?.access_token ? `Bearer ${session.access_token}` : null;
      } catch {}
      if (!authHeader && token) authHeader = `Bearer ${token}`;
      const mergedProfile: any = { user_role: title };
      const meta: any = { email_signature: signature, sender_name: name };
      mergedProfile.metadata = meta;
      const resp = await fetch('/api/update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(authHeader ? { Authorization: authHeader } : {}) },
        body: JSON.stringify({ profile: mergedProfile })
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(text || 'Profile update failed');
      }
      addToast({ type: 'success', title: 'Signature saved', description: 'Future drafts will use your name and signature.' });
      onSaved?.();
      onClose();
    } catch (e: any) {
      addToast({ type: 'error', title: 'Save failed', description: e?.message || 'Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-lg border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-800">Save default signature</h3>
        <p className="text-xs text-gray-500 mt-1">These details will auto-fill future drafts. You can change them anytime.</p>
        <div className="mt-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700">Your name</label>
            <input value={name} onChange={e => setName(e.target.value)} className="mt-1 w-full border border-gray-300 rounded px-2 py-1.5 text-sm" placeholder="Jane Doe" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">Your title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} className="mt-1 w-full border border-gray-300 rounded px-2 py-1.5 text-sm" placeholder="Account Executive" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">Your company (optional)</label>
            <input value={company} onChange={e => setCompany(e.target.value)} className="mt-1 w-full border border-gray-300 rounded px-2 py-1.5 text-sm" placeholder="Acme Inc." />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">Signature template</label>
            <textarea value={signature} onChange={e => setSignature(e.target.value)} rows={4} className="mt-1 w-full border border-gray-300 rounded px-2 py-1.5 text-sm font-mono" />
            <p className="text-[11px] text-gray-500 mt-1">Tip: Use your preferred closing and layout. I’ll use this verbatim.</p>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="text-sm text-gray-600 hover:text-gray-900" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded px-3 py-1.5 disabled:opacity-50" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}

