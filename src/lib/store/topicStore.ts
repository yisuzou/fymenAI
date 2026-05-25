import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Topic } from '@/lib/types';

interface State {
  topics: Record<string, Topic>;
  order: string[];
  loaded: boolean;
}

interface Actions {
  hydrate: (topics: Topic[]) => void;
  upsert: (t: Topic) => void;
  remove: (id: string) => void;
  rename: (id: string, title: string) => void;
}

export const useTopicStore = create<State & Actions>()(
  persist(
    (set) => ({
      topics: {},
      order: [],
      loaded: false,
      hydrate: (topics) =>
        set(() => ({
          topics: Object.fromEntries(topics.map((t) => [t.id, t])),
          order: topics
            .slice()
            .sort((a, b) => b.createdAt - a.createdAt)
            .map((t) => t.id),
          loaded: true,
        })),
      upsert: (t) =>
        set((s) => ({
          topics: { ...s.topics, [t.id]: t },
          order: s.order.includes(t.id) ? s.order : [t.id, ...s.order],
        })),
      remove: (id) =>
        set((s) => {
          const { [id]: _drop, ...rest } = s.topics;
          void _drop;
          return { topics: rest, order: s.order.filter((x) => x !== id) };
        }),
      rename: (id, title) =>
        set((s) =>
          s.topics[id] ? { topics: { ...s.topics, [id]: { ...s.topics[id], title } } } : s,
        ),
    }),
    { name: 'feynman.topics' },
  ),
);
