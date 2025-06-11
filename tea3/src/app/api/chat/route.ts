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
    displayName: "Llama 3 8B (Groq)"
  },
  "qwen/qwen3-235b-a22b:free": {
    provider: openrouter,
    displayName: "Qwen 3 235B (OpenRouter)"
  },
  "meta-llama/llama-4-maverick:free": {
    provider: openrouter,
    displayName: "LLaMA 4 Maverick (OpenRouter)"
  }
};

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