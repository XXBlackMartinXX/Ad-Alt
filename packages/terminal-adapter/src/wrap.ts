/**
 * The only mode in this package that ever spawns a real process. It wraps
 * an explicit, user-supplied command with FULLY INHERITED stdio -- the
 * wrapped process's stdin/stdout/stderr connect directly to the real
 * terminal. This process never creates a pipe for them, so there is no
 * code path here capable of reading their content, even by accident.
 *
 * Only ever observed: process start, process exit code, wall-clock
 * duration. Never the wrapped command's argv, environment, working
 * directory, or any I/O content -- none of that is read, logged, or
 * stored anywhere in this file.
 */
import { spawn } from "node:child_process";
import { isAdapterDisabled, type TerminalAdapterFlags } from "./kill-switch.js";
import {
  buildLifecycleEvent,
  newSessionId,
  type LifecycleEvent,
  type SafeErrorCode,
} from "./lifecycle.js";

export interface WrapOptions {
  adapterId: string;
  flags: TerminalAdapterFlags;
  /** Must be true (from local config) for any lifecycle event to be emitted. */
  enabled: boolean;
  onEvent?: (event: LifecycleEvent) => void;
}

export interface WrapResult {
  exitCode: number;
  events: LifecycleEvent[];
}

function classifyError(err: NodeJS.ErrnoException): SafeErrorCode {
  if (err.code === "ENOENT") return "spawn_enoent";
  if (err.code === "EACCES") return "spawn_eacces";
  return "unknown_safe_error";
}

/**
 * Spawns argv[0] with argv.slice(1) as its arguments. The wrapped command's
 * own behavior (exit code, terminal output, interactivity) is never
 * altered by this function -- it always runs exactly as if invoked
 * directly, because stdio is fully inherited rather than piped.
 */
export function wrapCommand(argv: readonly string[], options: WrapOptions): Promise<WrapResult> {
  const { adapterId, flags, enabled } = options;
  const events: LifecycleEvent[] = [];
  const emit = (event: LifecycleEvent) => {
    events.push(event);
    options.onEvent?.(event);
  };

  const killSwitched = enabled && isAdapterDisabled(adapterId, flags);
  const monitored = enabled && !killSwitched;
  const sessionId = newSessionId();

  if (killSwitched) {
    emit(buildLifecycleEvent({ eventType: "kill_switch_active", adapterId, sessionId }));
  } else if (monitored) {
    emit(buildLifecycleEvent({ eventType: "adapter_started", adapterId, sessionId }));
    emit(buildLifecycleEvent({ eventType: "session_started", adapterId, sessionId }));
    emit(buildLifecycleEvent({ eventType: "wait_state_started", adapterId, sessionId }));
  }

  return new Promise((resolve) => {
    const command = argv[0];
    if (!command) {
      if (monitored) {
        emit(
          buildLifecycleEvent({
            eventType: "error_safe_code_only",
            adapterId,
            sessionId,
            errorCode: "unknown_safe_error",
          }),
        );
      }
      resolve({ exitCode: 1, events });
      return;
    }

    const startedAt = Date.now();
    const child = spawn(command, argv.slice(1), { stdio: "inherit" });

    child.on("error", (err) => {
      if (monitored) {
        emit(
          buildLifecycleEvent({
            eventType: "error_safe_code_only",
            adapterId,
            sessionId,
            errorCode: classifyError(err as NodeJS.ErrnoException),
          }),
        );
      }
      resolve({ exitCode: 1, events });
    });

    child.on("exit", (exitCode) => {
      const durationMs = Date.now() - startedAt;
      const finalCode = exitCode ?? 1;
      if (monitored) {
        emit(
          buildLifecycleEvent({ eventType: "wait_state_ended", adapterId, sessionId, durationMs }),
        );
        emit(
          buildLifecycleEvent({
            eventType: "adapter_stopped",
            adapterId,
            sessionId,
            exitCode: finalCode,
          }),
        );
      }
      resolve({ exitCode: finalCode, events });
    });
  });
}
