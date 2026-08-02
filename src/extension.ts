import * as vscode from 'vscode';
import { ChewgyConfig, readConfig, updateSetting } from './config.js';
import { createProvider, looksLikeKey, providerKeyHint } from './providers/index.js';
import { DiagnosticLevel, DiagnosticSpec } from './review/diagnostics.js';
import { Reviewer, baseName } from './review/reviewer.js';
import { Attitude } from './review/types.js';
import { SecretStore } from './secrets.js';
import { ChewgyState } from './state.js';
import { CatViewProvider } from './ui/catViewProvider.js';
import { CHEWGY_SOURCE, ChewgyCodeActionProvider } from './ui/codeActions.js';
import { quips } from './ui/quips.js';
import { ChewgyStatusBar } from './ui/statusBar.js';

const LEVEL_MAP: Record<DiagnosticLevel, vscode.DiagnosticSeverity> = {
  warning: vscode.DiagnosticSeverity.Warning,
  information: vscode.DiagnosticSeverity.Information,
  hint: vscode.DiagnosticSeverity.Hint,
};

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('Chewgy', { log: true });
  const secrets = new SecretStore(context.secrets);
  const state = new ChewgyState(context.globalState);
  const statusBar = new ChewgyStatusBar();
  const catView = new CatViewProvider(context.extensionUri, state);
  const codeActions = new ChewgyCodeActionProvider();
  const diagnostics = vscode.languages.createDiagnosticCollection('chewgy');
  const reviewer = new Reviewer();

  /** Guards against overlapping reviews of the same document (save storms). */
  const inFlight = new Map<string, vscode.CancellationTokenSource>();
  /** Pending "review while typing" timers, keyed by document uri, so a keystroke resets the clock. */
  const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();

  function cancelTypingTimer(key: string): void {
    const timer = typingTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      typingTimers.delete(key);
    }
  }

  context.subscriptions.push(
    output,
    state,
    statusBar,
    catView,
    codeActions,
    diagnostics,
    vscode.window.registerWebviewViewProvider(CatViewProvider.viewType, catView, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.languages.registerCodeActionsProvider(
      { scheme: 'file' },
      codeActions,
      ChewgyCodeActionProvider.metadata,
    ),
  );

  context.subscriptions.push(state.onDidChange((snapshot) => statusBar.render(snapshot)));

  // ---------------------------------------------------------------- helpers

  async function currentKey(config: ChewgyConfig): Promise<string | undefined> {
    return secrets.get(config.provider);
  }

  async function needsKey(config: ChewgyConfig): Promise<boolean> {
    const provider = createProvider(config.provider, {});
    if (!provider.requiresApiKey) {
      return false;
    }
    return !(await currentKey(config));
  }

  /**
   * Recomputes the sleeping/needs-key/idle status.
   *
   * Reading the key is async, so state can change underneath us (activation
   * racing a toggle, a save racing a settings change). Every branch is
   * re-validated after the await so a stale refresh never clobbers newer state.
   */
  async function refresh(bubble?: string): Promise<void> {
    const config = readConfig();
    state.setContext(config.provider, config.attitude, config.silentMode);

    if (state.isAsleep) {
      state.setSleeping();
      return;
    }

    const missingKey = await needsKey(config);

    if (state.isAsleep) {
      state.setSleeping();
      return;
    }
    if (missingKey) {
      state.setNeedsKey();
      return;
    }
    // A review that started while we were awaiting owns the bubble.
    if (state.snapshot().status === 'thinking' && !bubble) {
      return;
    }
    if (bubble) {
      state.setIdle(bubble);
    } else if (state.snapshot().status !== 'idle') {
      state.setIdle('Awake. Unimpressed, but awake.');
    }
  }

  function publish(uri: vscode.Uri, specs: DiagnosticSpec[]): void {
    const items = specs.map((spec, index) => {
      const diagnostic = new vscode.Diagnostic(
        new vscode.Range(
          new vscode.Position(spec.startLine, spec.startCharacter),
          new vscode.Position(spec.endLine, spec.endCharacter),
        ),
        spec.message,
        LEVEL_MAP[spec.severity],
      );
      diagnostic.source = CHEWGY_SOURCE;
      // Index into the spec list; the code-action provider uses it to find the fix.
      diagnostic.code = index;
      return diagnostic;
    });

    diagnostics.set(uri, items);
    codeActions.setFixes(uri, specs);
    catView.setFindings(uri, specs);
  }

  async function runReview(
    document: vscode.TextDocument,
    opts: { manual: boolean; range?: vscode.Range },
  ): Promise<void> {
    const config = readConfig(document.uri);

    if (state.isAsleep) {
      if (opts.manual) {
        vscode.window.showInformationMessage('Chewgy is asleep. Run "Chewgy: Wake Up" first.');
      }
      return;
    }

    if (await needsKey(config)) {
      state.setNeedsKey();
      if (opts.manual) {
        const choice = await vscode.window.showWarningMessage(
          'Chewgy needs an API key before it will judge anything.',
          'Set API Key',
        );
        if (choice) {
          await vscode.commands.executeCommand('chewgy.setApiKey');
        }
      }
      return;
    }

    const key = document.uri.toString();
    inFlight.get(key)?.cancel();
    const cts = new vscode.CancellationTokenSource();
    inFlight.set(key, cts);

    const name = baseName(document.uri.path);
    state.setThinking(name);

    try {
      const outcome = await reviewer.review({
        document,
        config,
        apiKey: await currentKey(config),
        range: opts.range,
        token: cts.token,
      });

      if (cts.token.isCancellationRequested) {
        return;
      }

      switch (outcome.kind) {
        case 'skipped': {
          output.appendLine(`[skip] ${name}: ${outcome.detail}`);
          diagnostics.delete(document.uri);
          codeActions.clear(document.uri);
          catView.setFindings(undefined, []);
          const line = outcome.detail.includes('characters') ? quips.tooBig() : quips.skipped();
          state.setIdle(line, outcome.detail);
          if (opts.manual && !config.silentMode) {
            vscode.window.showInformationMessage(`Chewgy skipped ${name}. ${outcome.detail}`);
          }
          return;
        }

        case 'error': {
          output.appendLine(`[error] ${name}: ${outcome.detail}`);
          state.setError(outcome.detail);
          if (opts.manual || !config.silentMode) {
            const choice = await vscode.window.showErrorMessage(
              `Chewgy: ${outcome.detail}`,
              'Show Log',
              'Set API Key',
            );
            if (choice === 'Show Log') {
              output.show(true);
            } else if (choice === 'Set API Key') {
              await vscode.commands.executeCommand('chewgy.setApiKey');
            }
          }
          return;
        }

        case 'reviewed': {
          publish(document.uri, outcome.specs);
          state.setResult(outcome.result, name, outcome.specs.length);
          output.appendLine(
            `[ok] ${name}: ${outcome.specs.length} finding(s) — "${outcome.result.verdict}"`,
          );
          if (opts.manual && !config.silentMode) {
            await catView.reveal();
          }
          return;
        }
      }
    } finally {
      cts.dispose();
      if (inFlight.get(key) === cts) {
        inFlight.delete(key);
      }
    }
  }

  // --------------------------------------------------------------- commands

  const register = (id: string, handler: (...args: never[]) => unknown) =>
    context.subscriptions.push(vscode.commands.registerCommand(id, handler));

  register('chewgy.setApiKey', async () => {
    const startingConfig = readConfig();

    const PROVIDER_LABELS: Record<ChewgyConfig['provider'], string> = {
      anthropic: 'Anthropic Claude',
      openai: 'OpenAI',
      gemini: 'Gemini (free tier at aistudio.google.com/apikey)',
      groq: 'Groq (free tier at console.groq.com/keys)',
      ollama: 'Ollama (local, no key needed)',
    };

    const providerPick = await vscode.window.showQuickPick(
      (Object.keys(PROVIDER_LABELS) as Array<ChewgyConfig['provider']>).map((id) => ({
        label: PROVIDER_LABELS[id],
        description: id === startingConfig.provider ? 'current' : undefined,
        id,
      })),
      { title: 'Chewgy — which LLM backend is this key for?', ignoreFocusOut: true },
    );

    if (!providerPick) {
      return;
    }

    if (providerPick.id !== startingConfig.provider) {
      await updateSetting('provider', providerPick.id);
    }

    const config = { ...startingConfig, provider: providerPick.id };
    const hint = providerKeyHint(config.provider);

    if (!hint.requiresKey) {
      const provider = createProvider(config.provider, {
        model: config.model,
        baseUrl: config.baseUrl,
      });
      const result = await provider.verify();
      await vscode.window[result.ok ? 'showInformationMessage' : 'showWarningMessage'](
        `Chewgy: ${result.message}`,
      );
      await refresh(result.ok ? quips.keyAccepted() : quips.keyRejected());
      return;
    }

    const entered = await vscode.window.showInputBox({
      title: `Chewgy — ${config.provider} API key`,
      prompt: hint.prompt,
      placeHolder: hint.placeholder,
      password: true,
      ignoreFocusOut: true,
      validateInput: (value) => {
        const problem = looksLikeKey(config.provider, value);
        if (!problem) {
          return undefined;
        }
        return {
          message: problem.message,
          severity:
            problem.severity === 'error'
              ? vscode.InputBoxValidationSeverity.Error
              : vscode.InputBoxValidationSeverity.Warning,
        };
      },
    });

    if (!entered) {
      return;
    }

    const verification = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Chewgy is checking your key…' },
      async () => {
        const provider = createProvider(config.provider, {
          apiKey: entered,
          model: config.model,
          baseUrl: config.baseUrl,
        });
        return provider.verify();
      },
    );

    if (!verification.ok) {
      output.appendLine(`[key] rejected: ${verification.message}`);
      const choice = await vscode.window.showErrorMessage(
        `${quips.keyRejected()} ${verification.message}`,
        'Try Again',
      );
      await refresh();
      if (choice === 'Try Again') {
        await vscode.commands.executeCommand('chewgy.setApiKey');
      }
      return;
    }

    await secrets.set(config.provider, entered);
    vscode.window.showInformationMessage(`Chewgy: ${verification.message}`);
    await refresh(quips.keyAccepted());
    await catView.reveal();
  });

  register('chewgy.clearApiKey', async () => {
    const config = readConfig();
    await secrets.clear(config.provider);
    vscode.window.showInformationMessage(`Chewgy: forgot the ${config.provider} key.`);
    await refresh();
  });

  register('chewgy.reviewFile', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showInformationMessage('Chewgy: open a file first. I cannot judge the void.');
      return;
    }
    await runReview(editor.document, { manual: true });
  });

  register('chewgy.reviewSelection', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) {
      vscode.window.showInformationMessage('Chewgy: select some code first.');
      return;
    }
    await runReview(editor.document, { manual: true, range: editor.selection });
  });

  register('chewgy.sleep', async () => {
    await state.setAsleep(true);
    diagnostics.clear();
    codeActions.clear();
    catView.setFindings(undefined, []);
    state.setSleeping();
    vscode.window.showInformationMessage(`Chewgy: ${quips.sleep()}`);
  });

  register('chewgy.wake', async () => {
    await state.setAsleep(false);
    await refresh(quips.wake());
  });

  register('chewgy.toggle', async () => {
    await vscode.commands.executeCommand(state.isAsleep ? 'chewgy.wake' : 'chewgy.sleep');
  });

  register('chewgy.setAttitude', async () => {
    const current = readConfig().attitude;
    const items: Array<vscode.QuickPickItem & { value: Attitude }> = [
      { label: 'Mild', description: 'Passive-aggressive advice', value: 'mild' },
      { label: 'Standard', description: 'Sassy mochi cat', value: 'standard' },
      { label: 'Ruthless', description: 'Unfiltered roast', value: 'ruthless' },
    ];
    const picked = await vscode.window.showQuickPick(
      items.map((i) => ({ ...i, picked: i.value === current })),
      { title: 'How harsh should Chewgy be?', placeHolder: `Currently: ${current}` },
    );
    if (!picked) {
      return;
    }
    await updateSetting('attitude', picked.value);
    await refresh(`Attitude set to ${picked.value}. You asked for this.`);
  });

  register('chewgy.clearDiagnostics', async () => {
    diagnostics.clear();
    codeActions.clear();
    catView.setFindings(undefined, []);
    await refresh('Cleared. The complaints still happened, though.');
  });

  register('chewgy.showPanel', async () => {
    await catView.reveal();
  });

  register('chewgy.applyFix', async () => {
    await vscode.commands.executeCommand('editor.action.quickFix');
  });

  // --------------------------------------------------------------- triggers

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (document) => {
      cancelTypingTimer(document.uri.toString());
      const config = readConfig(document.uri);
      if (!config.reviewOnSave || state.isAsleep) {
        return;
      }
      await runReview(document, { manual: false });
    }),

    vscode.workspace.onDidChangeTextDocument((event) => {
      const document = event.document;
      if (event.contentChanges.length === 0) {
        return;
      }
      const config = readConfig(document.uri);
      const key = document.uri.toString();
      cancelTypingTimer(key);
      if (!config.reviewOnType || state.isAsleep) {
        return;
      }
      const timer = setTimeout(() => {
        typingTimers.delete(key);
        void runReview(document, { manual: false });
      }, config.reviewDebounceMs);
      typingTimers.set(key, timer);
    }),

    vscode.workspace.onDidCloseTextDocument((document) => {
      const key = document.uri.toString();
      cancelTypingTimer(key);
      diagnostics.delete(document.uri);
      codeActions.clear(document.uri);
      inFlight.get(key)?.cancel();
    }),

    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration('chewgy')) {
        await refresh();
      }
    }),

    secrets.onDidChange(() => void refresh()),
  );

  void refresh();
  output.appendLine('Chewgy activated. Reluctantly.');
}

export function deactivate(): void {
  /* Disposables registered on the context handle teardown. */
}
