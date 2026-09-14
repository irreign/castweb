import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { loadJSON, saveJSON } from '@/lib/storage';

const KEY = 'levelground.shortlistedPropertyIDs';

interface ShortlistContextValue {
  shortlistedIds: Set<string>;
  toggle: (id: string) => void;
  isShortlisted: (id: string) => boolean;
}

const ShortlistContext = createContext<ShortlistContextValue | null>(null);

export function ShortlistProvider({ children }: { children: ReactNode }) {
  const [shortlistedIds, setShortlistedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadJSON<string[]>(KEY, []).then((ids) => setShortlistedIds(new Set(ids)));
  }, []);

  const toggle = (id: string) => {
    setShortlistedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveJSON(KEY, Array.from(next));
      return next;
    });
  };

  return (
    <ShortlistContext.Provider value={{ shortlistedIds, toggle, isShortlisted: (id) => shortlistedIds.has(id) }}>
      {children}
    </ShortlistContext.Provider>
  );
}

export function useShortlist(): ShortlistContextValue {
  const ctx = useContext(ShortlistContext);
  if (!ctx) throw new Error('useShortlist must be used within ShortlistProvider');
  return ctx;
}
