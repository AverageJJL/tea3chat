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
  }
};

export async function POST(req: Request) {
  const { messages, model } = await req.json();

  // Model is now required
  if (!model) {
    return new Response("Model selection is required", { status: 400 });
  }

  // Get the provider for the selected model
  const modelConfig = MODEL_PROVIDERS[model as keyof typeof MODEL_PROVIDERS];
  if (!modelConfig) {
    return new Response("Invalid model selection", { status: 400 });
  }

  const result = await streamText({
    model: modelConfig.provider(model),
    messages,
  });

  return result.toDataStreamResponse();
}

// Export available models for frontend use
export async function GET() {
  const models = Object.entries(MODEL_PROVIDERS).map(([value, config]) => ({
    value,
    displayName: config.displayName
  }));
  
  return Response.json({ models });
}