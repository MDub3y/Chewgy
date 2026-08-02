import { describe, expect, it } from 'vitest';
import {
  buildSystemPrompt,
  buildUserPrompt,
  numberLines,
  responseTokenBudget,
} from '../review/prompt.js';

describe('numberLines', () => {
  it('numbers from 1 by default', () => {
    expect(numberLines('a\nb', 1)).toBe('1 | a\n2 | b');
  });

  it('offsets for a selection', () => {
    expect(numberLines('a\nb', 40)).toBe('40 | a\n41 | b');
  });

  it('right-aligns numbers so the code stays in one column', () => {
    const out = numberLines(Array.from({ length: 11 }, (_, i) => `l${i}`).join('\n'), 1);
    const lines = out.split('\n');
    expect(lines[0]).toBe(' 1 | l0');
    expect(lines[10]).toBe('11 | l10');
  });

  it('preserves blank lines and indentation', () => {
    expect(numberLines('a\n\n    b', 1)).toBe('1 | a\n2 | \n3 |     b');
  });
});

describe('buildSystemPrompt', () => {
  it('changes tone per attitude', () => {
    expect(buildSystemPrompt('mild', 8)).toContain('ATTITUDE: MILD');
    expect(buildSystemPrompt('standard', 8)).toContain('ATTITUDE: STANDARD');
    expect(buildSystemPrompt('ruthless', 8)).toContain('ATTITUDE: RUTHLESS');
  });

  it('keeps the roast pointed at the code even at max attitude', () => {
    const prompt = buildSystemPrompt('ruthless', 8);
    expect(prompt).toContain('no personal attacks');
    expect(prompt).toContain('no profanity');
  });

  it('states the language-agnostic rule', () => {
    expect(buildSystemPrompt('standard', 8)).toContain('LANGUAGE-AGNOSTIC');
  });

  it('injects the finding budget', () => {
    expect(buildSystemPrompt('standard', 3)).toContain('At most 3 findings');
  });

  it('demands the JSON contract and separates persona from substance', () => {
    const prompt = buildSystemPrompt('standard', 8);
    expect(prompt).toContain('return ONE JSON object');
    expect(prompt).toContain('catComment');
    expect(prompt).toContain('suggestedFix');
    expect(prompt).toContain('Never put snark in `issue`');
  });
});

describe('buildUserPrompt', () => {
  const base = {
    languageId: 'rust',
    fileName: 'main.rs',
    code: 'fn main() {\n    println!("hi");\n}',
    attitude: 'standard' as const,
    maxFindings: 8,
    startLine: 1,
  };

  it('includes the file name, language and delimited code', () => {
    const prompt = buildUserPrompt(base);
    expect(prompt).toContain('File: main.rs');
    expect(prompt).toContain('Language id: rust');
    expect(prompt).toContain('--- BEGIN CODE ---');
    expect(prompt).toContain('--- END CODE ---');
  });

  it('uses absolute line numbers for a selection', () => {
    const prompt = buildUserPrompt({ ...base, startLine: 120 });
    expect(prompt).toContain('120 | fn main() {');
  });
});

describe('responseTokenBudget', () => {
  it('scales with the finding budget', () => {
    expect(responseTokenBudget(1)).toBeLessThan(responseTokenBudget(8));
  });

  it('is capped', () => {
    expect(responseTokenBudget(30)).toBeLessThanOrEqual(4096);
  });
});
