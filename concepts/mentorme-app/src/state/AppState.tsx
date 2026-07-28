import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

const STORAGE_KEY = 'mentorme.appstate.v1';
const FREE_ASK_LIMIT = 2;

type GateKey = 'home' | 'cards' | 'grow';

type Persisted = {
  profile: Profile;
  savings: number;
  annualIncome: number;
  cardMonthlySpend: number;
  netWorthHistory: NetWorthEntry[];
  isPro: boolean;
  askAnswered: string[];
  gatesCompleted: Record<GateKey, boolean>;
};

const DEFAULTS: Persisted = {
  profile: { name: '', mobile: '', email: '' },
  savings: 0,
  annualIncome: 0,
  cardMonthlySpend: 0,
  netWorthHistory: [],
  isPro: false,
  askAnswered: [],
  gatesCompleted: { home: false, cards: false, grow: false },
};

type AppStateShape = Persisted & {
  isLoaded: boolean;
  hasAccount: boolean;
  setProfile: (p: Profile) => void;
  enrollments: Enrollment[];
  setMoneyInputs: (savings: number, annualIncome: number) => void;
  setCardSpend: (cardMonthlySpend: number) => void;
  addNetWorthCheckIn: (amount: number) => void;
  setIsPro: (v: boolean) => void;
  freeAskLimit: number;
  markAskAnswered: (key: string) => void;
  markGateComplete: (key: GateKey) => void;
};

const AppStateContext = createContext<AppStateShape | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Persisted>(DEFAULTS);
  const [isLoaded, setIsLoaded] = useState(false);
  const [enrollments] = useState<Enrollment[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setState({ ...DEFAULTS, ...JSON.parse(raw) });
      })
      .finally(() => setIsLoaded(true));
  }, []);

  useEffect(() => {
    if (!isLoaded) return; // don't overwrite storage with defaults before the initial load resolves
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
  }, [state, isLoaded]);

  const setProfile = (p: Profile) => setState((s) => ({ ...s, profile: p }));
  const setMoneyInputs = (savings: number, annualIncome: number) =>
    setState((s) => ({
      ...s,
      savings,
      annualIncome,
      netWorthHistory: s.netWorthHistory.length === 0 ? [{ date: 'today', amount: savings }] : s.netWorthHistory,
    }));
  const setCardSpend = (cardMonthlySpend: number) => setState((s) => ({ ...s, cardMonthlySpend }));
  const addNetWorthCheckIn = (amount: number) =>
    setState((s) => ({ ...s, savings: amount, netWorthHistory: [...s.netWorthHistory, { date: 'today', amount }] }));
  const setIsPro = (v: boolean) => setState((s) => ({ ...s, isPro: v }));
  const markAskAnswered = (key: string) =>
    setState((s) => (s.askAnswered.includes(key) ? s : { ...s, askAnswered: [...s.askAnswered, key] }));
  const markGateComplete = (key: GateKey) =>
    setState((s) => ({ ...s, gatesCompleted: { ...s.gatesCompleted, [key]: true } }));

  const value = useMemo<AppStateShape>(
    () => ({
      ...state,
      isLoaded,
      hasAccount: state.profile.name.trim().length > 0,
      enrollments,
      setProfile,
      setMoneyInputs,
      setCardSpend,
      addNetWorthCheckIn,
      setIsPro,
      freeAskLimit: FREE_ASK_LIMIT,
      markAskAnswered,
      markGateComplete,
    }),
    [state, isLoaded, enrollments]
  );
  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
}
