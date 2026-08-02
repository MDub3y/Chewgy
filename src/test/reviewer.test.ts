import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import { ChewgyConfig } from '../config.js';
import { Reviewer, baseName } from '../review/reviewer.js';
import { Position, Range, makeDocument } from './mocks/vscode.js';

const RUST = [
  'fn main() {',
  '    let value = risky().unwrap();',
  '    println!("{}", value);',
  '}',
].join('\n');

function config(over: Partial<ChewgyConfig> = {}): ChewgyConfig {
  return {
    provider: 'anthropic',
    model: '',
    baseUrl: '',
    attitude: 'standard',
    reviewOnSave: true,
    silentMode: false,
    maxFindings: 8,
    maxChars: 24_000,
    temperature: 0.6,
    excludeGlobs: ['**/target/**'],
    languages: [],
    requestTimeoutMs: 60_000,
    ...over,
  };
}

type FetchArgs = [url: string, init: RequestInit];

function stubFetch(handler: (...args: FetchArgs) => Response) {
  const spy = vi.fn((...args: FetchArgs) => Promise.resolve(handler(...args)));
  vi.stubGlobal('fetch', spy);
  return spy;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function stubModel(text: string) {
  return stubFetch(() => jsonResponse({ content: [{ type: 'text', text }] }));
}

function requestBody(spy: ReturnType<typeof stubFetch>, call = 0): Record<string, unknown> {
  return JSON.parse(spy.mock.calls[call][1].body as string) as Record<string, unknown>;
}

const GOOD_RESPONSE = JSON.stringify({
  verdict: 'That unwrap is a cry for help.',
  mood: 'horrified',
  findings: [
    {
      line: 2,
      endLine: 2,
      severity: 'warning',
      catComment: 'Bold of you to assume that never fails.',
      issue: 'unwrap() panics when risky() returns Err.',
      suggestedFix: 'let value = risky()?;',
    },
  ],
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Reviewer', () => {
  it('runs the full pipeline and produces squiggle specs', async () => {
    stubModel(GOOD_RESPONSE);
    const doc = makeDocument({ text: RUST });

    const outcome = await new Reviewer().review({
      document: doc as unknown as vscode.TextDocument,
      config: config(),
      apiKey: 'sk-ant-test',
    });

    expect(outcome.kind).toBe('reviewed');
    if (outcome.kind !== 'reviewed') {
      return;
    }
    expect(outcome.result.verdict).toBe('That unwrap is a cry for help.');
    expect(outcome.specs).toHaveLength(1);
    // 1-based line 2 becomes 0-based line 1, squiggle starting after the indent.
    expect(outcome.specs[0].startLine).toBe(1);
    expect(outcome.specs[0].startCharacter).toBe(4);
    expect(outcome.specs[0].severity).toBe('warning');
    expect(outcome.specs[0].finding.suggestedFix).toBe('let value = risky()?;');
  });

  it('sends the file name, language and numbered code to the model', async () => {
    const spy = stubModel(GOOD_RESPONSE);
    const doc = makeDocument({ text: RUST, path: '/repo/src/lib.rs' });

    await new Reviewer().review({
      document: doc as unknown as vscode.TextDocument,
      config: config(),
      apiKey: 'k',
    });

    const body = requestBody(spy);
    const content = (body.messages as Array<{ content: string }>)[0].content;
    expect(body.system).toContain('ATTITUDE: STANDARD');
    expect(content).toContain('File: lib.rs');
    expect(content).toContain('Language id: rust');
    expect(content).toContain('2 |     let value = risky().unwrap();');
  });

  it('reviews only the selection, with absolute line numbers', async () => {
    const spy = stubModel(GOOD_RESPONSE);
    const doc = makeDocument({ text: RUST });

    await new Reviewer().review({
      document: doc as unknown as vscode.TextDocument,
      config: config(),
      apiKey: 'k',
      range: new Range(new Position(1, 4), new Position(2, 10)) as unknown as vscode.Range,
    });

    const content = (requestBody(spy).messages as Array<{ content: string }>)[0].content;
    expect(content).toContain('2 |     let value = risky().unwrap();');
    expect(content).not.toContain('fn main() {');
  });

  it('skips excluded paths without calling the model', async () => {
    const spy = stubModel(GOOD_RESPONSE);
    const doc = makeDocument({ text: RUST, path: '/repo/target/debug/x.rs' });

    const outcome = await new Reviewer().review({
      document: doc as unknown as vscode.TextDocument,
      config: config(),
      apiKey: 'k',
    });

    expect(outcome.kind).toBe('skipped');
    expect(spy).not.toHaveBeenCalled();
  });

  it('skips oversized files', async () => {
    const spy = stubModel(GOOD_RESPONSE);
    const doc = makeDocument({ text: 'x'.repeat(200) });

    const outcome = await new Reviewer().review({
      document: doc as unknown as vscode.TextDocument,
      config: config({ maxChars: 100 }),
      apiKey: 'k',
    });

    expect(outcome).toMatchObject({ kind: 'skipped' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('honours chewgy-ignore-file before spending a token', async () => {
    const spy = stubModel(GOOD_RESPONSE);
    const doc = makeDocument({ text: `// chewgy-ignore-file\n${RUST}` });

    const outcome = await new Reviewer().review({
      document: doc as unknown as vscode.TextDocument,
      config: config(),
      apiKey: 'k',
    });

    expect(outcome).toMatchObject({ kind: 'skipped' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('drops findings on chewgy-ignore lines after the model replies', async () => {
    stubModel(GOOD_RESPONSE);
    const text = [
      'fn main() {',
      '    let value = risky().unwrap(); // chewgy-ignore',
      '}',
    ].join('\n');

    const outcome = await new Reviewer().review({
      document: makeDocument({ text }) as unknown as vscode.TextDocument,
      config: config(),
      apiKey: 'k',
    });

    expect(outcome.kind).toBe('reviewed');
    if (outcome.kind === 'reviewed') {
      expect(outcome.result.findings).toHaveLength(1);
      expect(outcome.specs).toHaveLength(0);
    }
  });

  it('returns an error outcome when the provider rejects the key', async () => {
    stubFetch(() => jsonResponse({ error: { message: 'invalid x-api-key' } }, 401));

    const outcome = await new Reviewer().review({
      document: makeDocument({ text: RUST }) as unknown as vscode.TextDocument,
      config: config(),
      apiKey: 'bad',
    });

    expect(outcome.kind).toBe('error');
    if (outcome.kind === 'error') {
      expect(outcome.detail).toContain('invalid x-api-key');
    }
  });

  it('returns an error outcome when the model ignores the JSON contract', async () => {
    stubModel('I am a cat and I refuse to emit JSON.');

    const outcome = await new Reviewer().review({
      document: makeDocument({ text: RUST }) as unknown as vscode.TextDocument,
      config: config(),
      apiKey: 'k',
    });

    expect(outcome).toMatchObject({ kind: 'error' });
    if (outcome.kind === 'error') {
      expect(outcome.detail).toContain('JSON contract');
    }
  });

  it('survives a model that wraps its JSON in prose and fences', async () => {
    stubModel(`Sure thing.\n\`\`\`json\n${GOOD_RESPONSE}\n\`\`\`\nHope that helps!`);

    const outcome = await new Reviewer().review({
      document: makeDocument({ text: RUST }) as unknown as vscode.TextDocument,
      config: config(),
      apiKey: 'k',
    });

    expect(outcome.kind).toBe('reviewed');
  });

  it('works the same for every language', async () => {
    for (const [languageId, path] of [
      ['python', '/repo/app.py'],
      ['typescript', '/repo/src/index.ts'],
      ['go', '/repo/main.go'],
      ['cpp', '/repo/main.cpp'],
    ] as const) {
      stubModel(GOOD_RESPONSE);
      const outcome = await new Reviewer().review({
        document: makeDocument({
          text: 'a = 1\nb = risky()\nprint(b)',
          languageId,
          path,
        }) as unknown as vscode.TextDocument,
        config: config(),
        apiKey: 'k',
      });
      expect(outcome.kind, languageId).toBe('reviewed');
    }
  });

  it('routes through OpenAI when configured, with no code changes elsewhere', async () => {
    const spy = stubFetch(() => jsonResponse({ choices: [{ message: { content: GOOD_RESPONSE } }] }));

    const outcome = await new Reviewer().review({
      document: makeDocument({ text: RUST }) as unknown as vscode.TextDocument,
      config: config({ provider: 'openai' }),
      apiKey: 'sk-test',
    });

    expect(outcome.kind).toBe('reviewed');
    expect(spy.mock.calls[0][0]).toContain('/chat/completions');
  });

  it('routes through Ollama with no key at all', async () => {
    const spy = stubFetch(() => jsonResponse({ message: { content: GOOD_RESPONSE } }));

    const outcome = await new Reviewer().review({
      document: makeDocument({ text: RUST }) as unknown as vscode.TextDocument,
      config: config({ provider: 'ollama' }),
    });

    expect(outcome.kind).toBe('reviewed');
    expect(spy.mock.calls[0][0]).toContain('/api/chat');
  });

  it('passes an abort signal so timeouts and cancellation can bite', async () => {
    let capturedSignal: AbortSignal | null | undefined;
    stubFetch((_url, init) => {
      capturedSignal = init.signal;
      return jsonResponse({ content: [{ type: 'text', text: GOOD_RESPONSE }] });
    });

    await new Reviewer().review({
      document: makeDocument({ text: RUST }) as unknown as vscode.TextDocument,
      config: config(),
      apiKey: 'k',
    });

    expect(capturedSignal).toBeInstanceOf(AbortSignal);
    expect(capturedSignal?.aborted).toBe(false);
  });

  it('reports a timeout in character when the request outlives the budget', async () => {
    stubFetch(() => {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      throw err;
    });

    const outcome = await new Reviewer().review({
      document: makeDocument({ text: RUST }) as unknown as vscode.TextDocument,
      config: config({ requestTimeoutMs: 5000 }),
      apiKey: 'k',
    });

    expect(outcome).toMatchObject({ kind: 'error' });
    if (outcome.kind === 'error') {
      expect(outcome.detail).toMatch(/lost interest/);
    }
  });
});

describe('baseName', () => {
  it('takes the last path segment', () => {
    expect(baseName('/repo/src/main.rs')).toBe('main.rs');
    expect(baseName('main.rs')).toBe('main.rs');
  });
});
