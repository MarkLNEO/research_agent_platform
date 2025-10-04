import { useState } from 'react';
import { AlertCircle, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';

interface ProfileHealthProps {
  profile: any;
  customCriteriaCount: number;
  signalPreferencesCount: number;
  onNavigateToProfile: () => void;
}

export function ProfileHealth({ profile, customCriteriaCount, signalPreferencesCount, onNavigateToProfile }: ProfileHealthProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const calculateCompleteness = () => {
    let score = 0;
    const totalFields = 10;

    if (profile?.company_name) score += 1;
    if (profile?.company_url) score += 1;
    if (profile?.industry) score += 1;
    if (profile?.icp_definition) score += 1.5;
    if (profile?.user_role) score += 0.5;
    if (profile?.use_case) score += 0.5;
    if (profile?.target_titles?.length > 0) score += 1;
    if (customCriteriaCount >= 3) score += 1.5;
    if (customCriteriaCount > 0 && customCriteriaCount < 3) score += 0.75;
    if (signalPreferencesCount >= 2) score += 1.5;
    if (signalPreferencesCount > 0 && signalPreferencesCount < 2) score += 0.75;
    if (profile?.competitors?.length > 0) score += 0.5;

    return Math.round((score / totalFields) * 100);
  };

  const getMissingFields = () => {
    const missing = [];

    if (!profile?.company_name) missing.push({ field: 'Company Name', priority: 'critical' });
    if (!profile?.company_url) missing.push({ field: 'Company Website', priority: 'critical' });
    if (!profile?.industry) missing.push({ field: 'Industry', priority: 'critical' });
    if (!profile?.icp_definition) missing.push({ field: 'ICP Definition', priority: 'critical' });
    if (!profile?.target_titles?.length) missing.push({ field: 'Target Titles', priority: 'important' });
    if (customCriteriaCount < 3) missing.push({
      field: `${3 - customCriteriaCount} More Custom Criteria`,
      priority: 'critical',
      current: customCriteriaCount
    });
    if (signalPreferencesCount < 2) missing.push({
      field: `${2 - signalPreferencesCount} More Buying Signals`,
      priority: 'important',
      current: signalPreferencesCount
    });
    if (!profile?.competitors?.length) missing.push({ field: 'Competitors', priority: 'optional' });

    return missing;
  };

  const completeness = calculateCompleteness();
  const missingFields = getMissingFields();

  const getColorClasses = () => {
    if (completeness >= 70) return {
      bg: 'bg-green-50',
      text: 'text-green-700',
      border: 'border-green-200',
      bar: 'bg-green-500',
      icon: 'text-green-600'
    };
    if (completeness >= 40) return {
      bg: 'bg-yellow-50',
      text: 'text-yellow-700',
      border: 'border-yellow-200',
      bar: 'bg-yellow-500',
      icon: 'text-yellow-600'
    };
    return {
      bg: 'bg-red-50',
      text: 'text-red-700',
      border: 'border-red-200',
      bar: 'bg-red-500',
      icon: 'text-red-600'
    };
  };

  const colors = getColorClasses();

  return (
    <div className={`border ${colors.border} ${colors.bg} rounded-lg p-3 mb-4`}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between mb-2"
      >
        <div className="flex items-center gap-2">
          {completeness >= 70 ? (
            <CheckCircle className={`w-4 h-4 ${colors.icon}`} />
          ) : (
            <AlertCircle className={`w-4 h-4 ${colors.icon}`} />
          )}
          <span className={`text-sm font-medium ${colors.text}`}>
            Profile Health: {completeness}%
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp className={`w-4 h-4 ${colors.text}`} />
        ) : (
          <ChevronDown className={`w-4 h-4 ${colors.text}`} />
        )}
      </button>

      <div className="bg-gray-200 rounded-full h-2 overflow-hidden mb-2">
        <div
          className={`${colors.bar} h-full transition-all duration-300`}
          style={{ width: `${completeness}%` }}
        />
      </div>

      {isExpanded && missingFields.length > 0 && (
        <div className="mt-3 space-y-2">
          <div className="text-xs font-medium text-gray-700 mb-2">Missing:</div>
          {missingFields.slice(0, 3).map((item, index) => (
            <div key={index} className="flex items-start gap-2 text-xs">
              <div className="w-1 h-1 rounded-full bg-gray-400 mt-1.5 flex-shrink-0" />
              <span className="text-gray-600 flex-1">
                {item.field}
                {item.priority === 'critical' && (
                  <span className="ml-1 text-red-600 font-medium">(critical)</span>
                )}
              </span>
            </div>
          ))}
          {missingFields.length > 3 && (
            <div className="text-xs text-gray-500">
              + {missingFields.length - 3} more
            </div>
          )}
          <button
            onClick={onNavigateToProfile}
            className={`w-full mt-2 text-xs font-medium ${colors.text} hover:underline text-left`}
          >
            Complete profile for better research →
          </button>
        </div>
      )}

      {isExpanded && missingFields.length === 0 && (
        <div className="mt-2 text-xs text-green-700">
          All critical fields complete!
        </div>
      )}
    </div>
  );
}
