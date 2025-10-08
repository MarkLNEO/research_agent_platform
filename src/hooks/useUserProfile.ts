import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface ProfileData {
  profile: any | null;
  customCriteriaCount: number;
  signalPreferencesCount: number;
  disqualifiersCount: number;
  loading: boolean;
  error: Error | null;
}

const CACHE_DURATION = 5 * 60 * 1000;
const profileCache = new Map<string, { data: ProfileData; timestamp: number }>();

export function useUserProfile(forceRefresh = false) {
  const { user } = useAuth();
  const [profileData, setProfileData] = useState<ProfileData>({
    profile: null,
    customCriteriaCount: 0,
    signalPreferencesCount: 0,
    disqualifiersCount: 0,
    loading: true,
    error: null,
  });

  const loadProfile = useCallback(async () => {
    if (!user?.id) {
      setProfileData({
        profile: null,
        customCriteriaCount: 0,
        signalPreferencesCount: 0,
        disqualifiersCount: 0,
        loading: false,
        error: null,
      });
      return;
    }

    const cacheKey = user.id;
    const cached = profileCache.get(cacheKey);

    if (!forceRefresh && cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      setProfileData(cached.data);
      return;
    }

    setProfileData(prev => ({ ...prev, loading: true, error: null }));

    try {
      const [profileResult, criteriaResult, signalsResult, disqualifiersResult] = await Promise.all([
        supabase
          .from('company_profiles')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('user_custom_criteria')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id),
        supabase
          .from('user_signal_preferences')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id),
        supabase
          .from('user_disqualifying_criteria')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
      ]);

      const newData = {
        profile: profileResult.data,
        customCriteriaCount: criteriaResult.count || 0,
        signalPreferencesCount: signalsResult.count || 0,
        disqualifiersCount: disqualifiersResult.count || 0,
        loading: false,
        error: null,
      };

      profileCache.set(cacheKey, {
        data: newData,
        timestamp: Date.now(),
      });

      setProfileData(newData);
    } catch (error) {
      console.error('Error loading profile:', error);
      setProfileData(prev => ({
        ...prev,
        loading: false,
        error: error as Error,
      }));
    }
  }, [user?.id, forceRefresh]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string }>).detail;
      if (detail?.userId && detail.userId === user?.id) {
        if (user?.id) {
          profileCache.delete(user.id);
        }
        void loadProfile();
      }
    };

    window.addEventListener('profile:updated', handler);
    return () => window.removeEventListener('profile:updated', handler);
  }, [user?.id, loadProfile]);

  const refreshProfile = useCallback(() => {
    if (user?.id) {
      profileCache.delete(user.id);
    }
    loadProfile();
  }, [user?.id, loadProfile]);

  const isProfileComplete = useCallback(() => {
    const { profile } = profileData;
    if (!profile) return false;

    // If onboarding is explicitly marked as complete, allow access to dashboard
    if (profile.onboarding_complete) return true;

    const criticalComplete = !!(
      profile.company_name &&
      profile.company_url &&
      profile.industry &&
      profile.icp_definition
    );

    if (!criticalComplete) return false;

    const importantComplete = !!(
      profile.user_role &&
      profile.use_case &&
      profile.target_titles?.length > 0
    );

    return importantComplete;
  }, [profileData]);

  const isProfileIncomplete = useCallback(() => {
    return !isProfileComplete();
  }, [isProfileComplete]);

  const getCompletionPercentage = useCallback(() => {
    const { profile, customCriteriaCount, signalPreferencesCount } = profileData;
    if (!profile) return 0;

    let completed = 0;
    const total = 10;

    if (profile.company_name) completed++;
    if (profile.company_url) completed++;
    if (profile.industry) completed++;
    if (profile.icp_definition) completed++;
    if (profile.user_role) completed++;
    if (profile.use_case) completed++;
    if (profile.target_titles?.length > 0) completed++;
    if (customCriteriaCount > 0) completed++;
    if (signalPreferencesCount > 0) completed++;
    if (profile.competitors?.length > 0) completed++;

    return Math.round((completed / total) * 100);
  }, [profileData]);

  return {
    ...profileData,
    refreshProfile,
    isProfileComplete,
    isProfileIncomplete,
    getCompletionPercentage,
  };
}
