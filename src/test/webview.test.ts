import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CatViewProvider } from '../ui/catViewProvider.js';
import { ChewgyState } from '../state.js';
import { catSvg } from '../ui/catSvg.js';
import { Uri } from './mocks/vscode.js';

// Vitest runs with the project root as cwd (see vitest.config.ts).
const read = (relative: string) => readFileSync(resolve(process.cwd(), relative), 'utf8');

const CLIENT_JS = read('media/chewgy.js');
const CLIENT_CSS = read('media/chewgy.css');
const PROVIDER_SRC = read('src/ui/catViewProvider.ts');

/** Renders the panel HTML through the real provider with a fake webview. */
function renderHtml(): string {
  const memento = {
    get: <T>(_key: string, fallback: T) => fallback,
    update: async () => undefined,
    keys: () => [],
  };
  const state = new ChewgyState(memento as never);
  const provider = new CatViewProvider(Uri.file('/ext') as never, state);

  const webview = {
    cspSource: 'vscode-resource:',
    asWebviewUri: (uri: { toString(): string }) => uri.toString(),
    options: {},
    html: '',
    postMessage: async () => true,
    onDidReceiveMessage: () => ({ dispose: () => undefined }),
  };

  provider.resolveWebviewView({
    webview,
    onDidDispose: () => ({ dispose: () => undefined }),
  } as never);

  return webview.html;
}

describe('panel HTML', () => {
  const html = renderHtml();

  it('renders every element id the client script reaches for', () => {
    const ids = [...CLIENT_JS.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(5);
    for (const id of ids) {
      expect(html, `missing #${id}`).toContain(`id="${id}"`);
    }
  });

  it('has an extension-side handler for every data-command button', () => {
    const commands = [...html.matchAll(/data-command="([^"]+)"/g)].map((m) => m[1]);
    expect(commands).toContain('review');
    expect(commands).toContain('toggle');
    for (const command of commands) {
      expect(PROVIDER_SRC, `unhandled command: ${command}`).toContain(`case '${command}':`);
    }
  });

  it('has an extension-side handler for every message the client posts', () => {
    const posted = new Set([...CLIENT_JS.matchAll(/send\('([a-zA-Z]+)'/g)].map((m) => m[1]));
    // Posted outside the data-command wiring, so easy to forget.
    for (const command of ['ready', 'poke', 'reveal']) {
      expect(posted, `client never posts ${command}`).toContain(command);
    }
    for (const command of posted) {
      expect(PROVIDER_SRC, `unhandled message: ${command}`).toContain(`case '${command}':`);
    }
  });

  it('renders every status label the state machine can emit', () => {
    for (const status of ['needsKey', 'sleeping', 'thinking', 'idle']) {
      expect(CLIENT_JS, status).toContain(`${status}:`);
    }
  });

  it('locks the webview down with a CSP and a per-render nonce', () => {
    expect(html).toContain("default-src 'none'");
    const nonce = /nonce-([A-Za-z0-9]{32})/.exec(html)?.[1];
    expect(nonce).toBeTruthy();
    expect(html).toContain(`<script nonce="${nonce}"`);
    expect(renderHtml()).not.toContain(`nonce-${nonce}`);
  });

  it('loads styles and script from the media folder', () => {
    expect(html).toContain('/ext/media/chewgy.css');
    expect(html).toContain('/ext/media/chewgy.js');
  });

  it('has no inline event handlers', () => {
    expect(html).not.toMatch(/\son(click|load|error)=/i);
  });
});

describe('cat sprite', () => {
  const svg = catSvg();

  it('is a self-contained svg', () => {
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
    expect(svg).not.toContain('<image');
  });

  it('exposes the mood hooks the stylesheet targets', () => {
    for (const cls of ['eye-open', 'eye-closed', 'pupil', 'zzz', 'cat']) {
      expect(svg, cls).toContain(cls);
    }
  });

  it('has balanced tags', () => {
    const open = (svg.match(/<(?!\/)[a-zA-Z]/g) ?? []).length;
    const close = (svg.match(/<\/[a-zA-Z]/g) ?? []).length;
    const selfClosing = (svg.match(/\/>/g) ?? []).length;
    expect(open).toBe(close + selfClosing);
  });
});

describe('stylesheet', () => {
  it('themes from VS Code variables rather than hardcoded chrome', () => {
    expect(CLIENT_CSS).toContain('var(--vscode-foreground)');
    expect(CLIENT_CSS).toContain('var(--vscode-font-family)');
    expect(CLIENT_CSS).toContain('background: transparent');
  });

  it('styles each status and mood the state machine can emit', () => {
    for (const status of ['thinking', 'sleeping']) {
      expect(CLIENT_CSS).toContain(`data-status='${status}'`);
    }
    for (const mood of ['smug', 'horrified', 'impressed']) {
      expect(CLIENT_CSS).toContain(`data-mood='${mood}'`);
    }
  });
});
