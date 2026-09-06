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
  /** Whether the topic list in the left sidebar is collapsed. */
  topicListCollapsed: boolean;
  /** Persisted width of the right panel (px). */
  rightPanelWidth: number;
  /** Whether the Feynman check modal is open. */
  feynmanModalOpen: boolean;
  /**
   * Which single pane is visible below the `lg` breakpoint. Above it, all three
   * columns show and this is ignored — the switch is pure CSS, so there is no
   * `matchMedia` read during render and no SSR/client mismatch.
   */
  mobilePane: 'tree' | 'chat' | 'focus';
  /**
   * Last user-facing failure (network, API rejection, mid-stream provider
   * error). Rendered as a dismissible banner. Previously such failures either
   * vanished into `console` or were appended to the assistant's message body.
   */
  lastError: string | null;
}

interface Actions {
  setActiveTopic: (id: string | null) => void;
  toggleBranch: (branchId: string, open?: boolean) => void;
  setFocusedBranch: (branchId: string) => void;
  setScrollTarget: (id: string | null) => void;
  setTopicListCollapsed: (collapsed: boolean) => void;
  setRightPanelWidth: (width: number) => void;
  setFeynmanModalOpen: (open: boolean) => void;
  setMobilePane: (pane: 'tree' | 'chat' | 'focus') => void;
  setLastError: (message: string | null) => void;
}

export const useUiStore = create<State & Actions>()(
  persist(
    (set) => ({
      activeTopicId: null,
      expandedBranches: {},
      focusedBranchId: 'main',
      scrollTargetMessageId: null,
      topicListCollapsed: false,
      rightPanelWidth: 420,
      feynmanModalOpen: false,
      mobilePane: 'chat',
      lastError: null,
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
      setTopicListCollapsed: (collapsed) => set({ topicListCollapsed: collapsed }),
      setRightPanelWidth: (width) => set({ rightPanelWidth: width }),
      setFeynmanModalOpen: (open) => set({ feynmanModalOpen: open }),
      setMobilePane: (pane) => set({ mobilePane: pane }),
      setLastError: (message) => set({ lastError: message }),
    }),
    {
      name: 'feynman.ui',
      // Only durable preferences survive a reload. Persisting the transient
      // fields meant a refresh could restore a stale scroll target, reopen the
      // Feynman modal, or show an error from the previous session.
      partialize: (s) => ({
        activeTopicId: s.activeTopicId,
        expandedBranches: s.expandedBranches,
        focusedBranchId: s.focusedBranchId,
        topicListCollapsed: s.topicListCollapsed,
        rightPanelWidth: s.rightPanelWidth,
      }),
    },
  ),
);
