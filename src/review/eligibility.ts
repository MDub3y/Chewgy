import { matchesAnyGlob } from './ignore.js';

export interface EligibilityInput {
  /** VS Code language id, e.g. `rust`, `python`, `typescriptreact`. */
  languageId: string;
  /** Path or URI path of the document. */
  path: string;
  /** Full document text. */
  text: string;
  /** URI scheme; only real files on disk are reviewed. */
  scheme: string;
  excludeGlobs: readonly string[];
  /** Empty means "every language". */
  languages: readonly string[];
  maxChars: number;
}

export type Eligibility =
  | { eligible: true }
  | { eligible: false; reason: EligibilityReason; detail: string };

export type EligibilityReason =
  | 'scheme'
  | 'excluded'
  | 'language'
  | 'empty'
  | 'tooLarge'
  | 'ignoredFile';

/**
 * Everything that decides "should Chewgy even look at this", in one pure
 * function so the rules are testable without an editor.
 */
export function checkEligibility(input: EligibilityInput): Eligibility {
  if (input.scheme !== 'file' && input.scheme !== 'vscode-vfs' && input.scheme !== 'vscode-remote') {
    return {
      eligible: false,
      reason: 'scheme',
      detail: `Not a real file (${input.scheme}).`,
    };
  }

  if (matchesAnyGlob(input.path, input.excludeGlobs)) {
    return { eligible: false, reason: 'excluded', detail: 'File matches chewgy.excludeGlobs.' };
  }

  if (input.languages.length > 0 && !input.languages.includes(input.languageId)) {
    return {
      eligible: false,
      reason: 'language',
      detail: `Language "${input.languageId}" is not in chewgy.languages.`,
    };
  }

  if (!input.text.trim()) {
    return { eligible: false, reason: 'empty', detail: 'File is empty.' };
  }

  if (input.text.length > input.maxChars) {
    return {
      eligible: false,
      reason: 'tooLarge',
      detail: `File is ${input.text.length} characters; limit is ${input.maxChars}.`,
    };
  }

  return { eligible: true };
}
