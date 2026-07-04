/**
 * Fully synthetic wait-state demo. Never spawns a process, never reads any
 * real command/output/file. This is the safe default entry point --
 * `wrap` mode (see wrap.ts) is the only mode that ever touches a real
 * process, and even then only its lifecycle metadata.
 */
import { isAdapterDisabled, type TerminalAdapterFlags } from "./kill-switch.js";
import { buildLifecycleEvent, newSessionId, type LifecycleEvent } from "./lifecycle.js";

export interface DemoOptions {
  adapterId: string;
  flags: TerminalAdapterFlags;
  /** Synthetic wait-state duration in milliseconds. Not derived from anything real. */
  durationMs?: number;
  /** Injectable sleep function so tests never need a real timer. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs one synthetic demo session and returns the full ordered event
 * sequence. When kill-switched, returns only a single kill_switch_active
 * event.
 */
export async function runDemo(options: DemoOptions): Promise<LifecycleEvent[]> {
  const { adapterId, flags } = options;
  const durationMs = options.durationMs ?? 500;
  const sleep = options.sleep ?? defaultSleep;

  if (isAdapterDisabled(adapterId, flags)) {
    return [buildLifecycleEvent({ eventType: "kill_switch_active", adapterId, sessionId: newSessionId() })];
  }

  const sessionId = newSessionId();
  const events: LifecycleEvent[] = [];

  events.push(buildLifecycleEvent({ eventType: "adapter_started", adapterId, sessionId }));
  events.push(buildLifecycleEvent({ eventType: "session_started", adapterId, sessionId }));
  events.push(buildLifecycleEvent({ eventType: "wait_state_started", adapterId, sessionId }));

  await sleep(durationMs);

  events.push(
    buildLifecycleEvent({ eventType: "wait_state_ended", adapterId, sessionId, durationMs }),
  );
  events.push(buildLifecycleEvent({ eventType: "banner_rendered", adapterId, sessionId }));
  events.push(buildLifecycleEvent({ eventType: "banner_closed", adapterId, sessionId }));
  events.push(buildLifecycleEvent({ eventType: "adapter_stopped", adapterId, sessionId }));

  return events;
}
