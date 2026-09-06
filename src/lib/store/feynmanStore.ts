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
  /**
   * topicId -> node key -> result.
   *
   * The key is a *stable identity* from `lib/tree.ts` (`branchId` for a
   * branch, `q-<messageId>` for a main-thread question) — never the question's
   * text. Keying by text meant two branches that framed the same phrase under
   * different parents shared one slot and silently overwrote each other's
   * scores.
   */
  byKey: Record<string, Record<string, FeynmanResult>>;
  /**
   * Migration shim for results written before v1, which were keyed by label
   * text. Read-only: kept so old scores stay visible, never written to again.
   * Entries here still carry the historical collision defect — two questions
   * with identical text share one entry and there is no way to tell them apart
   * after the fact.
   */
  legacyByLabel: Record<string, Record<string, FeynmanResult>>;
}

interface Actions {
  setResult: (topicId: string, key: string, result: FeynmanResult) => void;
  clearResult: (topicId: string, key: string) => void;
}

interface PersistedV0 {
  results?: Record<string, Record<string, FeynmanResult>>;
}

export const useFeynmanStore = create<State & Actions>()(
  persist(
    (set) => ({
      byKey: {},
      legacyByLabel: {},
      setResult: (topicId, key, result) =>
        set((s) => ({
          byKey: {
            ...s.byKey,
            [topicId]: { ...(s.byKey[topicId] ?? {}), [key]: result },
          },
        })),
      clearResult: (topicId, key) =>
        set((s) => {
          const topicMap = { ...(s.byKey[topicId] ?? {}) };
          delete topicMap[key];
          return { byKey: { ...s.byKey, [topicId]: topicMap } };
        }),
    }),
    {
      name: 'feynman.results',
      version: 1,
      migrate: (persisted, from) => {
        if (from >= 1) return persisted as State & Actions;
        // v0 stored `results` keyed by label text; park it in the read-only shim.
        const v0 = persisted as PersistedV0 | undefined;
        return {
          byKey: {},
          legacyByLabel: v0?.results ?? {},
        } as State & Actions;
      },
      partialize: (s) => ({ byKey: s.byKey, legacyByLabel: s.legacyByLabel }) as State & Actions,
    },
  ),
);

/**
 * Look up a result by stable key, falling back to the pre-v1 label-keyed data.
 * A plain function rather than a store action so components can call it inside
 * a narrow selector without subscribing to the whole store.
 */
export function pickResult(
  state: State,
  topicId: string,
  key: string,
  label: string,
): FeynmanResult | undefined {
  return state.byKey[topicId]?.[key] ?? state.legacyByLabel[topicId]?.[label];
}
