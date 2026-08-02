import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { activate, deactivate } from '../extension.js';
import { Uri, makeDocument, recorder, window } from './mocks/vscode.js';

const RUST = ['fn main() {', '    let v = risky().unwrap();', '}'].join('\n');

const MODEL_REPLY = JSON.stringify({
  verdict: 'That unwrap is a cry for help.',
  mood: 'horrified',
  findings: [
    {
      line: 2,
      severity: 'warning',
      catComment: 'Bold of you to assume that never fails.',
      issue: 'unwrap() panics on Err.',
      suggestedFix: 'let v = risky()?;',
    },
  ],
});

function fakeContext(storedKey?: string) {
  const secretStore = new Map<string, string>();
  if (storedKey) {
    secretStore.set('chewgy.apiKey.anthropic', storedKey);
  }
  const globalStore = new Map<string, unknown>();

  return {
    subscriptions: [] as Array<{ dispose(): void }>,
    extensionUri: Uri.file('/ext'),
    secrets: {
      get: async (key: string) => secretStore.get(key),
      store: async (key: string, value: string) => void secretStore.set(key, value),
      delete: async (key: string) => void secretStore.delete(key),
      onDidChange: () => ({ dispose: () => undefined }),
    },
    globalState: {
      get: <T>(key: string, fallback: T) => (globalStore.has(key) ? (globalStore.get(key) as T) : fallback),
      update: async (key: string, value: unknown) => void globalStore.set(key, value),
    },
  };
}

function stubModel(text: string, status = 200) {
  const spy = vi.fn(async () =>
    new Response(JSON.stringify({ content: [{ type: 'text', text }] }), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', spy);
  return spy;
}

function openEditor(text = RUST) {
  const document = makeDocument({ text });
  window.activeTextEditor = {
    document,
    selection: { isEmpty: true },
  } as unknown as typeof window.activeTextEditor;
  return document;
}

beforeEach(() => {
  recorder.reset();
  window.activeTextEditor = undefined;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('activate', () => {
  it('registers every command without throwing', () => {
    const context = fakeContext();
    expect(() => activate(context as never)).not.toThrow();

    for (const id of [
      'chewgy.setApiKey',
      'chewgy.clearApiKey',
      'chewgy.reviewFile',
      'chewgy.reviewSelection',
      'chewgy.toggle',
      'chewgy.sleep',
      'chewgy.wake',
      'chewgy.setAttitude',
      'chewgy.clearDiagnostics',
      'chewgy.showPanel',
      'chewgy.applyFix',
    ]) {
      expect(recorder.commands.has(id), `${id} not registered`).toBe(true);
    }
    expect(context.subscriptions.length).toBeGreaterThan(10);
  });

  it('starts in Needs Key when no key is stored', async () => {
    activate(fakeContext() as never);
    await Promise.resolve();
    await Promise.resolve();
    expect(recorder.statusBarText).toContain('Needs Key');
  });

  it('starts in Judging when a key is already stored', async () => {
    activate(fakeContext('sk-ant-stored') as never);
    await new Promise((r) => setTimeout(r, 5));
    expect(recorder.statusBarText).toContain('Judging');
  });

  it('deactivate is safe to call', () => {
    activate(fakeContext() as never);
    expect(() => deactivate()).not.toThrow();
  });
});

describe('chewgy.reviewFile', () => {
  it('publishes diagnostics from a model response', async () => {
    stubModel(MODEL_REPLY);
    activate(fakeContext('sk-ant-stored') as never);
    const document = openEditor();

    await recorder.commands.get('chewgy.reviewFile')!();

    const published = recorder.diagnostics.get(document.uri.toString());
    expect(published).toHaveLength(1);
    expect(published![0].message).toContain('Bold of you to assume that never fails.');
    expect(published![0].source).toBe('Chewgy');
    expect(published![0].range.start.line).toBe(1);
    expect(published![0].range.start.character).toBe(4);
    expect(recorder.statusBarText).toContain('Judging');
  });

  it('says something instead of crashing with no editor open', async () => {
    activate(fakeContext('sk-ant-stored') as never);
    await recorder.commands.get('chewgy.reviewFile')!();
    expect(recorder.infoMessages.join(' ')).toContain('cannot judge the void');
  });

  it('prompts for a key rather than calling the API without one', async () => {
    const spy = stubModel(MODEL_REPLY);
    activate(fakeContext() as never);
    openEditor();

    await recorder.commands.get('chewgy.reviewFile')!();

    expect(spy).not.toHaveBeenCalled();
    expect(recorder.warnMessages.join(' ')).toContain('needs an API key');
    expect(recorder.statusBarText).toContain('Needs Key');
  });

  it('surfaces a provider error to the user and the log', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ error: { message: 'invalid x-api-key' } }), { status: 401 }),
      ),
    );
    activate(fakeContext('sk-ant-bad') as never);
    openEditor();

    await recorder.commands.get('chewgy.reviewFile')!();

    expect(recorder.errorMessages.join(' ')).toContain('invalid x-api-key');
    expect(recorder.outputLines.join(' ')).toContain('[error]');
  });

  it('clears diagnostics when a file becomes ineligible', async () => {
    stubModel(MODEL_REPLY);
    activate(fakeContext('sk-ant-stored') as never);

    const document = openEditor();
    await recorder.commands.get('chewgy.reviewFile')!();
    expect(recorder.diagnostics.size).toBe(1);

    openEditor(`// chewgy-ignore-file\n${RUST}`);
    await recorder.commands.get('chewgy.reviewFile')!();
    expect(recorder.diagnostics.get(document.uri.toString())).toBeUndefined();
    expect(recorder.outputLines.join(' ')).toContain('[skip]');
  });
});

describe('sleep and wake', () => {
  it('sleeping clears diagnostics and blocks reviews', async () => {
    const spy = stubModel(MODEL_REPLY);
    activate(fakeContext('sk-ant-stored') as never);
    openEditor();

    await recorder.commands.get('chewgy.reviewFile')!();
    expect(recorder.diagnostics.size).toBe(1);
    spy.mockClear();

    await recorder.commands.get('chewgy.sleep')!();
    expect(recorder.diagnostics.size).toBe(0);
    expect(recorder.statusBarText).toContain('Sleeping');

    await recorder.commands.get('chewgy.reviewFile')!();
    expect(spy).not.toHaveBeenCalled();
  });

  it('waking restores the judging state', async () => {
    activate(fakeContext('sk-ant-stored') as never);
    await recorder.commands.get('chewgy.sleep')!();
    await recorder.commands.get('chewgy.wake')!();
    expect(recorder.statusBarText).toContain('Judging');
  });

  it('toggle flips between the two', async () => {
    activate(fakeContext('sk-ant-stored') as never);
    await recorder.commands.get('chewgy.toggle')!();
    expect(recorder.statusBarText).toContain('Sleeping');
    await recorder.commands.get('chewgy.toggle')!();
    expect(recorder.statusBarText).toContain('Judging');
  });

  it('a save while asleep triggers nothing', async () => {
    const spy = stubModel(MODEL_REPLY);
    activate(fakeContext('sk-ant-stored') as never);
    await recorder.commands.get('chewgy.sleep')!();
    spy.mockClear();

    for (const handler of recorder.savedDocuments) {
      await handler(makeDocument({ text: RUST }));
    }
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('review on save', () => {
  it('reviews a saved document when enabled', async () => {
    const spy = stubModel(MODEL_REPLY);
    recorder.settings.set('reviewOnSave', true);
    activate(fakeContext('sk-ant-stored') as never);

    const document = makeDocument({ text: RUST });
    for (const handler of recorder.savedDocuments) {
      await handler(document);
    }

    expect(spy).toHaveBeenCalled();
    expect(recorder.diagnostics.get(document.uri.toString())).toHaveLength(1);
  });

  it('stays quiet when reviewOnSave is off', async () => {
    const spy = stubModel(MODEL_REPLY);
    recorder.settings.set('reviewOnSave', false);
    activate(fakeContext('sk-ant-stored') as never);

    for (const handler of recorder.savedDocuments) {
      await handler(makeDocument({ text: RUST }));
    }
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('chewgy.setApiKey', () => {
  it('stores the key only after the provider verifies it', async () => {
    const spy = stubModel('k');
    const context = fakeContext();
    activate(context as never);

    recorder.nextInputBox = 'sk-ant-api03-valid-key';
    await recorder.commands.get('chewgy.setApiKey')!();

    expect(spy).toHaveBeenCalled();
    expect(await context.secrets.get('chewgy.apiKey.anthropic')).toBe('sk-ant-api03-valid-key');
    expect(recorder.infoMessages.join(' ')).toContain('Key accepted');
    expect(recorder.statusBarText).toContain('Judging');
  });

  it('refuses to store a key the provider rejects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ error: { message: 'invalid x-api-key' } }), { status: 401 }),
      ),
    );
    const context = fakeContext();
    activate(context as never);

    recorder.nextInputBox = 'sk-ant-api03-bogus-key';
    await recorder.commands.get('chewgy.setApiKey')!();

    expect(await context.secrets.get('chewgy.apiKey.anthropic')).toBeUndefined();
    expect(recorder.errorMessages.join(' ')).toContain('invalid x-api-key');
    expect(recorder.statusBarText).toContain('Needs Key');
  });

  it('does nothing when the user cancels', async () => {
    const spy = stubModel('k');
    activate(fakeContext() as never);

    recorder.nextInputBox = undefined;
    await recorder.commands.get('chewgy.setApiKey')!();

    expect(spy).not.toHaveBeenCalled();
  });

  it('clearApiKey forgets the stored key', async () => {
    const context = fakeContext('sk-ant-stored');
    activate(context as never);

    await recorder.commands.get('chewgy.clearApiKey')!();

    expect(await context.secrets.get('chewgy.apiKey.anthropic')).toBeUndefined();
    expect(recorder.statusBarText).toContain('Needs Key');
  });
});

describe('chewgy.setAttitude', () => {
  it('writes the chosen attitude to settings', async () => {
    activate(fakeContext('sk-ant-stored') as never);
    recorder.nextQuickPick = { label: 'Ruthless', value: 'ruthless' };

    await recorder.commands.get('chewgy.setAttitude')!();

    expect(recorder.updatedSettings).toContainEqual({ key: 'attitude', value: 'ruthless' });
  });

  it('leaves settings alone when the picker is dismissed', async () => {
    activate(fakeContext('sk-ant-stored') as never);
    recorder.nextQuickPick = undefined;

    await recorder.commands.get('chewgy.setAttitude')!();

    expect(recorder.updatedSettings).toHaveLength(0);
  });
});

describe('chewgy.clearDiagnostics', () => {
  it('removes every published complaint', async () => {
    stubModel(MODEL_REPLY);
    activate(fakeContext('sk-ant-stored') as never);
    openEditor();

    await recorder.commands.get('chewgy.reviewFile')!();
    expect(recorder.diagnostics.size).toBe(1);

    await recorder.commands.get('chewgy.clearDiagnostics')!();
    expect(recorder.diagnostics.size).toBe(0);
  });
});
