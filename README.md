This is a chatapp using Next.js and tailwind as a frontend, Supabase for remote DB, Dexie for indexedDB and Redis for resumable stream implementation.

We added Openrouter, Groq Gemini (first party API) and OpenAI (responses endpoint) as provider, and a clear structure in the codebase for easier implementation of new models. Our focus on the UI was being responsive and at the same time provide a clean and modern look. Theming was scheduled (we added experimental liquid glass inspired by WWDC 25) but isn't completed due to the time constraint.

Attachment and images input and web search are supported by the Gemini models via their first party API, and Images input and web search are supported by the OpenAI models. Image generation via the responses endpoint tools calling is also supported (byok only because we don't have organisation approved API keys)

Chat sharing and branching is also implemented.

Syntax highlighting and MD rendering was done, and we used a different approach that took inspiration from obsidian for easier readability.

Mobile friendly aspect ratio is also provided.

Our focus is to build a chatapp that is clean and perform well, with good custimisations. 
