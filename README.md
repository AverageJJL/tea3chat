# tea3chat

## Adding a model provider

Provider implementations live under `tea3/src/providers/`. Each module exports an object that implements the `ModelProvider` interface.
To expose models, add the provider to `PROVIDERS` in `src/providers/index.ts` and update `MODEL_TO_PROVIDER` in `src/app/api/chat/route.ts` with the model name to provider key mapping.
