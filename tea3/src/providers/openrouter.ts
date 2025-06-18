import { OpenAI } from 'openai';
import type { ModelProvider } from './index';
import { CoreMessage } from 'ai';

const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
});

const openrouterProvider: ModelProvider = {
  async *stream({ model, messages, providerConfig }) {
    const response = await client.chat.completions.create({
      model: model,
      messages: messages as CoreMessage[],
      stream: true,
      ...providerConfig,
    });

    for await (const chunk of response as any) {
      const reasoning = (chunk.choices[0].delta as any).reasoning;
      if (reasoning) {
        yield { type: 'reasoning', value: reasoning };
      }
      const content = chunk.choices[0].delta.content;
      if (content) {
        yield { type: 'content', value: content };
      }
    }
  },
};

export default openrouterProvider;
