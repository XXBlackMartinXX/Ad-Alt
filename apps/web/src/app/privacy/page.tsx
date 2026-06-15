import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Ad-Alt",
  description: "Ad-Alt privacy policy and telemetry specification. Exactly what we collect and what we never collect.",
};

export default function PrivacyPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-16">
      <Link href="/" className="text-indigo-400 text-sm hover:underline mb-8 block">
        ← Back to home
      </Link>

      <h1 className="text-4xl font-bold mb-4">Privacy Policy</h1>
      <p className="text-gray-400 mb-12 text-sm">Last updated: June 2026 · Version 1.0</p>

      <div className="space-y-10">
        <section>
          <h2 className="text-2xl font-semibold mb-4 text-indigo-300">The short version</h2>
          <div className="card border-green-900/50">
            <p className="font-semibold mb-3">We never collect:</p>
            <ul className="text-gray-300 text-sm space-y-1.5">
              {[
                "Your source code or file contents",
                "File names, paths, or project structure",
                "AI prompts you write",
                "AI responses you receive",
                "Terminal contents",
                "Git remotes or repository names",
                "Environment variables or secrets",
                "Chat history with any AI assistant",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="text-red-400 mt-0.5 font-bold">✗</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">What we do collect</h2>
          <div className="space-y-4 text-sm text-gray-300 leading-relaxed">
            <div className="card">
              <h3 className="font-semibold text-white mb-2">Anonymous device identifier</h3>
              <p>
                A randomly generated ID stored securely in VS Code&apos;s SecretStorage. It is not derived
                from your machine ID, username, hostname, or any personally identifiable information.
                You can rotate it by reinstalling the extension. We use this to prevent multi-account
                abuse, not to identify you.
              </p>
            </div>
            <div className="card">
              <h3 className="font-semibold text-white mb-2">Wait-state timing signals</h3>
              <p>
                Timestamps of when our extension detects an AI wait-state began, and when it ended.
                We do <strong>not</strong> record what you typed, what the AI said, or why there was a pause.
                We only record that a pause occurred.
              </p>
            </div>
            <div className="card">
              <h3 className="font-semibold text-white mb-2">Ad viewability signals</h3>
              <p>
                How long a sponsored message was displayed (in milliseconds) and whether you clicked on it.
                Click events do not include any context about your work.
              </p>
            </div>
            <div className="card">
              <h3 className="font-semibold text-white mb-2">Account data</h3>
              <p>
                If you create an account: your email address, OAuth provider name, and payout email
                (if you choose to configure one). We use email only for account management and payout processing.
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">Exact telemetry schema</h2>
          <p className="text-gray-400 text-sm mb-4">
            Every event sent from the extension to our server follows one of these exact schemas.
            Nothing else is ever sent.
          </p>
          <div className="card bg-gray-950 font-mono text-xs overflow-x-auto">
            <pre className="text-gray-300 leading-relaxed">{`// All events share these base fields:
{
  eventId: string,         // UUID, idempotency key
  eventType: string,       // one of the 4 types below
  deviceId: string,        // pseudonymous, not linked to identity
  sessionId: string,       // rotated hourly, UUID
  userId: string?,         // only if signed in
  extensionVersion: string,
  adapterName: string,     // "ai_status_bar" | "mock"
  clientTimestamp: string, // ISO 8601
  sequenceNumber: number   // monotonic within session
}

// impression_requested: AI wait-state detected, ad requested
+ adDecisionId, campaignId, creativeId

// impression_rendered: ad text was displayed
+ adDecisionId, renderedAt

// viewability_threshold_met: ad displayed >= 5 seconds
+ adDecisionId, displayedDurationMs, thresholdMs

// click: developer clicked the sponsored link
+ adDecisionId, creativeId

// ABSENT from all events:
// sourceCode, filePath, fileName, promptText, aiResponse,
// chatHistory, terminalContent, projectStructure, workspacePath,
// gitRemote, envVariables, apiKey, secret, password, token`}</pre>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">Data retention</h2>
          <div className="space-y-2 text-sm text-gray-300">
            {[
              ["Event data (impressions, clicks)", "90 days, then anonymized"],
              ["Ledger entries", "7 years (financial regulation requirement)"],
              ["Account data", "Until deletion requested"],
              ["IP addresses", "Never stored (we hash for fraud signals, discard within 24h)"],
              ["Device IDs", "Until you rotate or delete account"],
              ["Admin audit logs", "3 years"],
            ].map(([type, policy]) => (
              <div key={type} className="flex justify-between py-2 border-b border-gray-800">
                <span>{type}</span>
                <span className="text-gray-500 text-right">{policy}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">Your rights</h2>
          <div className="text-sm text-gray-300 space-y-3 leading-relaxed">
            <p>
              <strong className="text-white">Export:</strong> Request a full export of all data
              associated with your account at any time via the dashboard.
            </p>
            <p>
              <strong className="text-white">Delete:</strong> Request account deletion. We will
              delete your account, device records, and personal data within 30 days. Anonymized
              ledger entries may be retained for financial compliance.
            </p>
            <p>
              <strong className="text-white">Opt out:</strong> Disable Ad-Alt at any time via
              the VS Code command palette. Disabling stops all event transmission immediately.
            </p>
            <p>
              To exercise any right, email{" "}
              <a href="mailto:privacy@adalt.dev" className="text-indigo-400 hover:underline">
                privacy@adalt.dev
              </a>
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">Contact</h2>
          <p className="text-gray-400 text-sm">
            Questions about this policy:{" "}
            <a href="mailto:privacy@adalt.dev" className="text-indigo-400 hover:underline">
              privacy@adalt.dev
            </a>
          </p>
        </section>
      </div>
    </main>
  );
}
