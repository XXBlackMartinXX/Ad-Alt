import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard — Ad-Alt",
};

// In production this would fetch real data from the API via a server component
async function getDashboardData() {
  return {
    totalEarnedMicrocents: 1_250_000n, // $1.25
    pendingMicrocents: 980_000n,        // $0.98
    impressionsToday: 47,
    clicksToday: 2,
    isOptedIn: true,
    recentEntries: [
      { id: "1", type: "developer_credit", referenceType: "impression", amountMicrocents: 4_000n, createdAt: new Date().toISOString(), description: "Impression earning: abc123" },
      { id: "2", type: "developer_credit", referenceType: "click", amountMicrocents: 40_000n, createdAt: new Date(Date.now() - 60_000).toISOString(), description: "Click earning: def456" },
      { id: "3", type: "developer_credit", referenceType: "impression", amountMicrocents: 4_000n, createdAt: new Date(Date.now() - 120_000).toISOString(), description: "Impression earning: ghi789" },
    ],
  };
}

function formatMicrocents(mc: bigint): string {
  const dollars = Number(mc) / 1_000_000;
  return `$${dollars.toFixed(4)}`;
}

export default async function DashboardPage() {
  const data = await getDashboardData();

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-10">
        <div>
          <Link href="/" className="text-sm text-gray-500 hover:text-white mb-2 block">← Ad-Alt</Link>
          <h1 className="text-3xl font-bold">Developer Dashboard</h1>
        </div>
        <div className="flex gap-3">
          <Link href="/dashboard/campaigns" className="btn-secondary text-sm">
            Advertise
          </Link>
          <Link href="/dashboard/earnings" className="btn-primary text-sm">
            View ledger
          </Link>
        </div>
      </div>

      {!data.isOptedIn && (
        <div className="card border-yellow-800/50 mb-8">
          <div className="flex items-start gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <p className="font-semibold mb-1">You haven&apos;t opted in yet</p>
              <p className="text-gray-400 text-sm mb-3">
                Install the VS Code extension and run &quot;Ad-Alt: Enable&quot; to start earning.
              </p>
              <a
                href="vscode:extension/ad-alt.ad-alt"
                className="btn-primary text-sm inline-block"
              >
                Install VS Code Extension
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Total earned", value: formatMicrocents(data.totalEarnedMicrocents) },
          { label: "Pending payout", value: formatMicrocents(data.pendingMicrocents) },
          { label: "Impressions today", value: data.impressionsToday.toLocaleString() },
          { label: "Clicks today", value: data.clicksToday.toLocaleString() },
        ].map((stat) => (
          <div key={stat.label} className="card">
            <p className="label">{stat.label}</p>
            <p className="text-2xl font-bold text-white mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Status */}
      <div className="card mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-lg">Extension status</h2>
          <span className={`badge ${data.isOptedIn ? "badge-green" : "badge-gray"}`}>
            {data.isOptedIn ? "Active" : "Inactive"}
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="label">Display surface</p>
            <p className="text-gray-200">Status bar</p>
          </div>
          <div>
            <p className="label">Adapter</p>
            <p className="text-gray-200">AI status bar</p>
          </div>
          <div>
            <p className="label">Viewability threshold</p>
            <p className="text-gray-200">5 seconds</p>
          </div>
        </div>
      </div>

      {/* Recent earnings */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-lg">Recent earnings</h2>
          <Link href="/dashboard/earnings" className="text-indigo-400 text-sm hover:underline">
            View all →
          </Link>
        </div>
        <div className="space-y-0">
          {data.recentEntries.map((entry) => (
            <div key={entry.id} className="flex items-center justify-between py-3 border-b border-gray-800 last:border-0">
              <div>
                <p className="text-sm font-medium">
                  {entry.referenceType === "click" ? "Click earning" : "Impression earning"}
                </p>
                <p className="text-xs text-gray-500 font-mono">{entry.id}</p>
              </div>
              <div className="text-right">
                <p className={`text-sm font-semibold ${entry.referenceType === "click" ? "text-green-400" : "text-gray-200"}`}>
                  +{formatMicrocents(entry.amountMicrocents)}
                </p>
                <p className="text-xs text-gray-500">
                  {new Date(entry.createdAt).toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
