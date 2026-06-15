import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — PromptProfit",
  description: "PromptProfit Terms of Service.",
};

export default function TermsPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-16">
      <Link href="/" className="text-indigo-400 text-sm hover:underline mb-8 block">
        ← Back to home
      </Link>

      <h1 className="text-4xl font-bold mb-4">Terms of Service</h1>
      <p className="text-gray-400 mb-12 text-sm">Last updated: June 2026 · Version 1.0</p>

      <div className="space-y-10 text-gray-300 leading-relaxed">
        <section>
          <h2 className="text-xl font-semibold text-white mb-3">1. Acceptance</h2>
          <p>
            By installing the PromptProfit VS Code extension or using the PromptProfit web
            platform, you agree to these Terms of Service. If you do not agree, do not use
            the service.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">2. Service Description</h2>
          <p>
            PromptProfit displays a single sponsored text message in your VS Code status bar
            during AI assistant wait-states. Participation is entirely opt-in. You may
            disable the service at any time from the extension settings.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">3. Eligibility</h2>
          <p>
            You must be at least 18 years old and able to form a legally binding contract
            to use PromptProfit. The service is currently available to developers worldwide
            subject to applicable laws and regulations.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">4. Earnings and Payouts</h2>
          <p>
            Earnings are calculated based on verified, non-fraudulent impressions as
            described in the earnings documentation. PromptProfit reserves the right to
            withhold payment for impressions determined to be fraudulent. Payout methods
            and minimum thresholds are subject to change with 30 days notice.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">5. Privacy</h2>
          <p>
            Your privacy is fundamental to how PromptProfit is designed. Please review our{" "}
            <Link href="/privacy" className="text-indigo-400 hover:underline">
              Privacy Policy
            </Link>{" "}
            for the complete technical specification of what data we collect and what we
            never collect.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">6. Prohibited Conduct</h2>
          <p>You agree not to:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1 text-gray-400">
            <li>Artificially inflate impression counts through automation</li>
            <li>Misrepresent your identity or device information</li>
            <li>Reverse-engineer the impression tracking or fraud detection systems</li>
            <li>Use the service in violation of any applicable law</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">7. Termination</h2>
          <p>
            PromptProfit may suspend or terminate your account if you violate these terms
            or engage in fraudulent activity. You may stop using the service at any time
            by disabling or uninstalling the extension.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">8. Disclaimer</h2>
          <p>
            THE SERVICE IS PROVIDED &quot;AS IS&quot; WITHOUT WARRANTIES OF ANY KIND.
            PROMPTPROFIT SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
            DAMAGES ARISING FROM YOUR USE OF THE SERVICE.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">9. Contact</h2>
          <p>
            Questions about these terms?{" "}
            <a href="mailto:legal@promptprofit.dev" className="text-indigo-400 hover:underline">
              legal@promptprofit.dev
            </a>
          </p>
        </section>
      </div>
    </main>
  );
}
