import {
  CompletionRequest,
  LlmProvider,
  ProviderError,
  ProviderOptions,
  VerificationResult,
  describeHttpFailure,
  normalizeBaseUrl,
} from './types.js';

const DEFAULT_BASE = 'https://api.anthropic.com';
const API_VERSION = '2023-06-01';

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
}

export class AnthropicProvider implements LlmProvider {
  readonly id = 'anthropic' as const;
  readonly label = 'Anthropic';
  readonly requiresApiKey = true;
  readonly defaultModel = 'claude-sonnet-4-5';

  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(opts: ProviderOptions) {
    this.apiKey = opts.apiKey ?? '';
    this.model = (opts.model ?? '').trim() || this.defaultModel;
    this.baseUrl = normalizeBaseUrl(opts.baseUrl, DEFAULT_BASE);
  }

  async verify(): Promise<VerificationResult> {
    if (!this.apiKey) {
      return { ok: false, message: 'No API key provided.' };
    }
    try {
      // One token is enough to prove the credential is live.
      await this.request({
        system: 'Reply with the single character: k',
        user: 'k',
        maxTokens: 1,
        temperature: 0,
      });
      return { ok: true, message: `Key accepted by Anthropic (${this.model}).` };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }

  async complete(req: CompletionRequest): Promise<string> {
    return this.request(req);
  }

  private async request(req: CompletionRequest): Promise<string> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': API_VERSION,
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: req.maxTokens,
          temperature: req.temperature,
          system: req.system,
          messages: [{ role: 'user', content: req.user }],
        }),
        signal: req.signal,
      });
    } catch (err) {
      throw toNetworkError(err, 'Anthropic', this.baseUrl);
    }

    if (!res.ok) {
      const body = await safeText(res);
      throw new ProviderError(describeHttpFailure('Anthropic', res.status, body), res.status);
    }

    const json = (await res.json()) as AnthropicResponse;
    return (json.content ?? [])
      .filter((block) => block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text as string)
      .join('')
      .trim();
  }
}

export async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

export function toNetworkError(err: unknown, provider: string, baseUrl: string): ProviderError {
  if (err instanceof Error && err.name === 'AbortError') {
    return new ProviderError(`${provider} took too long and Chewgy lost interest.`);
  }
  const detail = err instanceof Error ? err.message : String(err);
  return new ProviderError(`Could not reach ${provider} at ${baseUrl} — ${detail}`);
}
