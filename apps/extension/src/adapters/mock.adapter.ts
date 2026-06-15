import * as vscode from "vscode";
import type { IWaitStateAdapter, WaitStateEvent } from "./types";

export class MockAdapter implements IWaitStateAdapter {
  readonly name = "mock";
  private interval: NodeJS.Timeout | undefined;
  private endTimeout: NodeJS.Timeout | undefined;
  private waitStateStartHandlers: Array<(e: WaitStateEvent) => void> = [];
  private waitStateEndHandlers: Array<() => void> = [];

  constructor(private readonly cycleMs = 15_000) {}

  activate(_context: vscode.ExtensionContext): void {
    // Fire a wait-state every cycleMs for testing
    this.interval = setInterval(() => {
      const event: WaitStateEvent = { startedAt: new Date(), adapterName: this.name };
      this.waitStateStartHandlers.forEach((h) => h(event));
      // End after 8 seconds
      this.endTimeout = setTimeout(() => {
        this.endTimeout = undefined;
        this.waitStateEndHandlers.forEach((h) => h());
      }, 8_000);
    }, this.cycleMs);
  }

  deactivate(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
    if (this.endTimeout) {
      clearTimeout(this.endTimeout);
      this.endTimeout = undefined;
    }
  }

  onWaitStateStart(handler: (e: WaitStateEvent) => void): vscode.Disposable {
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
}
