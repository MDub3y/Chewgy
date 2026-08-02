import { safeText, toNetworkError } from './anthropic.js';
import {
  CompletionRequest,
  LlmProvider,
  ProviderError,
  ProviderOptions,
  VerificationResult,
  describeHttpFailure,
  normalizeBaseUrl,
} from './types.js';

const DEFAULT_BASE = 'https://api.openai.com/v1';

interface OpenAiResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
}

/**
 * Works with OpenAI proper and any OpenAI-compatible gateway
 * (Groq, Together, OpenRouter, LM Studio, vLLM) via `chewgy.baseUrl`.
 */
export class OpenAiProvider implements LlmProvider {
  readonly id = 'openai' as const;
  readonly label = 'OpenAI';
  readonly requiresApiKey = true;
  readonly defaultModel = 'gpt-4o-mini';

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
      await this.request({
        system: 'Reply with the single character: k',
        user: 'k',
        maxTokens: 1,
        temperature: 0,
      });
      return { ok: true, message: `Key accepted by OpenAI (${this.model}).` };
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
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          max_completion_tokens: req.maxTokens,
          temperature: req.temperature,
          messages: [
            { role: 'system', content: req.system },
            { role: 'user', content: req.user },
          ],
        }),
        signal: req.signal,
      });
    } catch (err) {
      throw toNetworkError(err, 'OpenAI', this.baseUrl);
    }

    if (!res.ok) {
      const body = await safeText(res);
      throw new ProviderError(describeHttpFailure('OpenAI', res.status, body), res.status);
    }

    const json = (await res.json()) as OpenAiResponse;
    return (json.choices?.[0]?.message?.content ?? '').trim();
  }
}
