'use client';

import { PageShell } from '@/components/layout/PageShell';
import { Mail, Clock, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';

export default function SupportPage() {
  const user = useSelector((state: RootState) => state.auth.user);

  return (
    <PageShell>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto">
          
          {/* Back Button - Only show if user is authenticated */}
          {user && (
            <Link 
              href="/research"
              className="inline-flex items-center text-slate-400 hover:text-white mb-8 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Research
            </Link>
          )}

          {/* Main Card */}
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl border border-slate-700 p-12 text-center">
            
            {/* Icon */}
            <div className="flex items-center justify-center w-20 h-20 rounded-full bg-blue-500/10 mx-auto mb-6">
              <Mail className="w-10 h-10 text-blue-400" />
            </div>

            {/* Title */}
            <h1 className="text-4xl font-bold text-white mb-4">
              Need Help?
            </h1>

            {/* Description */}
            <p className="text-xl text-slate-300 mb-8 max-w-lg mx-auto">
              Our support team is here to help you. Send us an email and we'll get back to you as soon as possible.
            </p>

            {/* Email Button */}
            <a
              href="mailto:support@bloomengine.ai?subject=Support Request&body=Hi BloomEngine Support Team,%0D%0A%0D%0AI need help with:%0D%0A%0D%0A"
              className="inline-flex items-center justify-center px-8 py-4 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white text-lg font-semibold rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105"
            >
              <Mail className="w-5 h-5 mr-3" />
              Contact Support
            </a>

            {/* Support Email Display */}
            <div className="mt-8 pt-8 border-t border-slate-700">
              <p className="text-sm text-slate-400 mb-2">
                Or email us directly at:
              </p>
              <a 
                href="mailto:support@bloomengine.ai"
                className="text-blue-400 hover:text-blue-300 font-medium text-lg transition-colors"
              >
                support@bloomengine.ai
              </a>
            </div>

            {/* Response Time */}
            <div className="mt-8 flex items-center justify-center text-slate-400">
              <Clock className="w-4 h-4 mr-2" />
              <span className="text-sm">We typically respond within 24 hours</span>
            </div>
          </div>

          {/* Additional Help - Only show if user is authenticated */}
          {user && (
            <div className="mt-8 text-center">
              <p className="text-slate-400 text-sm mb-4">
                Looking for something else?
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                <Link
                  href="/research"
                  className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg border border-slate-700 hover:border-slate-600 transition-all duration-200 text-sm"
                >
                  Research
                </Link>
                <Link
                  href="/subscription"
                  className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg border border-slate-700 hover:border-slate-600 transition-all duration-200 text-sm"
                >
                  Subscription
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
