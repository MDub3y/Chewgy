import * as vscode from 'vscode';
import { DiagnosticSpec } from '../review/diagnostics.js';

export const CHEWGY_SOURCE = 'Chewgy';

export interface StoredFix {
  range: vscode.Range;
  replacement: string;
  title: string;
}

/**
 * Offers "Apply Chewgy's fix" on the lightbulb, plus an "ignore this line"
 * action so dismissing a complaint is one keystroke rather than a doc lookup.
 */
export class ChewgyCodeActionProvider
  implements vscode.CodeActionProvider, vscode.Disposable
{
  static readonly metadata: vscode.CodeActionProviderMetadata = {
    providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
  };

  private readonly fixes = new Map<string, Map<number, StoredFix>>();

  /** Called after every review; replaces the fix table for that document. */
  setFixes(uri: vscode.Uri, specs: readonly DiagnosticSpec[]): void {
    const table = new Map<number, StoredFix>();
    specs.forEach((spec, index) => {
      if (!spec.finding.suggestedFix) {
        return;
      }
      table.set(index, {
        range: new vscode.Range(
          new vscode.Position(spec.startLine, 0),
          new vscode.Position(spec.endLine, Number.MAX_SAFE_INTEGER),
        ),
        replacement: spec.finding.suggestedFix,
        title: `🐱 Chewgy: ${truncate(spec.finding.issue || spec.finding.catComment, 60)}`,
      });
    });
    this.fixes.set(uri.toString(), table);
  }

  clear(uri?: vscode.Uri): void {
    if (uri) {
      this.fixes.delete(uri.toString());
    } else {
      this.fixes.clear();
    }
  }

  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    const table = this.fixes.get(document.uri.toString());
    const actions: vscode.CodeAction[] = [];

    for (const diagnostic of context.diagnostics) {
      if (diagnostic.source !== CHEWGY_SOURCE) {
        continue;
      }

      const index = typeof diagnostic.code === 'number' ? diagnostic.code : undefined;
      const stored = index !== undefined ? table?.get(index) : undefined;

      if (stored) {
        const fix = new vscode.CodeAction(stored.title, vscode.CodeActionKind.QuickFix);
        fix.diagnostics = [diagnostic];
        fix.isPreferred = true;
        fix.edit = new vscode.WorkspaceEdit();
        const safeRange = document.validateRange(stored.range);
        fix.edit.replace(document.uri, safeRange, reindent(document, safeRange, stored.replacement));
        actions.push(fix);
      }

      const ignore = new vscode.CodeAction(
        '🙈 Tell Chewgy to ignore this line',
        vscode.CodeActionKind.QuickFix,
      );
      ignore.diagnostics = [diagnostic];
      ignore.edit = new vscode.WorkspaceEdit();
      ignore.edit.insert(
        document.uri,
        new vscode.Position(diagnostic.range.start.line, document.lineAt(diagnostic.range.start.line).text.length),
        `  ${commentToken(document.languageId)} chewgy-ignore`,
      );
      actions.push(ignore);
    }

    return actions;
  }

  dispose(): void {
    this.fixes.clear();
  }
}

/**
 * Models are inconsistent about indentation. Re-anchor the replacement to the
 * original block's indentation so applying a fix never shifts the code.
 */
export function reindent(
  document: vscode.TextDocument,
  range: vscode.Range,
  replacement: string,
): string {
  const originalIndent = /^\s*/.exec(document.lineAt(range.start.line).text)?.[0] ?? '';
  const lines = replacement.replace(/\r\n/g, '\n').split('\n');

  const nonEmpty = lines.filter((l) => l.trim());
  if (nonEmpty.length === 0) {
    return replacement;
  }
  const commonIndent = Math.min(
    ...nonEmpty.map((l) => (/^\s*/.exec(l)?.[0] ?? '').length),
  );

  return lines
    .map((l) => (l.trim() ? originalIndent + l.slice(commonIndent) : ''))
    .join('\n');
}

/** Best-effort line-comment token per language; falls back to `//`. */
export function commentToken(languageId: string): string {
  const hash = [
    'python', 'ruby', 'shellscript', 'bash', 'yaml', 'perl', 'r', 'makefile',
    'dockerfile', 'toml', 'elixir', 'julia', 'nim', 'powershell', 'coffeescript',
  ];
  const dashes = ['sql', 'lua', 'haskell', 'ada', 'elm'];
  if (hash.includes(languageId)) {
    return '#';
  }
  if (dashes.includes(languageId)) {
    return '--';
  }
  if (languageId === 'clojure' || languageId === 'lisp' || languageId === 'ini') {
    return ';';
  }
  if (languageId === 'vb' || languageId === 'vba') {
    return "'";
  }
  if (languageId === 'matlab' || languageId === 'erlang' || languageId === 'tex') {
    return '%';
  }
  return '//';
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
