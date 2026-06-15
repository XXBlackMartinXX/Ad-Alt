"use client";

import Link from "next/link";
import { useState } from "react";

type CampaignStatus = "draft" | "pending_review" | "active" | "paused" | "exhausted" | "archived";

type Campaign = {
  id: string;
  name: string;
  status: CampaignStatus;
  budgetMicrocents: number;
  spentMicrocents: number;
  cpmBidMicrocents: number;
  impressionCount: number;
  clickCount: number;
  createdAt: string;
};

const MOCK_CAMPAIGNS: Campaign[] = [
  {
    id: "cmp_1",
    name: "Acme CI — Developer Outreach",
    status: "active",
    budgetMicrocents: 50_000_000,
    spentMicrocents: 12_400_000,
    cpmBidMicrocents: 5_000_000,
    impressionCount: 12400,
    clickCount: 58,
    createdAt: "2026-06-01T00:00:00Z",
  },
];

const statusBadge: Record<CampaignStatus, string> = {
  draft: "badge-gray",
  pending_review: "badge-yellow",
  active: "badge-green",
  paused: "badge-yellow",
  exhausted: "badge-red",
  archived: "badge-gray",
};

function formatMicrocents(mc: number) {
  return `$${(mc / 1_000_000).toFixed(2)}`;
}

export default function CampaignsPage() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    budgetDollars: "",
    cpmBid: "",
    headline: "",
    body: "",
    displayUrl: "",
    clickUrl: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    // In production: POST to /api/campaigns
    await new Promise(r => setTimeout(r, 800));
    setSubmitting(false);
    setSubmitted(true);
    setShowForm(false);
  }

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <Link href="/dashboard" className="text-sm text-gray-500 hover:text-white mb-6 block">
        ← Dashboard
      </Link>

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Campaigns</h1>
          <p className="text-gray-400 text-sm mt-1">
            All creatives are reviewed by our team before serving. Text only — no images or scripts.
          </p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          + New campaign
        </button>
      </div>

      {submitted && (
        <div className="card border-green-800/50 mb-6">
          <p className="text-green-400 font-semibold">✓ Campaign submitted for review</p>
          <p className="text-gray-400 text-sm mt-1">
            Our team will review your creative within 24 hours. You&apos;ll receive an email when it&apos;s approved.
          </p>
        </div>
      )}

      {showForm && (
        <div className="card mb-8 border-indigo-800/50">
          <h2 className="font-semibold text-lg mb-6">New campaign</h2>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="label">Campaign name</label>
                <input
                  className="input"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Acme CI — Developer Outreach"
                  required
                />
              </div>
              <div>
                <label className="label">Total budget (USD)</label>
                <input
                  className="input"
                  type="number"
                  min="1"
                  step="0.01"
                  value={form.budgetDollars}
                  onChange={e => setForm(f => ({ ...f, budgetDollars: e.target.value }))}
                  placeholder="e.g. 50.00"
                  required
                />
              </div>
            </div>

            <div>
              <label className="label">CPM bid (USD per 1,000 impressions)</label>
              <input
                className="input"
                type="number"
                min="0.10"
                step="0.01"
                value={form.cpmBid}
                onChange={e => setForm(f => ({ ...f, cpmBid: e.target.value }))}
                placeholder="e.g. 5.00 — minimum $0.10"
                required
              />
              <p className="text-xs text-gray-500 mt-1">Higher bids increase your ad&apos;s priority in the queue.</p>
            </div>

            <hr className="border-gray-800" />
            <h3 className="font-medium">Ad creative — text only</h3>

            <div>
              <label className="label">Headline (max 80 characters)</label>
              <input
                className="input"
                maxLength={80}
                value={form.headline}
                onChange={e => setForm(f => ({ ...f, headline: e.target.value }))}
                placeholder="e.g. Ship faster with Acme CI — 10-second builds"
                required
              />
              <p className="text-xs text-gray-500 mt-1">{form.headline.length}/80 characters</p>
            </div>

            <div>
              <label className="label">Body (optional, max 140 characters)</label>
              <input
                className="input"
                maxLength={140}
                value={form.body}
                onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                placeholder="Optional additional context for the developer"
              />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="label">Display URL (max 50 chars)</label>
                <input
                  className="input"
                  maxLength={50}
                  value={form.displayUrl}
                  onChange={e => setForm(f => ({ ...f, displayUrl: e.target.value }))}
                  placeholder="acme.example.com"
                  required
                />
              </div>
              <div>
                <label className="label">Click URL (must be HTTPS)</label>
                <input
                  className="input"
                  type="url"
                  value={form.clickUrl}
                  onChange={e => setForm(f => ({ ...f, clickUrl: e.target.value }))}
                  placeholder="https://acme.example.com/developers"
                  required
                />
              </div>
            </div>

            <div className="card border-yellow-800/40 text-sm text-gray-400">
              <strong className="text-yellow-400">Review required:</strong> All creatives are
              manually reviewed before serving. Approval typically takes under 24 hours.
              We reject ads that are misleading, unsafe, or irrelevant to developers.
            </div>

            <div className="flex gap-3">
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? "Submitting..." : "Submit for review"}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Campaign list */}
      {MOCK_CAMPAIGNS.length === 0 ? (
        <div className="card text-center py-16">
          <p className="text-gray-400 text-lg mb-4">No campaigns yet</p>
          <p className="text-gray-500 text-sm">Create your first campaign to reach developers during AI wait-states.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {MOCK_CAMPAIGNS.map((c) => (
            <div key={c.id} className="card">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold">{c.name}</h3>
                    <span className={`badge ${statusBadge[c.status]}`}>{c.status}</span>
                  </div>
                  <p className="text-xs text-gray-500 font-mono mt-0.5">{c.id}</p>
                </div>
                <div className="text-right text-sm text-gray-400">
                  Created {new Date(c.createdAt).toLocaleDateString()}
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                <div>
                  <p className="label">Budget</p>
                  <p>{formatMicrocents(c.budgetMicrocents)}</p>
                </div>
                <div>
                  <p className="label">Spent</p>
                  <p>{formatMicrocents(c.spentMicrocents)}</p>
                </div>
                <div>
                  <p className="label">CPM bid</p>
                  <p>{formatMicrocents(c.cpmBidMicrocents)}</p>
                </div>
                <div>
                  <p className="label">Impressions</p>
                  <p>{c.impressionCount.toLocaleString()}</p>
                </div>
                <div>
                  <p className="label">Clicks</p>
                  <p>{c.clickCount.toLocaleString()}</p>
                </div>
              </div>

              {/* Budget progress */}
              <div className="mt-4">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Budget used</span>
                  <span>{Math.round((c.spentMicrocents / c.budgetMicrocents) * 100)}%</span>
                </div>
                <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full"
                    style={{ width: `${Math.min(100, (c.spentMicrocents / c.budgetMicrocents) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
