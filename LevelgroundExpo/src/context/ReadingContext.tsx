import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { loadJSON, saveJSON } from '@/lib/storage';

const READ_KEY = 'levelground.readIDs';
const BOOKMARK_KEY = 'levelground.bookmarkedIDs';

interface ReadingContextValue {
  readIds: Set<string>;
  bookmarkedIds: Set<string>;
  markRead: (id: string) => void;
  toggleBookmark: (id: string) => void;
  isRead: (id: string) => boolean;
  isBookmarked: (id: string) => boolean;
}

const ReadingContext = createContext<ReadingContextValue | null>(null);

export function ReadingProvider({ children }: { children: ReactNode }) {
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      const [read, bookmarked] = await Promise.all([
        loadJSON<string[]>(READ_KEY, []),
        loadJSON<string[]>(BOOKMARK_KEY, []),
      ]);
      setReadIds(new Set(read));
      setBookmarkedIds(new Set(bookmarked));
    })();
  }, []);

  const markRead = (id: string) => {
    setReadIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      saveJSON(READ_KEY, Array.from(next));
      return next;
    });
  };

  const toggleBookmark = (id: string) => {
    setBookmarkedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveJSON(BOOKMARK_KEY, Array.from(next));
      return next;
    });
  };

  return (
    <ReadingContext.Provider
      value={{
        readIds,
        bookmarkedIds,
        markRead,
        toggleBookmark,
        isRead: (id) => readIds.has(id),
        isBookmarked: (id) => bookmarkedIds.has(id),
      }}
    >
      {children}
    </ReadingContext.Provider>
  );
}

export function useReading(): ReadingContextValue {
  const ctx = useContext(ReadingContext);
  if (!ctx) throw new Error('useReading must be used within ReadingProvider');
  return ctx;
}
