import { describe, expect, it } from 'vitest';
import { EligibilityInput, checkEligibility } from '../review/eligibility.js';

function input(over: Partial<EligibilityInput> = {}): EligibilityInput {
  return {
    languageId: 'rust',
    path: '/repo/src/main.rs',
    text: 'fn main() {}',
    scheme: 'file',
    excludeGlobs: ['**/target/**'],
    languages: [],
    maxChars: 1000,
    ...over,
  };
}

describe('checkEligibility', () => {
  it('accepts a normal source file', () => {
    expect(checkEligibility(input()).eligible).toBe(true);
  });

  it('is language-agnostic by default', () => {
    for (const languageId of ['rust', 'python', 'typescript', 'go', 'cpp', 'ruby', 'zig']) {
      expect(checkEligibility(input({ languageId })).eligible, languageId).toBe(true);
    }
  });

  it('rejects non-file schemes', () => {
    const result = checkEligibility(input({ scheme: 'output' }));
    expect(result).toMatchObject({ eligible: false, reason: 'scheme' });
  });

  it('allows remote and virtual filesystems', () => {
    expect(checkEligibility(input({ scheme: 'vscode-remote' })).eligible).toBe(true);
    expect(checkEligibility(input({ scheme: 'vscode-vfs' })).eligible).toBe(true);
  });

  it('rejects excluded paths', () => {
    const result = checkEligibility(input({ path: '/repo/target/debug/x.rs' }));
    expect(result).toMatchObject({ eligible: false, reason: 'excluded' });
  });

  it('respects a language allow-list', () => {
    expect(checkEligibility(input({ languages: ['rust'] })).eligible).toBe(true);
    const result = checkEligibility(input({ languages: ['python'] }));
    expect(result).toMatchObject({ eligible: false, reason: 'language' });
  });

  it('rejects empty and whitespace-only files', () => {
    expect(checkEligibility(input({ text: '' })).eligible).toBe(false);
    expect(checkEligibility(input({ text: '   \n\t\n' }))).toMatchObject({ reason: 'empty' });
  });

  it('rejects oversized files', () => {
    const result = checkEligibility(input({ text: 'x'.repeat(1001) }));
    expect(result).toMatchObject({ eligible: false, reason: 'tooLarge' });
    if (!result.eligible) {
      expect(result.detail).toContain('1001');
    }
  });

  it('accepts a file exactly at the limit', () => {
    expect(checkEligibility(input({ text: 'x'.repeat(1000) })).eligible).toBe(true);
  });
});
