import * as vscode from "vscode";

export type AdInfo = {
  headline: string;
  displayUrl: string;
  adDecisionId: string;
};

export class AdStatusBar {
  private readonly statusBarItem: vscode.StatusBarItem;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      "ad-alt.sponsoredMoment",
      vscode.StatusBarAlignment.Left,
      -1000, // low priority so it does not crowd other items
    );
  }

  showAd(ad: AdInfo): void {
    this.statusBarItem.text = `$(megaphone) ${ad.headline} — ${ad.displayUrl}`;
    this.statusBarItem.tooltip = new vscode.MarkdownString(
      `**Sponsored** · ${ad.displayUrl}\n\n*Click to open · Displayed by Ad-Alt*`,
    );
    this.statusBarItem.command = {
      command: "ad-alt._handleAdClick",
      title: "Open sponsored link",
      arguments: [ad.adDecisionId],
    };
    this.statusBarItem.backgroundColor = undefined; // no highlight colour
    this.statusBarItem.show();
  }

  showSignedOut(): void {
    this.statusBarItem.text = "$(key) Ad-Alt: Sign in";
    this.statusBarItem.tooltip = "Sign in to Ad-Alt to start earning";
    this.statusBarItem.command = "ad-alt.signIn";
    this.statusBarItem.show();
  }

  showEarning(amountText: string): void {
    this.statusBarItem.text = `$(check) Ad-Alt ${amountText}`;
    this.statusBarItem.tooltip = "Ad-Alt: Earning credited";
    this.statusBarItem.command = "ad-alt.showEarnings";
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
