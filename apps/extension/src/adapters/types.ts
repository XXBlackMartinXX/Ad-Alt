import type * as vscode from "vscode";

export type WaitStateEvent = {
  startedAt: Date;
  adapterName: string;
};

export interface IWaitStateAdapter {
  readonly name: string;
  activate(context: vscode.ExtensionContext): void;
  deactivate(): void;
  onWaitStateStart(handler: (event: WaitStateEvent) => void): vscode.Disposable;
  onWaitStateEnd(handler: () => void): vscode.Disposable;
  dispose(): void;
}
