import { Finding, MOODS, Mood, ReviewResult, SEVERITIES, Severity } from './types.js';

/** Most important first: a real bug outranks a style nit even if the model listed it later. */
const SEVERITY_RANK: Record<Severity, number> = {
  warning: 0,
  refactor: 1,
  style: 2,
};

export class ParseError extends Error {
  constructor(
    message: string,
    readonly raw: string,
  ) {
    super(message);
    this.name = 'ParseError';
  }
}

export interface ParseOptions {
  /** Findings pointing outside [1, totalLines] are clamped. */
  totalLines: number;
  maxFindings: number;
}

/**
 * Pulls the first balanced JSON object or array out of arbitrary model output.
 *
 * Models wrap JSON in prose, in ```json fences, or emit it bare. This walks the
 * string tracking string/escape state so braces inside string literals do not
 * confuse the matcher.
 */
export function extractJson(raw: string): string | undefined {
  if (!raw) {
    return undefined;
  }

  // Strip a fenced block first; its contents are the highest-confidence candidate.
  const fence = /```(?:json|JSON)?\s*\n?([\s\S]*?)```/.exec(raw);
  const candidates = fence ? [fence[1], raw] : [raw];

  for (const candidate of candidates) {
    const found = scanBalanced(candidate);
    if (found) {
      return found;
    }
  }
  return undefined;
}

function scanBalanced(text: string): string | undefined {
  const start = findFirstStructuralStart(text);
  if (start === -1) {
    return undefined;
  }

  const openChar = text[start];
  const closeChar = openChar === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === openChar) {
      depth++;
    } else if (ch === closeChar) {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return undefined;
}

function findFirstStructuralStart(text: string): number {
  const brace = text.indexOf('{');
  const bracket = text.indexOf('[');
  if (brace === -1) {
    return bracket;
  }
  if (bracket === -1) {
    return brace;
  }
  return Math.min(brace, bracket);
}

/**
 * Parses and normalizes a model response into a `ReviewResult`.
 * Never trusts the model: every field is validated, coerced or dropped.
 */
export function parseReview(raw: string, opts: ParseOptions): ReviewResult {
  const jsonText = extractJson(raw);
  if (!jsonText) {
    throw new ParseError('No JSON object found in the model response.', raw);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new ParseError(
      `Model returned malformed JSON: ${err instanceof Error ? err.message : String(err)}`,
      raw,
    );
  }

  // Some models return just the findings array. Accept that shape too.
  const root: Record<string, unknown> = Array.isArray(parsed)
    ? { findings: parsed }
    : ((parsed ?? {}) as Record<string, unknown>);

  const rawFindings = Array.isArray(root.findings) ? root.findings : [];
  const findings = rawFindings
    .map((f) => normalizeFinding(f, opts.totalLines))
    .filter((f): f is Finding => f !== undefined)
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
    .slice(0, opts.maxFindings);

  return {
    verdict: normalizeVerdict(root.verdict, findings.length),
    mood: normalizeMood(root.mood, findings),
    findings,
  };
}

function normalizeFinding(value: unknown, totalLines: number): Finding | undefined {
  if (value === null || typeof value !== 'object') {
    return undefined;
  }
  const obj = value as Record<string, unknown>;

  const line = clampLine(toInt(obj.line ?? obj.lineNumber ?? firstOf(obj.lineNumbers)), totalLines);
  if (line === undefined) {
    return undefined;
  }

  const rawEnd = toInt(obj.endLine ?? obj.lineEnd ?? lastOf(obj.lineNumbers));
  const endLine = clampLine(rawEnd, totalLines) ?? line;

  const catComment = toText(obj.catComment ?? obj.comment ?? obj.message, 400);
  const issue = toText(obj.issue ?? obj.explanation ?? obj.reason, 400);

  // A finding with no words is useless noise.
  if (!catComment && !issue) {
    return undefined;
  }

  return {
    line,
    endLine: Math.max(line, endLine),
    severity: normalizeSeverity(obj.severity),
    catComment: catComment || issue,
    issue: issue || catComment,
    suggestedFix: normalizeFix(obj.suggestedFix ?? obj.fix ?? obj.replacement),
  };
}

function normalizeSeverity(value: unknown): Severity {
  const text = String(value ?? '').trim().toLowerCase();
  if ((SEVERITIES as readonly string[]).includes(text)) {
    return text as Severity;
  }
  // Common synonyms models reach for.
  if (['error', 'bug', 'critical', 'high'].includes(text)) {
    return 'warning';
  }
  if (['refactoring', 'design', 'structure', 'medium'].includes(text)) {
    return 'refactor';
  }
  return 'style';
}

function normalizeMood(value: unknown, findings: Finding[]): Mood {
  const text = String(value ?? '').trim().toLowerCase();
  if ((MOODS as readonly string[]).includes(text)) {
    return text as Mood;
  }
  if (findings.length === 0) {
    return 'impressed';
  }
  if (findings.some((f) => f.severity === 'warning')) {
    return 'horrified';
  }
  return findings.length > 3 ? 'annoyed' : 'smug';
}

function normalizeVerdict(value: unknown, findingCount: number): string {
  const text = toText(value, 200);
  if (text) {
    return text;
  }
  return findingCount === 0
    ? 'Nothing to complain about. Suspicious, but fine.'
    : `${findingCount} problem${findingCount === 1 ? '' : 's'}. Naturally.`;
}

/** Strips markdown fences a model may have wrapped around the fix despite instructions. */
function normalizeFix(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  let text = value.replace(/\r\n/g, '\n');
  const fence = /^\s*```[a-zA-Z0-9_+-]*\s*\n([\s\S]*?)\n?\s*```\s*$/.exec(text);
  if (fence) {
    text = fence[1];
  }
  text = text.replace(/\s+$/, '');
  return text.trim() ? text : undefined;
}

function toText(value: unknown, max: number): string {
  if (typeof value !== 'string') {
    return '';
  }
  const cleaned = value.replace(/\s+/g, ' ').trim();
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned;
}

function toInt(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === 'string') {
    const match = /-?\d+/.exec(value);
    if (match) {
      return Number.parseInt(match[0], 10);
    }
  }
  return undefined;
}

function clampLine(value: number | undefined, totalLines: number): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (totalLines < 1) {
    return undefined;
  }
  return Math.min(Math.max(value, 1), totalLines);
}

function firstOf(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : undefined;
}

function lastOf(value: unknown): unknown {
  return Array.isArray(value) && value.length > 0 ? value[value.length - 1] : undefined;
}
