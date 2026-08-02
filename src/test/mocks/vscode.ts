/**
 * Minimal in-memory stand-in for the `vscode` module.
 *
 * Only the surface Chewgy actually touches is implemented. Aliased in
 * vitest.config.ts so pipeline code can be exercised without an editor host.
 */

export class Position {
  constructor(
    readonly line: number,
    readonly character: number,
  ) {}
}

export class Range {
  readonly start: Position;
  readonly end: Position;

  constructor(startOrLine: Position | number, endOrChar: Position | number, c?: number, d?: number) {
    if (typeof startOrLine === 'number') {
      this.start = new Position(startOrLine, endOrChar as number);
      this.end = new Position(c as number, d as number);
    } else {
      this.start = startOrLine;
      this.end = endOrChar as Position;
    }
  }

  get isEmpty(): boolean {
    return this.start.line === this.end.line && this.start.character === this.end.character;
  }
}

export class Selection extends Range {}

export class Uri {
  constructor(
    readonly scheme: string,
    readonly path: string,
  ) {}

  static file(path: string): Uri {
    return new Uri('file', path);
  }

  static parse(value: string): Uri {
    const [scheme, rest] = value.split('://');
    return new Uri(scheme, rest ?? value);
  }

  static joinPath(base: Uri, ...segments: string[]): Uri {
    return new Uri(base.scheme, [base.path.replace(/\/$/, ''), ...segments].join('/'));
  }

  toString(): string {
    return `${this.scheme}://${this.path}`;
  }
}

export class EventEmitter<T> {
  private listeners: Array<(value: T) => void> = [];

  readonly event = (listener: (value: T) => void) => {
    this.listeners.push(listener);
    return {
      dispose: () => {
        this.listeners = this.listeners.filter((l) => l !== listener);
      },
    };
  };

  fire(value: T): void {
    for (const listener of [...this.listeners]) {
      listener(value);
    }
  }

  dispose(): void {
    this.listeners = [];
  }
}

export class CancellationTokenSource {
  private handlers: Array<() => void> = [];
  readonly token = {
    isCancellationRequested: false,
    onCancellationRequested: (handler: () => void) => {
      this.handlers.push(handler);
      return { dispose: () => undefined };
    },
  };

  cancel(): void {
    this.token.isCancellationRequested = true;
    for (const handler of this.handlers) {
      handler();
    }
  }

  dispose(): void {
    this.handlers = [];
  }
}

export enum DiagnosticSeverity {
  Error = 0,
  Warning = 1,
  Information = 2,
  Hint = 3,
}

export enum DiagnosticTag {
  Unnecessary = 1,
  Deprecated = 2,
}

export enum StatusBarAlignment {
  Left = 1,
  Right = 2,
}

export enum TextEditorRevealType {
  Default = 0,
  InCenter = 1,
  InCenterIfOutsideViewport = 2,
}

export enum InputBoxValidationSeverity {
  Info = 1,
  Warning = 2,
  Error = 3,
}

export enum ConfigurationTarget {
  Global = 1,
  Workspace = 2,
}

export const CodeActionKind = { QuickFix: { value: 'quickfix' } };

export class CodeAction {
  diagnostics?: unknown[];
  isPreferred?: boolean;
  edit?: WorkspaceEdit;
  constructor(
    readonly title: string,
    readonly kind?: unknown,
  ) {}
}

export class WorkspaceEdit {
  readonly operations: Array<{ kind: string; uri: Uri; range?: Range; text: string }> = [];

  replace(uri: Uri, range: Range, text: string): void {
    this.operations.push({ kind: 'replace', uri, range, text });
  }

  insert(uri: Uri, position: Position, text: string): void {
    this.operations.push({
      kind: 'insert',
      uri,
      range: new Range(position, position),
      text,
    });
  }
}

export class Diagnostic {
  source?: string;
  code?: string | number;
  tags?: DiagnosticTag[];
  constructor(
    readonly range: Range,
    readonly message: string,
    readonly severity: DiagnosticSeverity,
  ) {}
}

export class MarkdownString {
  value = '';
  isTrusted = false;
  supportHtml = false;
  constructor(value?: string) {
    this.value = value ?? '';
  }
  appendMarkdown(text: string): this {
    this.value += text;
    return this;
  }
}

export class ThemeColor {
  constructor(readonly id: string) {}
}

/** A `TextDocument` backed by a plain string. */
export function makeDocument(options: {
  text: string;
  languageId?: string;
  path?: string;
  scheme?: string;
}) {
  const lines = options.text.split('\n');
  const uri = new Uri(options.scheme ?? 'file', options.path ?? '/repo/src/main.rs') as Uri;

  return {
    uri,
    languageId: options.languageId ?? 'rust',
    lineCount: lines.length,
    getText(range?: Range): string {
      if (!range) {
        return options.text;
      }
      const slice = lines.slice(range.start.line, range.end.line + 1);
      if (slice.length === 0) {
        return '';
      }
      slice[slice.length - 1] = slice[slice.length - 1].slice(0, range.end.character);
      slice[0] = slice[0].slice(range.start.character);
      return slice.join('\n');
    },
    lineAt(line: number) {
      const text = lines[line] ?? '';
      return {
        text,
        range: new Range(new Position(line, 0), new Position(line, text.length)),
      };
    },
    validateRange(range: Range): Range {
      return range;
    },
  };
}

export const ProgressLocation = { Notification: 15 };

const noopDisposable = { dispose: () => undefined };

/**
 * Mutable recording surface. Tests read `recorder` to assert on what the
 * extension did, and write to it to script user responses.
 */
export const recorder = {
  commands: new Map<string, (...args: unknown[]) => unknown>(),
  diagnostics: new Map<string, Diagnostic[]>(),
  outputLines: [] as string[],
  infoMessages: [] as string[],
  warnMessages: [] as string[],
  errorMessages: [] as string[],
  statusBarText: '',
  savedDocuments: [] as Array<(doc: unknown) => unknown>,
  changedDocuments: [] as Array<(event: unknown) => unknown>,
  settings: new Map<string, unknown>(),
  updatedSettings: [] as Array<{ key: string; value: unknown }>,
  /** Scripted user input for showInputBox / showQuickPick. */
  nextInputBox: undefined as string | undefined,
  nextQuickPick: undefined as unknown,

  reset(): void {
    this.commands.clear();
    this.diagnostics.clear();
    this.outputLines = [];
    this.infoMessages = [];
    this.warnMessages = [];
    this.errorMessages = [];
    this.statusBarText = '';
    this.savedDocuments = [];
    this.changedDocuments = [];
    this.settings.clear();
    this.updatedSettings = [];
    this.nextInputBox = undefined;
    this.nextQuickPick = undefined;
  },
};

export const window = {
  createOutputChannel: () => ({
    appendLine: (line: string) => recorder.outputLines.push(line),
    show: () => undefined,
    dispose: () => undefined,
  }),
  createStatusBarItem: () => ({
    get text() {
      return recorder.statusBarText;
    },
    set text(value: string) {
      recorder.statusBarText = value;
    },
    tooltip: undefined as unknown,
    command: '',
    name: '',
    backgroundColor: undefined as unknown,
    show: () => undefined,
    dispose: () => undefined,
  }),
  showInformationMessage: async (message: string) => {
    recorder.infoMessages.push(message);
    return undefined;
  },
  showWarningMessage: async (message: string) => {
    recorder.warnMessages.push(message);
    return undefined;
  },
  showErrorMessage: async (message: string) => {
    recorder.errorMessages.push(message);
    return undefined;
  },
  showInputBox: async (options?: { validateInput?: (v: string) => unknown }) => {
    const value = recorder.nextInputBox;
    if (value !== undefined && options?.validateInput) {
      const problem = options.validateInput(value) as { severity?: number } | undefined;
      if (problem && problem.severity === InputBoxValidationSeverity.Error) {
        return undefined;
      }
    }
    return value;
  },
  showQuickPick: async () => recorder.nextQuickPick,
  showTextDocument: async () => ({
    selection: undefined as unknown,
    revealRange: () => undefined,
  }),
  withProgress: async <T>(_o: unknown, task: () => Promise<T>) => task(),
  registerWebviewViewProvider: () => noopDisposable,
  activeTextEditor: undefined as unknown,
};

export const workspace = {
  getConfiguration: () => ({
    get: (key: string) => recorder.settings.get(key),
    update: async (key: string, value: unknown) => {
      recorder.settings.set(key, value);
      recorder.updatedSettings.push({ key, value });
    },
  }),
  onDidSaveTextDocument: (handler: (doc: unknown) => unknown) => {
    recorder.savedDocuments.push(handler);
    return noopDisposable;
  },
  onDidChangeTextDocument: (handler: (event: unknown) => unknown) => {
    recorder.changedDocuments.push(handler);
    return noopDisposable;
  },
  onDidCloseTextDocument: () => noopDisposable,
  onDidChangeConfiguration: () => noopDisposable,
  openTextDocument: async () => makeDocument({ text: '' }),
};

export const commands = {
  registerCommand: (id: string, handler: (...args: unknown[]) => unknown) => {
    recorder.commands.set(id, handler);
    return noopDisposable;
  },
  executeCommand: async (id: string, ...args: unknown[]) => {
    const handler = recorder.commands.get(id);
    return handler ? handler(...args) : undefined;
  },
};

export const languages = {
  createDiagnosticCollection: () => ({
    set: (uri: Uri, items: Diagnostic[]) => recorder.diagnostics.set(uri.toString(), items),
    delete: (uri: Uri) => recorder.diagnostics.delete(uri.toString()),
    clear: () => recorder.diagnostics.clear(),
    dispose: () => undefined,
  }),
  registerCodeActionsProvider: () => noopDisposable,
};
