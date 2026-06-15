import * as vscode from "vscode";
import { createHash, randomBytes } from "crypto";

const DEVICE_ID_KEY = "ad-alt.deviceId";

export async function getOrCreateDeviceId(context: vscode.ExtensionContext): Promise<string> {
  const existing = await context.secrets.get(DEVICE_ID_KEY);
  if (existing) return existing;

  // Create a pseudonymous ID from random bytes.
  // Does NOT include machine ID, username, hostname, or any identifiable info.
  const random = randomBytes(16).toString("hex");
  const deviceId = `dev_${createHash("sha256").update(random).digest("hex").slice(0, 32)}`;

  await context.secrets.store(DEVICE_ID_KEY, deviceId);
  return deviceId;
}
