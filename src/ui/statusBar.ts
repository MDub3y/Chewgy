import * as vscode from 'vscode';
import { ChewgySnapshot } from '../state.js';

const LABELS: Record<ChewgySnapshot['status'], { icon: string; text: string }> = {
  needsKey: { icon: '😿', text: 'Needs Key' },
  sleeping: { icon: '💤', text: 'Sleeping' },
  thinking: { icon: '$(loading~spin)', text: 'Judging…' },
  idle: { icon: '🐱', text: 'Judging' },
};

/** Right-aligned, high priority so it sits near the language indicator. */
export class ChewgyStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = 'chewgy.showPanel';
    this.item.name = 'Chewgy';
    this.item.show();
  }

  render(snapshot: ChewgySnapshot): void {
    const label = LABELS[snapshot.status];
    const count =
      snapshot.status === 'idle' && snapshot.findingCount > 0 ? ` ${snapshot.findingCount}` : '';
    this.item.text = `${label.icon} Chewgy (${label.text})${count}`;

    this.item.backgroundColor =
      snapshot.status === 'needsKey'
        ? new vscode.ThemeColor('statusBarItem.warningBackground')
        : undefined;

    const tip = new vscode.MarkdownString(undefined, true);
    tip.isTrusted = true;
    tip.supportHtml = false;
    tip.appendMarkdown(`**Chewgy** — ${label.text}\n\n`);
    if (snapshot.bubble) {
      tip.appendMarkdown(`_"${escapeMd(snapshot.bubble)}"_\n\n`);
    }
    if (snapshot.detail) {
      tip.appendMarkdown(`${escapeMd(snapshot.detail)}\n\n`);
    }
    tip.appendMarkdown(
      `Provider: \`${snapshot.provider}\` · Attitude: \`${snapshot.attitude}\`${
        snapshot.silent ? ' · silent' : ''
      }\n\n`,
    );
    tip.appendMarkdown(
      '[Review file](command:chewgy.reviewFile) · ' +
        '[Sleep/Wake](command:chewgy.toggle) · ' +
        '[Attitude](command:chewgy.setAttitude) · ' +
        '[Set key](command:chewgy.setApiKey)',
    );
    this.item.tooltip = tip;
  }

  dispose(): void {
    this.item.dispose();
  }
}

function escapeMd(text: string): string {
  return text.replace(/([\\`*_{}[\]()#+\-.!])/g, '\\$1');
}
