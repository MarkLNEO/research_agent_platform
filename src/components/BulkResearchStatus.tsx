import { useState, useEffect, useRef, useCallback } from 'react';
import { Clock, CheckCircle, AlertCircle, Download, Square } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from './ToastProvider';

interface BulkResearchJob {
  id: string;
  companies: string[];
  research_type: 'quick' | 'deep';
  status: 'pending' | 'running' | 'completed' | 'failed';
  created_at: string;
  started_at?: string;
  completed_at?: string;
  completed_count: number;
  total_count: number;
  results?: Array<{
    company: string;
    status: 'completed' | 'failed';
    result?: string;
    error?: string;
    completed_at: string;
  }>;
  error?: string;
}

interface BulkResearchStatusProps {
  onJobComplete?: (jobId: string) => void;
}

export function BulkResearchStatus({ onJobComplete }: BulkResearchStatusProps) {
  const [jobs, setJobs] = useState<BulkResearchJob[]>([]);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const pollModeRef = useRef<'fast' | 'slow' | null>(null);

  useEffect(() => {
    void loadJobs();
    const triggerReload = () => {
      void loadJobs();
    };
    window.addEventListener('bulk-research:job-started', triggerReload);
    return () => {
      window.removeEventListener('bulk-research:job-started', triggerReload);
      stopPolling();
    };
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
      pollModeRef.current = null;
    }
  }, []);

  const loadJobs = useCallback(async (isPoll = false) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase
        .from('bulk_research_jobs')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) {
        console.error('Failed to load bulk research jobs:', error);
        return;
      }

      const nextJobs = data || [];
      const hasActiveJobs = nextJobs.some(job => job.status === 'pending' || job.status === 'running');
      if (hasActiveJobs) {
        if (!isPoll || pollModeRef.current !== 'fast') {
          stopPolling();
          pollRef.current = setInterval(() => { void loadJobs(true); }, 5000);
          pollModeRef.current = 'fast';
        }
      } else if (!isPoll) {
        stopPolling();
      }

      setJobs(prev => {
        if (prev.length > 0) {
          const newlyCompleted = nextJobs.filter(job => job.status === 'completed' && !prev.find(prevJob => prevJob.id === job.id && prevJob.status === 'completed'));
          newlyCompleted.forEach(job => {
            const jobElementId = `bulk-job-${job.id}`;
            addToast({
              type: 'success',
              title: 'Bulk research complete',
              description: `Finished ${job.total_count} companies.`,
              actionText: 'View results',
              onAction: () => {
                try {
                  const el = document.getElementById(jobElementId);
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                } catch {}
              }
            } as any);
            if (onJobComplete) {
              onJobComplete(job.id);
            }
          });
        }
        return nextJobs;
      });

    } catch (_error) {
      console.error('Error loading bulk research jobs:', _error);
    } finally {
      setLoading(false);
    }
  }, [addToast, onJobComplete, stopPolling]);

  useEffect(() => {
    void loadJobs();
    const triggerReload = () => {
      void loadJobs();
    };
    window.addEventListener('bulk-research:job-started', triggerReload);
    return () => {
      window.removeEventListener('bulk-research:job-started', triggerReload);
      stopPolling();
    };
  }, [loadJobs, stopPolling]);

  const downloadResults = (job: BulkResearchJob) => {
    if (!job.results) return;

    const csvContent = [
      'Company,Status,ICP Score,Signal Score,Composite Score,Key Decision Makers,Top Signals,Personalization Points,Completed At',
      ...job.results.map(result => {
        const researchContent = {
          icpScore: '',
          signalScore: '',
          compositeScore: '',
          decisionMakers: '',
          topSignals: '',
          personalizationPoints: ''
        };

        if (result.result) {
          try {
            const parsed = JSON.parse(result.result);
            const content = parsed.content || parsed.output || parsed.message || '';

            // Extract key metrics from the research content
            const icpMatch = content.match(/ICP Fit Score:?\s*(\d+\/100|\d+%)/i);
            const signalMatch = content.match(/Signal Score:?\s*(\d+\/100|\d+%)/i);
            const compositeMatch = content.match(/Composite score[^=]*=\s*[^=]*=\s*(\d+\/100|\d+%)/i);

            researchContent.icpScore = icpMatch ? icpMatch[1] : '';
            researchContent.signalScore = signalMatch ? signalMatch[1] : '';
            researchContent.compositeScore = compositeMatch ? compositeMatch[1] : '';

            // Extract decision makers (look for leadership section)
            const leadershipMatch = content.match(/LEADERSHIP[^]*?(?=\n\d+\)|###|\n\n)/i);
            if (leadershipMatch) {
              const leaders = leadershipMatch[0].match(/([A-Z][a-z]+\s+[A-Z][a-z]+)\s*—\s*([^(\n]+)/g) || [];
              researchContent.decisionMakers = leaders.slice(0, 3).map((l: string) => l.replace(/—/g, '-')).join('; ');
            }

            // Extract top signals
            const signalsMatch = content.match(/RECENT ACTIVITY[^]*?(?=\n\d+\)|###|\n\n)/i);
            if (signalsMatch) {
              const signals = signalsMatch[0].match(/•\s*([^•\n]+)/g) || [];
              researchContent.topSignals = signals.slice(0, 3).map((s: string) => s.replace(/[•\n]/g, '').trim()).join('; ');
            }

            // Extract personalization points (count them)
            const personalizationMatch = content.match(/PERSONALIZATION POINTS[^]*?(?=\n\d+\)|###|\n\n)/i);
            if (personalizationMatch) {
              const points = personalizationMatch[0].match(/•\s*[^•\n]+/g) || [];
              researchContent.personalizationPoints = `${points.length} actionable points`;
            }
          } catch (_e) {
            // If parsing fails, try to extract what we can from raw text
            researchContent.topSignals = 'See full research output';
          }
        }

        return [
          result.company,
          result.status,
          researchContent.icpScore,
          researchContent.signalScore,
          researchContent.compositeScore,
          `"${researchContent.decisionMakers.replace(/"/g, '""')}"`,
          `"${researchContent.topSignals.replace(/"/g, '""')}"`,
          researchContent.personalizationPoints,
          result.completed_at
        ].join(',');
      })
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bulk_research_${job.id}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };
  
  const stopJob = async (job: BulkResearchJob) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const resp = await fetch('/api/research/bulk-cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ job_id: job.id })
      });
      if (!resp.ok) {
        const msg = await resp.text();
        addToast({ type: 'error', title: 'Failed to stop job', description: msg.slice(0, 200) });
      } else {
        addToast({ type: 'success', title: 'Job stopped', description: 'Bulk research was cancelled.' });
        void loadJobs();
      }
    } catch (e: any) {
      addToast({ type: 'error', title: 'Failed to stop job', description: e?.message || String(e) });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
      case 'running':
        return <Clock className="h-5 w-5 text-blue-600 animate-pulse" />;
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'failed':
        return <AlertCircle className="h-5 w-5 text-red-600" />;
      default:
        return <Clock className="h-5 w-5 text-gray-400" />;
    }
  };

  const getStatusText = (job: BulkResearchJob) => {
    switch (job.status) {
      case 'pending':
        return 'Queued';
      case 'running':
        return `Processing (${job.completed_count}/${job.total_count})`;
      case 'completed':
        return 'Completed';
      case 'failed':
        return 'Failed';
      default:
        return 'Unknown';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
        <div className="space-y-3">
          <div className="h-16 bg-gray-200 rounded"></div>
          <div className="h-16 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="border border-dashed border-gray-300 rounded-lg p-4 bg-gray-50">
        <h3 className="text-sm font-semibold text-gray-800">No bulk research runs yet</h3>
        <p className="text-xs text-gray-600 mt-1 leading-relaxed">
          Upload a CSV from the chat composer to research many accounts at once. Your most recent jobs will appear here with status, progress, and downloads when they finish.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">Bulk Research Jobs</h3>
      
      <div className="space-y-3">
        {jobs.map((job) => (
          <div
            key={job.id}
            id={`bulk-job-${job.id}`}
            className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {getStatusIcon(job.status)}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">
                      {job.research_type === 'deep' ? 'Deep' : 'Quick'} Research
                    </span>
                    <span className="text-sm text-gray-500">
                      • {job.total_count} companies
                    </span>
                  </div>
                  <div className="text-sm text-gray-600">
                    {getStatusText(job)} • Started {formatDate(job.created_at)}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {job.status === 'running' && (
                  <div className="flex items-center gap-2 text-sm text-blue-600">
                    <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
                    {Math.round((job.completed_count / job.total_count) * 100)}%
                  </div>
                )}
                {(job.status === 'running' || job.status === 'pending') && (
                  <button
                    onClick={() => void stopJob(job)}
                    className="flex items-center gap-1 px-3 py-1 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                    title="Stop this bulk job"
                  >
                    <Square size={14} /> Stop
                  </button>
                )}
                
                {job.results && job.results.length > 0 && job.status !== 'completed' && (
                  <button
                    onClick={() => downloadResults(job)}
                    className="flex items-center gap-1 px-3 py-1 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
                    title="Download partial results"
                  >
                    <Download size={14} />
                    Download partial
                  </button>
                )}

                {job.status === 'completed' && job.results && (
                  <button
                    onClick={() => downloadResults(job)}
                    className="flex items-center gap-1 px-3 py-1 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
                  >
                    <Download size={14} />
                    Download
                  </button>
                )}
              </div>
            </div>

            {job.status === 'running' && (
              <div className="mt-3">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(job.completed_count / job.total_count) * 100}%` }}
                  ></div>
                </div>
              </div>
            )}

            {job.results && (
              <div className="mt-3 text-sm text-gray-600">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1">
                    <CheckCircle size={14} className="text-green-600" />
                    {job.results.filter(r => r.status === 'completed').length} completed
                  </span>
                  {job.results.filter(r => r.status === 'failed').length > 0 && (
                    <span className="flex items-center gap-1">
                      <AlertCircle size={14} className="text-red-600" />
                      {job.results.filter(r => r.status === 'failed').length} failed
                    </span>
                  )}
                </div>
                {job.results.filter(r => r.status === 'failed').length > 0 && (
                  <div className="mt-2 bg-red-50 border border-red-200 rounded p-2">
                    <div className="text-red-700 font-medium mb-1">Recent errors</div>
                    <ul className="list-disc list-inside text-red-700 space-y-1">
                      {job.results.filter(r => r.status === 'failed').slice(-3).map((r, idx) => (
                        <li key={idx}><span className="font-semibold">{r.company}:</span> {r.error || 'Unknown error'}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {job.status === 'failed' && job.error && (
              <div className="mt-3 text-sm text-red-600 bg-red-50 p-2 rounded">
                Error: {job.error}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
