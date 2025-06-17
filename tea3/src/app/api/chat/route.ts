// api/chat/route.ts
import { getRedisClient } from "@/lib/redis";
import { PROVIDERS, ModelProvider } from "@/src/providers";


// Map of model names to the provider key defined in src/providers
export const MODEL_TO_PROVIDER: Record<string, string> = {
  "llama3-8b-8192": "groq",
  "deepseek/deepseek-chat-v3-0324": "openrouter",
  "gemini-2.5-flash-preview-05-20": "gemini",
};
async function processAIAndCacheInBackground({
  provider,
  model,
  messages,
  useWebSearch,
  redisKey,
  timestamp,
}: {
  provider: ModelProvider;
  model: string;
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

    for await (const chunk of provider.stream({ model, messages, useWebSearch })) {
      finalContent += chunk;
      const state = { status: "streaming", content: finalContent };
      await redis.set(redisKey, JSON.stringify(state), { EX: 300 });
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

    const providerKey: string | undefined = MODEL_TO_PROVIDER[model];

    if (!providerKey) {
      return new Response(JSON.stringify({ error: "Invalid model" }), {
        status: 400,
      });
    }
    const provider = PROVIDERS[providerKey];
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
      provider,
      model,
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
    const models = Object.entries(MODEL_TO_PROVIDER).map(([value, key]) => ({
      value,
      displayName: PROVIDERS[key].displayName,
      supportsImages: PROVIDERS[key].supportsImages,
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