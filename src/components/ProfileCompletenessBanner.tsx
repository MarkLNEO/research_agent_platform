import { AlertCircle, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserProfile } from '../hooks/useUserProfile';

export function ProfileCompletenessBanner() {
  const navigate = useNavigate();
  const { profile, customCriteriaCount, signalPreferencesCount, loading } = useUserProfile();
  const [isDismissed, setIsDismissed] = useState(() => {
    const dismissed = localStorage.getItem('profileBannerDismissed');
    return dismissed === 'true';
  });

  useEffect(() => {
    const dismissedAt = localStorage.getItem('profileBannerDismissedAt');
    if (dismissedAt) {
      const daysSinceDismissal = (Date.now() - parseInt(dismissedAt)) / (1000 * 60 * 60 * 24);
      if (daysSinceDismissal > 7) {
        localStorage.removeItem('profileBannerDismissed');
        localStorage.removeItem('profileBannerDismissedAt');
        setIsDismissed(false);
      }
    }
  }, []);

  const handleDismiss = () => {
    setIsDismissed(true);
    localStorage.setItem('profileBannerDismissed', 'true');
    localStorage.setItem('profileBannerDismissedAt', Date.now().toString());
  };

  const { completion, requiredMissing, importantMissing, optionalMissing } = useMemo(() => {
    if (!profile) {
      return {
        completion: 0,
        requiredMissing: ['Company name', 'Company website', 'Industry', 'Ideal customer profile'],
        importantMissing: [],
        optionalMissing: [],
      };
    }

    const requiredMissing: string[] = [];
    const importantMissing: string[] = [];
    const optionalMissing: string[] = [];

    let score = 0;
    let total = 0;

    const addWeighted = (condition: boolean, value: number) => {
      total += value;
      if (condition) score += value;
    };

    const hasCompanyName = Boolean(profile.company_name);
    const hasCompanyUrl = Boolean(profile.company_url);
    const hasIndustry = Boolean(profile.industry);
    const hasICP = Boolean(profile.icp_definition || profile.icp);

    if (!hasCompanyName) requiredMissing.push('Company name');
    if (!hasCompanyUrl) requiredMissing.push('Company website');
    if (!hasIndustry) requiredMissing.push('Industry');
    if (!hasICP) requiredMissing.push('Ideal customer profile');

    addWeighted(hasCompanyName, 20);
    addWeighted(hasCompanyUrl, 15);
    addWeighted(hasIndustry, 15);
    addWeighted(hasICP, 20);

    const hasRole = Boolean(profile.user_role);
    const hasUseCase = Boolean(profile.use_case);
    const hasTargets = Array.isArray(profile.target_titles) && profile.target_titles.length > 0;
    const hasCustomCriteria = customCriteriaCount > 0;
    const hasSignalPrefs = signalPreferencesCount > 0;

    if (!hasRole) importantMissing.push('Role');
    if (!hasUseCase) importantMissing.push('Use case');
    if (!hasTargets) importantMissing.push('Target job titles');
    if (!hasCustomCriteria) importantMissing.push('Qualifying criteria');
    if (!hasSignalPrefs) importantMissing.push('Buying signal preferences');

    addWeighted(hasRole, 10);
    addWeighted(hasUseCase, 10);
    addWeighted(hasTargets, 8);
    addWeighted(hasCustomCriteria, 4);
    addWeighted(hasSignalPrefs, 4);

    const hasCompetitors = Array.isArray(profile.competitors) && profile.competitors.length > 0;
    const hasResearchFocus = Array.isArray(profile.research_focus) && profile.research_focus.length > 0;

    if (!hasCompetitors) optionalMissing.push('Competitors');
    if (!hasResearchFocus) optionalMissing.push('Preferred research focus');

    addWeighted(hasCompetitors, 4);
    addWeighted(hasResearchFocus, 4);

    const completion = total > 0 ? Math.round((score / total) * 100) : 0;

    return { completion, requiredMissing, importantMissing, optionalMissing };
  }, [profile, customCriteriaCount, signalPreferencesCount]);

  if (loading || !profile || isDismissed) return null;

  const hasRequired = requiredMissing.length > 0;
  const hasImportant = importantMissing.length > 0;
  const severity = hasRequired ? 'critical' : hasImportant ? 'important' : 'optional';

  if (!hasRequired && !hasImportant && optionalMissing.length === 0) {
    return null;
  }

  const bodyText = hasRequired
    ? 'Add these essentials so I can qualify companies accurately:'
    : hasImportant
    ? 'Add these details to sharpen recommendations:'
    : 'Optional enhancements to personalize research even further:';

  const missingList = hasRequired ? requiredMissing : hasImportant ? importantMissing : optionalMissing;

  return (
    <div
      className={`p-4 mb-4 rounded-2xl border-2 ${
        severity === 'critical'
          ? 'bg-red-50 border-red-200'
          : severity === 'important'
          ? 'bg-yellow-50 border-yellow-200'
          : 'bg-blue-50 border-blue-200'
      }`}
      data-testid="profile-completeness-banner"
    >
      <div className="flex items-start gap-3">
        <AlertCircle
          className={`h-5 w-5 flex-shrink-0 ${
            severity === 'critical' ? 'text-red-500' : severity === 'important' ? 'text-yellow-500' : 'text-blue-500'
          }`}
        />
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <h3
              className={`text-sm font-semibold ${
                severity === 'critical'
                  ? 'text-red-900'
                  : severity === 'important'
                  ? 'text-yellow-900'
                  : 'text-blue-900'
              }`}
            >
              {severity === 'critical'
                ? 'Complete your profile for better research'
                : severity === 'important'
                ? 'Boost your research accuracy'
                : 'Enhance your profile (optional)'}
              <span className="ml-2 px-2 py-0.5 text-xs font-bold bg-white/80 rounded-full text-gray-700">
                {completion}% complete
              </span>
            </h3>
            <button
              onClick={handleDismiss}
              className="text-gray-400 hover:text-gray-600"
              title="Dismiss for 7 days"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className={`text-xs mt-2 ${severity === 'critical' ? 'text-red-800' : severity === 'important' ? 'text-yellow-800' : 'text-blue-800'}`}>
            {bodyText}
          </p>
          <ul className="mt-2 text-xs text-gray-700 list-disc list-inside space-y-1">
            {missingList.slice(0, 3).map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
            {missingList.length > 3 && <li>+{missingList.length - 3} more</li>}
          </ul>
          <button
            onClick={() => navigate('/profile-coach')}
            className="mt-3 text-xs font-semibold text-blue-700 hover:text-blue-900 underline"
          >
            {severity === 'optional' ? 'Enhance profile →' : 'Complete profile →'}
          </button>
        </div>
      </div>
    </div>
  );
}
