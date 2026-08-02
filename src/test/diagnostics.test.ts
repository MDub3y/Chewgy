import { describe, expect, it } from 'vitest';
import {
  SEVERITY_LEVEL,
  formatMessage,
  toDiagnosticSpecs,
} from '../review/diagnostics.js';
import { buildIgnorePlan } from '../review/ignore.js';
import { Finding } from '../review/types.js';

const CODE = [
  'fn main() {',
  '    let x = maybe().unwrap();',
  '        let y = 2;   ',
  '',
  '}',
];

const plan = buildIgnorePlan(CODE.join('\n'));

function finding(over: Partial<Finding> = {}): Finding {
  return {
    line: 2,
    endLine: 2,
    severity: 'warning',
    catComment: 'Bold assumption.',
    issue: 'unwrap() panics on None.',
    ...over,
  };
}

describe('toDiagnosticSpecs', () => {
  it('converts to 0-based ranges', () => {
    const [spec] = toDiagnosticSpecs([finding()], { lines: CODE, plan });
    expect(spec.startLine).toBe(1);
    expect(spec.endLine).toBe(1);
  });

  it('starts the squiggle after the indentation', () => {
    const [spec] = toDiagnosticSpecs([finding()], { lines: CODE, plan });
    expect(spec.startCharacter).toBe(4);
  });

  it('ends the squiggle at the last non-whitespace character', () => {
    const [spec] = toDiagnosticSpecs([finding({ line: 3, endLine: 3 })], {
      lines: CODE,
      plan,
    });
    expect(spec.startCharacter).toBe(8);
    expect(spec.endCharacter).toBe(CODE[2].trimEnd().length);
  });

  it('keeps a non-empty range on a blank line', () => {
    const [spec] = toDiagnosticSpecs([finding({ line: 4, endLine: 4 })], {
      lines: CODE,
      plan,
    });
    expect(spec.endCharacter).toBeGreaterThan(spec.startCharacter);
  });

  it('spans multi-line findings', () => {
    const [spec] = toDiagnosticSpecs([finding({ line: 1, endLine: 3 })], {
      lines: CODE,
      plan,
    });
    expect(spec.startLine).toBe(0);
    expect(spec.endLine).toBe(2);
  });

  it('clamps out-of-range findings', () => {
    const specs = toDiagnosticSpecs([finding({ line: 99, endLine: 120 })], {
      lines: CODE,
      plan,
    });
    expect(specs[0].startLine).toBe(CODE.length - 1);
    expect(specs[0].endLine).toBe(CODE.length - 1);
  });

  it('maps severities to soft levels', () => {
    const specs = toDiagnosticSpecs(
      [
        finding({ severity: 'warning' }),
        finding({ severity: 'refactor' }),
        finding({ severity: 'style' }),
      ],
      { lines: CODE, plan },
    );
    expect(specs.map((s) => s.severity)).toEqual(['warning', 'information', 'hint']);
    expect(SEVERITY_LEVEL.warning).toBe('warning');
  });

  it('drops findings on suppressed lines', () => {
    const source = ['ok', 'bad() // chewgy-ignore', 'also ok'];
    const localPlan = buildIgnorePlan(source.join('\n'));
    const specs = toDiagnosticSpecs(
      [finding({ line: 1, endLine: 1 }), finding({ line: 2, endLine: 2 })],
      { lines: source, plan: localPlan },
    );
    expect(specs).toHaveLength(1);
    expect(specs[0].startLine).toBe(0);
  });

  it('drops everything when the file opts out', () => {
    const source = ['// chewgy-ignore-file', 'bad()'];
    const specs = toDiagnosticSpecs([finding({ line: 2, endLine: 2 })], {
      lines: source,
      plan: buildIgnorePlan(source.join('\n')),
    });
    expect(specs).toHaveLength(0);
  });

  it('returns nothing for an empty document', () => {
    expect(toDiagnosticSpecs([finding()], { lines: [], plan })).toHaveLength(0);
  });

  it('keeps the original finding attached for the fix layer', () => {
    const f = finding({ suggestedFix: 'let x = maybe()?;' });
    const [spec] = toDiagnosticSpecs([f], { lines: CODE, plan });
    expect(spec.finding.suggestedFix).toBe('let x = maybe()?;');
  });
});

describe('formatMessage', () => {
  it('puts the snark first and the technical detail second', () => {
    const message = formatMessage(finding());
    expect(message.startsWith('🙀 Bold assumption.')).toBe(true);
    expect(message).toContain('unwrap() panics on None.');
  });

  it('does not repeat identical text', () => {
    const message = formatMessage(finding({ issue: 'Bold assumption.' }));
    expect(message).toBe('🙀 Bold assumption.');
  });

  it('uses a different emoji per severity', () => {
    // Emoji are surrogate pairs, so index by code point rather than UTF-16 unit.
    const emojis = (['warning', 'refactor', 'style'] as const).map(
      (severity) => Array.from(formatMessage(finding({ severity })))[0],
    );
    expect(new Set(emojis).size).toBe(3);
  });
});
