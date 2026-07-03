/**
 * Minimal hand-written mock of the `vscode` module surface this extension
 * actually calls. Aliased as the "vscode" module in vitest.config.ts so unit
 * tests can exercise the REAL extension code (AiStatusBarAdapter,
 * PromptProfitController, AdStatusBar) without a running VS Code host.
 *
 * PRIVACY NOTE: every event trigger below fires a zero-argument (or
 * content-free) callback, exactly mirroring how the real extension code
 * consumes these events (it only reacts to an event firing, never reads a
 * payload) -- this mock cannot accidentally exercise a content-reading code
 * path because it never provides content to read.
 *
 * Call resetVscodeMock() in a beforeEach to get a clean slate between tests.
 */

type Listener = () => void;

export class Disposable {
  constructor(private readonly onDispose?: () => void) {}
  dispose(): void {
    this.onDispose?.();
  }
  static from(...disposables: { dispose(): void }[]): Disposable {
    return new Disposable(() => disposables.forEach((d) => d.dispose()));
  }
}

export class MarkdownString {
  constructor(public value: string = "") {}
}

export const StatusBarAlignment = { Left: 1, Right: 2 } as const;
export const ConfigurationTarget = { Global: 1, Workspace: 2, WorkspaceFolder: 3 } as const;

export class Uri {
  private constructor(public raw: string) {}
  static parse(value: string): Uri {
    return new Uri(value);
  }
}

export class MockStatusBarItem {
  text = "";
  tooltip: unknown;
  command: unknown;
  backgroundColor: unknown;
  visible = false;
  show(): void {
    this.visible = true;
  }
  hide(): void {
    this.visible = false;
  }
  dispose(): void {
    this.visible = false;
  }
}

// ---------------------------------------------------------------------------
// Mutable registries -- reset between tests via resetVscodeMock()
// ---------------------------------------------------------------------------

let textDocumentListeners: Listener[] = [];
let textEditorSelectionListeners: Listener[] = [];
let activeTerminalListeners: Listener[] = [];
let registeredCommands = new Map<string, (...args: unknown[]) => unknown>();
let configStore: Record<string, unknown> = {};
let showInformationMessageImpl: (...args: unknown[]) => Promise<string | undefined> = async () =>
  undefined;
let showInputBoxImpl: (...args: unknown[]) => Promise<string | undefined> = async () => undefined;
let openExternalCalls: Uri[] = [];
let createdStatusBarItems: MockStatusBarItem[] = [];

export function resetVscodeMock(): void {
  textDocumentListeners = [];
  textEditorSelectionListeners = [];
  activeTerminalListeners = [];
  registeredCommands = new Map();
  configStore = {};
  showInformationMessageImpl = async () => undefined;
  showInputBoxImpl = async () => undefined;
  openExternalCalls = [];
  createdStatusBarItems = [];
}

/** Simulates any workspace text-document change -- fires with no content. */
export function fireDidChangeTextDocument(): void {
  textDocumentListeners.forEach((l) => l());
}
/** Simulates any editor-selection change -- fires with no content. */
export function fireDidChangeTextEditorSelection(): void {
  textEditorSelectionListeners.forEach((l) => l());
}
/** Simulates an active-terminal focus change -- fires with no content. */
export function fireDidChangeActiveTerminal(): void {
  activeTerminalListeners.forEach((l) => l());
}
export function getRegisteredCommand(id: string): ((...args: unknown[]) => unknown) | undefined {
  return registeredCommands.get(id);
}
export function setConfig(key: string, value: unknown): void {
  configStore[key] = value;
}
export function getConfig(key: string): unknown {
  return configStore[key];
}
export function setShowInformationMessageImpl(fn: typeof showInformationMessageImpl): void {
  showInformationMessageImpl = fn;
}
export function setShowInputBoxImpl(fn: typeof showInputBoxImpl): void {
  showInputBoxImpl = fn;
}
export function getOpenExternalCalls(): Uri[] {
  return openExternalCalls;
}
export function getCreatedStatusBarItems(): MockStatusBarItem[] {
  return createdStatusBarItems;
}

export const workspace = {
  onDidChangeTextDocument(listener: Listener): Disposable {
    textDocumentListeners.push(listener);
    return new Disposable(() => {
      textDocumentListeners = textDocumentListeners.filter((l) => l !== listener);
    });
  },
  getConfiguration(_section?: string) {
    return {
      get<T>(key: string, fallback?: T): T | undefined {
        return key in configStore ? (configStore[key] as T) : fallback;
      },
      update(key: string, value: unknown, _target?: unknown): Promise<void> {
        configStore[key] = value;
        return Promise.resolve();
      },
    };
  },
};

export const window = {
  onDidChangeTextEditorSelection(listener: Listener): Disposable {
    textEditorSelectionListeners.push(listener);
    return new Disposable(() => {
      textEditorSelectionListeners = textEditorSelectionListeners.filter((l) => l !== listener);
    });
  },
  onDidChangeActiveTerminal(listener: Listener): Disposable {
    activeTerminalListeners.push(listener);
    return new Disposable(() => {
      activeTerminalListeners = activeTerminalListeners.filter((l) => l !== listener);
    });
  },
  createStatusBarItem(
    _id?: string,
    _alignment?: unknown,
    _priority?: number,
  ): MockStatusBarItem {
    const item = new MockStatusBarItem();
    createdStatusBarItems.push(item);
    return item;
  },
  showInformationMessage(...args: unknown[]): Promise<string | undefined> {
    return showInformationMessageImpl(...args);
  },
  showInputBox(...args: unknown[]): Promise<string | undefined> {
    return showInputBoxImpl(...args);
  },
};

export const commands = {
  registerCommand(id: string, handler: (...args: unknown[]) => unknown): Disposable {
    registeredCommands.set(id, handler);
    return new Disposable(() => registeredCommands.delete(id));
  },
};

export const env = {
  openExternal(uri: Uri): Promise<boolean> {
    openExternalCalls.push(uri);
    return Promise.resolve(true);
  },
};
