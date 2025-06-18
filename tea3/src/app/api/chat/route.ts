// api/chat/route.ts
import { getRedisClient } from "@/lib/redis";
import { MODELS_CONFIG } from "@/lib/models";
import { PROVIDERS, ModelProvider } from "@/src/providers";
import { NextResponse } from "next/server";

async function processAIAndCacheInBackground({
  provider,
  model,
  messages,
  useWebSearch,
  redisKey,
  timestamp,
  userPreferences,
}: {
  provider: ModelProvider;
  model: string;
  messages: any[];
  useWebSearch: boolean;
  redisKey: string;
  timestamp: string;
  userPreferences?: { name?: string; role?: string; traits?: string[]; customInstructions?: string };
}) {
  let redis: Awaited<ReturnType<typeof getRedisClient>>;
  let finalContent = "";
  let finalReasoning = "";

  try {
    console.log(
      `[${timestamp}] [BACKGROUND] Starting AI processing for key: ${redisKey}`
    );

    redis = await getRedisClient();

    const modelConfig = MODELS_CONFIG[model];
    const modelDisplayName = modelConfig.displayName;
    const currentTimestamp = new Date().toLocaleString(undefined, {
      timeZoneName: "short",
    });

    let systemPrompt = `You are Tweak 3 Chat, an AI assistant powered by the ${modelDisplayName} model. Your role is to assist and engage in conversation while being helpful, respectful, and engaging.

If you are specifically asked about the model you are using, you may mention that you use the ${modelDisplayName} model. If you are not asked specifically about the model you are using, you do not need to mention it.
The current date and time including timezone is ${currentTimestamp}.
Always use LaTeX for mathematical expressions.

For inline math, use a single dollar sign, like $...$. For example, $E = mc^2$.
For display math, use double dollar signs, like $$...$$. For example, $$\int_{a}^{b} f(x) dx$$.

Present code in Markdown code blocks with the correct language extension indicated`;
    
    if (userPreferences?.name && userPreferences.name.trim() !== '') {
      systemPrompt += `\n\nYou're speaking with ${userPreferences.name}.`;
    }

    if (userPreferences?.role && userPreferences.role.trim() !== '') {
       systemPrompt += `\n\nThe user's occupation is ${userPreferences.role}.`;
    }

    if (userPreferences?.traits && userPreferences.traits.length > 0) {
       systemPrompt += `\n\nBehavioral traits to incorporate:\n${userPreferences.traits.join("\n")}`;
    }

    if (userPreferences?.customInstructions && userPreferences.customInstructions.trim() !== '') {
       systemPrompt += `\n\nAdditional context:\n${userPreferences.customInstructions}`;
    }

    const systemMessage = { role: "system" as const, content: systemPrompt };
    const messagesWithSystemPrompt = [systemMessage, ...messages];

    for await (const part of provider.stream({
      model,
      messages: messagesWithSystemPrompt,
      useWebSearch: useWebSearch && modelConfig.supportsWebSearch === true,
      providerConfig: modelConfig.providerConfig,
    })) {
      if (part.type === "content") {
        finalContent += part.value;
      } else if (part.type === "reasoning") {
        finalReasoning += part.value;
      }
      const state = {
        status: "streaming",
        content: finalContent,
        reasoning: finalReasoning,
      };
      await redis.set(redisKey, JSON.stringify(state), { EX: 300 });
    }
    console.log(
      `[${timestamp}] [BACKGROUND] AI processing finished for key: ${redisKey}.`
    );
    console.log(
      `[${timestamp}] [BACKGROUND] Final response for key ${redisKey}:`,
      finalContent
    );
    if (finalReasoning) {
      console.log(
        `[${timestamp}] [BACKGROUND] Final reasoning for key ${redisKey}:`,
        finalReasoning
      );
    }
  } catch (error) {
    console.error(
      `[${timestamp}] [BACKGROUND] Error during AI processing for key ${redisKey}:`,
      error
    );
    finalContent = `Error: Generation failed.`;
    finalReasoning = "";
  } finally {
    console.log(
      `[${timestamp}] [BACKGROUND] Task complete. Setting final content for key ${redisKey} with 60s TTL.`
    );
    const finalState = {
      status: "complete",
      content: finalContent,
      reasoning: finalReasoning,
    };
    await redis.set(redisKey, JSON.stringify(finalState), { EX: 60 });
  }
}

// --- API ROUTE HANDLERS ---
export async function POST(req: Request) {
  const timestamp = new Date().toISOString();
  let redisKey: string | null = null;
  try {
    const {
      messages,
      model,
      useWebSearch,
      assistantMessageId,
      userPreferences,
    } = await req.json();

    const disableResumableStream =
      userPreferences?.disableResumableStream === true;

    console.log(
      `[${timestamp}] [POST] Received request for model: ${model}, assistantMessageId: ${assistantMessageId}`
    );

    if (messages && messages.length > 0) {
      const userMessage = messages[messages.length - 1];
      console.log(`[${timestamp}] [USER MESSAGE]`, userMessage);
    }

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

    const modelConfig = MODELS_CONFIG[model];

    if (!modelConfig) {
      return new Response(JSON.stringify({ error: "Invalid model" }), {
        status: 400,
      });
    }
    const provider = PROVIDERS[modelConfig.provider];
    // Add other validations as needed...

    if (disableResumableStream) {
      const modelDisplayName = modelConfig.displayName;
      const currentTimestamp = new Date().toLocaleString(undefined, {
        timeZoneName: "short",
      });

      let systemPrompt = `You are Tweak 3 Chat, an AI assistant powered by the ${modelDisplayName} model. Your role is to assist and engage in conversation while being helpful, respectful, and engaging.

If you are specifically asked about the model you are using, you may mention that you use the ${modelDisplayName} model. If you are not asked specifically about the model you are using, you do not need to mention it.
The current date and time including timezone is ${currentTimestamp}.
Always use LaTeX for mathematical expressions.

For inline math, use a single dollar sign, like $...$. For example, $E = mc^2$.
For display math, use double dollar signs, like $$...$$. For example, $$\\int_{a}^{b} f(x) dx$$.

Present code in Markdown code blocks with the correct language extension indicated`;

      if (userPreferences?.name && userPreferences.name.trim() !== '') {
        systemPrompt += `\n\nYou're speaking with ${userPreferences.name}.`;
      }

      if (userPreferences?.role && userPreferences.role.trim() !== '') {
        systemPrompt += `\n\nThe user's occupation is ${userPreferences.role}.`;
      }

      if (userPreferences?.traits && userPreferences.traits.length > 0) {
        systemPrompt += `\n\nBehavioral traits to incorporate:\n${userPreferences.traits.join("\n")}`;
      }

      if (
        userPreferences?.customInstructions &&
        userPreferences.customInstructions.trim() !== ''
      ) {
        systemPrompt += `\n\nAdditional context:\n${userPreferences.customInstructions}`;
      }

      const systemMessage = { role: "system" as const, content: systemPrompt };
      const messagesWithSystemPrompt = [systemMessage, ...messages];

      const directStream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          let finalContent = "";
          try {
            for await (const part of provider.stream({
              model,
              messages: messagesWithSystemPrompt,
              useWebSearch: useWebSearch && modelConfig.supportsWebSearch === true,
              providerConfig: modelConfig.providerConfig,
            })) {
              if (part.type === "content") {
                finalContent += part.value;
                controller.enqueue(
                  encoder.encode(`0:${JSON.stringify(part.value)}\n`)
                );
              } else if (part.type === "reasoning") {
                // Use prefix '2:' for custom data frames
                controller.enqueue(
                  encoder.encode(`2:${JSON.stringify(part)}\n`)
                );
              }
            }
            console.log(
              `[${timestamp}] [DIRECT STREAM] Final response:`,
              finalContent
            );
          } catch (err) {
            console.error(`[${timestamp}] [DIRECT STREAM] Error:`, err);
            controller.enqueue(
              encoder.encode(`0:${JSON.stringify('Error: Generation failed.')}\n`)
            );
          } finally {
            controller.close();
          }
        },
      });

      return new Response(directStream, {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

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
      userPreferences,
    });

    // --- CLIENT-FACING STREAM ---
    // This stream polls Redis and sends updates to the client
    const clientStream = new ReadableStream({
      async start(controller) {
        let lastContentSent = "";
        let lastReasoningSent = "";
        const encoder = new TextEncoder();

        while (true) {
          const rawState = await redis.get(redisKey);
          if (rawState === null) break; // Key expired or deleted, we're done.

          const state = JSON.parse(rawState.toLocaleString());
          if (state.content && state.content.length > lastContentSent.length) {
            const newChunk = state.content.substring(lastContentSent.length);
            controller.enqueue(
              encoder.encode(`0:${JSON.stringify(newChunk)}\n`)
            );
            lastContentSent = state.content;
          }

          if (
            state.reasoning &&
            state.reasoning.length > lastReasoningSent.length
          ) {
            const newChunk = state.reasoning.substring(
              lastReasoningSent.length
            );
            // Use prefix '2:' for custom data frames
            controller.enqueue(
              encoder.encode(
                `2:${JSON.stringify({ type: "reasoning", value: newChunk })}\n`
              )
            );
            lastReasoningSent = state.reasoning;
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
    const models = Object.entries(MODELS_CONFIG).map(([value, config]) => ({
      value,
      displayName: config.displayName,
      supportsImages: config.supportsImages,
      supportsWebSearch: config.supportsWebSearch === true,
      // Note: We are not exposing providerConfig to the client here for security
      // and simplicity. The client only needs the list of models.
    }));

    return NextResponse.json({ models });
  } catch (error) {
    console.error("Failed to fetch models:", error);
    return NextResponse.json(
      { error: "Failed to load available models" },
      {
        status: 500,
      },
    );
  }
}