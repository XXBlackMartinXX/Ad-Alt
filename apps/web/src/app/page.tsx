import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen">
      {/* Nav */}
      <nav className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-indigo-400 font-bold text-xl">Ad-Alt</span>
            <span className="badge badge-gray text-xs">Beta</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="text-sm text-gray-400 hover:text-white transition-colors">
              Privacy
            </Link>
            <Link href="/dashboard" className="btn-secondary text-sm">
              Dashboard
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 pt-24 pb-16 text-center">
        <div className="badge badge-blue mb-6 text-sm px-4 py-1">
          Privacy-first · Opt-in · Transparent
        </div>
        <h1 className="text-5xl font-bold tracking-tight mb-6">
          Your AI wait-states,{" "}
          <span className="text-indigo-400">your earnings</span>
        </h1>
        <p className="text-xl text-gray-400 mb-10 max-w-2xl mx-auto leading-relaxed">
          Ad-Alt shows a single tasteful sponsored text line in your VS Code status bar
          while your AI assistant is thinking. You earn a share of the advertising
          revenue. No code or prompts ever leave your machine.
        </p>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <Link href="/dashboard" className="btn-primary text-base px-6 py-3">
            Get started free
          </Link>
          <Link href="/privacy" className="btn-secondary text-base px-6 py-3">
            Read privacy policy
          </Link>
        </div>
      </section>

      {/* Demo strip */}
      <section className="max-w-4xl mx-auto px-6 py-8">
        <div className="card border-indigo-800/50 bg-gray-950">
          <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">VS Code status bar preview</p>
          <div className="flex items-center gap-3 font-mono text-sm">
            <span className="text-gray-500">⚙ AI thinking...</span>
            <span className="text-gray-600">|</span>
            <span className="text-indigo-300">📢 Ship faster with Acme CI — acme.example.com</span>
            <span className="badge badge-gray ml-auto text-xs">Sponsored · Ad-Alt</span>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <h2 className="text-3xl font-bold text-center mb-12">How it works</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              step: "1",
              title: "Install & opt in",
              body: "Install the VS Code extension. Read the privacy policy. If you agree, opt in with one click. You're in control.",
            },
            {
              step: "2",
              title: "Earn during wait-states",
              body: "When your AI assistant is processing, a sponsored text line appears in your status bar. After 5 seconds of display, you earn a micro-payment.",
            },
            {
              step: "3",
              title: "Get paid",
              body: "Your earnings accumulate in a transparent ledger you can audit at any time. Request a payout when you reach the minimum threshold.",
            },
          ].map((item) => (
            <div key={item.step} className="card">
              <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-sm font-bold mb-4">
                {item.step}
              </div>
              <h3 className="font-semibold text-lg mb-2">{item.title}</h3>
              <p className="text-gray-400 text-sm leading-relaxed">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Privacy callout */}
      <section className="max-w-4xl mx-auto px-6 py-10">
        <div className="card border-green-900/50">
          <div className="flex items-start gap-4">
            <span className="text-3xl">🔒</span>
            <div>
              <h3 className="font-semibold text-lg mb-2">Privacy by construction</h3>
              <ul className="text-gray-400 text-sm space-y-1">
                {[
                  "Your source code never leaves your machine",
                  "File names and paths are never transmitted",
                  "AI prompts and responses are never seen",
                  "Project structure and workspace data stay local",
                  "Only anonymous timing signals are sent — and you can audit every one",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="text-green-400 mt-0.5">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
              <Link href="/privacy" className="text-indigo-400 text-sm mt-4 inline-block hover:underline">
                Read the full privacy specification →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* For advertisers */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-3xl font-bold mb-6">For advertisers</h2>
            <p className="text-gray-400 mb-6 leading-relaxed">
              Reach developers when they have a natural moment to read — while waiting
              for AI completions. Text-only creatives keep your brand safe and the
              developer experience respectful.
            </p>
            <ul className="text-gray-400 text-sm space-y-3 mb-8">
              {[
                "CPM-based billing — pay only for verified viewable impressions",
                "All creatives reviewed before serving",
                "Real-time spend dashboard",
                "No tracking pixels or scripts — text only",
                "Daily and total budget caps",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="text-indigo-400 mt-0.5">→</span>
                  {item}
                </li>
              ))}
            </ul>
            <Link href="/dashboard/campaigns" className="btn-primary">
              Create a campaign
            </Link>
          </div>
          <div className="card space-y-4">
            <div>
              <p className="label">Headline</p>
              <p className="text-sm font-mono bg-gray-900 rounded p-2 text-gray-200">
                Ship faster with Acme CI — 10-second builds guaranteed
              </p>
            </div>
            <div>
              <p className="label">Display URL</p>
              <p className="text-sm font-mono bg-gray-900 rounded p-2 text-gray-400">acme.example.com</p>
            </div>
            <div className="flex gap-4 text-sm">
              <div>
                <p className="label">CPM Bid</p>
                <p className="text-white font-semibold">$5.00</p>
              </div>
              <div>
                <p className="label">Status</p>
                <span className="badge badge-green">Active</span>
              </div>
              <div>
                <p className="label">Impressions</p>
                <p className="text-white font-semibold">12,400</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800 px-6 py-10 mt-10">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-gray-500">
          <span>© 2026 Ad-Alt Inc. All rights reserved.</span>
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
            <a href="mailto:support@adalt.dev" className="hover:text-white transition-colors">Support</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
