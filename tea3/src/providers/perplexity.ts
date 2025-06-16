import type { ModelProvider } from './index';

const perplexityProvider: ModelProvider = {
  displayName: 'Perplexity Sonar',
  supportsImages: false,
  async *stream({ messages }) {
    const systemMessage = messages.find((m: any) => m.role === 'system')?.content || 'Be precise and concise.';
    let history = messages.filter((m: any) => m.role !== 'system');
    if (history.length > 0) {
      const lastMessage = history[history.length - 1];
      if (lastMessage.role === 'assistant' && lastMessage.content === '') {
        history.pop();
      }
    }
    const perplexityMessages = history.map((m: any) => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
    }));

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar-deep-research',
        messages: [{ role: 'system', content: systemMessage }, ...perplexityMessages],
        search_mode: 'web',
        reasoning_effort: 'low',
        max_tokens: 800,
        temperature: 0.2,
        top_p: 0.9,
        top_k: 0,
        stream: true,
      }),
    });

    if (!response.ok || !response.body) {
      const errText = await response.text();
      throw new Error(`Perplexity API error: ${response.status} ${errText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let streamFinished = false;
    while (!streamFinished) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const dataContent = line.substring(6).trim();
        if (dataContent === '[DONE]') {
          streamFinished = true;
          break;
        }
        try {
          const json = JSON.parse(dataContent);
          const text = json.choices?.[0]?.delta?.content || '';
          if (text) yield text;
        } catch (e) {
          console.warn('Failed to parse perplexity stream line', line, e);
        }
      }
    }
  },
};

export default perplexityProvider;
