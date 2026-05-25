export type Role = 'user' | 'assistant' | 'system';

export interface Message {
  id: string;
  threadId: string;
  parentMessageId: string | null;
  role: Role;
  content: string;
  createdAt: number;
}

export interface Thread {
  id: string;
  parentThreadId: string | null;
  parentMessageId: string | null;
  triggerWord: string | null;
  title: string;
  createdAt: number;
}

export interface KnowledgePoint {
  id: string;
  label: string;
  mastery: number;
  threadId: string | null;
  createdAt: number;
}
