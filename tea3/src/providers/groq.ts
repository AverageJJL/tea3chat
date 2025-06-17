import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';
import type { ModelProvider } from './index';

const client = createOpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

const groqProvider: ModelProvider = {
  displayName: 'llama 3 8B',
  supportsImages: false,
  async *stream({ model, messages }) {
    const result = await streamText({ model: client(model), messages });
    for await (const chunk of result.textStream) {
      yield chunk;
    }
  },
};

export default groqProvider;
