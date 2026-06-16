import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "API Key — PromptProfit",
  description: "Generate and manage your PromptProfit API key for the VS Code extension.",
};

export default function ApiKeyPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-16">
      <Link href="/dashboard" className="text-indigo-400 text-sm hover:underline mb-8 block">
        ← Back to dashboard
      </Link>

      <h1 className="text-3xl font-bold mb-2">API Key</h1>
      <p className="text-gray-400 mb-10">
        Your API key authenticates the VS Code extension with PromptProfit. Treat it like a password.
      </p>

      {/* Step-by-step for development / pre-auth MVP */}
      <div className="space-y-6">
        <div className="card border-indigo-800/50">
          <h2 className="font-semibold text-lg mb-3">Getting your API key</h2>
          <ol className="space-y-4 text-gray-300 text-sm">
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">1</span>
              <div>
                <p className="font-medium text-white mb-1">Sign in to PromptProfit</p>
                <p className="text-gray-400">Use the Sign In button in the top navigation to authenticate with GitHub or Google.</p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">2</span>
              <div>
                <p className="font-medium text-white mb-1">Generate your key</p>
                <p className="text-gray-400">Click &quot;Generate new API key&quot; below. The key is shown exactly once — save it immediately.</p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">3</span>
              <div>
                <p className="font-medium text-white mb-1">Paste it into VS Code</p>
                <p className="text-gray-400">
                  Switch back to VS Code. The extension will prompt you to paste the key.
                  It&apos;s stored securely in VS Code&apos;s encrypted secret storage and never transmitted.
                </p>
              </div>
            </li>
          </ol>
        </div>

        {/* Development mode notice */}
        <div className="card border-yellow-800/50 bg-yellow-950/20">
          <div className="flex items-start gap-3">
            <span className="text-yellow-400 text-xl">⚠</span>
            <div>
              <h3 className="font-semibold text-yellow-300 mb-1">Authentication coming soon</h3>
              <p className="text-gray-400 text-sm">
                Full OAuth sign-in is not yet active in this MVP build. For local development,
                generate an API key via the CLI:
              </p>
              <pre className="mt-3 bg-gray-900 rounded p-3 text-xs text-gray-200 overflow-x-auto">
{`# Start the API and seed the database first, then:
curl -s -X POST http://localhost:3001/v1/auth/exchange \\
  -H "Content-Type: application/json" \\
  -d '{
    "deviceId": "dev_local_test",
    "userId": "<your-user-uuid-from-seed>",
    "keyName": "Local dev key"
  }' | jq '.data.apiKey'`}
              </pre>
              <p className="text-gray-500 text-xs mt-2">
                The raw API key is returned exactly once. The server only stores a SHA-256 hash.
              </p>
            </div>
          </div>
        </div>

        {/* Key management placeholder */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Your API keys</h2>
            <button
              disabled
              className="btn-primary text-sm opacity-50 cursor-not-allowed"
              title="Sign in to generate a key"
            >
              Generate new key
            </button>
          </div>
          <div className="text-center py-8 text-gray-500 text-sm">
            <p>Sign in to view and manage your API keys.</p>
            <Link href="/" className="text-indigo-400 hover:underline mt-2 inline-block">
              Return to home →
            </Link>
          </div>
        </div>

        {/* Security note */}
        <div className="card border-green-900/50">
          <div className="flex items-start gap-3">
            <span className="text-green-400 text-xl">🔒</span>
            <div>
              <h3 className="font-semibold mb-1">Security</h3>
              <ul className="text-gray-400 text-sm space-y-1">
                <li className="flex items-start gap-2"><span className="text-green-400 mt-0.5">✓</span>API keys are hashed (SHA-256) before storage — we cannot recover them</li>
                <li className="flex items-start gap-2"><span className="text-green-400 mt-0.5">✓</span>Keys are stored in VS Code&apos;s encrypted secret storage, not in settings</li>
                <li className="flex items-start gap-2"><span className="text-green-400 mt-0.5">✓</span>Revoke any key at any time from this page</li>
                <li className="flex items-start gap-2"><span className="text-green-400 mt-0.5">✓</span>Keys are scoped to your account only</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
