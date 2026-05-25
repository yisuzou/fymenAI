import { create } from 'zustand';
import { nanoid } from 'nanoid';
import type { KnowledgePoint } from '@/lib/types';

interface State { points: Record<string, KnowledgePoint>; }
interface Actions {
  reset: () => void;
  add: (input: { label: string; threadId: string | null; mastery?: number }) => string;
  setMastery: (id: string, mastery: number) => void;
  list: () => KnowledgePoint[];
}

export const useKnowledgeStore = create<State & Actions>((set, get) => ({
  points: {},
  reset: () => set({ points: {} }),
  add: ({ label, threadId, mastery = 0 }) => {
    const id = nanoid();
    set(s => ({ points: { ...s.points, [id]: { id, label, threadId, mastery, createdAt: Date.now() } } }));
    return id;
  },
  setMastery: (id, mastery) => set(s => ({
    points: { ...s.points, [id]: { ...s.points[id], mastery } },
  })),
  list: () => Object.values(get().points).sort((a, b) => b.createdAt - a.createdAt),
}));
