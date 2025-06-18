import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';
import type { ModelProvider } from './index';

const client = createOpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

const groqProvider: ModelProvider = {
  async *stream({ model, messages, providerConfig }) {
    const result = await streamText({ model: client(model), messages });
    for await (const chunk of result.textStream) {
      yield { type: 'content', value: chunk };
    }
  },
};

export default groqProvider;
