// api/chat/route.ts
import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { GoogleGenAI, createPartFromUri, Part } from "@google/genai";
import { getRedisClient } from "@/lib/redis";

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

// New helper function to upload files to Gemini and get a file part
async function handleFileUploadForGemini(url: string, mimeType: string, displayName: string): Promise<Part | null> {
  try {
    console.log(`[Gemini File API] Fetching: ${url}`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch file for Gemini upload: ${response.status}`);
    
    const fileBuffer = await response.arrayBuffer();

    console.log(`[Gemini File API] Uploading ${displayName} (${mimeType}) to Gemini...`);
    const uploadedFile = await geminiClient.files.upload({
      file: new Blob([fileBuffer], { type: mimeType }),
      config: {
        displayName: displayName,
      }
    });

    let getFile = await geminiClient.files.get({ name: uploadedFile.name });
    while (getFile.state === 'PROCESSING') {
      console.log(`[Gemini File API] Status: ${getFile.state}, retrying in 2 seconds...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      getFile = await geminiClient.files.get({ name: uploadedFile.name });
    }

    if (getFile.state === 'FAILED') {
      console.error('[Gemini File API] File processing failed:', getFile);
      throw new Error('File processing by Gemini failed.');
    }
    
    if (getFile.state === 'ACTIVE' && getFile.uri) {
      console.log(`[Gemini File API] File processed. URI: ${getFile.uri}`);
      return createPartFromUri(getFile.uri, getFile.mimeType);
    } else {
      console.error('[Gemini File API] File is not active or has no URI.', getFile);
      return null;
    }
  } catch (error) {
    console.error('[Gemini File API] Error during file upload and processing:', error);
    return null;
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
async function processAIAndCacheInBackground({
  model,
  modelConfig,
  messages,
  useWebSearch,
  redisKey,
  timestamp,
}: {
  model: string;
  modelConfig: any;
  messages: any[];
  useWebSearch: boolean;
  redisKey: string;
  timestamp: string;
}) {
  let redis: Awaited<ReturnType<typeof getRedisClient>>;
  let finalContent = "";

  try {
    console.log(
      `[${timestamp}] [BACKGROUND] Starting AI processing for key: ${redisKey}`
    );

    redis = await getRedisClient();

    if (modelConfig.provider === "google") {
      const geminiMessages = await Promise.all(
        messages.map(async (m: any) => {
          const role = m.role === "assistant" ? "model" : "user";
          let parts: any[] = [];
          if (Array.isArray(m.content)) {
            for (const part of m.content) {
              if (part.type === "text") {
                parts.push({ text: part.text });
              } else if (part.type === "image_url") {
                const imageUrl = part.image_url.url;
                if (imageUrl.startsWith("data:")) {
                  const [mimeInfo, base64Data] = imageUrl.split(",");
                  const mimeType =
                    mimeInfo.match(/data:([^;]+)/)?.[1] || "image/jpeg";
                  parts.push({
                    inlineData: { data: base64Data, mimeType: mimeType },
                  });
                } else {
                  const { data, mimeType } = await fetchImageAsBase64(imageUrl);
                  parts.push({ inlineData: { data: data, mimeType: mimeType } });
                }
              } else if (part.type === "file_url") {
                const { url, mime_type, file_name } = part.file_url;
                if (mime_type === "application/pdf") {
                  const uploadedFilePart = await handleFileUploadForGemini(
                    url,
                    mime_type,
                    file_name
                  );
                  if (uploadedFilePart) parts.push(uploadedFilePart);
                } else {
                  const { data, mimeType } = await fetchFileAsBase64(
                    url,
                    mime_type
                  );
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
        config: {
          thinkingConfig: { thinkingBudget: 0 },
        },
      };
      if (useWebSearch) {
        generateConfig.config.tools = [{ googleSearch: {} }];
      }
      
      const stream =
        await geminiClient.models.generateContentStream(generateConfig);
      for await (const chunk of stream) {
        const text = chunk.text || "";
        if (text) {
          finalContent += text;
          console.log( `[${timestamp}] [CHAT] Gemini chunk received: "${text}"`);
          // await redis.append(redisKey, text);
          // await redis.expire(redisKey, 300);
          const state = { status: "streaming", content: finalContent };
          await redis.set(redisKey, JSON.stringify(state), { EX: 300 });
        }
      }
    } else {
      // Handle other providers (Groq, OpenRouter)
      const streamResult = await streamText({
        model: (modelConfig.provider as any)(model),
        messages,
      });
      for await (const text of streamResult.textStream) {
        finalContent += text;
        const state = { status: "streaming", content: finalContent };
        await redis.set(redisKey, JSON.stringify(state), { EX: 300 });
      }
    }
    console.log(
      `[${timestamp}] [BACKGROUND] AI processing finished for key: ${redisKey}.`
    );
  } catch (error) {
    console.error(
      `[${timestamp}] [BACKGROUND] Error during AI processing for key ${redisKey}:`,
      error
    );
    finalContent = `Error: Generation failed.`;
  } finally {
    
    // console.log(
    //   `[${timestamp}] [BACKGROUND] Deleting Redis key: ${redisKey}`
    // );
    // await redis.del(redisKey);
    console.log(
      `[${timestamp}] [BACKGROUND] Task complete. Setting final content for key ${redisKey} with 60s TTL.`
    );
    const finalState = { status: "complete", content: finalContent };
    await redis.set(redisKey, JSON.stringify(finalState), { EX: 60 });
  }
}

// --- API ROUTE HANDLERS ---
export async function POST(req: Request) {
  const timestamp = new Date().toISOString();
  let redisKey: string | null = null;
  try {
    const { messages, model, useWebSearch, assistantMessageId } =
      await req.json();

    console.log(
      `[${timestamp}] [POST] Received request for model: ${model}, assistantMessageId: ${assistantMessageId}`
    );

    // --- Validation ---
    if (!assistantMessageId) {
      return new Response(
        JSON.stringify({ error: "assistantMessageId is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    if (!model) {
      return new Response(
        JSON.stringify({ error: "Model selection is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    const modelConfig = MODEL_PROVIDERS[model as keyof typeof MODEL_PROVIDERS];
    if (!modelConfig) {
      return new Response(JSON.stringify({ error: "Invalid model" }), {
        status: 400,
      });
    }
    // Add other validations as needed...

    if (!assistantMessageId) throw new Error("assistantMessageId is required.");
    redisKey = `stream:${assistantMessageId}`;

    const redis = await getRedisClient();

    // Quick health-check to ensure Redis is reachable (will throw if not)
    await redis.ping();

    const initialState = { status: "streaming", content: "" };
    await redis.set(redisKey, JSON.stringify(initialState), { EX: 300 });
    
    // --- DECOUPLING ---
    // Start the background processing but DO NOT await it.
    processAIAndCacheInBackground({
      model,
      modelConfig,
      messages,
      useWebSearch,
      redisKey,
      timestamp,
    });

    // --- CLIENT-FACING STREAM ---
    // This stream polls Redis and sends updates to the client
    const clientStream = new ReadableStream({
      async start(controller) {
        let lastContentSent = "";
        const encoder = new TextEncoder();

        while (true) {
          const rawState = await redis.get(redisKey);
          if (rawState === null) break; // Key expired or deleted, we're done.

          const state = JSON.parse(rawState.toLocaleString());
          if (state.content.length > lastContentSent.length) {
            const newChunk = state.content.substring(lastContentSent.length);
            controller.enqueue(
              encoder.encode(`0:${JSON.stringify(newChunk)}\n`)
            );
            lastContentSent = state.content;
          }

          // if the background task marked it as complete, we stop streaming.
          if (state.status === "complete") break;

          await new Promise((resolve) => setTimeout(resolve, 200));
        }
        controller.close();
      },
      cancel() {
        console.log(
          `[${timestamp}] [CLIENT STREAM] Client disconnected. Stopping polling stream. Background task continues.`
        );
      },
    });

    return new Response(clientStream, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (error: any) {
    // Enhanced error handling for Redis connection issues
    const isRedisConnErr = (err: any): boolean => {
      if (!err) return false;
      if (err.code === "ECONNREFUSED") return true;
      if (typeof err.message === "string" && err.message.includes("ECONNREFUSED")) return true;
      if (err instanceof AggregateError && Array.isArray(err.errors)) {
        return err.errors.some((e: any) =>
          e?.code === "ECONNREFUSED" ||
          (typeof e?.message === "string" && e.message.includes("ECONNREFUSED"))
        );
      }
      return false;
    };

    const redisConnError = isRedisConnErr(error);

    // Log the error for server-side diagnostics
    console.error(`[${timestamp}] [POST CATCH-ALL] Error:`, error);

    // If it's a Redis connectivity problem, surface a clearer message to the client
    if (redisConnError) {
      return new Response(
        JSON.stringify({ error: "Service temporarily unavailable (Redis connection failed). Please try again later." }),
        {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Fallback: generic 500 for other errors
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
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