export interface ModelStreamPart {
  type: 'content' | 'reasoning';
  value: string;
}

export interface ModelProvider {
  /**
   * Stream text chunks from the AI model.
   * @param args.model the model identifier
   * @param args.messages conversation history
   * @param args.useWebSearch optional web search flag
   */
  stream(args: {
    model: string;
    messages: any[];
    useWebSearch?: boolean;
    providerConfig: any;
  }): AsyncIterable<ModelStreamPart>;
}

// Provider registry populated below. Each module exports a ModelProvider
// implementation. Add new providers here and in the `MODELS_CONFIG` map
// inside `api/chat/route.ts` to expose them via the API.

import groq from './groq';
import openrouter from './openrouter';
import gemini from './gemini';

export const PROVIDERS: Record<string, ModelProvider> = {
  groq,
  openrouter,
  gemini,
};
