'use client';

import { PageShell } from '@/components/layout/PageShell';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';

export default function PrivacyPage() {
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
              Privacy Policy
            </h1>
            <p className="text-slate-400 text-sm">Last Updated: Feb 10, 2026</p>
          </header>

          <p className="text-slate-300 mb-12 leading-relaxed">
            BloomEngine (&quot;Company,&quot; &quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) respects your privacy. This Privacy Policy explains how we collect, use, and protect your information.
          </p>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4">1. Information We Collect</h2>

            <h3 className="text-lg font-medium text-slate-200 mb-3 mt-6">A. Information You Provide</h3>
            <ul className="list-disc pl-6 text-slate-300 space-y-2 mb-4">
              <li>Name</li>
              <li>Email address</li>
              <li>Billing information</li>
              <li>Account credentials</li>
              <li>Data you upload (reviews, ASINs, product information)</li>
            </ul>

            <h3 className="text-lg font-medium text-slate-200 mb-3 mt-6">B. Automatically Collected Information</h3>
            <ul className="list-disc pl-6 text-slate-300 space-y-2 mb-4">
              <li>IP address</li>
              <li>Device information</li>
              <li>Browser type</li>
              <li>Usage activity within the platform</li>
              <li>Log data</li>
            </ul>

            <h3 className="text-lg font-medium text-slate-200 mb-3 mt-6">C. Third-Party Data</h3>
            <p className="text-slate-300 leading-relaxed">
              We may receive data from integrated third-party APIs (e.g., marketplace data providers).
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4">2. How We Use Your Information</h2>
            <p className="text-slate-300 leading-relaxed mb-4">
              We use your information to:
            </p>
            <ul className="list-disc pl-6 text-slate-300 space-y-2 mb-4">
              <li>Provide and improve the Service</li>
              <li>Process payments</li>
              <li>Authenticate users</li>
              <li>Communicate updates</li>
              <li>Prevent fraud and abuse</li>
              <li>Analyze product usage</li>
            </ul>
            <p className="text-slate-300 leading-relaxed font-medium">
              We do not sell your personal data.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4">3. Data Storage &amp; Security</h2>
            <p className="text-slate-300 leading-relaxed mb-4">
              We implement reasonable administrative, technical, and physical safeguards to protect your information.
            </p>
            <p className="text-slate-300 leading-relaxed">
              However, no online platform can guarantee 100% security.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4">4. Data Retention</h2>
            <p className="text-slate-300 leading-relaxed mb-4">
              We retain data as long as:
            </p>
            <ul className="list-disc pl-6 text-slate-300 space-y-2 mb-4">
              <li>Your account is active</li>
              <li>Needed for legitimate business purposes</li>
              <li>Required by law</li>
            </ul>
            <p className="text-slate-300 leading-relaxed">
              You may request deletion of your account at any time.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4">5. Cookies &amp; Tracking</h2>
            <p className="text-slate-300 leading-relaxed mb-4">
              We use cookies and similar technologies to:
            </p>
            <ul className="list-disc pl-6 text-slate-300 space-y-2 mb-4">
              <li>Maintain sessions</li>
              <li>Improve user experience</li>
              <li>Analyze usage trends</li>
            </ul>
            <p className="text-slate-300 leading-relaxed">
              You may disable cookies in your browser, but some features may not function properly.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4">6. Third-Party Services</h2>
            <p className="text-slate-300 leading-relaxed mb-4">
              We may use third-party services such as:
            </p>
            <ul className="list-disc pl-6 text-slate-300 space-y-2 mb-4">
              <li>Payment processors</li>
              <li>Analytics providers</li>
              <li>API data providers</li>
            </ul>
            <p className="text-slate-300 leading-relaxed">
              These third parties have their own privacy policies.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4">7. Your Rights</h2>
            <p className="text-slate-300 leading-relaxed mb-4">
              Depending on your jurisdiction, you may have the right to:
            </p>
            <ul className="list-disc pl-6 text-slate-300 space-y-2 mb-4">
              <li>Access your data</li>
              <li>Correct inaccurate data</li>
              <li>Request deletion</li>
              <li>Object to certain processing</li>
            </ul>
            <p className="text-slate-300 leading-relaxed">
              To exercise these rights, contact{' '}
              <a
                href="mailto:support@bloomengine.ai"
                className="text-blue-400 hover:text-blue-300 transition-colors"
              >
                support@bloomengine.ai
              </a>
              .
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4">8. Children&apos;s Privacy</h2>
            <p className="text-slate-300 leading-relaxed">
              BloomEngine is not intended for individuals under 18. We do not knowingly collect data from minors.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4">9. International Users</h2>
            <p className="text-slate-300 leading-relaxed">
              If you access BloomEngine from outside the United States, you consent to the transfer and processing of data in jurisdictions where our servers are located.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4">10. Changes to This Policy</h2>
            <p className="text-slate-300 leading-relaxed">
              We may update this Privacy Policy from time to time. Continued use of the Service indicates acceptance of the updated policy.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-xl font-semibold text-white mb-4">11. Contact</h2>
            <p className="text-slate-300 leading-relaxed mb-4">
              For privacy-related questions:
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
            href="/terms"
            className="text-slate-400 hover:text-white text-sm transition-colors"
          >
            Terms of Service
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
