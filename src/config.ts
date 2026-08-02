import * as vscode from 'vscode';
import { ProviderId } from './providers/index.js';
import { Attitude } from './review/types.js';

export interface ChewgyConfig {
  provider: ProviderId;
  model: string;
  baseUrl: string;
  attitude: Attitude;
  reviewOnSave: boolean;
  silentMode: boolean;
  maxFindings: number;
  maxChars: number;
  temperature: number;
  excludeGlobs: string[];
  languages: string[];
  requestTimeoutMs: number;
}

const PROVIDERS: readonly ProviderId[] = ['anthropic', 'openai', 'ollama'];
const ATTITUDES: readonly Attitude[] = ['mild', 'standard', 'ruthless'];

/** Reads settings fresh on every call so changes apply without a reload. */
export function readConfig(scope?: vscode.Uri): ChewgyConfig {
  const c = vscode.workspace.getConfiguration('chewgy', scope);
  return {
    provider: oneOf(c.get<string>('provider'), PROVIDERS, 'anthropic'),
    model: (c.get<string>('model') ?? '').trim(),
    baseUrl: (c.get<string>('baseUrl') ?? '').trim(),
    attitude: oneOf(c.get<string>('attitude'), ATTITUDES, 'standard'),
    reviewOnSave: c.get<boolean>('reviewOnSave') ?? true,
    silentMode: c.get<boolean>('silentMode') ?? false,
    maxFindings: clampNumber(c.get<number>('maxFindings'), 1, 30, 8),
    maxChars: clampNumber(c.get<number>('maxChars'), 500, 500_000, 24_000),
    temperature: clampNumber(c.get<number>('temperature'), 0, 2, 0.6),
    excludeGlobs: c.get<string[]>('excludeGlobs') ?? [],
    languages: (c.get<string[]>('languages') ?? []).map((l) => l.trim()).filter(Boolean),
    requestTimeoutMs: clampNumber(c.get<number>('requestTimeoutMs'), 5000, 600_000, 60_000),
  };
}

export async function updateSetting<T>(key: string, value: T): Promise<void> {
  await vscode.workspace
    .getConfiguration('chewgy')
    .update(key, value, vscode.ConfigurationTarget.Global);
}

function oneOf<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function clampNumber(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(Math.max(value, min), max);
}
