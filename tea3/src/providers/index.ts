export interface ModelProvider {
  /** Display name used for selection menus. */
  displayName: string;
  /** Whether this provider supports image inputs. */
  supportsImages: boolean;
  /**
   * Stream text chunks from the AI model.
   * @param args.model the model identifier
   * @param args.messages conversation history
   * @param args.useWebSearch optional web search flag
   */
  stream(args: { model: string; messages: any[]; useWebSearch?: boolean }): AsyncIterable<string>;
}

// Provider registry populated below. Each module exports a ModelProvider
// implementation. Add new providers here and in the MODEL_TO_PROVIDER map
// inside `api/chat/route.ts` to expose them via the API.

import groq from './groq';
import openrouter from './openrouter';
import gemini from './gemini';

export const PROVIDERS: Record<string, ModelProvider> = {
  groq,
  openrouter,
  gemini,
};
