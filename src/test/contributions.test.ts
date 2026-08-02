import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relative: string) => readFileSync(resolve(process.cwd(), relative), 'utf8');

const pkg = JSON.parse(read('package.json')) as {
  main: string;
  activationEvents: string[];
  contributes: {
    commands: Array<{ command: string; title: string }>;
    keybindings: Array<{ command: string; key: string }>;
    menus: Record<string, Array<{ command: string }>>;
    views: Record<string, Array<{ id: string; type?: string }>>;
    viewsContainers: Record<string, Array<{ id: string }>>;
    configuration: { properties: Record<string, { type: string; default?: unknown }> };
  };
};

const EXTENSION_SRC = read('src/extension.ts');
const CONFIG_SRC = read('src/config.ts');
const CAT_VIEW_SRC = read('src/ui/catViewProvider.ts');

const declaredCommands = pkg.contributes.commands.map((c) => c.command);
const registeredCommands = [
  ...EXTENSION_SRC.matchAll(/register\('([\w.]+)'/g),
].map((m) => m[1]);

/**
 * These guard the failure mode that only shows up at runtime in the editor:
 * a command in the palette that throws "command not found" when clicked.
 */
describe('package.json contributions', () => {
  it('registers a handler for every declared command', () => {
    for (const command of declaredCommands) {
      expect(registeredCommands, `no handler for ${command}`).toContain(command);
    }
  });

  it('declares every command it registers', () => {
    for (const command of registeredCommands) {
      expect(declaredCommands, `${command} is not in package.json`).toContain(command);
    }
  });

  it('has no duplicate command ids', () => {
    expect(new Set(declaredCommands).size).toBe(declaredCommands.length);
  });

  it('namespaces and titles every command', () => {
    for (const entry of pkg.contributes.commands) {
      expect(entry.command.startsWith('chewgy.')).toBe(true);
      expect(entry.title.startsWith('Chewgy: ')).toBe(true);
    }
  });

  it('binds keys only to declared commands', () => {
    for (const binding of pkg.contributes.keybindings) {
      expect(declaredCommands).toContain(binding.command);
      expect(binding.key).toBeTruthy();
    }
  });

  it('references only declared commands from menus', () => {
    for (const entries of Object.values(pkg.contributes.menus)) {
      for (const entry of entries) {
        expect(declaredCommands).toContain(entry.command);
      }
    }
  });

  it('puts the cat view in the bottom panel with a matching container id', () => {
    const containers = pkg.contributes.viewsContainers.panel.map((c) => c.id);
    expect(containers).toContain('chewgy-panel');
    expect(Object.keys(pkg.contributes.views)).toEqual(['chewgy-panel']);
    expect(pkg.contributes.views['chewgy-panel'][0].type).toBe('webview');
  });

  it('uses the same view id in package.json and the provider', () => {
    const declaredId = pkg.contributes.views['chewgy-panel'][0].id;
    expect(CAT_VIEW_SRC).toContain(`readonly viewType = '${declaredId}'`);
    // The status bar and commands focus the view by "<id>.focus".
    expect(CAT_VIEW_SRC).toContain(`${declaredId}.focus`);
  });

  it('reads every declared setting in config.ts', () => {
    const keys = Object.keys(pkg.contributes.configuration.properties).map((k) =>
      k.replace(/^chewgy\./, ''),
    );
    expect(keys.length).toBeGreaterThan(8);
    for (const key of keys) {
      expect(CONFIG_SRC, `config.ts never reads ${key}`).toContain(`'${key}'`);
    }
  });

  it('gives every setting a default so first run needs no configuration', () => {
    for (const [key, schema] of Object.entries(pkg.contributes.configuration.properties)) {
      expect(schema.default, `${key} has no default`).toBeDefined();
    }
  });

  it('points main at the bundled output and activates without a language filter', () => {
    expect(pkg.main).toBe('./dist/extension.js');
    expect(pkg.activationEvents).toEqual(['onStartupFinished']);
  });
});
