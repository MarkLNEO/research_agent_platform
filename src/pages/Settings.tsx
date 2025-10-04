import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Building, Coins, User, CreditCard as Edit2, X, Check, Activity, AlertTriangle, Radar } from 'lucide-react';

export function Settings() {
  const { user, credits } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editingProfile, setEditingProfile] = useState(false);
  const [editedCompany, setEditedCompany] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [usageLogs, setUsageLogs] = useState<any[]>([]);
  const [usageSearch, setUsageSearch] = useState('');
  const [usageActionFilter, setUsageActionFilter] = useState('all');
  const [usageAgentFilter, setUsageAgentFilter] = useState('all');
  const [usageStartDate, setUsageStartDate] = useState('');
  const [usageEndDate, setUsageEndDate] = useState('');
  const [usagePage, setUsagePage] = useState(1);
  const usagePageSize = 10;

  useEffect(() => {
    loadProfile();
  }, [user]);

  const totalTokensUsed = usageLogs.reduce((sum, log) => sum + (log.tokens_used || 0), 0);
  const totalCreditsConsumed = usageLogs.reduce((sum, log) => sum + Math.max(1, Math.ceil((log.tokens_used || 0) / 1000)), 0);

  const formatUsageDate = (value: string) => {
    const date = new Date(value);
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatAgentLabel = (value: string) => value.replace(/_/g, ' ');

  const navigateToChat = (chatId?: string) => {
    if (!chatId) return;
    navigate('/', { state: { chatId } });
  };

  const resetUsageFilters = () => {
    setUsageSearch('');
    setUsageActionFilter('all');
    setUsageAgentFilter('all');
    setUsageStartDate('');
    setUsageEndDate('');
  };

  const actionOptions = useMemo(() => {
    return Array.from(new Set(usageLogs.map(log => log.action_type || '')))
      .filter(Boolean)
      .sort();
  }, [usageLogs]);

  const agentOptions = useMemo(() => {
    const options = new Set<string>();
    usageLogs.forEach(log => {
      const agent = log.metadata?.agent_type || 'chat';
      options.add(agent);
    });
    return Array.from(options).sort();
  }, [usageLogs]);

  const filteredUsageLogs = useMemo(() => {
    return usageLogs.filter(log => {
      if (usageActionFilter !== 'all' && log.action_type !== usageActionFilter) {
        return false;
      }

      const agentType = log.metadata?.agent_type || 'chat';
      if (usageAgentFilter !== 'all' && agentType !== usageAgentFilter) {
        return false;
      }

      if (usageSearch) {
        const query = usageSearch.toLowerCase();
        const haystack = [
          log.action_type || '',
          agentType,
          log.metadata?.chat_title || '',
        ]
          .join(' ')
          .toLowerCase();

        if (!haystack.includes(query)) {
          return false;
        }
      }

      if (usageStartDate) {
        const createdAt = new Date(log.created_at);
        const start = new Date(usageStartDate);
        if (createdAt < start) {
          return false;
        }
      }

      if (usageEndDate) {
        const createdAt = new Date(log.created_at);
        const end = new Date(usageEndDate);
        end.setHours(23, 59, 59, 999);
        if (createdAt > end) {
          return false;
        }
      }

      return true;
    });
  }, [usageLogs, usageActionFilter, usageAgentFilter, usageSearch, usageStartDate, usageEndDate]);

  useEffect(() => {
    setUsagePage(1);
  }, [usageSearch, usageActionFilter, usageAgentFilter, usageStartDate, usageEndDate]);

  const creditsFromLog = (log: any) => log.metadata?.credits_used ?? Math.max(1, Math.ceil((log.tokens_used || 0) / 1000));

  const filteredTokensUsed = filteredUsageLogs.reduce((sum, log) => sum + (log.tokens_used || 0), 0);
  const filteredCreditsConsumed = filteredUsageLogs.reduce((sum, log) => sum + creditsFromLog(log), 0);

  const totalUsagePages = Math.max(1, Math.ceil(filteredUsageLogs.length / usagePageSize));
  const paginatedUsageLogs = filteredUsageLogs.slice((usagePage - 1) * usagePageSize, usagePage * usagePageSize);
  const usageRangeStart = filteredUsageLogs.length === 0 ? 0 : (usagePage - 1) * usagePageSize + 1;
  const usageRangeEnd = Math.min(usagePage * usagePageSize, filteredUsageLogs.length);

  const loadProfile = async () => {
    if (!user) return;

    const [userResult, companyResult, usageResult] = await Promise.all([
      supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .maybeSingle(),
      supabase
        .from('company_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('usage_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(200)
    ]);

    setProfile({ user: userResult.data, company: companyResult.data });
    setUsageLogs(usageResult.data || []);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <button
            onClick={() => navigate('/')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <User className="w-5 h-5 text-blue-700" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900">Account Information</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <div className="text-gray-900">{profile?.user?.email}</div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <div className="text-gray-900">{profile?.user?.name || 'Not set'}</div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Account Type</label>
              <div className="text-gray-900 capitalize">{profile?.user?.account_type}</div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Subscription Tier</label>
              <div className="text-gray-900 capitalize">{profile?.user?.subscription_tier}</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Coins className="w-5 h-5 text-blue-700" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900">Credits</h2>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <div className="font-medium text-gray-900">Available Credits</div>
                <div className="text-sm text-gray-600">Use credits for research tasks</div>
              </div>
              <div className="text-3xl font-bold text-gray-900">{credits}</div>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <div className="font-medium text-gray-900">Total Credits</div>
                <div className="text-sm text-gray-600">Lifetime credits allocated</div>
              </div>
              <div className="text-3xl font-bold text-gray-900">{profile?.user?.credits_total}</div>
            </div>

            {credits !== undefined && credits <= 10 && (
              <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <div className="text-sm text-amber-800">
                  Your balance is running low. Consider purchasing additional credits to avoid interruptions.
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Activity className="w-5 h-5 text-blue-700" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Usage Ledger</h2>
                <p className="text-sm text-gray-500">Detailed record of credit consumption across chats.</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs uppercase text-gray-500">Total consumption</div>
              <div className="text-lg font-semibold text-gray-900">
                {totalCreditsConsumed.toLocaleString()} credits
              </div>
              <div className="text-xs text-gray-500">
                {totalTokensUsed.toLocaleString()} tokens
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <input
                type="text"
                value={usageSearch}
                onChange={(event) => setUsageSearch(event.target.value)}
                placeholder="Search action or chat..."
                className="md:col-span-2 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <select
                value={usageActionFilter}
                onChange={(event) => setUsageActionFilter(event.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All actions</option>
                {actionOptions.map(action => (
                  <option key={action} value={action}>
                    {action.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
              <select
                value={usageAgentFilter}
                onChange={(event) => setUsageAgentFilter(event.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All agents</option>
                {agentOptions.map(agent => (
                  <option key={agent} value={agent}>
                    {formatAgentLabel(agent)}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2 md:col-span-1">
                <input
                  type="date"
                  value={usageStartDate}
                  onChange={(event) => setUsageStartDate(event.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="date"
                  value={usageEndDate}
                  onChange={(event) => setUsageEndDate(event.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
              <span>
                Filtered consumption: {filteredTokensUsed.toLocaleString()} tokens (~{filteredCreditsConsumed.toLocaleString()} credits)
              </span>
              {(usageSearch || usageActionFilter !== 'all' || usageAgentFilter !== 'all' || usageStartDate || usageEndDate) && (
                <button
                  type="button"
                  onClick={resetUsageFilters}
                  className="text-blue-700 hover:text-blue-900"
                >
                  Reset filters
                </button>
              )}
            </div>

            {filteredUsageLogs.length === 0 ? (
              <div className="p-6 bg-gray-50 rounded-lg text-sm text-gray-600">
                No usage entries match the current filters. Adjust your search to explore more activity.
              </div>
            ) : (
              <>
                <div className="overflow-x-auto border border-gray-200 rounded-xl">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left font-semibold text-gray-600">When</th>
                        <th className="px-4 py-2 text-left font-semibold text-gray-600">Action</th>
                        <th className="px-4 py-2 text-left font-semibold text-gray-600">Tokens</th>
                        <th className="px-4 py-2 text-left font-semibold text-gray-600">Credits</th>
                        <th className="px-4 py-2 text-left font-semibold text-gray-600">Agent</th>
                        <th className="px-4 py-2 text-left font-semibold text-gray-600">Chat</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {paginatedUsageLogs.map((log) => (
                        <tr key={log.id}>
                          <td className="px-4 py-2 text-gray-700">{formatUsageDate(log.created_at)}</td>
                          <td className="px-4 py-2 text-gray-700 capitalize">{(log.action_type || '').replace(/_/g, ' ')}</td>
                          <td className="px-4 py-2 text-gray-700">{(log.tokens_used || 0).toLocaleString()}</td>
                          <td className="px-4 py-2 text-gray-700">{creditsFromLog(log).toLocaleString()}</td>
                          <td className="px-4 py-2 text-gray-500 capitalize">{formatAgentLabel(log.metadata?.agent_type || 'chat')}</td>
                          <td className="px-4 py-2 text-gray-500">
                            {log.metadata?.chat_id ? (
                              <button
                                type="button"
                                onClick={() => navigateToChat(log.metadata.chat_id)}
                                className="text-blue-600 hover:text-blue-800 font-medium"
                              >
                                View chat
                              </button>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-wrap items-center justify-between text-xs text-gray-500">
                  <span>
                    Showing {usageRangeStart}-{usageRangeEnd} of {filteredUsageLogs.length} filtered entries ({usageLogs.length} total)
                  </span>
                  {totalUsagePages > 1 && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setUsagePage(prev => Math.max(1, prev - 1))}
                        disabled={usagePage === 1}
                        className="px-2 py-1 border border-gray-200 rounded text-gray-600 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Prev
                      </button>
                      <span>Page {usagePage} of {totalUsagePages}</span>
                      <button
                        type="button"
                        onClick={() => setUsagePage(prev => Math.min(totalUsagePages, prev + 1))}
                        disabled={usagePage === totalUsagePages}
                        className="px-2 py-1 border border-gray-200 rounded text-gray-600 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Next
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {profile?.company && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Building className="w-5 h-5 text-blue-700" />
                </div>
                <h2 className="text-xl font-semibold text-gray-900">Company Profile</h2>
              </div>
              {!editingProfile ? (
                <button
                  onClick={() => {
                    setEditedCompany({ ...profile.company });
                    setEditingProfile(true);
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                >
                  <Edit2 className="w-4 h-4" />
                  Edit
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setEditingProfile(false);
                      setEditedCompany(null);
                    }}
                    disabled={saving}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium disabled:opacity-50"
                  >
                    <X className="w-4 h-4" />
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      setSaving(true);
                      try {
                        await supabase
                          .from('company_profiles')
                          .update(editedCompany)
                          .eq('user_id', user!.id);

                        setProfile({ ...profile, company: editedCompany });
                        setEditingProfile(false);
                      } catch (error) {
                        console.error('Error saving profile:', error);
                      } finally {
                        setSaving(false);
                      }
                    }}
                    disabled={saving}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" />
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              )}
            </div>

            {!editingProfile ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                  <div className="text-gray-900">{profile.company.company_name}</div>
                </div>
                {profile.company.company_url && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
                    <a
                      href={profile.company.company_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-700 hover:text-blue-700"
                    >
                      {profile.company.company_url}
                    </a>
                  </div>
                )}
                {profile.company.industry && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
                    <div className="text-gray-900">{profile.company.industry}</div>
                  </div>
                )}
                {profile.company.icp_definition && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ideal Customer Profile</label>
                    <div className="text-gray-900">{profile.company.icp_definition}</div>
                  </div>
                )}
                {profile.company.competitors && profile.company.competitors.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Competitors</label>
                    <div className="flex flex-wrap gap-2">
                      {profile.company.competitors.map((competitor: string) => (
                        <span
                          key={competitor}
                          className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm"
                        >
                          {competitor}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                  <input
                    type="text"
                    value={editedCompany.company_name || ''}
                    onChange={(e) => setEditedCompany({ ...editedCompany, company_name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
                  <input
                    type="url"
                    value={editedCompany.company_url || ''}
                    onChange={(e) => setEditedCompany({ ...editedCompany, company_url: e.target.value })}
                    placeholder="https://example.com"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
                  <input
                    type="text"
                    value={editedCompany.industry || ''}
                    onChange={(e) => setEditedCompany({ ...editedCompany, industry: e.target.value })}
                    placeholder="e.g., SaaS, Healthcare, Finance"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ideal Customer Profile</label>
                  <textarea
                    value={editedCompany.icp_definition || ''}
                    onChange={(e) => setEditedCompany({ ...editedCompany, icp_definition: e.target.value })}
                    placeholder="Describe your ideal customer..."
                    rows={4}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Competitors (comma-separated)</label>
                  <input
                    type="text"
                    value={editedCompany.competitors?.join(', ') || ''}
                    onChange={(e) => setEditedCompany({
                      ...editedCompany,
                      competitors: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                    })}
                    placeholder="e.g., Competitor 1, Competitor 2"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
