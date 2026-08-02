/**
 * Provider-agnostic LLM contract.
 *
 * Nothing in this folder may import `vscode`. The persona engine, the review
 * pipeline and the UI all talk to this interface only, which is what makes the
 * backend swappable (Anthropic <-> OpenAI <-> Ollama) without touching UI code.
 */

export type ProviderId = 'anthropic' | 'openai' | 'gemini' | 'groq' | 'ollama';

export interface CompletionRequest {
  system: string;
  user: string;
  /** Soft cap on response length. */
  maxTokens: number;
  temperature: number;
  /** Abort signal wired to a timeout by the caller. */
  signal?: AbortSignal;
}

export interface ProviderOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export interface VerificationResult {
  ok: boolean;
  /** Human-readable reason, shown to the user when `ok` is false. */
  message: string;
}

export interface LlmProvider {
  readonly id: ProviderId;
  /** Pretty name for UI messages. */
  readonly label: string;
  /** Whether this provider needs a secret at all (Ollama does not). */
  readonly requiresApiKey: boolean;
  /** Model used when the user has not configured one. */
  readonly defaultModel: string;
  /** Cheapest possible call that proves the credentials work. */
  verify(): Promise<VerificationResult>;
  /** Single-turn completion returning raw assistant text. */
  complete(req: CompletionRequest): Promise<string>;
}

/** Thrown for well-understood failures we want to surface verbatim to the user. */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

/**
 * Turns an HTTP failure into a message a human can act on.
 * Exported for testing.
 */
export function describeHttpFailure(
  provider: string,
  status: number,
  body: string,
): string {
  const detail = extractErrorMessage(body);
  switch (status) {
    case 401:
    case 403:
      return `${provider} rejected the key (${status}). Check that it is correct and still active.${detail ? ` — ${detail}` : ''}`;
    case 404:
      return `${provider} returned 404. The model id or base URL is probably wrong.${detail ? ` — ${detail}` : ''}`;
    case 429:
      return `${provider} rate-limited or out of quota (429).${detail ? ` — ${detail}` : ''}`;
    default:
      if (status >= 500) {
        return `${provider} had a server error (${status}). Try again shortly.${detail ? ` — ${detail}` : ''}`;
      }
      return `${provider} request failed (${status}).${detail ? ` — ${detail}` : ''}`;
  }
}

/** Digs the useful sentence out of a provider's JSON error envelope. */
export function extractErrorMessage(body: string): string {
  if (!body) {
    return '';
  }
  try {
    const parsed = JSON.parse(body) as unknown;
    const found = findMessage(parsed, 0);
    if (found) {
      return found.slice(0, 300);
    }
  } catch {
    /* not JSON, fall through */
  }
  return body.replace(/\s+/g, ' ').trim().slice(0, 200);
}

function findMessage(value: unknown, depth: number): string | undefined {
  if (depth > 4 || value === null || typeof value !== 'object') {
    return undefined;
  }
  const obj = value as Record<string, unknown>;
  if (typeof obj.message === 'string' && obj.message.trim()) {
    return obj.message.trim();
  }
  for (const key of ['error', 'detail', 'errors']) {
    if (key in obj) {
      const nested = findMessage(obj[key], depth + 1);
      if (nested) {
        return nested;
      }
    }
  }
  return undefined;
}

/** Strips a trailing slash so callers can safely append paths. */
export function normalizeBaseUrl(url: string | undefined, fallback: string): string {
  const chosen = (url ?? '').trim() || fallback;
  return chosen.replace(/\/+$/, '');
}
