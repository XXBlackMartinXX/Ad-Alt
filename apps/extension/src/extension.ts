import * as vscode from "vscode";
import { AdAltController } from "./controller";

let controller: AdAltController | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  controller = new AdAltController(context);
  await controller.initialize();

  context.subscriptions.push(
    vscode.commands.registerCommand("ad-alt.enable", () => controller?.enable()),
    vscode.commands.registerCommand("ad-alt.disable", () => controller?.disable()),
    vscode.commands.registerCommand("ad-alt.signIn", () => controller?.signIn()),
    vscode.commands.registerCommand("ad-alt.signOut", () => controller?.signOut()),
    vscode.commands.registerCommand("ad-alt.showEarnings", () => controller?.showEarnings()),
  );
}

export function deactivate(): void {
  controller?.dispose();
  controller = undefined;
}
