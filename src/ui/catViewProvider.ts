import * as vscode from 'vscode';
import { DiagnosticSpec } from '../review/diagnostics.js';
import { ChewgySnapshot, ChewgyState } from '../state.js';
import { catSvg } from './catSvg.js';
import { quips } from './quips.js';

interface WebviewMessage {
  command: string;
  payload?: { index?: number };
}

/** Lives in the bottom panel next to Terminal/Problems, so the cat sits low-right. */
export class CatViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  static readonly viewType = 'chewgy.catView';

  private view?: vscode.WebviewView;
  private findings: DiagnosticSpec[] = [];
  private findingsUri?: vscode.Uri;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly state: ChewgyState,
  ) {
    this.disposables.push(this.state.onDidChange((snapshot) => this.post(snapshot)));
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
    };
    view.webview.html = this.html(view.webview);

    view.webview.onDidReceiveMessage(
      (message: WebviewMessage) => void this.handle(message),
      undefined,
      this.disposables,
    );

    view.onDidDispose(
      () => {
        this.view = undefined;
      },
      undefined,
      this.disposables,
    );

    this.post(this.state.snapshot());
  }

  /** Replaces the finding list shown under the bubble. */
  setFindings(uri: vscode.Uri | undefined, specs: DiagnosticSpec[]): void {
    this.findingsUri = uri;
    this.findings = specs;
    this.post(this.state.snapshot());
  }

  async reveal(): Promise<void> {
    await vscode.commands.executeCommand('chewgy.catView.focus');
  }

  private post(snapshot: ChewgySnapshot): void {
    this.view?.webview.postMessage({
      type: 'state',
      state: {
        ...snapshot,
        findings: this.findings.map((spec) => ({
          line: spec.startLine + 1,
          severity: spec.finding.severity,
          catComment: spec.finding.catComment,
          issue: spec.finding.issue,
        })),
      },
    });
  }

  private async handle(message: WebviewMessage): Promise<void> {
    switch (message.command) {
      case 'ready':
        this.post(this.state.snapshot());
        return;
      case 'review':
        await vscode.commands.executeCommand('chewgy.reviewFile');
        return;
      case 'toggle':
        await vscode.commands.executeCommand('chewgy.toggle');
        return;
      case 'setKey':
        await vscode.commands.executeCommand('chewgy.setApiKey');
        return;
      case 'attitude':
        await vscode.commands.executeCommand('chewgy.setAttitude');
        return;
      case 'clear':
        await vscode.commands.executeCommand('chewgy.clearDiagnostics');
        return;
      case 'poke':
        this.onPoke();
        return;
      case 'reveal':
        await this.revealFinding(message.payload?.index ?? -1);
        return;
      default:
        return;
    }
  }

  private onPoke(): void {
    if (this.state.isAsleep) {
      this.state.setSleeping();
      return;
    }
    const snapshot = this.state.snapshot();
    if (snapshot.status === 'thinking') {
      return;
    }
    this.state.setIdle(POKES[Math.floor(Math.random() * POKES.length)], snapshot.detail);
  }

  private async revealFinding(index: number): Promise<void> {
    const spec = this.findings[index];
    if (!spec || !this.findingsUri) {
      return;
    }
    const doc = await vscode.workspace.openTextDocument(this.findingsUri);
    const editor = await vscode.window.showTextDocument(doc, { preserveFocus: false });
    const range = new vscode.Range(
      new vscode.Position(spec.startLine, spec.startCharacter),
      new vscode.Position(spec.endLine, spec.endCharacter),
    );
    editor.selection = new vscode.Selection(range.start, range.end);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }

  private html(webview: vscode.Webview): string {
    const nonce = makeNonce();
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'chewgy.css'),
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'chewgy.js'),
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';" />
<link href="${styleUri}" rel="stylesheet" />
<title>Chewgy</title>
</head>
<body data-status="idle" data-mood="bored">
  <div class="stage">
    <div class="cat-wrap" id="cat-wrap" title="Poke the cat">
      ${catSvg()}
      <div class="cat-name">Chewgy</div>
    </div>

    <div class="right">
      <div class="bubble" id="bubble">
        <div class="bubble-text" id="bubble-text">…</div>
        <div class="bubble-detail" id="bubble-detail"></div>
      </div>

      <div class="row">
        <span class="chip" id="chip-status">Judging</span>
        <span class="chip" id="chip-provider">anthropic</span>
        <span class="chip" id="chip-attitude">standard</span>
        <span class="chip" id="chip-silent" style="display:none">silent</span>
      </div>

      <div class="row">
        <button class="primary" data-command="review">Review file</button>
        <button data-command="toggle" id="btn-toggle">Go to sleep</button>
        <button data-command="attitude">Attitude</button>
        <button data-command="setKey">Set key</button>
        <button data-command="clear">Clear</button>
      </div>

      <div class="findings" id="findings"></div>
    </div>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}

const POKES = [
  'Do not poke me. I am working.',
  'That is my only good ear.',
  'I will allow one more.',
  'Poking does not fix the code.',
  quips.clean(0),
];

function makeNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 32; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}
