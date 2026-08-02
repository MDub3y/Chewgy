import { describe, expect, it } from 'vitest';
import type * as vscode from 'vscode';
import { commentToken, reindent } from '../ui/codeActions.js';
import { Position, Range, makeDocument } from './mocks/vscode.js';

function doc(text: string) {
  return makeDocument({ text }) as unknown as vscode.TextDocument;
}

function range(startLine: number, endLine = startLine) {
  return new Range(
    new Position(startLine, 0),
    new Position(endLine, 999),
  ) as unknown as vscode.Range;
}

describe('reindent', () => {
  it('re-anchors a flush-left fix to the original indentation', () => {
    const document = doc('fn main() {\n        let x = 1;\n}');
    expect(reindent(document, range(1), 'let x = 2;')).toBe('        let x = 2;');
  });

  it('preserves relative indentation across multiple lines', () => {
    const document = doc('impl A {\n    fn a() {}\n}');
    const fix = 'fn a() {\n    b();\n}';
    expect(reindent(document, range(1), fix)).toBe('    fn a() {\n        b();\n    }');
  });

  it('strips a uniform indent the model added', () => {
    const document = doc('x\n  y');
    expect(reindent(document, range(1), '        a\n        b')).toBe('  a\n  b');
  });

  it('does not indent blank lines', () => {
    const document = doc('x\n    y');
    expect(reindent(document, range(1), 'a\n\nb')).toBe('    a\n\n    b');
  });

  it('normalizes CRLF', () => {
    const document = doc('x\n  y');
    expect(reindent(document, range(1), 'a\r\nb')).toBe('  a\n  b');
  });

  it('leaves a whitespace-only replacement alone', () => {
    const document = doc('x\n  y');
    expect(reindent(document, range(1), '   ')).toBe('   ');
  });

  it('handles a zero-indent target', () => {
    const document = doc('fn main() {}');
    expect(reindent(document, range(0), 'fn main() { ok() }')).toBe('fn main() { ok() }');
  });
});

describe('commentToken', () => {
  it('picks the right line comment per language family', () => {
    expect(commentToken('rust')).toBe('//');
    expect(commentToken('typescript')).toBe('//');
    expect(commentToken('go')).toBe('//');
    expect(commentToken('cpp')).toBe('//');
    expect(commentToken('python')).toBe('#');
    expect(commentToken('ruby')).toBe('#');
    expect(commentToken('yaml')).toBe('#');
    expect(commentToken('shellscript')).toBe('#');
    expect(commentToken('sql')).toBe('--');
    expect(commentToken('lua')).toBe('--');
    expect(commentToken('haskell')).toBe('--');
    expect(commentToken('clojure')).toBe(';');
    expect(commentToken('matlab')).toBe('%');
  });

  it('falls back to // for unknown languages', () => {
    expect(commentToken('brainfuck')).toBe('//');
    expect(commentToken('')).toBe('//');
  });

  it('always produces a directive the ignore parser recognizes', async () => {
    const { buildIgnorePlan } = await import('../review/ignore.js');
    for (const language of ['rust', 'python', 'sql', 'clojure', 'matlab', 'unknown']) {
      const line = `code() ${commentToken(language)} chewgy-ignore`;
      expect(buildIgnorePlan(line).suppressedLines.has(1), language).toBe(true);
    }
  });
});
