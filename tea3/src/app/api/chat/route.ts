import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { GoogleGenAI } from "@google/genai";

// Groq provider
const groq = createOpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

// OpenRouter provider
const openrouter = createOpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

// Gemini provider  
const geminiClient = new GoogleGenAI({ 
  apiKey: process.env.GEMINI_API_KEY!
});

// Helper function to fetch and convert external files to base64
async function fetchFileAsBase64(url: string, originalMimeType?: string): Promise<{ data: string; mimeType: string }> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch file: ${response.status}`);
    }
    
    const buffer = await response.arrayBuffer();
    const base64Data = Buffer.from(buffer).toString('base64');
    
    // Try to get mime type from response headers, fallback to original or infer from URL
    let mimeType = response.headers.get('content-type') || originalMimeType || 'application/octet-stream';
    
    if (!mimeType || mimeType === 'application/octet-stream') {
      // Infer from URL extension if content-type is not available
      const extension = url.split('.').pop()?.toLowerCase();
      switch (extension) {
        case 'png': mimeType = 'image/png'; break;
        case 'jpg': case 'jpeg': mimeType = 'image/jpeg'; break;
        case 'gif': mimeType = 'image/gif'; break;
        case 'webp': mimeType = 'image/webp'; break;
        case 'pdf': mimeType = 'application/pdf'; break;
        case 'txt': mimeType = 'text/plain'; break;
        case 'json': mimeType = 'application/json'; break;
        case 'xml': mimeType = 'application/xml'; break;
        case 'csv': mimeType = 'text/csv'; break;
        case 'rtf': mimeType = 'application/rtf'; break;
        default: mimeType = originalMimeType || 'application/octet-stream'; break;
      }
    }
    
    return { data: base64Data, mimeType };
  } catch (error) {
    console.error('Error fetching file:', error);
    throw new Error(`Failed to fetch file from URL: ${url}`);
  }
}

// Legacy function for backward compatibility
async function fetchImageAsBase64(url: string): Promise<{ data: string; mimeType: string }> {
  return fetchFileAsBase64(url, 'image/jpeg');
}

// Model to provider mapping
const MODEL_PROVIDERS = {
  "llama3-8b-8192": {
    provider: groq,
    displayName: "Llama 3 8B (Groq)",
    supportsImages: false,
  },
  "deepseek/deepseek-chat-v3-0324": {
    provider: openrouter,
    displayName: "Deepseek V3 0324 (OpenRouter)",
    supportsImages: false,
  },

  "gemini-2.5-flash-preview-05-20": {
    provider: "google",
    displayName: "Gemini 2.5 Flash (Google)",
    supportsImages: true,
  },
} as const;

export async function POST(req: Request) {
  try {
    const { messages, model, useWebSearch } = await req.json();

    console.log(
      "BACKEND: Received from frontend:",
      JSON.stringify({ model, messages, useWebSearch }, null, 2)
    );

    // Model is now required
    if (!model) {
      return new Response(JSON.stringify({ error: "Model selection is required" }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get the provider for the selected model
    const modelConfig = MODEL_PROVIDERS[model as keyof typeof MODEL_PROVIDERS];
    if (!modelConfig) {
      return new Response(JSON.stringify({ error: "Invalid model selection" }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate messages
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "Messages are required" }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // If provider doesn't support attachments, ensure none are present
    const containsAttachment = messages.some((msg: any) => {
      if (Array.isArray(msg?.content)) {
        return msg.content.some((part: any) => part?.type === 'image_url' || part?.type === 'file_url');
      }
      return false;
    });
    const containsImage = messages.some((msg: any) => {
      if (Array.isArray(msg?.content)) {
        return msg.content.some((part: any) => part?.type === 'image_url');
      }
      return false;
    });

    if (containsAttachment && !modelConfig.supportsImages) {
      return new Response(JSON.stringify({ error: "The selected model does not support attachments." }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }



    console.log("Using model:", model);
    console.log("Model config:", modelConfig);
    console.log("Messages:", JSON.stringify(messages, null, 2));

    if (modelConfig.provider === "google") {
      // Validate API key
      if (!process.env.GEMINI_API_KEY) {
        return new Response(JSON.stringify({ error: "Gemini API key is not configured" }), { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const geminiMessages = await Promise.all(messages.map(async (m: any) => {
        const role = m.role === 'assistant' ? 'model' : 'user';
        let parts: any[] = [];
        if (Array.isArray(m.content)) {
          for (const part of m.content) {
            if (part.type === 'text') {
              parts.push({ text: part.text });
            } else if (part.type === 'image_url') {
              // Handle base64 image data for Gemini
              const imageUrl = part.image_url.url;
              if (imageUrl.startsWith('data:')) {
                // Extract base64 data and mime type from data URL
                const [mimeInfo, base64Data] = imageUrl.split(',');
                const mimeType = mimeInfo.match(/data:([^;]+)/)?.[1] || 'image/jpeg';
                parts.push({ 
                  inlineData: { 
                    data: base64Data, 
                    mimeType: mimeType 
                  } 
                });
              } else {
                // For external URLs, fetch and convert to base64
                try {
                  const { data, mimeType } = await fetchImageAsBase64(imageUrl);
                  parts.push({ 
                    inlineData: { 
                      data: data, 
                      mimeType: mimeType 
                    } 
                  });
                } catch (error) {
                  console.error('Failed to fetch external image:', error);
                  // Skip this image part if it fails to fetch
                }
              }
            } else if (part.type === 'file_url') {
              // Handle file attachments (images, PDFs, and other supported formats)
              const mimeType = part.file_url.mime_type || 'application/octet-stream';
              
              // Gemini supports images, PDFs, and various document formats
              const supportedTypes = [
                'image/', 'application/pdf', 'text/', 'application/json',
                'application/xml', 'application/rtf', 'text/csv'
              ];
              
              const isSupported = supportedTypes.some(type => mimeType.startsWith(type));
              
              if (isSupported) {
                if (part.file_url.url.startsWith('data:')) {
                  const [mimeInfo, base64Data] = part.file_url.url.split(',');
                  const actualMimeType = mimeInfo.match(/data:([^;]+)/)?.[1] || mimeType;
                  parts.push({ 
                    inlineData: { 
                      data: base64Data, 
                      mimeType: actualMimeType 
                    } 
                  });
                } else {
                  // For external file URLs, fetch and convert to base64
                  try {
                    const { data, mimeType: fetchedMimeType } = await fetchFileAsBase64(part.file_url.url, mimeType);
                    parts.push({ 
                      inlineData: { 
                        data: data, 
                        mimeType: fetchedMimeType 
                      } 
                    });
                  } catch (error) {
                    console.error('Failed to fetch external file:', error);
                    // Skip this file part if it fails to fetch
                  }
                }
              }
            }
          }
        } else {
          parts = [{ text: m.content }];
        }
        return { role, parts };
      }));

      try {
        const generateConfig: any = {
          model,
          contents: geminiMessages,
        };

        // Add search grounding if enabled
        if (useWebSearch) {
          generateConfig.config = {
            tools: [{ googleSearch: {} }],
          };
        }

        const stream = await geminiClient.models.generateContentStream(generateConfig);

        const encoder = new TextEncoder();
        const respStream = new ReadableStream({
          async start(controller) {
            for await (const chunk of stream) {
              const text = chunk.text || '';
              controller.enqueue(encoder.encode(`0:${JSON.stringify(text)}\n`));
            }
            controller.close();
          },
        });

        return new Response(respStream, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      } catch (geminiError: any) {
        console.error("Gemini API error:", geminiError);
        
        // Handle specific Gemini authentication errors
        if (geminiError.message?.includes('403') || geminiError.message?.includes('PERMISSION_DENIED')) {
          return new Response(JSON.stringify({ 
            error: "Gemini API authentication failed. Please check your API key and ensure it's valid." 
          }), { 
            status: 403,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        throw geminiError; // Re-throw to be handled by outer catch
      }
    }

    const result = await streamText({
      model: (modelConfig.provider as any)(model),
      messages,
    });

    return result.toDataStreamResponse();
  } catch (error: any) { // Added :any for easier property access, consider more specific type if known
    console.error("Chat API error:", error);
    console.error("Error details:", {
      message: error?.message,
      stack: error?.stack,
      name: error?.name,
      cause: error?.cause 
    });
    
    // Handle specific error types first
    if (error instanceof Error) {
      if (error.message.includes('API key')) {
        return new Response(JSON.stringify({ error: "API configuration error. Please check your API keys." }), { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (error.message.includes('rate limit')) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), { 
          status: 429,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Generic error response, attempting to use the actual error message
    let responseErrorMessage = "An unexpected error occurred. Please try again.";
    if (error instanceof Error && error.message) {
      responseErrorMessage = error.message;
    } else if (typeof error === 'string') {
      responseErrorMessage = error;
    }
    // For other types of 'error' (e.g., an object that is not an Error instance), 
    // it will use the default "An unexpected error occurred..." message.

    return new Response(JSON.stringify({ error: responseErrorMessage }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Export available models for frontend use
export async function GET() {
  try {
    const models = Object.entries(MODEL_PROVIDERS).map(([value, config]) => ({
      value,
      displayName: config.displayName
    }));
    
    return Response.json({ models });
  } catch (error) {
    console.error("Failed to fetch models:", error);
    return new Response(JSON.stringify({ error: "Failed to load available models" }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}