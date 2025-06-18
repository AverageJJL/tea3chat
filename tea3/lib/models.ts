// src/lib/models.ts

export const MODELS_CONFIG: Record<
  string,
  {
    provider: string;
    displayName: string;
    supportsImages: boolean;
    supportsWebSearch?: boolean;
    providerConfig: any;
  }
> = {
  "llama3-8b-8192": {
    provider: "groq",
    displayName: "Llama 3 8B (Groq)",
    supportsImages: false,
    supportsWebSearch: false,
    providerConfig: {},
  },
  "deepseek/deepseek-chat-v3-0324": {
    provider: "openrouter",
    displayName: "Deepseek V3",
    supportsImages: false,
    supportsWebSearch: false,
    providerConfig: {},
  },
  "deepseek/deepseek-r1-0528": {
    provider: "openrouter",
    displayName: "Deepseek R1",
    supportsImages: false,
    supportsWebSearch: false,
    providerConfig: {
      reasoning: { enabled: true },
    },
  },
  "gemini-2.5-flash": {
    provider: "gemini",
    displayName: "Gemini 2.5 Flash",
    supportsImages: true,
    supportsWebSearch: true,
    providerConfig: {
      thinkingConfig: { thinkingBudget: 0 },
      tools: {
        googleSearch: true,
      },
    },
  },
  "gpt-4.1-mini": {
    provider: "openai",
    displayName: "GPT-4.1 Mini",
    supportsImages: true,
    supportsWebSearch: true,
    providerConfig: {
      tools: {
        webSearch: true,
        imageGeneration: true,
      },
    },
  },
};