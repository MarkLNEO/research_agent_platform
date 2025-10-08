import { AlertCircle, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

interface ProfileCompleteness {
  isComplete: boolean;
  missingFields: string[];
  completionPercentage: number;
}

export function ProfileCompletenessBanner() {
  const navigate = useNavigate();
  const [profileStatus, setProfileStatus] = useState<ProfileCompleteness | null>(null);
  const [isDismissed, setIsDismissed] = useState(() => {
    // Check localStorage for dismissal state
    const dismissed = localStorage.getItem('profileBannerDismissed');
    return dismissed === 'true';
  });

  useEffect(() => {
    checkProfileCompleteness();
  }, []);

  const handleDismiss = () => {
    setIsDismissed(true);
    // Persist dismissal for 7 days
    localStorage.setItem('profileBannerDismissed', 'true');
    localStorage.setItem('profileBannerDismissedAt', Date.now().toString());
  };

  useEffect(() => {
    // Check if dismissal has expired (7 days)
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

  const checkProfileCompleteness = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [profileRes, signalsCountRes] = await Promise.all([
        supabase
          .from('company_profiles')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('user_signal_preferences')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id),
      ]);

      const profile = profileRes.data;
      const signalPreferencesCount = signalsCountRes.count || 0;

      if (!profile) {
        setProfileStatus({
          isComplete: false,
          missingFields: ['All profile information'],
          completionPercentage: 0
        });
        return;
      }

      const missingFields: string[] = [];
      let filledFields = 0;
      const totalFields = 7;

      if (!profile.company_name) missingFields.push('Company name'); else filledFields++;
      if (!profile.company_url) missingFields.push('Company website'); else filledFields++;
      if (!profile.industry) missingFields.push('Industry'); else filledFields++;
      if (!profile.icp_definition) missingFields.push('Ideal customer profile'); else filledFields++;
      if (!profile.competitors || profile.competitors.length === 0) missingFields.push('Competitors'); else filledFields++;
      if (!profile.target_titles || profile.target_titles.length === 0) missingFields.push('Target job titles'); else filledFields++;
      if (signalPreferencesCount === 0) missingFields.push('Buying signals'); else filledFields++;

      const completionPercentage = Math.round((filledFields / totalFields) * 100);

      setProfileStatus({
        isComplete: missingFields.length === 0,
        missingFields,
        completionPercentage
      });
    } catch (error) {
      console.error('Error checking profile completeness:', error);
    }
  };

  if (!profileStatus || profileStatus.isComplete || isDismissed) {
    return null;
  }

  return (
    <div className="bg-amber-50 border-l-4 border-amber-400 p-4 mb-4 rounded-r-lg" data-testid="profile-completeness-banner">
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <AlertCircle className="h-5 w-5 text-amber-400" />
        </div>
        <div className="ml-3 flex-1">
          <h3 className="text-sm font-medium text-amber-800">
            Complete your profile for better research ({profileStatus.completionPercentage}% complete)
          </h3>
          <div className="mt-2 text-sm text-amber-700">
            <p>
              Adding these details will help me provide more targeted and relevant research:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              {profileStatus.missingFields.slice(0, 3).map((field, index) => (
                <li key={index}>{field}</li>
              ))}
              {profileStatus.missingFields.length > 3 && (
                <li>And {profileStatus.missingFields.length - 3} more...</li>
              )}
            </ul>
          </div>
          <div className="mt-4">
            <button
              onClick={() => navigate('/profile-coach')}
              className="text-sm font-medium text-amber-800 hover:text-amber-900 underline"
            >
              Complete your profile →
            </button>
          </div>
        </div>
        <div className="ml-auto pl-3">
          <button
            onClick={handleDismiss}
            className="inline-flex text-amber-400 hover:text-amber-500"
            title="Dismiss for 7 days"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
