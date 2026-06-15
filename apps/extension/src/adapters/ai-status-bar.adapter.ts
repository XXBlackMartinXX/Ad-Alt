import * as vscode from "vscode";
import type { IWaitStateAdapter, WaitStateEvent } from "./types";

const IDLE_THRESHOLD_MS = 3000; // milliseconds of inactivity before assuming wait-state
const MAX_WAIT_STATE_MS = 60_000; // maximum duration of a single wait-state

export class AiStatusBarAdapter implements IWaitStateAdapter {
  readonly name = "ai_status_bar";

  private waitStateStartHandlers: Array<(event: WaitStateEvent) => void> = [];
  private waitStateEndHandlers: Array<() => void> = [];
  private disposables: vscode.Disposable[] = [];
  private idleTimer: NodeJS.Timeout | undefined;
  private maxTimer: NodeJS.Timeout | undefined;
  private isInWaitState = false;
  private lastActivityAt = Date.now();

  activate(context: vscode.ExtensionContext): void {
    // Watch for any user activity that indicates they're NOT in a wait-state
    const onActivity = () => {
      this.lastActivityAt = Date.now();
      if (this.isInWaitState) {
        this.endWaitState();
      }
      this.scheduleIdleCheck();
    };

    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument(onActivity),
      vscode.window.onDidChangeTextEditorSelection(onActivity),
      vscode.window.onDidChangeActiveTerminal(onActivity),
    );

    this.scheduleIdleCheck();

    // Suppress unused-variable warning — context is part of the interface contract
    void context;
  }

  deactivate(): void {
    this.clearTimers();
    if (this.isInWaitState) {
      this.endWaitState();
    }
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }

  onWaitStateStart(handler: (event: WaitStateEvent) => void): vscode.Disposable {
    this.waitStateStartHandlers.push(handler);
    return new vscode.Disposable(() => {
      this.waitStateStartHandlers = this.waitStateStartHandlers.filter((h) => h !== handler);
    });
  }

  onWaitStateEnd(handler: () => void): vscode.Disposable {
    this.waitStateEndHandlers.push(handler);
    return new vscode.Disposable(() => {
      this.waitStateEndHandlers = this.waitStateEndHandlers.filter((h) => h !== handler);
    });
  }

  dispose(): void {
    this.deactivate();
  }

  private scheduleIdleCheck(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.idleTimer = undefined;
      if (!this.isInWaitState) {
        this.startWaitState();
      }
    }, IDLE_THRESHOLD_MS);
  }

  private startWaitState(): void {
    this.isInWaitState = true;
    const event: WaitStateEvent = { startedAt: new Date(), adapterName: this.name };
    this.waitStateStartHandlers.forEach((h) => h(event));

    this.maxTimer = setTimeout(() => {
      this.maxTimer = undefined;
      if (this.isInWaitState) this.endWaitState();
    }, MAX_WAIT_STATE_MS);
  }

  private endWaitState(): void {
    this.isInWaitState = false;
    if (this.maxTimer) {
      clearTimeout(this.maxTimer);
      this.maxTimer = undefined;
    }
    this.waitStateEndHandlers.forEach((h) => h());
    this.scheduleIdleCheck();
  }

  private clearTimers(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = undefined;
    }
    if (this.maxTimer) {
      clearTimeout(this.maxTimer);
      this.maxTimer = undefined;
    }
  }
}
