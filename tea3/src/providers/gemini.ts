import { GoogleGenAI, createPartFromUri, Part } from '@google/genai';
import type { ModelProvider } from './index';

const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

async function fetchFileAsBase64(url: string, originalMimeType?: string): Promise<{ data: string; mimeType: string }> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch file: ${response.status}`);
  }
  const buffer = await response.arrayBuffer();
  const base64Data = Buffer.from(buffer).toString('base64');
  let mimeType = response.headers.get('content-type') || originalMimeType || 'application/octet-stream';
  if (!mimeType || mimeType === 'application/octet-stream') {
    const extension = url.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'png': mimeType = 'image/png'; break;
      case 'jpg':
      case 'jpeg': mimeType = 'image/jpeg'; break;
      case 'gif': mimeType = 'image/gif'; break;
      case 'webp': mimeType = 'image/webp'; break;
      case 'pdf': mimeType = 'application/pdf'; break;
      case 'txt': mimeType = 'text/plain'; break;
      case 'json': mimeType = 'application/json'; break;
      case 'xml': mimeType = 'application/xml'; break;
      case 'csv': mimeType = 'text/csv'; break;
      case 'rtf': mimeType = 'application/rtf'; break;
      default: mimeType = originalMimeType || 'application/octet-stream';
    }
  }
  return { data: base64Data, mimeType };
}

async function handleFileUploadForGemini(url: string, mimeType: string, displayName: string): Promise<Part | null> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch file for Gemini upload: ${response.status}`);
  const fileBuffer = await response.arrayBuffer();
  const uploadedFile = await client.files.upload({
    file: new Blob([fileBuffer], { type: mimeType }),
    config: { displayName },
  });
  let getFile = await client.files.get({ name: uploadedFile.name });
  while (getFile.state === 'PROCESSING') {
    await new Promise(resolve => setTimeout(resolve, 2000));
    getFile = await client.files.get({ name: uploadedFile.name });
  }
  if (getFile.state === 'FAILED') {
    throw new Error('File processing by Gemini failed.');
  }
  if (getFile.state === 'ACTIVE' && getFile.uri) {
    return createPartFromUri(getFile.uri, getFile.mimeType);
  }
  return null;
}

const geminiProvider: ModelProvider = {
  displayName: 'Gemini',
  supportsImages: true,
  async *stream({ model, messages, useWebSearch }) {
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
                const uploaded = await handleFileUploadForGemini(url, mime_type, file_name);
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
      config: { thinkingConfig: { thinkingBudget: 0 } },
    };
    if (useWebSearch) {
      generateConfig.config.tools = [{ googleSearch: {} }];
    }

    const stream = await client.models.generateContentStream(generateConfig);
    for await (const chunk of stream) {
      const text = chunk.text || '';
      if (text) yield text;
    }
  },
};

export default geminiProvider;
