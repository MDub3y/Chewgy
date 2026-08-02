/** Shared review vocabulary. Deliberately free of any `vscode` import. */

export type Attitude = 'mild' | 'standard' | 'ruthless';

export type Severity = 'style' | 'warning' | 'refactor';

export type Mood = 'smug' | 'bored' | 'annoyed' | 'horrified' | 'impressed' | 'sleeping';

export interface Finding {
  /** 1-based, clamped to the reviewed document. */
  line: number;
  /** 1-based inclusive end line; equals `line` for single-line findings. */
  endLine: number;
  severity: Severity;
  /** The persona layer — snark only, never code. */
  catComment: string;
  /** The substance — a plain-English description of the actual problem. */
  issue: string;
  /** Optional replacement code for [line, endLine]. */
  suggestedFix?: string;
}

export interface ReviewResult {
  /** One-line overall reaction shown in the speech bubble. */
  verdict: string;
  mood: Mood;
  findings: Finding[];
}

export const SEVERITIES: readonly Severity[] = ['style', 'warning', 'refactor'];
export const MOODS: readonly Mood[] = [
  'smug',
  'bored',
  'annoyed',
  'horrified',
  'impressed',
  'sleeping',
];
