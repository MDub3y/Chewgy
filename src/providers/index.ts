import { AnthropicProvider } from './anthropic.js';
import { OllamaProvider } from './ollama.js';
import { OpenAiProvider } from './openai.js';
import { LlmProvider, ProviderId, ProviderOptions } from './types.js';

export * from './types.js';
export { AnthropicProvider } from './anthropic.js';
export { OpenAiProvider } from './openai.js';
export { OllamaProvider } from './ollama.js';

/** Single place that knows how to build a provider. Adding a backend touches only this file. */
export function createProvider(id: ProviderId, opts: ProviderOptions): LlmProvider {
  switch (id) {
    case 'anthropic':
      return new AnthropicProvider(opts);
    case 'openai':
      return new OpenAiProvider(opts);
    case 'ollama':
      return new OllamaProvider(opts);
    default: {
      // Exhaustiveness guard: a new ProviderId will fail the build here.
      const never: never = id;
      throw new Error(`Unknown provider: ${String(never)}`);
    }
  }
}

/** Used by the key-entry flow to explain what a valid key looks like. */
export function providerKeyHint(id: ProviderId): {
  prompt: string;
  placeholder: string;
  requiresKey: boolean;
} {
  switch (id) {
    case 'anthropic':
      return {
        prompt: 'Paste your Anthropic API key',
        placeholder: 'sk-ant-...',
        requiresKey: true,
      };
    case 'openai':
      return {
        prompt: 'Paste your OpenAI (or OpenAI-compatible) API key',
        placeholder: 'sk-...',
        requiresKey: true,
      };
    case 'ollama':
      return {
        prompt: 'Ollama runs locally and needs no key',
        placeholder: '',
        requiresKey: false,
      };
  }
}

export interface KeyHint {
  /** `error` blocks submission; `warning` is advisory only. */
  severity: 'error' | 'warning';
  message: string;
}

/**
 * Cheap client-side sanity check so we do not waste a round trip on an
 * obviously malformed paste. Deliberately permissive — gateways use odd formats,
 * so an unexpected prefix is only a warning.
 */
export function looksLikeKey(id: ProviderId, key: string): KeyHint | undefined {
  const trimmed = key.trim();
  if (!trimmed) {
    return { severity: 'error', message: 'A key is required.' };
  }
  if (/\s/.test(trimmed)) {
    return {
      severity: 'error',
      message: 'Keys should not contain whitespace — check for a stray copy/paste newline.',
    };
  }
  if (trimmed.length < 12) {
    return { severity: 'error', message: 'That looks too short to be a real key.' };
  }
  if (id === 'anthropic' && !trimmed.startsWith('sk-ant-')) {
    return {
      severity: 'warning',
      message: 'Anthropic keys usually start with "sk-ant-". Continuing anyway.',
    };
  }
  if (id === 'openai' && !trimmed.startsWith('sk-')) {
    return {
      severity: 'warning',
      message: 'OpenAI keys usually start with "sk-". Fine if you use a gateway.',
    };
  }
  return undefined;
}
