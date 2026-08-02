import * as vscode from 'vscode';
import { Mood, ReviewResult } from './review/types.js';

export type ChewgyStatus = 'needsKey' | 'idle' | 'thinking' | 'sleeping';

export interface ChewgySnapshot {
  status: ChewgyStatus;
  mood: Mood;
  /** Text for the speech bubble. */
  bubble: string;
  /** Summary line under the cat. */
  detail: string;
  attitude: string;
  provider: string;
  findingCount: number;
  silent: boolean;
}

const SLEEP_KEY = 'chewgy.asleep';

/**
 * Single source of truth for what Chewgy is doing. The status bar and the
 * webview both render from this; neither owns state of its own.
 */
export class ChewgyState implements vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<ChewgySnapshot>();
  readonly onDidChange = this.emitter.event;

  private status: ChewgyStatus = 'needsKey';
  private mood: Mood = 'bored';
  private bubble = 'Set an API key. I do not work for free.';
  private detail = '';
  private findingCount = 0;
  private attitude = 'standard';
  private provider = 'anthropic';
  private silent = false;

  constructor(private readonly memento: vscode.Memento) {}

  get isAsleep(): boolean {
    return this.memento.get<boolean>(SLEEP_KEY, false);
  }

  /** Sleep survives window reloads — an off switch that turns back on is not an off switch. */
  async setAsleep(asleep: boolean): Promise<void> {
    await this.memento.update(SLEEP_KEY, asleep);
  }

  snapshot(): ChewgySnapshot {
    return {
      status: this.status,
      mood: this.mood,
      bubble: this.bubble,
      detail: this.detail,
      attitude: this.attitude,
      provider: this.provider,
      findingCount: this.findingCount,
      silent: this.silent,
    };
  }

  setContext(provider: string, attitude: string, silent: boolean): void {
    this.provider = provider;
    this.attitude = attitude;
    this.silent = silent;
    this.emit();
  }

  setSleeping(): void {
    this.status = 'sleeping';
    this.mood = 'sleeping';
    this.bubble = 'zzz…';
    this.detail = 'Chewgy is asleep. Wake me if it compiles.';
    this.findingCount = 0;
    this.emit();
  }

  setNeedsKey(): void {
    this.status = 'needsKey';
    this.mood = 'annoyed';
    this.bubble = 'No key, no opinions.';
    this.detail = 'Run "Chewgy: Set API Key" to get started.';
    this.findingCount = 0;
    this.emit();
  }

  setIdle(bubble: string, detail = ''): void {
    this.status = 'idle';
    this.mood = 'bored';
    this.bubble = bubble;
    this.detail = detail;
    this.emit();
  }

  setThinking(fileName: string): void {
    this.status = 'thinking';
    this.mood = 'annoyed';
    this.bubble = 'Fine. Reading it.';
    this.detail = `Reviewing ${fileName}…`;
    this.emit();
  }

  setResult(result: ReviewResult, fileName: string, shownCount: number): void {
    this.status = 'idle';
    this.mood = result.mood;
    this.bubble = result.verdict;
    this.findingCount = shownCount;
    this.detail =
      shownCount === 0
        ? `${fileName} — nothing worth mentioning.`
        : `${fileName} — ${shownCount} complaint${shownCount === 1 ? '' : 's'}.`;
    this.emit();
  }

  setError(message: string): void {
    this.status = 'idle';
    this.mood = 'horrified';
    this.bubble = 'Something broke, and for once it was not your code.';
    this.detail = message;
    this.findingCount = 0;
    this.emit();
  }

  private emit(): void {
    this.emitter.fire(this.snapshot());
  }

  dispose(): void {
    this.emitter.dispose();
  }
}
