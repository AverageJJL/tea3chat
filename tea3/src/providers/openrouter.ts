import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';
import type { ModelProvider } from './index';

const client = createOpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
});

const openrouterProvider: ModelProvider = {
  displayName: 'OpenRouter',
  supportsImages: false,
  async *stream({ model, messages }) {
    const result = await streamText({ model: client(model), messages });
    for await (const chunk of result.textStream) {
      yield chunk;
    }
  },
};

export default openrouterProvider;
