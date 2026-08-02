import * as vscode from 'vscode';
import { ProviderId } from './providers/index.js';

/**
 * Keys live in the OS keychain via `SecretStorage` — never in settings.json,
 * never in workspace state, never written to disk by us.
 *
 * Stored per provider so switching backends does not clobber the other key.
 */
export class SecretStore {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  private key(provider: ProviderId): string {
    return `chewgy.apiKey.${provider}`;
  }

  async get(provider: ProviderId): Promise<string | undefined> {
    const value = await this.secrets.get(this.key(provider));
    return value?.trim() ? value.trim() : undefined;
  }

  async set(provider: ProviderId, apiKey: string): Promise<void> {
    await this.secrets.store(this.key(provider), apiKey.trim());
  }

  async clear(provider: ProviderId): Promise<void> {
    await this.secrets.delete(this.key(provider));
  }

  async clearAll(): Promise<void> {
    await Promise.all(
      (['anthropic', 'openai', 'ollama'] as ProviderId[]).map((p) => this.clear(p)),
    );
  }

  /** Fires when a key is added or removed in any window, so the UI can re-sync. */
  onDidChange(listener: () => void): vscode.Disposable {
    return this.secrets.onDidChange((e) => {
      if (e.key.startsWith('chewgy.apiKey.')) {
        listener();
      }
    });
  }
}
