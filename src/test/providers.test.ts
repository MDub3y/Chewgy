import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AnthropicProvider,
  GeminiProvider,
  GroqProvider,
  OllamaProvider,
  OpenAiProvider,
  createProvider,
  describeHttpFailure,
  extractErrorMessage,
  looksLikeKey,
  normalizeBaseUrl,
  providerKeyHint,
} from '../providers/index.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(impl: (url: string, init?: RequestInit) => Promise<Response> | Response) {
  const spy = vi.fn(impl as never);
  vi.stubGlobal('fetch', spy);
  return spy;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('createProvider', () => {
  it('builds each backend with sensible defaults', () => {
    expect(createProvider('anthropic', {}).defaultModel).toBe('claude-sonnet-4-5');
    expect(createProvider('openai', {}).defaultModel).toBe('gpt-4o-mini');
    expect(createProvider('gemini', {}).defaultModel).toBe('gemini-2.0-flash');
    expect(createProvider('groq', {}).defaultModel).toBe('llama-3.3-70b-versatile');
    expect(createProvider('ollama', {}).defaultModel).toBe('llama3.1');
  });

  it('only requires a key where a key exists', () => {
    expect(createProvider('anthropic', {}).requiresApiKey).toBe(true);
    expect(createProvider('openai', {}).requiresApiKey).toBe(true);
    expect(createProvider('gemini', {}).requiresApiKey).toBe(true);
    expect(createProvider('groq', {}).requiresApiKey).toBe(true);
    expect(createProvider('ollama', {}).requiresApiKey).toBe(false);
  });
});

describe('normalizeBaseUrl', () => {
  it('falls back when unset', () => {
    expect(normalizeBaseUrl(undefined, 'https://a.test')).toBe('https://a.test');
    expect(normalizeBaseUrl('   ', 'https://a.test')).toBe('https://a.test');
  });

  it('strips trailing slashes', () => {
    expect(normalizeBaseUrl('https://b.test///', 'https://a.test')).toBe('https://b.test');
  });
});

describe('describeHttpFailure', () => {
  it('explains auth failures', () => {
    expect(describeHttpFailure('OpenAI', 401, '')).toMatch(/rejected the key/);
    expect(describeHttpFailure('OpenAI', 403, '')).toMatch(/rejected the key/);
  });

  it('explains bad model ids', () => {
    expect(describeHttpFailure('Anthropic', 404, '')).toMatch(/model id or base URL/);
  });

  it('explains rate limits and server errors', () => {
    expect(describeHttpFailure('Anthropic', 429, '')).toMatch(/rate-limited/);
    expect(describeHttpFailure('Anthropic', 503, '')).toMatch(/server error/);
  });

  it('surfaces the provider message', () => {
    const body = JSON.stringify({ error: { message: 'invalid x-api-key' } });
    expect(describeHttpFailure('Anthropic', 401, body)).toContain('invalid x-api-key');
  });
});

describe('extractErrorMessage', () => {
  it('digs through nested envelopes', () => {
    expect(extractErrorMessage(JSON.stringify({ error: { message: 'nope' } }))).toBe('nope');
    expect(extractErrorMessage(JSON.stringify({ detail: { message: 'deep' } }))).toBe('deep');
  });

  it('falls back to raw text', () => {
    expect(extractErrorMessage('plain   failure\ntext')).toBe('plain failure text');
  });

  it('handles empty input', () => {
    expect(extractErrorMessage('')).toBe('');
  });
});

describe('looksLikeKey', () => {
  it('blocks empty, short and whitespace-bearing keys', () => {
    expect(looksLikeKey('anthropic', '')?.severity).toBe('error');
    expect(looksLikeKey('anthropic', 'sk-ant-1')?.severity).toBe('error');
    expect(looksLikeKey('anthropic', 'sk-ant-aaaaaaaaaa bbb')?.severity).toBe('error');
  });

  it('only warns about an unexpected prefix', () => {
    expect(looksLikeKey('anthropic', 'weird-but-long-enough-key')?.severity).toBe('warning');
    expect(looksLikeKey('openai', 'gsk_abcdefghijklmnop')?.severity).toBe('warning');
    expect(looksLikeKey('gemini', 'not-an-aiza-key-1234')?.severity).toBe('warning');
    expect(looksLikeKey('groq', 'not-a-groq-key-1234')?.severity).toBe('warning');
  });

  it('accepts well-formed keys', () => {
    expect(looksLikeKey('anthropic', 'sk-ant-api03-abcdefghijkl')).toBeUndefined();
    expect(looksLikeKey('openai', 'sk-proj-abcdefghijkl')).toBeUndefined();
    expect(looksLikeKey('gemini', 'AIzaSyAbcdefghijkl')).toBeUndefined();
    expect(looksLikeKey('groq', 'gsk_abcdefghijkl')).toBeUndefined();
  });
});

describe('providerKeyHint', () => {
  it('tells the user Ollama needs nothing', () => {
    expect(providerKeyHint('ollama').requiresKey).toBe(false);
    expect(providerKeyHint('anthropic').requiresKey).toBe(true);
    expect(providerKeyHint('gemini').requiresKey).toBe(true);
    expect(providerKeyHint('groq').requiresKey).toBe(true);
  });
});

describe('AnthropicProvider', () => {
  it('sends the documented headers and body', async () => {
    const spy = stubFetch(() => json({ content: [{ type: 'text', text: '{"ok":1}' }] }));
    const provider = new AnthropicProvider({ apiKey: 'sk-ant-test', model: 'claude-x' });

    const out = await provider.complete({
      system: 'sys',
      user: 'usr',
      maxTokens: 100,
      temperature: 0.5,
    });

    expect(out).toBe('{"ok":1}');
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-ant-test');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('claude-x');
    expect(body.system).toBe('sys');
    expect(body.messages).toEqual([{ role: 'user', content: 'usr' }]);
  });

  it('concatenates multiple text blocks', async () => {
    stubFetch(() =>
      json({
        content: [
          { type: 'text', text: '{"a"' },
          { type: 'thinking', text: 'ignored' },
          { type: 'text', text: ':1}' },
        ],
      }),
    );
    const out = await new AnthropicProvider({ apiKey: 'k' }).complete({
      system: '',
      user: '',
      maxTokens: 10,
      temperature: 0,
    });
    expect(out).toBe('{"a":1}');
  });

  it('honours a base URL override', async () => {
    const spy = stubFetch(() => json({ content: [] }));
    await new AnthropicProvider({ apiKey: 'k', baseUrl: 'https://proxy.test/' }).complete({
      system: '',
      user: '',
      maxTokens: 1,
      temperature: 0,
    });
    expect(spy.mock.calls[0][0]).toBe('https://proxy.test/v1/messages');
  });

  it('verifies with a one-token call', async () => {
    const spy = stubFetch(() => json({ content: [{ type: 'text', text: 'k' }] }));
    const result = await new AnthropicProvider({ apiKey: 'sk-ant-x' }).verify();
    expect(result.ok).toBe(true);
    expect(JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string).max_tokens).toBe(1);
  });

  it('reports a rejected key instead of throwing', async () => {
    stubFetch(() => json({ error: { message: 'invalid x-api-key' } }, 401));
    const result = await new AnthropicProvider({ apiKey: 'bad' }).verify();
    expect(result.ok).toBe(false);
    expect(result.message).toContain('invalid x-api-key');
  });

  it('fails fast with no key at all', async () => {
    const spy = stubFetch(() => json({}));
    const result = await new AnthropicProvider({}).verify();
    expect(result.ok).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('turns a network failure into a readable message', async () => {
    stubFetch(() => Promise.reject(new Error('ECONNREFUSED')));
    const result = await new AnthropicProvider({ apiKey: 'sk-ant-x' }).verify();
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Could not reach Anthropic');
  });

  it('explains a timeout in character', async () => {
    stubFetch(() => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      return Promise.reject(err);
    });
    const result = await new AnthropicProvider({ apiKey: 'sk-ant-x' }).verify();
    expect(result.message).toMatch(/lost interest/);
  });
});

describe('OpenAiProvider', () => {
  it('calls the chat completions endpoint', async () => {
    const spy = stubFetch(() => json({ choices: [{ message: { content: '{"ok":2}' } }] }));
    const out = await new OpenAiProvider({ apiKey: 'sk-test' }).complete({
      system: 'sys',
      user: 'usr',
      maxTokens: 50,
      temperature: 0.2,
    });

    expect(out).toBe('{"ok":2}');
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk-test');
    const body = JSON.parse(init.body as string);
    expect(body.messages[0]).toEqual({ role: 'system', content: 'sys' });
  });

  it('supports OpenAI-compatible gateways', async () => {
    const spy = stubFetch(() => json({ choices: [] }));
    await new OpenAiProvider({ apiKey: 'k', baseUrl: 'https://gw.test/v1' }).complete({
      system: '',
      user: '',
      maxTokens: 1,
      temperature: 0,
    });
    expect(spy.mock.calls[0][0]).toBe('https://gw.test/v1/chat/completions');
  });

  it('handles a null content field', async () => {
    stubFetch(() => json({ choices: [{ message: { content: null } }] }));
    const out = await new OpenAiProvider({ apiKey: 'k' }).complete({
      system: '',
      user: '',
      maxTokens: 1,
      temperature: 0,
    });
    expect(out).toBe('');
  });
});

describe('GroqProvider', () => {
  it('calls the chat completions endpoint at groq.com', async () => {
    const spy = stubFetch(() => json({ choices: [{ message: { content: 'howdy' } }] }));
    const out = await new GroqProvider({ apiKey: 'gsk_test' }).complete({
      system: 'sys',
      user: 'usr',
      maxTokens: 50,
      temperature: 0.2,
    });

    expect(out).toBe('howdy');
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer gsk_test');
  });

  it('handles a null content field', async () => {
    stubFetch(() => json({ choices: [{ message: { content: null } }] }));
    const out = await new GroqProvider({ apiKey: 'k' }).complete({
      system: '',
      user: '',
      maxTokens: 1,
      temperature: 0,
    });
    expect(out).toBe('');
  });
});

describe('GeminiProvider', () => {
  it('calls generateContent with the key as a query param', async () => {
    const spy = stubFetch(() =>
      json({ candidates: [{ content: { parts: [{ text: 'howdy' }] } }] }),
    );
    const out = await new GeminiProvider({ apiKey: 'AIzaTest' }).complete({
      system: 'sys',
      user: 'usr',
      maxTokens: 50,
      temperature: 0.2,
    });

    expect(out).toBe('howdy');
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=AIzaTest',
    );
    const body = JSON.parse(init.body as string);
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'sys' }] });
    expect(body.contents[0]).toEqual({ role: 'user', parts: [{ text: 'usr' }] });
  });

  it('handles an empty candidates array', async () => {
    stubFetch(() => json({ candidates: [] }));
    const out = await new GeminiProvider({ apiKey: 'k' }).complete({
      system: '',
      user: '',
      maxTokens: 1,
      temperature: 0,
    });
    expect(out).toBe('');
  });
});

describe('OllamaProvider', () => {
  it('needs no key and checks the model is pulled', async () => {
    stubFetch(() => json({ models: [{ name: 'llama3.1:8b' }] }));
    const result = await new OllamaProvider({}).verify();
    expect(result.ok).toBe(true);
  });

  it('tells the user to pull a missing model', async () => {
    stubFetch(() => json({ models: [{ name: 'mistral:latest' }] }));
    const result = await new OllamaProvider({ model: 'llama3.1' }).verify();
    expect(result.ok).toBe(false);
    expect(result.message).toContain('ollama pull llama3.1');
  });

  it('reports an unreachable server', async () => {
    stubFetch(() => Promise.reject(new Error('ECONNREFUSED')));
    const result = await new OllamaProvider({}).verify();
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Could not reach Ollama');
  });

  it('requests JSON-formatted chat output', async () => {
    const spy = stubFetch(() => json({ message: { content: '{"ok":3}' } }));
    const out = await new OllamaProvider({ baseUrl: 'http://box:11434' }).complete({
      system: 's',
      user: 'u',
      maxTokens: 128,
      temperature: 0.4,
    });

    expect(out).toBe('{"ok":3}');
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://box:11434/api/chat');
    const body = JSON.parse(init.body as string);
    expect(body.stream).toBe(false);
    expect(body.format).toBe('json');
    expect(body.options.num_predict).toBe(128);
  });
});
