export interface LLMMessage { role: 'system' | 'user' | 'assistant'; content: string; }

export interface LLMOptions {
  temperature?: number;
  /**
   * Ask the provider to emit strict JSON. Used by the Feynman grader, which
   * needs a parseable object rather than prose wrapped around one.
   */
  json?: boolean;
}

export interface LLMProvider {
  chatStream(messages: LLMMessage[], opts?: LLMOptions): AsyncIterable<string>;
}
