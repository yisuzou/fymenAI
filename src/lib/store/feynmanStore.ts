import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface FeynmanResult {
  score: number;
  correct: string[];
  missing: string[];
  wrong: string[];
  advice: string;
  testedAt: number;
}

interface State {
  /** topicId -> questionLabel -> result */
  results: Record<string, Record<string, FeynmanResult>>;
}

interface Actions {
  setResult: (topicId: string, label: string, result: FeynmanResult) => void;
  getResult: (topicId: string, label: string) => FeynmanResult | undefined;
  clearResult: (topicId: string, label: string) => void;
}

export const useFeynmanStore = create<State & Actions>()(
  persist(
    (set, get) => ({
      results: {},
      setResult: (topicId, label, result) =>
        set((s) => ({
          results: {
            ...s.results,
            [topicId]: { ...(s.results[topicId] ?? {}), [label]: result },
          },
        })),
      getResult: (topicId, label) => get().results[topicId]?.[label],
      clearResult: (topicId, label) =>
        set((s) => {
          const topicMap = { ...(s.results[topicId] ?? {}) };
          delete topicMap[label];
          return { results: { ...s.results, [topicId]: topicMap } };
        }),
    }),
    { name: 'feynman.results' },
  ),
);
