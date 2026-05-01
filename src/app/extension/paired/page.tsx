// =============================================================================
// /extension/paired — landing after a successful extension-pair sign-in
// =============================================================================
// Login.tsx redirects here when the URL carried ?ext_pair=<code>.
// Goal: tell the user they're signed in to the extension and let them
// close the tab. Don't dump them into the dashboard, since this tab
// only existed to authenticate the extension.

'use client';

import Link from 'next/link';
import { CheckCircle2, ExternalLink } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { Footer } from '@/components/layout/Footer';

export default function ExtensionPairedPage() {
  return (
    <div className="relative min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col overflow-hidden">
      <div className="pointer-events-none absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-blue-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full bg-emerald-500/10 blur-3xl" />

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md relative">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center mb-4">
              <Logo variant="horizontal" className="h-16" alt="BloomEngine" priority />
            </div>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl p-8 border border-slate-700/50 shadow-2xl text-center space-y-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30">
              <CheckCircle2 className="w-9 h-9 text-emerald-400" />
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl font-semibold text-white">
                You&apos;re signed in to the BloomEngine extension
              </h1>
              <p className="text-slate-400 text-sm">
                You can close this tab and head back to Amazon. The extension will pick
                up your session within a second.
              </p>
            </div>

            <div className="pt-2">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
              >
                Open the BloomEngine dashboard
                <ExternalLink className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
