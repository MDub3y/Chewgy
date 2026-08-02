import * as vscode from 'vscode';
import { ChewgyConfig } from '../config.js';
import { createProvider } from '../providers/index.js';
import { DiagnosticSpec, toDiagnosticSpecs } from './diagnostics.js';
import { checkEligibility } from './eligibility.js';
import { buildIgnorePlan } from './ignore.js';
import { ParseError, parseReview } from './parser.js';
import { buildSystemPrompt, buildUserPrompt, responseTokenBudget } from './prompt.js';
import { ReviewResult } from './types.js';

export type ReviewOutcome =
  | { kind: 'reviewed'; result: ReviewResult; specs: DiagnosticSpec[] }
  | { kind: 'skipped'; detail: string }
  | { kind: 'error'; detail: string };

export interface ReviewRequest {
  document: vscode.TextDocument;
  config: ChewgyConfig;
  apiKey?: string;
  /** Optional selection; when present only these lines are sent to the model. */
  range?: vscode.Range;
  token?: vscode.CancellationToken;
}

/** Orchestrates one review: eligibility → prompt → provider → parse → squiggle specs. */
export class Reviewer {
  async review(req: ReviewRequest): Promise<ReviewOutcome> {
    const { document, config } = req;
    const fullText = document.getText();

    const eligibility = checkEligibility({
      languageId: document.languageId,
      path: document.uri.path,
      text: fullText,
      scheme: document.uri.scheme,
      excludeGlobs: config.excludeGlobs,
      languages: config.languages,
      maxChars: config.maxChars,
    });
    if (!eligibility.eligible) {
      return { kind: 'skipped', detail: eligibility.detail };
    }

    const plan = buildIgnorePlan(fullText);
    if (plan.fileIgnored) {
      return { kind: 'skipped', detail: 'File is marked chewgy-ignore-file.' };
    }

    const hasSelection = req.range !== undefined && !req.range.isEmpty;
    const startLine = hasSelection ? req.range!.start.line + 1 : 1;
    const codeToSend = hasSelection
      ? document.getText(
          new vscode.Range(
            new vscode.Position(req.range!.start.line, 0),
            document.lineAt(req.range!.end.line).range.end,
          ),
        )
      : fullText;

    const provider = createProvider(config.provider, {
      apiKey: req.apiKey,
      model: config.model,
      baseUrl: config.baseUrl,
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);
    const cancelSub = req.token?.onCancellationRequested(() => controller.abort());

    let raw: string;
    try {
      raw = await provider.complete({
        system: buildSystemPrompt(config.attitude, config.maxFindings),
        user: buildUserPrompt({
          languageId: document.languageId,
          fileName: baseName(document.uri.path),
          code: codeToSend,
          attitude: config.attitude,
          maxFindings: config.maxFindings,
          startLine,
        }),
        maxTokens: responseTokenBudget(config.maxFindings),
        temperature: config.temperature,
        signal: controller.signal,
      });
    } catch (err) {
      return { kind: 'error', detail: err instanceof Error ? err.message : String(err) };
    } finally {
      clearTimeout(timeout);
      cancelSub?.dispose();
    }

    if (req.token?.isCancellationRequested) {
      return { kind: 'skipped', detail: 'Review cancelled.' };
    }

    let result: ReviewResult;
    try {
      result = parseReview(raw, {
        totalLines: document.lineCount,
        maxFindings: config.maxFindings,
      });
    } catch (err) {
      const detail =
        err instanceof ParseError
          ? `${err.message} (the model ignored the JSON contract)`
          : String(err);
      return { kind: 'error', detail };
    }

    const lines = fullText.split('\n');
    const specs = toDiagnosticSpecs(result.findings, { lines, plan });

    return { kind: 'reviewed', result, specs };
  }
}

export function baseName(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}
