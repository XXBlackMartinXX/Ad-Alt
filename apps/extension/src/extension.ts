import * as vscode from "vscode";
import { PromptProfitController } from "./controller";

let controller: PromptProfitController | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  controller = new PromptProfitController(context);
  await controller.initialize();

  context.subscriptions.push(
    vscode.commands.registerCommand("promptprofit.enable", () => controller?.enable()),
    vscode.commands.registerCommand("promptprofit.disable", () => controller?.disable()),
    vscode.commands.registerCommand("promptprofit.signIn", () => controller?.signIn()),
    vscode.commands.registerCommand("promptprofit.signOut", () => controller?.signOut()),
    vscode.commands.registerCommand("promptprofit.showEarnings", () => controller?.showEarnings()),
  );
}

export function deactivate(): void {
  controller?.dispose();
  controller = undefined;
}
