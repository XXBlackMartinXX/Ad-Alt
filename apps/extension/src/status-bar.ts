import * as vscode from "vscode";

export type AdInfo = {
  headline: string;
  displayUrl: string;
  adDecisionId: string;
  creativeId: string;
};

export class AdStatusBar {
  private readonly statusBarItem: vscode.StatusBarItem;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      "promptprofit.sponsoredMoment",
      vscode.StatusBarAlignment.Left,
      -1000, // low priority so it does not crowd other items
    );
  }

  showAd(ad: AdInfo): void {
    this.statusBarItem.text = `$(megaphone) ${ad.headline} — ${ad.displayUrl}`;
    this.statusBarItem.tooltip = new vscode.MarkdownString(
      `**Sponsored** · ${ad.displayUrl}\n\n*Click to open · Displayed by PromptProfit*`,
    );
    this.statusBarItem.command = {
      command: "promptprofit._handleAdClick",
      title: "Open sponsored link",
      arguments: [ad.adDecisionId, ad.creativeId],
    };
    this.statusBarItem.backgroundColor = undefined; // no highlight colour
    this.statusBarItem.show();
  }

  showSignedOut(): void {
    this.statusBarItem.text = "$(key) PromptProfit: Sign in";
    this.statusBarItem.tooltip = "Sign in to PromptProfit to start earning";
    this.statusBarItem.command = "promptprofit.signIn";
    this.statusBarItem.show();
  }

  showEarning(amountText: string): void {
    this.statusBarItem.text = `$(check) PromptProfit ${amountText}`;
    this.statusBarItem.tooltip = "PromptProfit: Earning credited";
    this.statusBarItem.command = "promptprofit.showEarnings";
    this.statusBarItem.show();
    setTimeout(() => this.hide(), 3000);
  }

  hide(): void {
    this.statusBarItem.hide();
    this.statusBarItem.text = "";
  }

  dispose(): void {
    this.statusBarItem.dispose();
  }
}
