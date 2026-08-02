# 🐱 Chewgy — AI Code Reviewer

A small, round, permanently unimpressed mochi cat who reviews your code and does not pretend to enjoy it.

Chewgy lives in the bottom panel of your editor, watches you save files, and delivers real technical feedback wrapped in passive-aggressive feline commentary. It works in **any language** — Rust, Python, TypeScript, Go, C++, whatever — and runs on **your** API key against Anthropic, OpenAI, or a local Ollama model.

---

## What it does

| | |
|---|---|
| **Judges on save** | Reviews the file every time you save, or on demand with `Ctrl+Alt+C`. |
| **Inline squiggles** | Soft underlines on the offending lines. Hover for the roast plus the actual technical explanation. |
| **Quick fixes** | Lightbulb offers Chewgy's suggested replacement, re-indented to match your code. |
| **Speech bubbles** | The cat reacts in the bottom panel. Its mood changes with how bad things are. |
| **Sleep mode** | One command shuts it up completely, and it stays shut up across restarts. |
| **Attitude dial** | Mild → Standard → Ruthless. |
| **Ignore directives** | `chewgy-ignore` comments work in every language. |

Chewgy's persona and its technical findings are kept in **separate fields** — the snark never contaminates the actual explanation, and suggested fixes are always raw code with no commentary in them.

---

## Requirements

- **Node.js 18+** (for building)
- **VS Code 1.85+** or **Cursor**
- An API key for one of:
  - **Anthropic** — get one at [console.anthropic.com](https://console.anthropic.com)
  - **OpenAI** — or any OpenAI-compatible gateway (Groq, Together, OpenRouter, LM Studio, vLLM)
  - **Ollama** — no key needed, runs locally

> Cursor's built-in subscription does not expose a callable API, so Chewgy needs your own key even inside Cursor.

---

## Run it locally

```bash
git clone https://github.com/MDub3y/Chewgy.git
cd Chewgy
npm install
```

Then open the folder in VS Code or Cursor and press **F5**.

That launches an **Extension Development Host** — a second editor window with Chewgy loaded. The `watch` task starts automatically, so edits to `src/` rebuild on save (reload the host window with `Ctrl+R` to pick them up).

If you prefer to build manually:

```bash
npm run build     # one-off production bundle → dist/extension.js
npm run watch     # rebuild on change
```

### First run

1. In the Extension Development Host, open the Command Palette (`Ctrl+Shift+P`).
2. Run **`Chewgy: Set API Key`**.
3. Paste your key. Chewgy makes a **1-token verification call** before saving anything:
   - ✅ Accepted → stored in your OS keychain via VS Code's `SecretStorage`. Never written to `settings.json` or to disk by the extension.
   - ❌ Rejected → nothing is stored, and you get the provider's actual error message (bad key vs. wrong model vs. no quota).
4. The status bar bottom-right flips from `😿 Chewgy (Needs Key)` to `🐱 Chewgy (Judging)`.

### Try it

Open `samples/messy.rs` (or `samples/messy.py`) in the host window and press **`Ctrl+Alt+C`**.

Both files are seeded with real problems — hardcoded secrets, panicking `unwrap()`s, an off-by-one, shell injection, a mutable default argument, an abstract factory for two constants — plus a couple of blocks marked with ignore directives that Chewgy must leave alone, and one function that's genuinely fine.

---

## Commands

| Command | Keybinding | What it does |
|---|---|---|
| `Chewgy: Set API Key` | | Enter and verify a key |
| `Chewgy: Clear Stored API Key` | | Forget the key for the current provider |
| `Chewgy: Review Current File` | `Ctrl+Alt+C` | Review on demand |
| `Chewgy: Review Selection` | right-click menu | Review only the highlighted lines |
| `Chewgy: Go to Sleep` | | Silence everything, clear all squiggles |
| `Chewgy: Wake Up` | | Back on duty |
| `Chewgy: Toggle Sleep / Wake` | `Ctrl+Alt+Shift+C` | Flip between the two |
| `Chewgy: Set Attitude` | | Mild / Standard / Ruthless |
| `Chewgy: Clear All Complaints` | | Wipe diagnostics without sleeping |
| `Chewgy: Show the Cat` | | Focus the panel |

On macOS, substitute `Cmd` for `Ctrl`.

---

## Settings

| Setting | Default | Notes |
|---|---|---|
| `chewgy.provider` | `anthropic` | `anthropic` · `openai` · `ollama` |
| `chewgy.model` | *(provider default)* | `claude-sonnet-4-5` / `gpt-4o-mini` / `llama3.1` |
| `chewgy.baseUrl` | *(provider default)* | Point at a gateway, Azure, or a remote Ollama host |
| `chewgy.attitude` | `standard` | `mild` · `standard` · `ruthless` |
| `chewgy.reviewOnSave` | `true` | Auto-review on save |
| `chewgy.silentMode` | `false` | Keep diagnostics, suppress pop-ups and bubbles |
| `chewgy.maxFindings` | `8` | Complaints per review |
| `chewgy.maxChars` | `24000` | Files bigger than this are skipped |
| `chewgy.temperature` | `0.6` | Higher = sassier, less predictable |
| `chewgy.excludeGlobs` | `node_modules`, `target`, `dist`, … | Paths Chewgy refuses to open |
| `chewgy.languages` | `[]` (all) | Restrict to specific language ids |
| `chewgy.requestTimeoutMs` | `60000` | Give-up threshold |

### Switching providers

Keys are stored **per provider**, so you can keep an Anthropic key and an OpenAI key side by side and flip `chewgy.provider` without re-entering either.

For a local, free, offline setup:

```jsonc
{
  "chewgy.provider": "ollama",
  "chewgy.model": "llama3.1"      // run: ollama pull llama3.1
}
```

For an OpenAI-compatible gateway:

```jsonc
{
  "chewgy.provider": "openai",
  "chewgy.baseUrl": "https://api.groq.com/openai/v1",
  "chewgy.model": "llama-3.3-70b-versatile"
}
```

---

## Telling Chewgy to shut up

These work in **any language** — the token is matched anywhere on the line, so `//`, `#`, `--`, `%`, `;` and `<!-- -->` all work identically.

```rust
let x = risky().unwrap();  // chewgy-ignore          ← this line

// chewgy-ignore
let y = also_risky();                                ← the line below

// chewgy-ignore-next-line
let z = still_risky();                               ← only the line below

// chewgy-ignore-start
   ...anything in here...                            ← the whole block
// chewgy-ignore-end
```

```python
# chewgy-ignore-file      ← anywhere in the file: Chewgy never even sends it to the model
```

`chewgy-ignore-file` is checked **before** the API call, so ignored files cost you nothing.

There's also a lightbulb action — **"🙈 Tell Chewgy to ignore this line"** — that inserts the right comment token for you.

---

## Testing

```bash
npm run check    # TypeScript, no emit
npm test         # 184 unit tests
npm run build    # esbuild bundle
npm run verify   # all three
```

The suite runs entirely in Node — no editor download required — because `vscode` is aliased to an in-memory mock (`src/test/mocks/vscode.ts`).

What's covered:

- **`parser`** — hostile model output: prose-wrapped JSON, markdown fences, braces inside strings, bare arrays, wrong field names, string line numbers, out-of-range lines, missing fields.
- **`ignore`** — every directive in every comment syntax, nested blocks, CRLF, glob matching.
- **`diagnostics`** — range clamping, indentation-aware squiggles, severity mapping, suppression.
- **`eligibility`** — schemes, excludes, language filters, size limits.
- **`prompt`** — attitude wiring, absolute line numbering, the JSON contract, guardrails at max attitude.
- **`providers`** — request shape, headers, error classification, timeouts, all three backends.
- **`reviewer`** — the full pipeline end to end, per language and per provider.
- **`codeActions`** — fix re-indentation, comment tokens (verified round-trip against the ignore parser).
- **`contributions`** — every declared command has a handler and vice versa; view ids match; every setting is read.
- **`webview`** — every element id the client script touches exists; every posted message has a handler; CSP and per-render nonce.
- **`activation`** — `activate()` runs, commands register, key verification gates storage, sleep blocks reviews, diagnostics publish correctly.

---

## Architecture

```
src/
├── extension.ts              activation, commands, triggers — the only place they're wired
├── config.ts                 settings reader with validation and clamping
├── secrets.ts                SecretStorage wrapper, keyed per provider
├── state.ts                  single source of truth; status bar + webview both render from it
├── providers/                ← no vscode import
│   ├── types.ts              LlmProvider contract, HTTP error classification
│   ├── anthropic.ts  openai.ts  ollama.ts
│   └── index.ts              factory — adding a backend touches only this file
├── review/                   ← no vscode import except reviewer.ts
│   ├── prompt.ts             the Chewgy persona and the JSON contract
│   ├── parser.ts             defensive parsing of model output
│   ├── ignore.ts             suppression directives + glob matching
│   ├── eligibility.ts        "should we even look at this"
│   ├── diagnostics.ts        findings → editor-agnostic squiggle specs
│   └── reviewer.ts           orchestration
└── ui/
    ├── catSvg.ts             the cat, inline, no image assets
    ├── catViewProvider.ts    bottom-panel webview
    ├── statusBar.ts          Judging / Sleeping / Needs Key
    ├── codeActions.ts        quick fixes + ignore action
    └── quips.ts              local zero-token snark
```

Two deliberate boundaries:

1. **`providers/` and most of `review/` never import `vscode`.** That's what makes the logic unit-testable in plain Node, and it's why swapping Anthropic for Ollama touches no UI code.
2. **`review/diagnostics.ts` emits plain data**, not `vscode.Diagnostic`. The conversion happens once, at the edge, in `extension.ts`.

---

## Packaging

```bash
npm run package     # → chewgy-code-reviewer-0.1.0.vsix
```

Install it with **Extensions → ⋯ → Install from VSIX…**, or:

```bash
code --install-extension chewgy-code-reviewer-0.1.0.vsix
cursor --install-extension chewgy-code-reviewer-0.1.0.vsix
```

---

## Troubleshooting

**The cat isn't visible.** It's in the bottom panel, next to Terminal and Problems. Run `Chewgy: Show the Cat`, or click the status bar item. You can drag the view to the secondary sidebar if you'd rather have it on the right.

**Status bar says `Needs Key` after I entered one.** The verification call failed, so nothing was stored. Check the **Chewgy** output channel — it logs the provider's actual error.

**`404` from the provider.** Almost always a wrong `chewgy.model` or `chewgy.baseUrl`.

**Nothing happens on save.** Check `chewgy.reviewOnSave`, that Chewgy isn't asleep, that the file isn't matched by `chewgy.excludeGlobs`, and that it doesn't contain `chewgy-ignore-file`. Skips are logged to the output channel with the reason.

**Findings land on the wrong line.** Smaller models drift on line attribution. Try a stronger model, or lower `chewgy.maxFindings` so it has less to keep track of.

---

## Privacy

Your code is sent to the provider you configure, and nowhere else. There's no telemetry, no backend of ours, and no third party in the path. Your API key goes to the OS keychain via VS Code's `SecretStorage`.

Files matching `chewgy.excludeGlobs`, files containing `chewgy-ignore-file`, and files over `chewgy.maxChars` are never transmitted at all — those checks run before the request is built.

---

## License

MIT
