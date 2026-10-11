import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { load, save } from "../lib/storage";
import type { PredictResponse } from "../types/api";

const KEY = "prediction-history";
const LIMIT = 30;

export interface HistoryEntry {
  id: string;
  createdAt: string;
  /** JPEG thumbnail (image models) or the submitted text (text models). */
  input: { kind: "image"; thumbnail: string; name: string } | { kind: "text"; text: string };
  result: PredictResponse;
}

interface HistoryContextValue {
  entries: HistoryEntry[];
  add: (input: HistoryEntry["input"], result: PredictResponse) => void;
  remove: (id: string) => void;
  clear: () => void;
}

const HistoryContext = createContext<HistoryContextValue | null>(null);

// History lives only in this browser (localStorage); nothing is sent anywhere.
export function HistoryProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<HistoryEntry[]>(() => load<HistoryEntry[]>(KEY, []));

  const update = useCallback((fn: (prev: HistoryEntry[]) => HistoryEntry[]) => {
    setEntries((prev) => {
      const next = fn(prev);
      save(KEY, next);
      return next;
    });
  }, []);

  const value = useMemo<HistoryContextValue>(
    () => ({
      entries,
      add: (input, result) =>
        update((prev) =>
          [
            { id: crypto.randomUUID(), createdAt: new Date().toISOString(), input, result },
            ...prev,
          ].slice(0, LIMIT),
        ),
      remove: (id) => update((prev) => prev.filter((e) => e.id !== id)),
      clear: () => update(() => []),
    }),
    [entries, update],
  );

  return <HistoryContext.Provider value={value}>{children}</HistoryContext.Provider>;
}

export function useHistory() {
  const ctx = useContext(HistoryContext);
  if (!ctx) throw new Error("useHistory must be used inside <HistoryProvider>");
  return ctx;
}
