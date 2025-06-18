import { GoogleGenAI } from '@google/genai';
import type { ModelProvider } from './index';
import { fetchFileAsBase64, handleFileUploadForGemini } from './gemini.utils';

const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

const geminiProvider: ModelProvider = {
  async *stream({ model, messages, useWebSearch, providerConfig }) {
    const geminiMessages = await Promise.all(
      messages.map(async (m: any) => {
        const role = m.role === 'assistant' ? 'model' : 'user';
        let parts: any[] = [];
        if (Array.isArray(m.content)) {
          for (const part of m.content) {
            if (part.type === 'text') {
              parts.push({ text: part.text });
            } else if (part.type === 'image_url') {
              const imageUrl = part.image_url.url;
              if (imageUrl.startsWith('data:')) {
                const [mimeInfo, base64Data] = imageUrl.split(',');
                const mimeType = mimeInfo.match(/data:([^;]+)/)?.[1] || 'image/jpeg';
                parts.push({ inlineData: { data: base64Data, mimeType } });
              } else {
                const { data, mimeType } = await fetchFileAsBase64(imageUrl);
                parts.push({ inlineData: { data, mimeType } });
              }
            } else if (part.type === 'file_url') {
              const { url, mime_type, file_name } = part.file_url;
              if (mime_type === 'application/pdf') {
                const uploaded = await handleFileUploadForGemini(client, url, mime_type, file_name);
                if (uploaded) parts.push(uploaded);
              } else {
                const { data, mimeType } = await fetchFileAsBase64(url, mime_type);
                parts.push({ inlineData: { data, mimeType } });
              }
            }
          }
        } else {
          parts = [{ text: m.content }];
        }
        return { role, parts };
      })
    );

    const generateConfig: any = {
      model,
      contents: geminiMessages,
      config: { ...providerConfig.config },
    };
    if (useWebSearch && providerConfig.tools?.googleSearch) {
      generateConfig.tools = [{ googleSearch: {} }];
    }

    const stream = await client.models.generateContentStream(generateConfig);
    for await (const chunk of stream) {
      const text = chunk.text || '';
      if (text) yield { type: 'content', value: text };
    }
  },
};

export default geminiProvider;
