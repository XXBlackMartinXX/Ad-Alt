import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin — Ad-Alt",
};

// Stub data
const pendingCreatives = [
  {
    id: "cre_1",
    campaignId: "cmp_2",
    headline: "Try DevPulse Analytics — Real-time code quality for teams",
    displayUrl: "devpulse.example.com",
    clickUrl: "https://devpulse.example.com/signup",
    submittedAt: "2026-06-15T10:00:00Z",
    advertiserEmail: "ads@devpulse.example.com",
  },
];

const fraudQueue = [
  {
    id: "imp_1",
    deviceId: "dev_abc123",
    fraudScore: 72,
    fraudSignals: ["excessive_impression_rate", "device_velocity_high"],
    status: "fraud_blocked",
    createdAt: "2026-06-15T12:00:00Z",
  },
];

export default function AdminPage() {
  return (
    <main className="max-w-6xl mx-auto px-6 py-10">
      <Link href="/" className="text-sm text-gray-500 hover:text-white mb-6 block">
        ← Home
      </Link>

      <div className="flex items-center gap-3 mb-8">
        <h1 className="text-3xl font-bold">Admin Console</h1>
        <span className="badge badge-red">Admin only</span>
      </div>

      <div className="grid md:grid-cols-4 gap-4 mb-10">
        {[
          { label: "Pending creative review", value: pendingCreatives.length, color: "text-yellow-400" },
          { label: "Fraud queue", value: fraudQueue.length, color: "text-red-400" },
          { label: "Active campaigns", value: 1, color: "text-green-400" },
          { label: "Total developers", value: 42, color: "text-indigo-400" },
        ].map((s) => (
          <div key={s.label} className="card">
            <p className="label">{s.label}</p>
            <p className={`text-3xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Creative review queue */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-4">Creative review queue</h2>
        {pendingCreatives.length === 0 ? (
          <div className="card text-center py-8 text-gray-500">No creatives pending review</div>
        ) : (
          <div className="space-y-4">
            {pendingCreatives.map((c) => (
              <div key={c.id} className="card">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="font-mono text-xs text-gray-500">{c.id}</p>
                    <p className="text-xs text-gray-500">by {c.advertiserEmail}</p>
                  </div>
                  <p className="text-xs text-gray-500">{new Date(c.submittedAt).toLocaleString()}</p>
                </div>

                <div className="space-y-2 mb-4 text-sm">
                  <div>
                    <span className="label">Headline</span>
                    <p className="text-white font-medium">{c.headline}</p>
                  </div>
                  <div>
                    <span className="label">Display URL</span>
                    <p className="text-gray-300">{c.displayUrl}</p>
                  </div>
                  <div>
                    <span className="label">Click URL</span>
                    <p className="text-gray-300 font-mono text-xs">{c.clickUrl}</p>
                  </div>
                </div>

                <div className="card bg-gray-900 text-xs text-gray-400 mb-4">
                  <strong>Status bar preview:</strong>
                  <div className="mt-1 font-mono">
                    📢 {c.headline} — {c.displayUrl}
                  </div>
                </div>

                <div className="flex gap-3">
                  <form action={`/api/admin/creatives/${c.id}/review`} method="POST">
                    <input type="hidden" name="decision" value="approved" />
                    <button type="submit" className="btn-primary text-sm">
                      ✓ Approve
                    </button>
                  </form>
                  <form action={`/api/admin/creatives/${c.id}/review`} method="POST">
                    <input type="hidden" name="decision" value="rejected" />
                    <button type="submit" className="btn-secondary text-sm border-red-800 text-red-400 hover:border-red-600">
                      ✗ Reject
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Fraud review queue */}
      <section>
        <h2 className="text-xl font-semibold mb-4">Fraud review queue</h2>
        {fraudQueue.length === 0 ? (
          <div className="card text-center py-8 text-gray-500">No events pending fraud review</div>
        ) : (
          <div className="space-y-4">
            {fraudQueue.map((item) => (
              <div key={item.id} className="card border-red-900/30">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className="font-mono text-xs text-gray-400">{item.id}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Device: {item.deviceId}</p>
                  </div>
                  <div className="text-right">
                    <span className="badge badge-red">Score: {item.fraudScore}</span>
                  </div>
                </div>

                <div className="mb-3">
                  <p className="label">Signals detected</p>
                  <div className="flex gap-2 flex-wrap mt-1">
                    {item.fraudSignals.map(sig => (
                      <span key={sig} className="badge badge-red text-xs">{sig}</span>
                    ))}
                  </div>
                </div>

                <div className="card bg-gray-900 text-xs text-gray-400 mb-4">
                  <strong>Note:</strong> Fraud signals and scores are visible only to admins.
                  Developers are never shown their exact score to prevent gaming.
                </div>

                <div className="flex gap-3">
                  <button className="btn-secondary text-sm">
                    ✓ Clear (false positive)
                  </button>
                  <button className="btn-secondary text-sm border-red-800 text-red-400">
                    Block device
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
