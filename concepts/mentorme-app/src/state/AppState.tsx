import React, { createContext, useContext, useMemo, useState } from 'react';

type Profile = { name: string; mobile: string; email: string };
type Enrollment = {
  name: string;
  status: 'active' | 'cancelled';
  signedUp?: string;
  cancelled?: string;
  gift: string;
  reactivateFrom?: string;
};

type AppStateShape = {
  profile: Profile;
  setProfile: (p: Profile) => void;
  enrollments: Enrollment[];
};

const AppStateContext = createContext<AppStateShape | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile>({ name: '', mobile: '', email: '' });
  // Starts empty — a new user hasn't enrolled in anything yet. Enrolling via
  // an offer would push into this list; no "add card" flow exists yet, so it
  // just stays empty in this demo.
  const [enrollments] = useState<Enrollment[]>([]);

  const value = useMemo(() => ({ profile, setProfile, enrollments }), [profile, enrollments]);
  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
}
