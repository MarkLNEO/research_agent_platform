import { X } from 'lucide-react';
import type { FC } from 'react';

export interface SetupSummaryData {
  companyName?: string | null;
  companyUrl?: string | null;
  industry?: string | null;
  icp?: string | null;
  role?: string | null;
  useCase?: string | null;
  targetTitles?: string[];
  competitors?: string[];
  researchFocus?: string[];
  indicatorLabel?: string | null;
  indicatorChoices?: string[];
  customCriteria?: Array<{ name: string; importance: string }>;
  signalPreferences?: Array<{ signal_type: string; importance: string; lookback_days?: number }>;
  preferences?: Array<{ key: string; value: unknown; source?: string; confidence?: number; updated_at?: string }>;
}

interface SetupSummaryModalProps {
  open: boolean;
  loading?: boolean;
  data: SetupSummaryData | null;
  onClose: () => void;
}

export const SetupSummaryModal: FC<SetupSummaryModalProps> = ({ open, loading, data, onClose }) => {
  if (!open) return null;

  const badge = (label: string, tone: 'default' | 'primary' = 'default') => (
    <span
      key={label}
      className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-full border ${
        tone === 'primary'
          ? 'bg-blue-600 text-white border-blue-600'
          : 'bg-blue-50 text-blue-800 border-blue-100'
      }`}
    >
      {label}
    </span>
  );

  const prettyFocus = (s: string): string => {
    const map: Record<string, string> = {
      customers: 'Customer base',
      competitors: 'Competitors',
      partners: 'Partner ecosystem',
      titles: 'Target roles',
    };
    return map[s as keyof typeof map] || (s?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || '');
  };

  const renderList = (items?: string[], emptyText?: string) => {
    if (!items || items.length === 0) {
      return emptyText ? <p className="text-sm text-gray-500">{emptyText}</p> : null;
    }
    return (
      <div className="flex flex-wrap gap-2">
        {items.map(item => badge(prettyFocus(item)))}
      </div>
    );
  };

  const preferencesList = data?.preferences && data.preferences.length > 0
    ? data.preferences.map(pref => {
        let formatted: string;
        if (pref.value === null || pref.value === undefined) {
          formatted = '—';
        } else if (typeof pref.value === 'object') {
          try {
            formatted = JSON.stringify(pref.value);
          } catch {
            formatted = String(pref.value);
          }
        } else {
          formatted = String(pref.value);
        }
        const confidence = typeof pref.confidence === 'number'
          ? ` (${Math.round(pref.confidence * 100)}% confidence)`
          : '';
        return `${pref.key}: ${formatted}${confidence}`;
      })
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl border border-gray-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Your saved setup</h2>
            <p className="text-sm text-gray-600">
              Everything the agent remembers before it runs research or meeting prep.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-100 text-gray-600"
            aria-label="Close setup summary"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 py-5 max-h-[75vh] overflow-y-auto">
          {loading ? (
            <div className="py-12 text-center text-sm text-gray-600">Loading your setup…</div>
          ) : data ? (
            <div className="space-y-6 text-sm text-gray-800">
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Company profile</h3>
                <div className="grid gap-2">
                  <div>
                    <span className="font-semibold text-gray-700">Organization:</span>{' '}
                    {data.companyName || 'Not specified'}
                  </div>
                  <div>
                    <span className="font-semibold text-gray-700">Industry:</span>{' '}
                    {data.industry || 'Not specified'}
                  </div>
                  <div>
                    <span className="font-semibold text-gray-700">ICP summary:</span>{' '}
                    {data.icp || 'Not specified'}
                  </div>
                  <div>
                    <span className="font-semibold text-gray-700">Role & use case:</span>{' '}
                    {[data.role, data.useCase].filter(Boolean).join(' — ') || 'Not specified'}
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                  Target titles & focus
                </h3>
                {renderList(data.targetTitles, 'No titles saved yet.')}
                {renderList(data.researchFocus, '')}
              </section>

              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                  Buying signals & watch-list
                </h3>
                <div className="space-y-3">
                  <div>
                    <span className="font-semibold text-gray-700">Terminology:</span>{' '}
                    {data.indicatorLabel || 'Signals'}
                  </div>
                  <div>
                    <span className="font-semibold text-gray-700">Watch-list:</span>
                  </div>
                  {renderList(
                    data.indicatorChoices && data.indicatorChoices.length > 0
                      ? data.indicatorChoices
                      : undefined,
                    'No watch-list items yet. Add items in Profile Coach.'
                  )}
                  <div>
                    <span className="font-semibold text-gray-700">Signal alerts configured:</span>
                  </div>
                  {data.signalPreferences && data.signalPreferences.length > 0 ? (
                    <div className="space-y-2">
                      {data.signalPreferences.map(signal => (
                        <div key={`${signal.signal_type}-${signal.importance}`} className="flex flex-wrap gap-2">
                          {badge(signal.signal_type, 'primary')}
                          {badge(signal.importance)}
                          {typeof signal.lookback_days === 'number' ? badge(`${signal.lookback_days}d lookback`) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No signal alerts saved yet.</p>
                  )}
                </div>
              </section>

              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                  Custom criteria
                </h3>
                {data.customCriteria && data.customCriteria.length > 0 ? (
                  <div className="space-y-2">
                    {data.customCriteria.map((criterion, index) => (
                      <div key={`${criterion.name}-${index}`} className="flex flex-wrap gap-2">
                        {badge(criterion.name, 'primary')}
                        {badge(criterion.importance)}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No custom criteria saved yet.</p>
                )}
              </section>

              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                  Competitors to monitor
                </h3>
                {renderList(data.competitors, 'No competitors listed yet.')}
              </section>

              {preferencesList && preferencesList.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                    Conversational preferences
                  </h3>
                  <ul className="space-y-1">
                    {preferencesList.map((item, idx) => (
                      <li key={`${item}-${idx}`} className="text-sm text-gray-700">
                        • {item}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          ) : (
            <div className="py-12 text-center text-sm text-gray-600">
              No setup details saved yet. Use the Profile Coach to provide company context.
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
