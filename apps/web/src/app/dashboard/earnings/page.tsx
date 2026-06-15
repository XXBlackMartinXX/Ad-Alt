import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Earnings Ledger — Ad-Alt",
};

// Stub data — production version fetches from API
const entries = [
  { id: "ldg_1", type: "developer_credit", referenceType: "impression", amount: 4_000, createdAt: "2026-06-15T14:30:00Z", description: "Impression earning" },
  { id: "ldg_2", type: "developer_credit", referenceType: "click", amount: 40_000, createdAt: "2026-06-15T14:28:00Z", description: "Click earning" },
  { id: "ldg_3", type: "developer_credit", referenceType: "impression", amount: 4_000, createdAt: "2026-06-15T14:25:00Z", description: "Impression earning" },
  { id: "ldg_4", type: "developer_credit", referenceType: "impression", amount: 4_000, createdAt: "2026-06-15T13:50:00Z", description: "Impression earning" },
  { id: "ldg_5", type: "payout_debit", referenceType: "payout", amount: -500_000, createdAt: "2026-06-14T09:00:00Z", description: "Payout to paypal@example.com" },
];

function formatMicrocents(mc: number): string {
  const sign = mc >= 0 ? "+" : "";
  const dollars = Math.abs(mc) / 1_000_000;
  return `${sign}$${dollars.toFixed(6)}`;
}

export default function EarningsPage() {
  const totalEarned = entries.filter(e => e.amount > 0).reduce((sum, e) => sum + e.amount, 0);
  const totalPaid = Math.abs(entries.filter(e => e.amount < 0).reduce((sum, e) => sum + e.amount, 0));
  const pending = totalEarned - totalPaid;

  return (
    <main className="max-w-4xl mx-auto px-6 py-10">
      <Link href="/dashboard" className="text-sm text-gray-500 hover:text-white mb-6 block">
        ← Dashboard
      </Link>
      <h1 className="text-3xl font-bold mb-2">Earnings Ledger</h1>
      <p className="text-gray-400 text-sm mb-8">
        Every earning event is recorded here. This ledger is your auditable record of all
        impressions, clicks, and payouts associated with your account.
      </p>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="card">
          <p className="label">Total earned</p>
          <p className="text-2xl font-bold">${(totalEarned / 1_000_000).toFixed(4)}</p>
        </div>
        <div className="card">
          <p className="label">Paid out</p>
          <p className="text-2xl font-bold">${(totalPaid / 1_000_000).toFixed(4)}</p>
        </div>
        <div className="card">
          <p className="label">Pending</p>
          <p className="text-2xl font-bold text-indigo-400">${(pending / 1_000_000).toFixed(4)}</p>
        </div>
      </div>

      {/* Ledger table */}
      <div className="card p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-800">
          <h2 className="font-semibold">All entries</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-6 py-3 text-left">Event</th>
                <th className="px-6 py-3 text-left">Type</th>
                <th className="px-6 py-3 text-left">Entry ID</th>
                <th className="px-6 py-3 text-left">Timestamp</th>
                <th className="px-6 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-gray-900/50 transition-colors">
                  <td className="px-6 py-3 font-medium">{entry.description}</td>
                  <td className="px-6 py-3">
                    <span className={`badge ${entry.referenceType === "click" ? "badge-blue" : entry.referenceType === "payout" ? "badge-yellow" : "badge-gray"}`}>
                      {entry.referenceType}
                    </span>
                  </td>
                  <td className="px-6 py-3 font-mono text-xs text-gray-500">{entry.id}</td>
                  <td className="px-6 py-3 text-gray-400">
                    {new Date(entry.createdAt).toLocaleString()}
                  </td>
                  <td className={`px-6 py-3 text-right font-mono font-semibold ${entry.amount >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {formatMicrocents(entry.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6 card border-gray-700">
        <p className="text-xs text-gray-500">
          All amounts shown in USD microcents (µ¢). 1 µ¢ = $0.000001. Ledger entries are
          immutable — corrections are made via reversing entries, never destructive edits.
          This ensures your earnings record is always auditable.
        </p>
      </div>
    </main>
  );
}
