import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";

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

// Model to provider mapping
const MODEL_PROVIDERS = {
  "llama3-8b-8192": {
    provider: groq,
    displayName: "Llama 3 8B (Groq)",
    supportsImages: false,
  },
  "qwen/qwen3-235b-a22b:free": {
    provider: openrouter,
    displayName: "Qwen 3 235B (OpenRouter)",
    supportsImages: false,
  },
  "meta-llama/llama-4-maverick:free": {
    provider: openrouter,
    displayName: "LLaMA 4 Maverick (OpenRouter)",
    supportsImages: true,
  },
} as const;

export async function POST(req: Request) {
  try {
    const { messages, model } = await req.json();

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

    // If provider doesn't support images, ensure none are present in the payload
    const containsImage = messages.some((msg: any) => {
      if (Array.isArray(msg?.content)) {
        return msg.content.some((part: any) => part?.type === 'image_url');
      }
      return false;
    });

    if (containsImage && !modelConfig.supportsImages) {
      return new Response(JSON.stringify({ error: "The selected model does not support image attachments." }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ----- IMAGE-SAFE HANDLING -----
    // streamText currently has limited support for multimodal messages (content arrays).
    // When the payload contains images, we call OpenRouter directly (non-streaming)
    // and then convert the single response into the newline-delimited streaming format
    // expected by the frontend.

    if (containsImage) {
      // Direct call to OpenRouter
      const openrouterResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          // Optional identifying headers (safe defaults)
          "HTTP-Referer": "tea3.local",
          "X-Title": "Tea3 Chat",
        },
        body: JSON.stringify({
          model,
          stream: false,
          messages,
        }),
      });

      if (!openrouterResponse.ok) {
        const errText = await openrouterResponse.text();
        console.error("OpenRouter error:", errText);
        return new Response(errText, { status: openrouterResponse.status, headers: { 'Content-Type': 'application/json' } });
      }

      const json = await openrouterResponse.json();
      const assistantText = json?.choices?.[0]?.message?.content ?? "";

      // Wrap the assistant text into a compatible text/event-stream-like response
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          // Mimic the streamText prefix "0:" used on the frontend
          controller.enqueue(encoder.encode(`0:${JSON.stringify(assistantText)}\n`));
          controller.close();
        }
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
        },
      });
    }

    console.log("Using model:", model);
    console.log("Model config:", modelConfig);
    console.log("Messages:", JSON.stringify(messages, null, 2));

    const result = await streamText({
      model: modelConfig.provider(model),
      messages,
    });

    return result.toDataStreamResponse();
  } catch (error) {
    console.error("Chat API error:", error);
    console.error("Error details:", {
      message: error?.message,
      stack: error?.stack,
      name: error?.name,
      cause: error?.cause
    });
    
    // Handle specific error types
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

    return new Response(JSON.stringify({ error: "An unexpected error occurred. Please try again." }), { 
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