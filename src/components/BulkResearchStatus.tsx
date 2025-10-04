import { useState, useEffect } from 'react';
import { Clock, CheckCircle, AlertCircle, Download } from 'lucide-react';
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

  useEffect(() => {
    loadJobs();
    
    // Poll for updates every 10 seconds
    const interval = setInterval(loadJobs, 10000);
    return () => clearInterval(interval);
  }, []);

  const loadJobs = async () => {
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

      const previousJobs = jobs;
      setJobs(data || []);

      // Check for newly completed jobs
      if (previousJobs.length > 0) {
        const newlyCompleted = (data || []).filter(job => 
          job.status === 'completed' && 
          !previousJobs.find(prev => prev.id === job.id && prev.status === 'completed')
        );

        newlyCompleted.forEach(job => {
          addToast({
            type: 'success',
            title: 'Bulk research complete',
            description: `Research finished for ${job.total_count} companies. Check your results below.`,
          });
          
          if (onJobComplete) {
            onJobComplete(job.id);
          }
        });
      }

    } catch (error) {
      console.error('Error loading bulk research jobs:', error);
    } finally {
      setLoading(false);
    }
  };

  const downloadResults = (job: BulkResearchJob) => {
    if (!job.results) return;

    const csvContent = [
      'Company,Status,Research Result,Error,Completed At',
      ...job.results.map(result => [
        result.company,
        result.status,
        result.result ? `"${result.result.replace(/"/g, '""')}"` : '',
        result.error || '',
        result.completed_at
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bulk_research_${job.id}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
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
    return null;
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">Bulk Research Jobs</h3>
      
      <div className="space-y-3">
        {jobs.map((job) => (
          <div
            key={job.id}
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

            {job.status === 'completed' && job.results && (
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
