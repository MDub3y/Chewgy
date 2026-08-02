/**
 * Language-agnostic suppression directives.
 *
 * We deliberately do not parse comment syntax. Matching the bare token anywhere
 * on a line works identically in `//`, `#`, `--`, `%`, `;`, `<!-- -->` and
 * everything else, which is what "works in every language" actually requires.
 *
 *   chewgy-ignore-file            → skip the whole file
 *   chewgy-ignore                 → skip this line and the next one
 *   chewgy-ignore-next-line       → skip the next line
 *   chewgy-ignore-start / -end    → skip everything between (inclusive)
 */

export interface IgnorePlan {
  /** True when the file opted out entirely. */
  fileIgnored: boolean;
  /** 1-based line numbers whose findings must be dropped. */
  suppressedLines: ReadonlySet<number>;
}

const FILE_TOKEN = /chewgy-ignore-file\b/;
const START_TOKEN = /chewgy-ignore-start\b/;
const END_TOKEN = /chewgy-ignore-end\b/;
const NEXT_LINE_TOKEN = /chewgy-ignore-next-line\b/;
// `(?!-)` keeps this from matching the longer directives above.
const LINE_TOKEN = /chewgy-ignore(?!-)/;

export function buildIgnorePlan(text: string): IgnorePlan {
  const lines = text.split('\n');
  const suppressed = new Set<number>();
  let fileIgnored = false;
  let blockDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const line = lines[i];

    if (FILE_TOKEN.test(line)) {
      fileIgnored = true;
      continue;
    }

    if (START_TOKEN.test(line)) {
      blockDepth++;
      suppressed.add(lineNo);
      continue;
    }

    if (END_TOKEN.test(line)) {
      blockDepth = Math.max(0, blockDepth - 1);
      suppressed.add(lineNo);
      continue;
    }

    if (blockDepth > 0) {
      suppressed.add(lineNo);
      continue;
    }

    if (NEXT_LINE_TOKEN.test(line)) {
      suppressed.add(lineNo);
      suppressed.add(lineNo + 1);
      continue;
    }

    if (LINE_TOKEN.test(line)) {
      // Covers both a trailing comment on the offending line and a directive
      // written on the line above it.
      suppressed.add(lineNo);
      suppressed.add(lineNo + 1);
    }
  }

  return { fileIgnored, suppressedLines: suppressed };
}

/** A finding is dropped when any line in its range is suppressed. */
export function isSuppressed(plan: IgnorePlan, line: number, endLine: number): boolean {
  if (plan.fileIgnored) {
    return true;
  }
  for (let l = line; l <= endLine; l++) {
    if (plan.suppressedLines.has(l)) {
      return true;
    }
  }
  return false;
}

/** Minimal glob matcher for the `chewgy.excludeGlobs` setting. Supports `**`, `*` and `?`. */
export function matchesAnyGlob(path: string, globs: readonly string[]): boolean {
  const normalized = path.replace(/\\/g, '/');
  return globs.some((glob) => globToRegExp(glob).test(normalized));
}

const globCache = new Map<string, RegExp>();

export function globToRegExp(glob: string): RegExp {
  const cached = globCache.get(glob);
  if (cached) {
    return cached;
  }

  let out = '';
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        // `**/` should also match zero directories, so make the slash optional.
        if (glob[i + 2] === '/') {
          out += '(?:.*/)?';
          i += 2;
        } else {
          out += '.*';
          i += 1;
        }
      } else {
        out += '[^/]*';
      }
    } else if (ch === '?') {
      out += '[^/]';
    } else if ('\\^$+.()|{}[]'.includes(ch)) {
      out += `\\${ch}`;
    } else {
      out += ch;
    }
  }

  const re = new RegExp(`^${out}$`);
  globCache.set(glob, re);
  return re;
}
