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

const DEFAULT_BASE = 'http://localhost:11434';

interface OllamaChatResponse {
  message?: { content?: string };
}

interface OllamaTagsResponse {
  models?: Array<{ name?: string }>;
}

/** Local-first provider. No credential needed, so "verification" is a reachability probe. */
export class OllamaProvider implements LlmProvider {
  readonly id = 'ollama' as const;
  readonly label = 'Ollama';
  readonly requiresApiKey = false;
  readonly defaultModel = 'llama3.1';

  private readonly model: string;
  private readonly baseUrl: string;

  constructor(opts: ProviderOptions) {
    this.model = (opts.model ?? '').trim() || this.defaultModel;
    this.baseUrl = normalizeBaseUrl(opts.baseUrl, DEFAULT_BASE);
  }

  async verify(): Promise<VerificationResult> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`);
      if (!res.ok) {
        const body = await safeText(res);
        return { ok: false, message: describeHttpFailure('Ollama', res.status, body) };
      }
      const json = (await res.json()) as OllamaTagsResponse;
      const names = (json.models ?? []).map((m) => m.name ?? '').filter(Boolean);
      const installed = names.some((n) => n === this.model || n.startsWith(`${this.model}:`));
      if (!installed) {
        return {
          ok: false,
          message: `Ollama is running but "${this.model}" is not pulled. Run: ollama pull ${this.model}`,
        };
      }
      return { ok: true, message: `Ollama is up and "${this.model}" is available.` };
    } catch (err) {
      return {
        ok: false,
        message: toNetworkError(err, 'Ollama', this.baseUrl).message,
      };
    }
  }

  async complete(req: CompletionRequest): Promise<string> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          stream: false,
          format: 'json',
          options: {
            temperature: req.temperature,
            num_predict: req.maxTokens,
          },
          messages: [
            { role: 'system', content: req.system },
            { role: 'user', content: req.user },
          ],
        }),
        signal: req.signal,
      });
    } catch (err) {
      throw toNetworkError(err, 'Ollama', this.baseUrl);
    }

    if (!res.ok) {
      const body = await safeText(res);
      throw new ProviderError(describeHttpFailure('Ollama', res.status, body), res.status);
    }

    const json = (await res.json()) as OllamaChatResponse;
    return (json.message?.content ?? '').trim();
  }
}
