# tea3chat

## Adding a model provider

Provider implementations live under `tea3/src/providers/`. Each module exports an object that implements the `ModelProvider` interface.
To expose models, add the provider to `PROVIDERS` in `src/providers/index.ts` and update `MODEL_TO_PROVIDER` in `src/app/api/chat/route.ts` with the model name to provider key mapping.

### Available providers

- `groq`
- `openrouter`
- `gemini`
- `openai` (uses the `/v1/chat/responses` API)

Each model entry can specify `supportsImages` and `supportsWebSearch` so the UI
knows which capabilities are available.

The OpenAI provider supports optional web search and image generation via the
`tools` field in the model's provider config. Example:

```ts
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
}
```
