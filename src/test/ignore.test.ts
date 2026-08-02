import { describe, expect, it } from 'vitest';
import { buildIgnorePlan, isSuppressed, matchesAnyGlob } from '../review/ignore.js';

describe('buildIgnorePlan', () => {
  it('flags a whole file', () => {
    const plan = buildIgnorePlan('# chewgy-ignore-file\nprint(1)\n');
    expect(plan.fileIgnored).toBe(true);
    expect(isSuppressed(plan, 2, 2)).toBe(true);
  });

  it('works with any comment syntax', () => {
    for (const comment of ['//', '#', '--', '%', ';', '<!--', '/*']) {
      const plan = buildIgnorePlan(`a\n${comment} chewgy-ignore\nb\n`);
      expect(plan.suppressedLines.has(2), comment).toBe(true);
      expect(plan.suppressedLines.has(3), comment).toBe(true);
    }
  });

  it('suppresses the directive line and the next line', () => {
    const plan = buildIgnorePlan('one\n// chewgy-ignore\nthree\nfour\n');
    expect(plan.suppressedLines.has(1)).toBe(false);
    expect(plan.suppressedLines.has(2)).toBe(true);
    expect(plan.suppressedLines.has(3)).toBe(true);
    expect(plan.suppressedLines.has(4)).toBe(false);
  });

  it('supports a trailing directive on the offending line', () => {
    const plan = buildIgnorePlan('let x = unwrap(); // chewgy-ignore\n');
    expect(isSuppressed(plan, 1, 1)).toBe(true);
  });

  it('supports chewgy-ignore-next-line', () => {
    const plan = buildIgnorePlan('# chewgy-ignore-next-line\nbad()\ngood()\n');
    expect(plan.suppressedLines.has(2)).toBe(true);
    expect(plan.suppressedLines.has(3)).toBe(false);
  });

  it('suppresses a start/end block inclusively', () => {
    const plan = buildIgnorePlan(
      'keep\n// chewgy-ignore-start\na\nb\n// chewgy-ignore-end\nkeep\n',
    );
    expect(plan.suppressedLines.has(1)).toBe(false);
    for (const line of [2, 3, 4, 5]) {
      expect(plan.suppressedLines.has(line)).toBe(true);
    }
    expect(plan.suppressedLines.has(6)).toBe(false);
  });

  it('handles an unterminated block by suppressing to EOF', () => {
    const plan = buildIgnorePlan('a\n// chewgy-ignore-start\nb\nc\n');
    expect(plan.suppressedLines.has(3)).toBe(true);
    expect(plan.suppressedLines.has(4)).toBe(true);
  });

  it('does not treat the longer directives as a plain chewgy-ignore', () => {
    const plan = buildIgnorePlan('// chewgy-ignore-file\nnext\n');
    expect(plan.fileIgnored).toBe(true);
    expect(plan.suppressedLines.has(2)).toBe(false);
  });

  it('leaves clean files alone', () => {
    const plan = buildIgnorePlan('fn main() {}\n');
    expect(plan.fileIgnored).toBe(false);
    expect(plan.suppressedLines.size).toBe(0);
    expect(isSuppressed(plan, 1, 1)).toBe(false);
  });

  it('handles CRLF line endings', () => {
    const plan = buildIgnorePlan('a\r\n// chewgy-ignore\r\nb\r\n');
    expect(plan.suppressedLines.has(2)).toBe(true);
  });
});

describe('isSuppressed', () => {
  it('drops a range that overlaps a suppressed line', () => {
    const plan = buildIgnorePlan('a\nb\n// chewgy-ignore\nd\ne\n');
    expect(isSuppressed(plan, 1, 3)).toBe(true);
    expect(isSuppressed(plan, 1, 2)).toBe(false);
    expect(isSuppressed(plan, 5, 5)).toBe(false);
  });
});

describe('matchesAnyGlob', () => {
  const globs = ['**/node_modules/**', '**/target/**', '**/*.min.js', 'src/generated/*.ts'];

  it('matches nested directories', () => {
    expect(matchesAnyGlob('/repo/node_modules/foo/index.js', globs)).toBe(true);
    expect(matchesAnyGlob('/repo/target/debug/build.rs', globs)).toBe(true);
  });

  it('matches at the root without a leading directory', () => {
    expect(matchesAnyGlob('node_modules/a.js', globs)).toBe(true);
  });

  it('matches extension patterns anywhere', () => {
    expect(matchesAnyGlob('/repo/dist/app.min.js', globs)).toBe(true);
    expect(matchesAnyGlob('/repo/dist/app.js', globs)).toBe(false);
  });

  it('respects single-star directory boundaries', () => {
    expect(matchesAnyGlob('src/generated/api.ts', globs)).toBe(true);
    expect(matchesAnyGlob('src/generated/deep/api.ts', globs)).toBe(false);
  });

  it('normalizes Windows separators', () => {
    expect(matchesAnyGlob('C:\\repo\\node_modules\\a.js', globs)).toBe(true);
  });

  it('returns false for an empty glob list', () => {
    expect(matchesAnyGlob('anything.rs', [])).toBe(false);
  });

  it('does not match a partial segment', () => {
    expect(matchesAnyGlob('/repo/my_node_modules_backup/a.js', globs)).toBe(false);
  });
});
