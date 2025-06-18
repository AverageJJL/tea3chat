import { GoogleGenAI, createPartFromUri, Part } from '@google/genai';

export async function fetchFileAsBase64(url: string, originalMimeType?: string): Promise<{ data: string; mimeType: string }> {
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

export async function handleFileUploadForGemini(client: GoogleGenAI, url: string, mimeType: string, displayName: string): Promise<Part | null> {
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