export interface LLMMessage { role: 'system' | 'user' | 'assistant'; content: string; }
export interface LLMProvider {
  chatStream(messages: LLMMessage[], opts?: { temperature?: number }): AsyncIterable<string>;
}
