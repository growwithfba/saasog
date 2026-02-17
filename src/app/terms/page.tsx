'use client';

import { PageShell } from '@/components/layout/PageShell';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';

export default function TermsPage() {
  const user = useSelector((state: RootState) => state.auth.user);

  return (
    <PageShell>
      <div className="max-w-3xl mx-auto py-8 px-4 sm:px-6">
        {/* Back Button */}
        {user ? (
          <Link
            href="/research"
            className="inline-flex items-center text-slate-400 hover:text-white mb-8 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Research
          </Link>
        ) : (
          <Link
            href="/"
            className="inline-flex items-center text-slate-400 hover:text-white mb-8 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Link>
        )}

        <article className="max-w-none">
          <header className="mb-12">
            <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">
              Terms of Service
            </h1>
            <p className="text-slate-400 text-sm">Last Updated: Feb 10, 2026</p>
          </header>

          <p className="text-slate-300 mb-8 leading-relaxed">
            Welcome to BloomEngine (&quot;Company,&quot; &quot;we,&quot; &quot;our,&quot; or &quot;us&quot;). These Terms of Service (&quot;Terms&quot;) govern your access to and use of the BloomEngine website, application, and related services (collectively, the &quot;Service&quot;).
          </p>
          <p className="text-slate-300 mb-12 leading-relaxed">
            By accessing or using BloomEngine, you agree to be bound by these Terms. If you do not agree, do not use the Service.
          </p>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4">1. Eligibility</h2>
            <p className="text-slate-300 leading-relaxed">
              You must be at least 18 years old to use BloomEngine. By using the Service, you represent and warrant that you meet this requirement.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4">2. Description of Service</h2>
            <p className="text-slate-300 leading-relaxed mb-4">
              BloomEngine is a SaaS platform that provides product research, market analysis, sourcing insights, and related tools for e-commerce sellers.
            </p>
            <p className="text-slate-300 leading-relaxed">
              We may update, modify, or discontinue features at any time, including during beta periods.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4">3. Account Registration</h2>
            <p className="text-slate-300 leading-relaxed mb-4">
              To access certain features, you must create an account. You agree to:
            </p>
            <ul className="list-disc pl-6 text-slate-300 space-y-2 mb-4">
              <li>Provide accurate and complete information</li>
              <li>Maintain the security of your login credentials</li>
              <li>Notify us immediately of unauthorized access</li>
            </ul>
            <p className="text-slate-300 leading-relaxed">
              You are responsible for all activity under your account.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4">4. Subscription &amp; Payments</h2>
            <p className="text-slate-300 leading-relaxed mb-4">
              Some features of BloomEngine require a paid subscription.
            </p>
            <ul className="list-disc pl-6 text-slate-300 space-y-2 mb-4">
              <li>Subscriptions renew automatically unless canceled prior to renewal.</li>
              <li>Fees are non-refundable except where required by law.</li>
              <li>We reserve the right to change pricing with reasonable notice.</li>
              <li>Failure to pay may result in suspension or termination of your account.</li>
            </ul>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4">5. Acceptable Use</h2>
            <p className="text-slate-300 leading-relaxed mb-4">
              You agree not to:
            </p>
            <ul className="list-disc pl-6 text-slate-300 space-y-2 mb-4">
              <li>Use the Service for unlawful purposes</li>
              <li>Reverse engineer or attempt to extract source code</li>
              <li>Scrape, copy, or redistribute platform data without authorization</li>
              <li>Interfere with platform security or functionality</li>
              <li>Use the Service to violate third-party terms (including Amazon or other marketplaces)</li>
            </ul>
            <p className="text-slate-300 leading-relaxed">
              We reserve the right to suspend or terminate accounts that violate these rules.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4">6. Data &amp; Third-Party Integrations</h2>
            <p className="text-slate-300 leading-relaxed mb-4">
              BloomEngine may rely on third-party APIs and data providers (e.g., marketplace data services). We are not responsible for:
            </p>
            <ul className="list-disc pl-6 text-slate-300 space-y-2 mb-4">
              <li>Accuracy of third-party data</li>
              <li>Downtime caused by third-party providers</li>
              <li>Changes to third-party API policies</li>
            </ul>
            <p className="text-slate-300 leading-relaxed">
              Your use of such integrations is subject to those third parties&apos; terms.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4">7. Intellectual Property</h2>
            <p className="text-slate-300 leading-relaxed mb-4">
              All content, software, branding, design elements, algorithms, and proprietary tools within BloomEngine are the exclusive property of the Company.
            </p>
            <ul className="list-disc pl-6 text-slate-300 space-y-2 mb-4">
              <li>You may not copy, modify, distribute, or create derivative works without written permission.</li>
              <li>You retain ownership of any data you upload to the platform.</li>
            </ul>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4">8. Beta Disclaimer</h2>
            <p className="text-slate-300 leading-relaxed mb-4">
              BloomEngine may operate in beta. Features may be incomplete, experimental, or subject to change. You acknowledge that:
            </p>
            <ul className="list-disc pl-6 text-slate-300 space-y-2 mb-4">
              <li>Bugs or errors may occur</li>
              <li>Data outputs may not be perfect</li>
              <li>Features may be modified or removed</li>
              <li>Use during beta is at your own risk.</li>
            </ul>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4">9. Disclaimer of Warranties</h2>
            <p className="text-slate-300 leading-relaxed mb-4">
              BloomEngine is provided &quot;AS IS&quot; and &quot;AS AVAILABLE.&quot; We make no guarantees regarding:
            </p>
            <ul className="list-disc pl-6 text-slate-300 space-y-2 mb-4">
              <li>Profitability or business outcomes</li>
              <li>Accuracy of market data</li>
              <li>Continuous uptime</li>
              <li>Error-free operation</li>
            </ul>
            <p className="text-slate-300 leading-relaxed">
              We disclaim all warranties to the fullest extent permitted by law.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4">10. Limitation of Liability</h2>
            <p className="text-slate-300 leading-relaxed mb-4">
              To the maximum extent permitted by law, BloomEngine shall not be liable for:
            </p>
            <ul className="list-disc pl-6 text-slate-300 space-y-2 mb-4">
              <li>Indirect, incidental, or consequential damages</li>
              <li>Lost profits or lost business opportunities</li>
              <li>Data loss</li>
              <li>Marketplace account suspensions</li>
            </ul>
            <p className="text-slate-300 leading-relaxed">
              Our total liability shall not exceed the amount paid by you in the previous 12 months.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4">11. Termination</h2>
            <p className="text-slate-300 leading-relaxed mb-4">
              We may suspend or terminate your access at any time for:
            </p>
            <ul className="list-disc pl-6 text-slate-300 space-y-2 mb-4">
              <li>Violations of these Terms</li>
              <li>Non-payment</li>
              <li>Abuse of the platform</li>
            </ul>
            <p className="text-slate-300 leading-relaxed">
              You may cancel your account at any time through your account settings.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4">12. Governing Law</h2>
            <p className="text-slate-300 leading-relaxed">
              These Terms shall be governed by the laws of the United States, without regard to conflict of law principles.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4">13. Changes to These Terms</h2>
            <p className="text-slate-300 leading-relaxed">
              We may update these Terms from time to time. Continued use of the Service constitutes acceptance of the revised Terms.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-xl font-semibold text-white mb-4">14. Contact</h2>
            <p className="text-slate-300 leading-relaxed mb-4">
              If you have questions about these Terms, contact:
            </p>
            <ul className="list-none text-slate-300 space-y-2">
              <li>
                <strong className="text-slate-200">Email:</strong>{' '}
                <a
                  href="mailto:support@bloomengine.ai"
                  className="text-blue-400 hover:text-blue-300 transition-colors"
                >
                  support@bloomengine.ai
                </a>
              </li>
              <li>
                <strong className="text-slate-200">Website:</strong>{' '}
                <a
                  href="https://www.bloomengine.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 transition-colors"
                >
                  www.bloomengine.ai
                </a>
              </li>
            </ul>
          </section>
        </article>

        {/* Footer links */}
        <div className="flex flex-wrap gap-4 pt-8 border-t border-slate-700">
          <Link
            href="/privacy"
            className="text-slate-400 hover:text-white text-sm transition-colors"
          >
            Privacy Policy
          </Link>
          <Link
            href="/support"
            className="text-slate-400 hover:text-white text-sm transition-colors"
          >
            Support
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
