import { IgnorePlan, isSuppressed } from './ignore.js';
import { Finding, Severity } from './types.js';

/** Editor-agnostic description of a squiggle. Converted to `vscode.Diagnostic` at the edge. */
export interface DiagnosticSpec {
  /** 0-based, ready for `vscode.Range`. */
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
  severity: DiagnosticLevel;
  /** What shows on hover. */
  message: string;
  /** Kept separately so the code-action layer can offer the fix. */
  finding: Finding;
}

export type DiagnosticLevel = 'warning' | 'information' | 'hint';

/** Softer than a linter on purpose: only real bugs get a yellow squiggle. */
export const SEVERITY_LEVEL: Record<Severity, DiagnosticLevel> = {
  warning: 'warning',
  refactor: 'information',
  style: 'hint',
};

export const SEVERITY_EMOJI: Record<Severity, string> = {
  warning: '🙀',
  refactor: '😼',
  style: '😾',
};

export interface SpecOptions {
  /** Text of every line in the document, used to size the squiggle. */
  lines: readonly string[];
  plan: IgnorePlan;
}

/**
 * Converts findings into squiggle specs: clamps to the document, drops
 * suppressed lines, and trims the range to the non-whitespace span so the
 * underline sits on the code rather than the indentation.
 */
export function toDiagnosticSpecs(
  findings: readonly Finding[],
  opts: SpecOptions,
): DiagnosticSpec[] {
  const total = opts.lines.length;
  const specs: DiagnosticSpec[] = [];

  for (const finding of findings) {
    if (total === 0) {
      continue;
    }
    const start = clamp(finding.line, 1, total);
    const end = clamp(Math.max(finding.endLine, start), start, total);

    if (isSuppressed(opts.plan, start, end)) {
      continue;
    }

    const startText = opts.lines[start - 1] ?? '';
    const endText = opts.lines[end - 1] ?? '';
    const startCharacter = leadingWhitespace(startText);
    const endCharacter = Math.max(trimmedEnd(endText), startCharacter + 1);

    specs.push({
      startLine: start - 1,
      startCharacter,
      endLine: end - 1,
      endCharacter,
      severity: SEVERITY_LEVEL[finding.severity],
      message: formatMessage(finding),
      finding,
    });
  }

  return specs;
}

/** Hover text: persona first (it's the point), technical detail underneath. */
export function formatMessage(finding: Finding): string {
  const emoji = SEVERITY_EMOJI[finding.severity];
  const parts = [`${emoji} ${finding.catComment}`];
  if (finding.issue && finding.issue !== finding.catComment) {
    parts.push('', finding.issue);
  }
  return parts.join('\n');
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function leadingWhitespace(text: string): number {
  const match = /^\s*/.exec(text);
  return match ? match[0].length : 0;
}

function trimmedEnd(text: string): number {
  return text.replace(/\s+$/, '').length;
}
