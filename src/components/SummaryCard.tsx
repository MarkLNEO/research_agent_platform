import { X, Leaf } from 'lucide-react';
import type { SummarySchema } from '../../shared/summarySchema';

interface SummaryCardProps {
  summary: SummarySchema;
  onClose?: () => void;
}

function renderList(items: string[], emptyLabel: string) {
  if (!Array.isArray(items) || items.length === 0) {
    return <li className="text-sm text-gray-500">{emptyLabel}</li>;
  }
  return items.map((item) => (
    <li key={item} className="text-sm text-gray-800 leading-relaxed">{item}</li>
  ));
}

export function SummaryCard({ summary, onClose }: SummaryCardProps) {
  const {
    company_overview,
    value_drivers,
    risks,
    eco_profile,
    tech_stack,
    buying_centers,
    next_actions,
  } = summary;

  return (
    <section className="border border-gray-200 bg-white shadow-sm rounded-2xl p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Executive Snapshot</h3>
          <p className="text-sm text-gray-500">Structured summary aligned with onboarding insights.</p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100"
            aria-label="Close summary"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="space-y-5">
        <div>
          <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-1">Company Overview</h4>
          <p className="text-sm text-gray-800 leading-relaxed">{company_overview || 'Overview unavailable.'}</p>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-1">Value Drivers</h4>
          <ul className="ml-4 list-disc space-y-1">
            {renderList(value_drivers, 'No value drivers captured.')}
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-1">Risks &amp; Gaps</h4>
          <ul className="ml-4 list-disc space-y-1">
            {renderList(risks, 'No material risks surfaced.')}
          </ul>
        </div>

        {(eco_profile?.initiatives?.length || eco_profile?.certifications?.length) ? (
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 uppercase tracking-wide mb-1">
              <Leaf className="w-4 h-4" />
              Sustainability &amp; Eco Profile
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <h5 className="text-xs font-semibold text-gray-500 uppercase mb-1">Initiatives</h5>
                <ul className="ml-4 list-disc space-y-1">
                  {renderList(eco_profile?.initiatives || [], 'No initiatives noted.')}
                </ul>
              </div>
              <div>
                <h5 className="text-xs font-semibold text-gray-500 uppercase mb-1">Certifications</h5>
                <ul className="ml-4 list-disc space-y-1">
                  {renderList(eco_profile?.certifications || [], 'No certifications listed.')}
                </ul>
              </div>
            </div>
          </div>
        ) : null}

        <div>
          <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-1">Tech Stack</h4>
          <ul className="ml-4 list-disc space-y-1">
            {renderList(tech_stack, 'Tech stack unknown.')}
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-1">Buying Centers</h4>
          <div className="space-y-2">
            {(Array.isArray(buying_centers) && buying_centers.length > 0)
              ? buying_centers.map((center, idx) => (
                  <div key={`${center.title}-${idx}`} className="border border-gray-200 rounded-xl p-3">
                    <div className="text-sm font-semibold text-gray-900">{center.title}</div>
                    <div className="text-sm text-gray-600 leading-relaxed">{center.relevance}</div>
                  </div>
                ))
              : <div className="text-sm text-gray-500">No buying centers identified.</div>}
          </div>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-1">Next Actions</h4>
          <ul className="ml-4 list-disc space-y-1">
            {renderList(next_actions, 'No recommended next actions yet.')}
          </ul>
        </div>
      </div>
    </section>
  );
}

export default SummaryCard;
