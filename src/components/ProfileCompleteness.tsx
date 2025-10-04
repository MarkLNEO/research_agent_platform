import { AlertCircle, CheckCircle, TrendingUp } from 'lucide-react';

interface ProfileCompletenessProps {
  profile: any;
}

interface CriteriaStatus {
  label: string;
  completed: boolean;
  importance: 'critical' | 'important' | 'optional';
}

export function ProfileCompleteness({ profile }: ProfileCompletenessProps) {
  const criteria: CriteriaStatus[] = [
    { label: 'Company Name', completed: !!profile?.company_name, importance: 'critical' },
    { label: 'Company Website', completed: !!profile?.company_url, importance: 'critical' },
    { label: 'Industry', completed: !!profile?.industry, importance: 'critical' },
    { label: 'ICP Definition', completed: !!profile?.icp_definition, importance: 'critical' },
    { label: 'User Role', completed: !!profile?.user_role, importance: 'important' },
    { label: 'Use Case', completed: !!profile?.use_case, importance: 'important' },
    { label: 'Target Job Titles', completed: !!(profile?.target_titles && profile.target_titles.length > 0), importance: 'important' },
    { label: 'Custom Qualifying Criteria', completed: !!(profile?.custom_criteria_count && profile.custom_criteria_count > 0), importance: 'important' },
    { label: 'Buying Signal Preferences', completed: !!(profile?.signal_preferences_count && profile.signal_preferences_count > 0), importance: 'important' },
    { label: 'Competitors', completed: !!(profile?.competitors && profile.competitors.length > 0), importance: 'optional' },
    { label: 'LinkedIn Company Page', completed: !!profile?.linkedin_url, importance: 'optional' },
    { label: 'Research Focus Areas', completed: !!(profile?.research_focus && profile.research_focus.length > 0), importance: 'optional' },
  ];

  const criticalCount = criteria.filter(c => c.importance === 'critical').length;
  const criticalCompleted = criteria.filter(c => c.importance === 'critical' && c.completed).length;

  const importantCount = criteria.filter(c => c.importance === 'important').length;
  const importantCompleted = criteria.filter(c => c.importance === 'important' && c.completed).length;

  const totalCompleted = criteria.filter(c => c.completed).length;
  const totalCount = criteria.length;
  const completionPercentage = Math.round((totalCompleted / totalCount) * 100);

  const isComplete = criticalCompleted === criticalCount;

  if (isComplete && importantCompleted === importantCount) {
    return null;
  }

  return (
    <div className={`mb-6 rounded-xl border-2 p-6 ${
      criticalCompleted < criticalCount
        ? 'bg-red-50 border-red-200'
        : 'bg-yellow-50 border-yellow-200'
    }`}>
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          {criticalCompleted < criticalCount ? (
            <AlertCircle className="w-6 h-6 text-red-600" />
          ) : (
            <TrendingUp className="w-6 h-6 text-yellow-600" />
          )}
        </div>
        <div className="flex-1">
          <h3 className={`text-lg font-semibold mb-2 ${
            criticalCompleted < criticalCount ? 'text-red-900' : 'text-yellow-900'
          }`}>
            {criticalCompleted < criticalCount
              ? '⚠️ Critical Profile Information Missing'
              : '📊 Complete Your Profile for Better Results'}
          </h3>

          <p className={`text-sm mb-4 ${
            criticalCompleted < criticalCount ? 'text-red-800' : 'text-yellow-800'
          }`}>
            {criticalCompleted < criticalCount
              ? 'Your profile is missing critical information needed to provide accurate research. Please complete the required fields below.'
              : 'You\'ve covered the basics! Adding more details will significantly improve research quality and personalization.'}
          </p>

          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className={`text-sm font-medium ${
                criticalCompleted < criticalCount ? 'text-red-900' : 'text-yellow-900'
              }`}>
                Profile Completion
              </span>
              <span className={`text-sm font-bold ${
                criticalCompleted < criticalCount ? 'text-red-900' : 'text-yellow-900'
              }`}>
                {completionPercentage}%
              </span>
            </div>
            <div className="w-full bg-white rounded-full h-3 overflow-hidden border border-gray-200">
              <div
                className={`h-full transition-all duration-500 ${
                  criticalCompleted < criticalCount
                    ? 'bg-red-500'
                    : completionPercentage > 70
                    ? 'bg-green-500'
                    : 'bg-yellow-500'
                }`}
                style={{ width: `${completionPercentage}%` }}
              />
            </div>
          </div>

          <div className="space-y-3">
            {criticalCompleted < criticalCount && (
              <div>
                <div className="text-xs font-semibold text-red-800 uppercase tracking-wide mb-2">
                  Critical (Required)
                </div>
                <div className="space-y-1">
                  {criteria
                    .filter(c => c.importance === 'critical')
                    .map((criterion, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        {criterion.completed ? (
                          <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                        )}
                        <span className={`text-sm ${
                          criterion.completed ? 'text-gray-600 line-through' : 'text-red-900 font-medium'
                        }`}>
                          {criterion.label}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {criticalCompleted === criticalCount && importantCompleted < importantCount && (
              <div>
                <div className="text-xs font-semibold text-yellow-800 uppercase tracking-wide mb-2">
                  Important (Recommended)
                </div>
                <div className="space-y-1">
                  {criteria
                    .filter(c => c.importance === 'important')
                    .map((criterion, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        {criterion.completed ? (
                          <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-yellow-600 flex-shrink-0" />
                        )}
                        <span className={`text-sm ${
                          criterion.completed ? 'text-gray-600 line-through' : 'text-yellow-900 font-medium'
                        }`}>
                          {criterion.label}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>

          <div className={`mt-4 pt-4 border-t ${
            criticalCompleted < criticalCount ? 'border-red-200' : 'border-yellow-200'
          }`}>
            <p className={`text-xs ${
              criticalCompleted < criticalCount ? 'text-red-700' : 'text-yellow-700'
            }`}>
              <strong>💡 Why this matters:</strong> The more context you provide about your company, ICP, and research goals,
              the more accurate and personalized your research results will be. Custom criteria, buying signals, and competitor
              information help our AI agents deliver insights that are specifically relevant to your business.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
