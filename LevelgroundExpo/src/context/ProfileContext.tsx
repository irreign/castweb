import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { DEFAULT_PROFILE, type UserProfile } from '@/lib/models';
import { loadJSON, saveJSON } from '@/lib/storage';

const KEY = 'levelground.userProfile';

interface ProfileContextValue {
  profile: UserProfile;
  isLoaded: boolean;
  setProfile: (profile: UserProfile) => void;
  resetOnboarding: () => void;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfileState] = useState<UserProfile>(DEFAULT_PROFILE);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    loadJSON(KEY, DEFAULT_PROFILE).then((loaded) => {
      setProfileState(loaded);
      setIsLoaded(true);
    });
  }, []);

  const setProfile = (next: UserProfile) => {
    setProfileState(next);
    saveJSON(KEY, next);
  };

  const resetOnboarding = () => {
    setProfileState((prev) => {
      const next = { ...prev, completedOnboarding: false };
      saveJSON(KEY, next);
      return next;
    });
  };

  return (
    <ProfileContext.Provider value={{ profile, isLoaded, setProfile, resetOnboarding }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used within ProfileProvider');
  return ctx;
}
