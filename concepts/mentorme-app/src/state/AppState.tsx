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
type NetWorthEntry = { date: string; amount: number };

type AppStateShape = {
  profile: Profile;
  setProfile: (p: Profile) => void;
  enrollments: Enrollment[];

  // Real numbers entered on the Grow gate — power every computed figure below.
  savings: number;
  annualIncome: number;
  setMoneyInputs: (savings: number, annualIncome: number) => void;

  netWorthHistory: NetWorthEntry[];
  addNetWorthCheckIn: (amount: number) => void;

  isPro: boolean;
  setIsPro: (v: boolean) => void;
};

const AppStateContext = createContext<AppStateShape | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile>({ name: '', mobile: '', email: '' });
  const [enrollments] = useState<Enrollment[]>([]);
  const [savings, setSavings] = useState(0);
  const [annualIncome, setAnnualIncome] = useState(0);
  const [netWorthHistory, setNetWorthHistory] = useState<NetWorthEntry[]>([]);
  const [isPro, setIsPro] = useState(false);

  const setMoneyInputs = (s: number, i: number) => {
    setSavings(s);
    setAnnualIncome(i);
    setNetWorthHistory((prev) => (prev.length === 0 ? [{ date: 'today', amount: s }] : prev));
  };

  const addNetWorthCheckIn = (amount: number) => {
    setSavings(amount);
    setNetWorthHistory((prev) => [...prev, { date: 'today', amount }]);
  };

  const value = useMemo(
    () => ({
      profile,
      setProfile,
      enrollments,
      savings,
      annualIncome,
      setMoneyInputs,
      netWorthHistory,
      addNetWorthCheckIn,
      isPro,
      setIsPro,
    }),
    [profile, enrollments, savings, annualIncome, netWorthHistory, isPro]
  );
  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
}
