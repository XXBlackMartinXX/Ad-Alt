import * as vscode from "vscode";
import { randomUUID } from "crypto";
import { ApiClient } from "./api-client";
import { AdStatusBar } from "./status-bar";
import { EventQueue } from "./event-queue";
import { AiStatusBarAdapter } from "./adapters/ai-status-bar.adapter";
import { MockAdapter } from "./adapters/mock.adapter";
import { getOrCreateDeviceId } from "./device-id";
import type { IWaitStateAdapter, WaitStateEvent } from "./adapters/types";

const EXTENSION_VERSION = "0.1.0";
const API_KEY_SECRET = "ad-alt.apiKey";
const FLAGS_CACHE_KEY = "ad-alt.flagsCache";
const FLAGS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const CONSENT_TEXT =
  `Ad-Alt will show one sponsored text line in your status bar while your AI coding assistant is thinking.\n\n` +
  `What we collect: An anonymous device ID, timing of AI wait-states, and whether you view or click an ad.\n\n` +
  `What we NEVER collect: Your source code, file names, project structure, AI prompts, AI responses, or any workspace data.\n\n` +
  `You can disable this at any time via the Command Palette → "Ad-Alt: Disable".`;

type FlagsCache = {
  flags: {
    killSwitchEnabled: boolean;
    disabledAdapters: string[];
    flags: Record<string, boolean>;
  };
  fetchedAt: number;
};

export class AdAltController {
  private apiClient!: ApiClient;
  private statusBar!: AdStatusBar;
  private eventQueue!: EventQueue;
  private adapter: IWaitStateAdapter | undefined;
  private deviceId = "";
  private readonly sessionId = randomUUID();
  private sequenceNumber = 0;
  private disposables: vscode.Disposable[] = [];
  private currentAdDecisionId: string | undefined;
  private viewabilityTimer: NodeJS.Timeout | undefined;
  private isKillSwitched = false;

  constructor(private readonly context: vscode.ExtensionContext) {}

  // ---------------------------------------------------------------------------
  // Public lifecycle
  // ---------------------------------------------------------------------------

  async initialize(): Promise<void> {
    const config = vscode.workspace.getConfiguration("ad-alt");
    const apiUrl = config.get<string>("apiUrl") ?? "https://api.adalt.dev";

    this.deviceId = await getOrCreateDeviceId(this.context);
    const apiKey = await this.context.secrets.get(API_KEY_SECRET);

    this.apiClient = new ApiClient(apiUrl, apiKey);
    this.statusBar = new AdStatusBar();
    this.eventQueue = new EventQueue(this.apiClient);

    // Register disposables with the extension context
    this.context.subscriptions.push(this.statusBar, this.eventQueue);

    // Register the internal click-handler command
    this.context.subscriptions.push(
      vscode.commands.registerCommand("ad-alt._handleAdClick", (decisionId: string) => {
        void this.handleAdClick(decisionId);
      }),
    );

    // Fetch feature flags (fails safely)
    await this.refreshFlags();

    if (this.isKillSwitched) {
      void vscode.window.showInformationMessage(
        "Ad-Alt is temporarily unavailable. Please check for updates.",
      );
      return;
    }

    const enabled = config.get<boolean>("enabled") ?? false;
    if (enabled && apiKey) {
      this.startAdapter();
    } else if (!apiKey) {
      this.statusBar.showSignedOut();
    }
  }

  async enable(): Promise<void> {
    const choice = await vscode.window.showInformationMessage(
      CONSENT_TEXT,
      { modal: true },
      "Enable Ad-Alt",
      "Cancel",
    );

    if (choice !== "Enable Ad-Alt") return;

    const apiKey = await this.context.secrets.get(API_KEY_SECRET);
    if (!apiKey) {
      const signIn = await vscode.window.showInformationMessage(
        "You need to sign in first to enable Ad-Alt.",
        "Sign In",
      );
      if (signIn === "Sign In") await this.signIn();
      return;
    }

    await vscode.workspace
      .getConfiguration("ad-alt")
      .update("enabled", true, vscode.ConfigurationTarget.Global);
    this.startAdapter();
    void vscode.window.showInformationMessage(
      "Ad-Alt enabled. You'll see sponsored moments during AI wait-states.",
    );
  }

  async disable(): Promise<void> {
    await vscode.workspace
      .getConfiguration("ad-alt")
      .update("enabled", false, vscode.ConfigurationTarget.Global);
    this.stopAdapter();
    this.statusBar.hide();
    void vscode.window.showInformationMessage(
      "Ad-Alt disabled. No sponsored moments will be shown.",
    );
  }

  async signIn(): Promise<void> {
    const config = vscode.workspace.getConfiguration("ad-alt");
    const rawApiUrl = config.get<string>("apiUrl") ?? "https://api.adalt.dev";
    // Convert e.g. https://api.adalt.dev → https://adalt.dev
    const dashboardBase = rawApiUrl.replace(/^https?:\/\/api\./, "https://");
    const dashboardUrl = `${dashboardBase}/dashboard/api-key`;

    await vscode.env.openExternal(vscode.Uri.parse(dashboardUrl));

    const key = await vscode.window.showInputBox({
      prompt: "Paste your Ad-Alt API key from the dashboard",
      password: true,
      placeHolder: "aak_...",
      validateInput: (v) => (v.length < 10 ? "Key looks too short" : undefined),
    });

    if (!key) return;

    await this.context.secrets.store(API_KEY_SECRET, key);
    this.apiClient.setApiKey(key);
    void vscode.window.showInformationMessage(
      "Signed in to Ad-Alt! Run 'Ad-Alt: Enable' to start earning.",
    );
  }

  async signOut(): Promise<void> {
    await this.context.secrets.delete(API_KEY_SECRET);
    this.stopAdapter();
    this.statusBar.showSignedOut();
    void vscode.window.showInformationMessage("Signed out of Ad-Alt.");
  }

  showEarnings(): void {
    const config = vscode.workspace.getConfiguration("ad-alt");
    const rawApiUrl = config.get<string>("apiUrl") ?? "https://api.adalt.dev";
    const dashboardBase = rawApiUrl.replace(/^https?:\/\/api\./, "https://");
    const dashboardUrl = `${dashboardBase}/dashboard/earnings`;
    void vscode.env.openExternal(vscode.Uri.parse(dashboardUrl));
  }

  dispose(): void {
    this.stopAdapter();
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }

  // ---------------------------------------------------------------------------
  // Adapter management
  // ---------------------------------------------------------------------------

  private startAdapter(): void {
    if (this.adapter) return;
    if (this.isKillSwitched) return;

    const config = vscode.workspace.getConfiguration("ad-alt");
    const adapterName = config.get<string>("adapter") ?? "ai_status_bar";

    this.adapter = adapterName === "mock" ? new MockAdapter() : new AiStatusBarAdapter();

    this.adapter.activate(this.context);

    this.disposables.push(
      this.adapter.onWaitStateStart((event) => {
        void this.onWaitStateStart(event);
      }),
      this.adapter.onWaitStateEnd(() => {
        this.onWaitStateEnd();
      }),
    );
  }

  private stopAdapter(): void {
    this.adapter?.dispose();
    this.adapter = undefined;
    this.clearViewabilityTimer();
  }

  // ---------------------------------------------------------------------------
  // Wait-state event handlers
  // ---------------------------------------------------------------------------

  private async onWaitStateStart(event: WaitStateEvent): Promise<void> {
    if (this.isKillSwitched) return;

    const decision = await this.apiClient.requestAd({
      deviceId: this.deviceId,
      adapterName: event.adapterName,
      extensionVersion: EXTENSION_VERSION,
    });

    if (!decision) return;

    this.currentAdDecisionId = decision.adDecisionId;

    // Impression requested (privacy-safe: no code / file / prompt data)
    this.eventQueue.enqueue({
      eventId: randomUUID(),
      eventType: "impression_requested",
      deviceId: this.deviceId,
      sessionId: this.sessionId,
      extensionVersion: EXTENSION_VERSION,
      adapterName: event.adapterName,
      clientTimestamp: new Date().toISOString(),
      sequenceNumber: this.sequenceNumber++,
      adDecisionId: decision.adDecisionId,
      campaignId: decision.campaignId,
      creativeId: decision.creativeId,
    });

    // Display the ad
    this.statusBar.showAd({
      headline: decision.headline,
      displayUrl: decision.displayUrl,
      adDecisionId: decision.adDecisionId,
    });

    // Impression rendered
    const renderedAt = new Date().toISOString();
    this.eventQueue.enqueue({
      eventId: randomUUID(),
      eventType: "impression_rendered",
      deviceId: this.deviceId,
      sessionId: this.sessionId,
      extensionVersion: EXTENSION_VERSION,
      adapterName: event.adapterName,
      clientTimestamp: new Date().toISOString(),
      sequenceNumber: this.sequenceNumber++,
      adDecisionId: decision.adDecisionId,
      renderedAt,
    });

    // Viewability timer — fires after 5 s of continuous display
    const renderTime = Date.now();
    this.viewabilityTimer = setTimeout(() => {
      this.viewabilityTimer = undefined;
      const displayedDurationMs = Date.now() - renderTime;
      this.eventQueue.enqueue({
        eventId: randomUUID(),
        eventType: "viewability_threshold_met",
        deviceId: this.deviceId,
        sessionId: this.sessionId,
        extensionVersion: EXTENSION_VERSION,
        adapterName: event.adapterName,
        clientTimestamp: new Date().toISOString(),
        sequenceNumber: this.sequenceNumber++,
        adDecisionId: decision.adDecisionId,
        displayedDurationMs,
        thresholdMs: 5000,
      });
    }, 5000);
  }

  private onWaitStateEnd(): void {
    this.clearViewabilityTimer();
    this.statusBar.hide();
    this.currentAdDecisionId = undefined;
  }

  // ---------------------------------------------------------------------------
  // Click handling
  // ---------------------------------------------------------------------------

  private async handleAdClick(adDecisionId: string): Promise<void> {
    const config = vscode.workspace.getConfiguration("ad-alt");
    const adapterName = config.get<string>("adapter") ?? "ai_status_bar";

    // Send click event BEFORE navigating
    this.eventQueue.enqueue({
      eventId: randomUUID(),
      eventType: "click",
      deviceId: this.deviceId,
      sessionId: this.sessionId,
      extensionVersion: EXTENSION_VERSION,
      adapterName,
      clientTimestamp: new Date().toISOString(),
      sequenceNumber: this.sequenceNumber++,
      adDecisionId,
      // creativeId resolved server-side via adDecisionId
    });

    // Open via server-side redirect so raw destination URL is never exposed to client
    const apiUrl = config.get<string>("apiUrl") ?? "https://api.adalt.dev";
    const clickUrl = `${apiUrl}/v1/ads/click/${adDecisionId}`;
    await vscode.env.openExternal(vscode.Uri.parse(clickUrl));
  }

  // ---------------------------------------------------------------------------
  // Feature flags
  // ---------------------------------------------------------------------------

  private async refreshFlags(): Promise<void> {
    const cached = this.context.globalState.get<FlagsCache>(FLAGS_CACHE_KEY);
    if (cached && Date.now() - cached.fetchedAt < FLAGS_CACHE_TTL_MS) {
      this.isKillSwitched = cached.flags.killSwitchEnabled ?? false;
      return;
    }

    const flags = await this.apiClient.getFlags();
    if (flags) {
      await this.context.globalState.update(FLAGS_CACHE_KEY, {
        flags,
        fetchedAt: Date.now(),
      } satisfies FlagsCache);
      this.isKillSwitched = flags.killSwitchEnabled ?? false;
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private clearViewabilityTimer(): void {
    if (this.viewabilityTimer) {
      clearTimeout(this.viewabilityTimer);
      this.viewabilityTimer = undefined;
    }
  }
}
