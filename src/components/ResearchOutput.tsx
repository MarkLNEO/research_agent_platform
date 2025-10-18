import { useEffect, useMemo, useState } from 'react';
import { Download, FileText, TrendingUp, Zap, Users, Target, Lightbulb, HelpCircle } from 'lucide-react';
import { OptimizeICPModal } from './OptimizeICPModal';

interface ResearchOutputProps {
  research: {
    id: string;
    subject: string;
    research_type: string;
    icp_fit_score?: number;
    signal_score?: number;
    composite_score?: number;
    priority_level?: 'hot' | 'warm' | 'standard';
    executive_summary?: string;
    company_data?: any;
    leadership_team?: any[];
    buying_signals?: any[];
    custom_criteria_assessment?: any[];
    personalization_points?: any[];
    recommended_actions?: any;
    confidence_level?: string;
    markdown_report?: string;
    sources?: any;
    created_at: string;
  };
  onExportPDF?: () => void;
  onExportCSV?: () => void;
}

function ScoreCard({ label, score, icon: Icon, color }: { label: string; score?: number; icon: any; color: string }) {
  if (score === undefined || score === null) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-600">{label}</span>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <div className="text-3xl font-bold text-gray-900">{score}</div>
      <div className="mt-2 bg-gray-100 rounded-full h-2 overflow-hidden">
        <div
          className={`h-full ${color.replace('text-', 'bg-')}`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

function PriorityBadge({ level }: { level?: string }) {
  if (!level) return null;

  const config = {
    hot: { icon: '🔥', label: 'HOT LEAD', color: 'bg-red-50 text-red-700 border-red-200' },
    warm: { icon: '⚡', label: 'WARM LEAD', color: 'bg-orange-50 text-orange-700 border-orange-200' },
    standard: { icon: '📍', label: 'STANDARD', color: 'bg-blue-50 text-blue-700 border-blue-200' }
  };

  const { icon, label, color } = config[level as keyof typeof config] || config.standard;

  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold border ${color}`}>
      <span>{icon}</span>
      {label}
    </span>
  );
}

export function ResearchOutput({ research, onExportPDF, onExportCSV }: ResearchOutputProps) {
  const [showIcpWhy, setShowIcpWhy] = useState(false);
  const [optimizeOpen, setOptimizeOpen] = useState(false);
  const [enriched, setEnriched] = useState<Record<string, { email?: string; linkedin_url?: string | null }>>({});

  const domain = useMemo(() => {
    try {
      const raw = research?.company_data?.website || research?.company_data?.domain || '';
      if (!raw) return '';
      const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
      return u.hostname.replace(/^www\./, '');
    } catch { return ''; }
  }, [research?.company_data]);

  useEffect(() => {
    let canceled = false;
    (async () => {
      try {
        if (!domain) return;
        const names = (Array.isArray(research?.leadership_team) ? research.leadership_team : []).slice(0, 6).map((l: any) => ({ name: l?.name || '', title: l?.title || l?.role || '' })).filter(x => x.name);
        if (names.length === 0) return;
        const resp = await fetch('/api/contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ domain, names, limit: 6 }) });
        if (!resp.ok) return;
        const data = await resp.json();
        if (canceled) return;
        const map: Record<string, { email?: string; linkedin_url?: string | null }> = {};
        for (const c of (data?.contacts || [])) {
          map[(c.name || '').toLowerCase()] = { email: c.email || undefined, linkedin_url: c.linkedin_url || null };
        }
        setEnriched(map);
      } catch {
        // graceful fallback
      }
    })();
    return () => { canceled = true; };
  }, [domain, research?.leadership_team]);
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 space-y-6" data-testid="research-output">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-2xl font-bold text-gray-900 mb-2">{research.subject}</h3>
          <div className="flex items-center gap-3">
            <PriorityBadge level={research.priority_level} />
            {research.confidence_level && (
              <span className="text-sm text-gray-600">
                Confidence: <span className="font-semibold capitalize">{research.confidence_level}</span>
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onExportPDF}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title="Export as PDF"
          >
            <FileText className="w-5 h-5 text-gray-600" />
          </button>
          <button
            onClick={onExportCSV}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title="Export as CSV"
          >
            <Download className="w-5 h-5 text-gray-600" />
          </button>
        </div>
      </div>

      {/* Executive Summary */}
      {research.executive_summary && (
        <div className="bg-white border border-gray-200 rounded-xl p-4" data-testid="research-section-executive-summary">
          <h4 className="font-semibold text-gray-900 mb-2">Executive Summary</h4>
          <p className="text-gray-700 leading-relaxed">{research.executive_summary}</p>
        </div>
      )}

      {/* Scores */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ScoreCard
          label="ICP Fit Score"
          score={research.icp_fit_score}
          icon={Target}
          color="text-blue-600"
        />
        <ScoreCard
          label="Signal Score"
          score={research.signal_score}
          icon={Zap}
          color="text-blue-700"
        />
        <ScoreCard
          label="Composite Score"
          score={research.composite_score}
          icon={TrendingUp}
          color="text-green-600"
        />
      </div>

      {/* ICP explanation */}
      {(typeof research.icp_fit_score === 'number') && (
        <div className="-mt-2">
          <button
            type="button"
            onClick={() => setShowIcpWhy(v => !v)}
            className="inline-flex items-center gap-1 text-xs text-blue-700 hover:text-blue-900"
          >
            <HelpCircle className="w-3.5 h-3.5" /> Why this score?
          </button>
          {showIcpWhy && (
            <div className="mt-2 bg-white border border-blue-100 rounded-lg p-3">
              {Array.isArray(research.custom_criteria_assessment) && research.custom_criteria_assessment.length > 0 ? (
                <div className="text-sm text-gray-800">
                  <div className="font-semibold mb-1">Criteria evaluation</div>
                  <ul className="list-disc list-inside space-y-1">
                    {research.custom_criteria_assessment.slice(0, 8).map((c: any, idx: number) => (
                      <li key={idx}>
                        <span className="font-medium">{c.name || c.field_name || 'Criterion'}:</span>{' '}
                        <span className={`${c.status === 'met' ? 'text-green-700' : c.status === 'unknown' ? 'text-gray-700' : 'text-red-700'}`}>{String(c.status || c.value || 'unknown')}</span>
                        {c.source && (
                          <span className="text-xs text-gray-500"> — source: {typeof c.source === 'string' ? c.source : ''}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="text-sm text-gray-700">This score is based on default criteria and recent signal strength.</div>
              )}
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => setOptimizeOpen(true)}
                  className="text-xs font-semibold text-blue-700 hover:text-blue-900 underline"
                >
                  Optimize ICP
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Optimize ICP modal */}
      <OptimizeICPModal isOpen={optimizeOpen} onClose={() => setOptimizeOpen(false)} />

      {/* Company Data */}
      {research.company_data && Object.keys(research.company_data).length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5" data-testid="research-section-company-overview">
          <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Users className="w-5 h-5" />
            Company Overview
          </h4>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            {research.company_data.industry && (
              <div>
                <span className="text-sm text-gray-600">Industry</span>
                <p className="font-medium text-gray-900">{research.company_data.industry}</p>
              </div>
            )}
            {research.company_data.size && (
              <div>
                <span className="text-sm text-gray-600">Company Size</span>
                <p className="font-medium text-gray-900">{research.company_data.size}</p>
              </div>
            )}
            {research.company_data.location && (
              <div>
                <span className="text-sm text-gray-600">Location</span>
                <p className="font-medium text-gray-900">{research.company_data.location}</p>
              </div>
            )}
            {research.company_data.founded && (
              <div>
                <span className="text-sm text-gray-600">Founded</span>
                <p className="font-medium text-gray-900">{research.company_data.founded}</p>
              </div>
            )}
            {research.company_data.website && (
              <div className="col-span-2">
                <span className="text-sm text-gray-600">Website</span>
                <a
                  href={research.company_data.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-blue-600 hover:underline block"
                >
                  {research.company_data.website}
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Decision Makers */}
      {research.leadership_team && research.leadership_team.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5" data-testid="research-section-decision-makers">
          <h4 className="font-semibold text-gray-900 mb-4">Decision Makers</h4>
          <div className="space-y-3">
            {research.leadership_team.map((leader: any, idx: number) => (
              <div key={idx} className="flex items-start gap-3 pb-3 border-b border-gray-100 last:border-0">
                <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-semibold text-gray-600">
                    {leader.name?.charAt(0) || '?'}
                  </span>
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-gray-900">{leader.name}</div>
                  <div className="text-sm text-gray-600">{leader.title || leader.role}</div>
                  {enriched[String(leader.name || '').toLowerCase()]?.email && (
                    <div className="text-sm text-gray-700">
                      <a href={`mailto:${enriched[String(leader.name || '').toLowerCase()].email}`} className="text-blue-700 hover:underline">
                        {enriched[String(leader.name || '').toLowerCase()].email}
                      </a>
                    </div>
                  )}
                  {leader.linkedin && (
                    <a
                      href={leader.linkedin}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline"
                    >
                      LinkedIn Profile
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Buying Signals */}
      {research.buying_signals && research.buying_signals.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5" data-testid="research-section-buying-signals">
          <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Zap className="w-5 h-5 text-blue-700" />
            Buying Signals
          </h4>
          <div className="space-y-3">
            {research.buying_signals.map((signal: any, idx: number) => (
              <div key={idx} className="border-l-4 border-blue-400 pl-4 py-2">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold text-gray-900">{signal.type || signal.signal_type}</div>
                    <p className="text-sm text-gray-600 mt-1">{signal.description || signal.details}</p>
                    {signal.date && (
                      <span className="text-xs text-gray-500 mt-1 block">{signal.date}</span>
                    )}
                  </div>
                  {signal.score !== undefined && (
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm font-semibold">
                      +{signal.score}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Custom Criteria Assessment */}
      {research.custom_criteria_assessment && research.custom_criteria_assessment.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5" data-testid="research-section-custom-criteria">
          <h4 className="font-semibold text-gray-900 mb-4">Custom Criteria Assessment</h4>
          <div className="space-y-2">
            {research.custom_criteria_assessment.map((criterion: any, idx: number) => (
              <div key={idx} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div className="flex-1">
                  <span className="font-medium text-gray-900">{criterion.name || criterion.field_name}</span>
                  <span className="text-sm text-gray-600 ml-2">
                    {criterion.value !== undefined && criterion.value !== null ? String(criterion.value) : 'N/A'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {criterion.confidence && (
                    <span
                      className={`text-xs px-2 py-1 rounded ${
                        criterion.confidence === 'high'
                          ? 'bg-green-100 text-green-700'
                          : criterion.confidence === 'medium'
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {criterion.confidence}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Personalization Points */}
      {research.personalization_points && research.personalization_points.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5" data-testid="research-section-personalization">
          <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-yellow-600" />
            Personalization Points
          </h4>
          <ul className="space-y-3">
            {research.personalization_points.map((point: any, idx: number) => (
              <li key={idx} className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-yellow-100 text-yellow-700 flex items-center justify-center text-sm font-semibold">
                  {idx + 1}
                </span>
                <div className="flex-1">
                  <p className="text-gray-700">{point.point || point.description || point}</p>
                  {point.source && (
                    <span className="text-xs text-gray-500 mt-1 block">Source: {point.source}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recommended Actions */}
      {research.recommended_actions && Object.keys(research.recommended_actions).length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5" data-testid="research-section-recommended-actions">
          <h4 className="font-semibold text-gray-900 mb-4">Recommended Actions</h4>
          <div className="space-y-3">
            {research.recommended_actions.timing && (
              <div>
                <span className="text-sm font-medium text-gray-600">Timing:</span>
                <p className="text-gray-900 mt-1">{research.recommended_actions.timing}</p>
              </div>
            )}
            {research.recommended_actions.messaging && (
              <div>
                <span className="text-sm font-medium text-gray-600">Messaging Angles:</span>
                <p className="text-gray-700 mt-1">{research.recommended_actions.messaging}</p>
              </div>
            )}
            {research.recommended_actions.targets && (
              <div>
                <span className="text-sm font-medium text-gray-600">Key Targets:</span>
                <p className="text-gray-700 mt-1">{research.recommended_actions.targets}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {Array.isArray(research.sources) && research.sources.length > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-5" data-testid="research-section-sources">
          <h4 className="font-semibold text-gray-900 mb-3">Sources & Citations</h4>
          <ul className="space-y-2 text-sm">
            {research.sources.map((source: any, idx: number) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-gray-400">{idx + 1}.</span>
                {source?.url ? (
                  <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700 underline">
                    {source.title || source.url}
                  </a>
                ) : (
                  <span className="text-gray-700">{source?.title || 'Reference'}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Full Report Link */}
      {research.markdown_report && (
        <div className="text-center pt-4 border-t border-gray-200" data-testid="research-section-markdown">
          <button className="text-blue-600 hover:text-blue-700 font-medium text-sm">
            View Full Research Report →
          </button>
        </div>
      )}
    </div>
  );
}
