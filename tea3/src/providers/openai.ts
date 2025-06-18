import OpenAI from 'openai';
import type { ModelProvider } from './index';

const defaultClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function convertMessage(m: any) {
  // FIX: Determine the correct content type based on the role.
  const contentType = m.role === "assistant" ? "output_text" : "input_text";

  if (Array.isArray(m.content)) {
    const content = m.content
      .map((part: any) => {
        if (part.type === "text") {
          // Use the determined contentType
          return { type: contentType, text: part.text };
        } else if (part.type === "image_url") {
          // Images are always 'input_image' and only valid for user roles
          const url =
            typeof part.image_url === "string"
              ? part.image_url
              : part.image_url.url;
          return { type: "input_image", image_url: url };
        }
        return null;
      })
      .filter(Boolean);
    return { role: m.role, content };
  }

  // Also use the determined contentType for simple text messages
  return { role: m.role, content: [{ type: contentType, text: m.content }] };
}

const openaiProvider: ModelProvider = {
  async *stream({ model, messages, useWebSearch, providerConfig }) {
    const client = providerConfig?.apiKey
      ? new OpenAI({ apiKey: providerConfig.apiKey })
      : defaultClient;
      
    const input = messages.map(convertMessage);
    const body: any = { model, input, stream: true };

    const tools: any[] = [];
    if (providerConfig?.tools?.webSearch && useWebSearch) {
      tools.push({ type: 'web_search_preview' });
    }
    if (providerConfig?.tools?.imageGeneration) {
      tools.push({ type: 'image_generation' });
    }
    if (tools.length > 0) {
      body.tools = tools;
    }

    Object.assign(body, providerConfig?.config);

    const stream = await client.responses.create(body);
    for await (const event of stream as any) {
      if (event.type === 'response.output_text.delta') {
        yield { type: 'content', value: event.delta };
      }
    }
  },
};

export default openaiProvider;
