import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Loader2, Mail, User, Users, X } from 'lucide-react';

export interface DraftEmailRecipient {
  name: string;
  title?: string | null;
}

interface DraftEmailDialogProps {
  open: boolean;
  loading: boolean;
  company?: string | null;
  candidates: DraftEmailRecipient[];
  defaultRole?: string;
  initialSenderName?: string;
  initialSenderTitle?: string;
  onClose: () => void;
  onSubmit: (options: {
    recipientName?: string;
    recipientTitle?: string;
    useGeneric: boolean;
    senderName?: string;
    senderTitle?: string;
    rememberSender?: boolean;
  }) => void;
}

type Mode = 'candidate' | 'custom' | 'generic';

export function DraftEmailDialog({
  open,
  loading,
  company,
  candidates,
  defaultRole = 'CISO',
  initialSenderName,
  initialSenderTitle,
  onClose,
  onSubmit,
}: DraftEmailDialogProps) {
  const [mode, setMode] = useState<Mode>('candidate');
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [customName, setCustomName] = useState('');
  const [customTitle, setCustomTitle] = useState(defaultRole);
  const [senderName, setSenderName] = useState(initialSenderName || '');
  const [senderTitle, setSenderTitle] = useState(initialSenderTitle || '');
  const [rememberSender, setRememberSender] = useState(false);

  useEffect(() => {
    if (open) {
      setMode(candidates.length > 0 ? 'candidate' : 'custom');
      setSelectedIndex(0);
      setCustomName('');
      setCustomTitle(defaultRole || '');
      setSenderName(initialSenderName || '');
      setSenderTitle(initialSenderTitle || '');
      setRememberSender(false);
    }
  }, [open, candidates.length, defaultRole, initialSenderName, initialSenderTitle]);

  const activeCandidate = useMemo(() => {
    if (mode !== 'candidate') return null;
    return candidates[selectedIndex] || null;
  }, [mode, candidates, selectedIndex]);

  if (!open) return null;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (loading) return;

    if (mode === 'candidate' && activeCandidate) {
      onSubmit({
        recipientName: activeCandidate.name,
        recipientTitle: activeCandidate.title || defaultRole,
        useGeneric: false,
        senderName,
        senderTitle,
        rememberSender,
      });
      return;
    }

    if (mode === 'custom' && customName.trim()) {
      onSubmit({
        recipientName: customName.trim(),
        recipientTitle: customTitle.trim() || defaultRole,
        useGeneric: false,
        senderName,
        senderTitle,
        rememberSender,
      });
      return;
    }

    if (mode === 'generic') {
      onSubmit({
        useGeneric: true,
        senderName,
        senderTitle,
        rememberSender,
      });
    }
  };

  const disableSubmit = loading || (mode === 'custom' && !customName.trim());

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm" role="dialog" aria-modal="true">
      <form onSubmit={handleSubmit} className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-gray-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Who should this email address?</h2>
            <p className="text-xs text-gray-600 mt-1">Pick a decision maker or keep it generic. I’ll tailor the draft accordingly.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full text-gray-500 hover:text-gray-900 hover:bg-gray-100"
            aria-label="Close draft email dialog"
            disabled={loading}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
          <section className="space-y-3">
            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Recipient</div>
            {candidates.length > 0 && (
              <div className="rounded-xl border border-gray-200 divide-y divide-gray-100">
                {candidates.map((candidate, index) => {
                  const active = mode === 'candidate' && selectedIndex === index;
                  return (
                    <label
                      key={`${candidate.name}-${index}`}
                      className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors ${active ? 'bg-blue-50 border-l-4 border-blue-500' : 'hover:bg-gray-50'}`}
                    >
                      <input
                        type="radio"
                        className="mt-1"
                        name="email-mode"
                        checked={mode === 'candidate' && selectedIndex === index}
                        onChange={() => {
                          setMode('candidate');
                          setSelectedIndex(index);
                        }}
                      />
                      <div>
                        <div className="text-sm font-semibold text-gray-900">{candidate.name}</div>
                        <div className="text-xs text-gray-600">{candidate.title || defaultRole || 'Decision maker'}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}

            <label
              className={`flex items-start gap-3 px-4 py-3 rounded-xl border border-gray-200 cursor-pointer transition-colors ${mode === 'custom' ? 'bg-blue-50 border-blue-400' : 'hover:bg-gray-50'}`}
            >
              <input
                type="radio"
                name="email-mode"
                className="mt-1"
                checked={mode === 'custom'}
                onChange={() => setMode('custom')}
              />
              <div className="flex-1">
                <div className="text-sm font-semibold text-gray-900 mb-2">Different contact</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Name</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        value={customName}
                        onChange={(e) => setCustomName(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="e.g., James Chen"
                        disabled={mode !== 'custom'}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Title</label>
                    <input
                      type="text"
                      value={customTitle}
                      onChange={(e) => setCustomTitle(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder={defaultRole || 'Role'}
                      disabled={mode !== 'custom'}
                    />
                  </div>
                </div>
              </div>
            </label>

            <label
              className={`flex items-start gap-3 px-4 py-3 rounded-xl border border-gray-200 cursor-pointer transition-colors ${mode === 'generic' ? 'bg-blue-50 border-blue-400' : 'hover:bg-gray-50'}`}
            >
              <input
                type="radio"
                name="email-mode"
                className="mt-1"
                checked={mode === 'generic'}
                onChange={() => setMode('generic')}
              />
              <div>
                <div className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-500" />
                  Keep it generic
                </div>
                <div className="text-xs text-gray-600 mt-1">Draft outreach without a named contact—helpful if you’re unsure who owns security at {company || 'this account'}.</div>
              </div>
            </label>
          </section>

          <section className="space-y-3">
            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Your details (optional)</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Your name</label>
                <input
                  type="text"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Alex Rivera"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Your title</label>
                <input
                  type="text"
                  value={senderTitle}
                  onChange={(e) => setSenderTitle(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Account Executive"
                />
              </div>
            </div>
            <label className="inline-flex items-center gap-2 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={rememberSender}
                onChange={(e) => setRememberSender(e.target.checked)}
              />
              Remember for future drafts
            </label>
          </section>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          <div className="text-xs text-gray-500 flex items-center gap-2">
            <Mail className="w-4 h-4" />
            Emails always stream live so you can copy immediately.
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={disableSubmit}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-lg bg-rose-500 hover:bg-rose-600 disabled:bg-gray-300"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              Draft email
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
