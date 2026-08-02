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

const DEFAULT_BASE = 'https://generativelanguage.googleapis.com/v1beta';

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

/** Google's Gemini API — free tier available via a key from Google AI Studio. */
export class GeminiProvider implements LlmProvider {
  readonly id = 'gemini' as const;
  readonly label = 'Gemini';
  readonly requiresApiKey = true;
  readonly defaultModel = 'gemini-2.0-flash';

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
      return { ok: true, message: `Key accepted by Gemini (${this.model}).` };
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
      res = await fetch(
        `${this.baseUrl}/models/${this.model}:generateContent?key=${encodeURIComponent(this.apiKey)}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: req.system }] },
            contents: [{ role: 'user', parts: [{ text: req.user }] }],
            generationConfig: {
              maxOutputTokens: req.maxTokens,
              temperature: req.temperature,
            },
          }),
          signal: req.signal,
        },
      );
    } catch (err) {
      throw toNetworkError(err, 'Gemini', this.baseUrl);
    }

    if (!res.ok) {
      const body = await safeText(res);
      throw new ProviderError(describeHttpFailure('Gemini', res.status, body), res.status);
    }

    const json = (await res.json()) as GeminiResponse;
    return (json.candidates?.[0]?.content?.parts ?? [])
      .map((part) => part.text ?? '')
      .join('')
      .trim();
  }
}
