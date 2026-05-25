import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface State {
  activeTopicId: string | null;
  /** Set of branchIds (other than 'main') that are expanded in the conversation. */
  expandedBranches: Record<string, boolean>;
  /** Branch the user is currently focused on (for Tracer highlight + right column). */
  focusedBranchId: string;
  /** Optional: id of a message to scroll to. */
  scrollTargetMessageId: string | null;
}

interface Actions {
  setActiveTopic: (id: string | null) => void;
  toggleBranch: (branchId: string, open?: boolean) => void;
  setFocusedBranch: (branchId: string) => void;
  setScrollTarget: (id: string | null) => void;
}

export const useUiStore = create<State & Actions>()(
  persist(
    (set) => ({
      activeTopicId: null,
      expandedBranches: {},
      focusedBranchId: 'main',
      scrollTargetMessageId: null,
      setActiveTopic: (id) => set({ activeTopicId: id, focusedBranchId: 'main' }),
      toggleBranch: (branchId, open) =>
        set((s) => ({
          expandedBranches: {
            ...s.expandedBranches,
            [branchId]: open ?? !s.expandedBranches[branchId],
          },
        })),
      setFocusedBranch: (branchId) => set({ focusedBranchId: branchId }),
      setScrollTarget: (id) => set({ scrollTargetMessageId: id }),
    }),
    { name: 'feynman.ui' },
  ),
);
