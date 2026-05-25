export type Role = 'user' | 'assistant' | 'system';

export interface Topic {
  id: string;
  title: string;
  rootMessageId: string | null;
  createdAt: number;
}

export interface BranchInfo {
  parentMessageId: string;
  selectedText: string;
}

/**
 * A message belongs to a topic and lives inside some branch.
 * - `parentMessageId`: previous message in the same branch's linear chain (null = first message of its branch).
 * - `branchFrom`: only set if this message is the FIRST message of a non-main branch.
 *   Identifies which message (in some other branch) it was branched from, and the user-selected text.
 * - `branchId`: a derived/stored identifier of the branch this message lives in.
 *   `'main'` for the topic's main thread; otherwise equals the id of the first message of that branch.
 */
export interface Message {
  id: string;
  topicId: string;
  branchId: string;
  parentMessageId: string | null;
  role: Role;
  content: string;
  branchFrom: BranchInfo | null;
  createdAt: number;
}
