import { describe, expect, it } from 'vitest';
import { ParseError, extractJson, parseReview } from '../review/parser.js';

const opts = { totalLines: 100, maxFindings: 8 };

describe('extractJson', () => {
  it('returns bare JSON unchanged', () => {
    expect(extractJson('{"a":1}')).toBe('{"a":1}');
  });

  it('unwraps a fenced block', () => {
    const raw = 'Here you go:\n```json\n{"verdict":"meh"}\n```\nHope that helps.';
    expect(extractJson(raw)).toBe('{"verdict":"meh"}');
  });

  it('unwraps an unlabelled fence', () => {
    expect(extractJson('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('ignores braces inside string literals', () => {
    const raw = '{"catComment":"use a HashMap { } instead","line":3}';
    expect(extractJson(raw)).toBe(raw);
  });

  it('ignores escaped quotes', () => {
    const raw = '{"catComment":"the \\"clever\\" bit {","line":3}';
    expect(extractJson(raw)).toBe(raw);
  });

  it('strips leading prose', () => {
    expect(extractJson('Sure! {"a":[1,2]} done')).toBe('{"a":[1,2]}');
  });

  it('finds a top-level array', () => {
    expect(extractJson('[{"line":1}]')).toBe('[{"line":1}]');
  });

  it('returns undefined when there is no JSON', () => {
    expect(extractJson('I refuse.')).toBeUndefined();
    expect(extractJson('')).toBeUndefined();
  });

  it('returns undefined for unbalanced JSON', () => {
    expect(extractJson('{"a": 1')).toBeUndefined();
  });
});

describe('parseReview', () => {
  it('parses a well-formed response', () => {
    const raw = JSON.stringify({
      verdict: 'This unwrap will bite you.',
      mood: 'horrified',
      findings: [
        {
          line: 12,
          endLine: 14,
          severity: 'warning',
          catComment: 'Bold of you to assume that is Some.',
          issue: 'unwrap() panics on None.',
          suggestedFix: 'if let Some(v) = maybe {',
        },
      ],
    });
    const result = parseReview(raw, opts);
    expect(result.verdict).toBe('This unwrap will bite you.');
    expect(result.mood).toBe('horrified');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].line).toBe(12);
    expect(result.findings[0].endLine).toBe(14);
    expect(result.findings[0].suggestedFix).toBe('if let Some(v) = maybe {');
  });

  it('throws ParseError on non-JSON output', () => {
    expect(() => parseReview('no thanks', opts)).toThrow(ParseError);
  });

  it('throws ParseError on malformed JSON', () => {
    expect(() => parseReview('{"findings": [oops]}', opts)).toThrow(ParseError);
  });

  it('accepts a bare findings array', () => {
    const result = parseReview('[{"line":2,"catComment":"no"}]', opts);
    expect(result.findings).toHaveLength(1);
    expect(result.verdict).toContain('1 problem');
  });

  it('clamps line numbers into the document', () => {
    const result = parseReview(
      '{"findings":[{"line":9999,"catComment":"x"},{"line":-4,"catComment":"y"}]}',
      { totalLines: 10, maxFindings: 8 },
    );
    expect(result.findings[0].line).toBe(10);
    expect(result.findings[1].line).toBe(1);
  });

  it('forces endLine to be at least line', () => {
    const result = parseReview('{"findings":[{"line":8,"endLine":3,"catComment":"x"}]}', opts);
    expect(result.findings[0].endLine).toBe(8);
  });

  it('honours maxFindings', () => {
    const findings = Array.from({ length: 20 }, (_, i) => ({ line: i + 1, catComment: 'x' }));
    const result = parseReview(JSON.stringify({ findings }), { totalLines: 100, maxFindings: 3 });
    expect(result.findings).toHaveLength(3);
  });

  it('sorts findings worst-severity-first, most important surviving the maxFindings cut', () => {
    const raw = JSON.stringify({
      findings: [
        { line: 1, severity: 'style', catComment: 'nit' },
        { line: 2, severity: 'warning', catComment: 'real bug' },
        { line: 3, severity: 'refactor', catComment: 'over-engineered' },
        { line: 4, severity: 'warning', catComment: 'another real bug' },
      ],
    });
    const result = parseReview(raw, { totalLines: 100, maxFindings: 3 });
    expect(result.findings.map((f) => f.severity)).toEqual(['warning', 'warning', 'refactor']);
    expect(result.findings[0].catComment).toBe('real bug');
  });

  it('maps severity synonyms and defaults to style', () => {
    const raw = JSON.stringify({
      findings: [
        { line: 1, severity: 'ERROR', catComment: 'a' },
        { line: 2, severity: 'design', catComment: 'b' },
        { line: 3, severity: 'nonsense', catComment: 'c' },
        { line: 4, catComment: 'd' },
      ],
    });
    const result = parseReview(raw, opts);
    expect(result.findings.map((f) => f.severity)).toEqual([
      'warning',
      'refactor',
      'style',
      'style',
    ]);
  });

  it('accepts alternative field names from sloppy models', () => {
    const raw = JSON.stringify({
      findings: [
        { lineNumbers: [5, 7], comment: 'sloppy', explanation: 'why', fix: 'let x = 1;' },
      ],
    });
    const result = parseReview(raw, opts);
    expect(result.findings[0].line).toBe(5);
    expect(result.findings[0].endLine).toBe(7);
    expect(result.findings[0].catComment).toBe('sloppy');
    expect(result.findings[0].issue).toBe('why');
    expect(result.findings[0].suggestedFix).toBe('let x = 1;');
  });

  it('coerces string line numbers', () => {
    const result = parseReview('{"findings":[{"line":"line 42","catComment":"x"}]}', opts);
    expect(result.findings[0].line).toBe(42);
  });

  it('drops findings with no line and no text', () => {
    const raw = JSON.stringify({
      findings: [{ catComment: 'no line' }, { line: 3 }, null, 'garbage', { line: 4, issue: 'ok' }],
    });
    const result = parseReview(raw, opts);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].line).toBe(4);
  });

  it('strips markdown fences from suggestedFix', () => {
    const raw = JSON.stringify({
      findings: [{ line: 1, catComment: 'x', suggestedFix: '```rust\nlet x = 1;\n```' }],
    });
    expect(parseReview(raw, opts).findings[0].suggestedFix).toBe('let x = 1;');
  });

  it('drops an empty suggestedFix', () => {
    const raw = JSON.stringify({ findings: [{ line: 1, catComment: 'x', suggestedFix: '   ' }] });
    expect(parseReview(raw, opts).findings[0].suggestedFix).toBeUndefined();
  });

  it('preserves multi-line fix indentation', () => {
    const raw = JSON.stringify({
      findings: [{ line: 1, catComment: 'x', suggestedFix: 'fn a() {\n    b();\n}' }],
    });
    expect(parseReview(raw, opts).findings[0].suggestedFix).toBe('fn a() {\n    b();\n}');
  });

  it('infers mood when the model omits it', () => {
    expect(parseReview('{"findings":[]}', opts).mood).toBe('impressed');
    expect(
      parseReview('{"findings":[{"line":1,"severity":"warning","catComment":"x"}]}', opts).mood,
    ).toBe('horrified');
    expect(parseReview('{"findings":[{"line":1,"catComment":"x"}]}', opts).mood).toBe('smug');
  });

  it('rejects an invalid mood', () => {
    expect(parseReview('{"mood":"hangry","findings":[]}', opts).mood).toBe('impressed');
  });

  it('supplies a verdict when missing', () => {
    expect(parseReview('{"findings":[]}', opts).verdict).toMatch(/nothing to complain/i);
  });

  it('collapses whitespace and truncates long text', () => {
    const long = 'a'.repeat(600);
    const result = parseReview(
      JSON.stringify({ findings: [{ line: 1, catComment: `too\n\n  long ${long}` }] }),
      opts,
    );
    expect(result.findings[0].catComment.length).toBeLessThanOrEqual(400);
    expect(result.findings[0].catComment).not.toContain('\n');
  });

  it('handles a zero-line document', () => {
    const result = parseReview('{"findings":[{"line":1,"catComment":"x"}]}', {
      totalLines: 0,
      maxFindings: 8,
    });
    expect(result.findings).toHaveLength(0);
  });

  it('falls back between catComment and issue', () => {
    const only = parseReview('{"findings":[{"line":1,"issue":"real problem"}]}', opts);
    expect(only.findings[0].catComment).toBe('real problem');
    expect(only.findings[0].issue).toBe('real problem');
  });
});
