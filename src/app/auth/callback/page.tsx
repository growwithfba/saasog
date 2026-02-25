'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/utils/supabaseClient';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { Logo } from '@/components/Logo';

const MONTHLY_KEY = 'grow_with_fba_ai_monthly_subscription';
const ANNUAL_KEY = 'grow_with_fba_ai_yearly_membership';

async function createCheckoutUrl(userId: string, userEmail: string, productId: string): Promise<string | null> {
  const response = await fetch('/api/stripe/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productId, userId, userEmail }),
  });
  const result = await response.json();
  return result.success && result.url ? result.url : null;
}

async function resolveProductId(plan: string): Promise<string | null> {
  const response = await fetch('/api/stripe/products');
  const result = await response.json();
  if (!result.success || !result.data) return null;
  const lookupKey = plan === 'monthly' ? MONTHLY_KEY : ANNUAL_KEY;
  const product = result.data.find(
    (p: { default_price?: { lookup_key?: string | null }; id: string }) =>
      p.default_price?.lookup_key === lookupKey
  );
  return product?.id ?? null;
}

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Confirming your account...');

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const code = searchParams.get('code');
        const plan = searchParams.get('plan');
        const productId = searchParams.get('productId');

        let userId: string | null = null;
        let userEmail: string | null = null;

        if (code) {
          // PKCE flow: exchange authorization code for session
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          userId = data.session?.user?.id ?? null;
          userEmail = data.session?.user?.email ?? null;
        } else {
          // Implicit flow: session is already extracted from URL hash by the client
          const { data: { session } } = await supabase.auth.getSession();
          userId = session?.user?.id ?? null;
          userEmail = session?.user?.email ?? null;
        }

        if (!userId || !userEmail) {
          router.push('/login?message=Please sign in to continue');
          return;
        }

        // If no plan was selected, go straight to the app
        if (!plan) {
          router.push('/research');
          return;
        }

        setMessage('Setting up your subscription...');

        // Resolve productId (from URL param or by fetching Stripe products)
        let resolvedProductId = productId;
        if (!resolvedProductId) {
          resolvedProductId = await resolveProductId(plan);
        }

        if (!resolvedProductId) {
          router.push('/subscription');
          return;
        }

        const checkoutUrl = await createCheckoutUrl(userId, userEmail, resolvedProductId);

        if (checkoutUrl) {
          setStatus('success');
          setMessage('Redirecting to payment...');
          window.location.href = checkoutUrl;
        } else {
          router.push('/subscription');
        }
      } catch (err) {
        console.error('Auth callback error:', err);
        setStatus('error');
        setMessage('There was an error confirming your account. Please try signing in.');
        setTimeout(() => router.push('/login'), 3000);
      }
    };

    handleCallback();
  }, [router, searchParams]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-6">
      <div className="text-center max-w-md w-full">
        <Logo variant="horizontal" className="h-16 mx-auto mb-8" alt="BloomEngine" priority />

        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-8">
          {status === 'loading' && (
            <>
              <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">{message}</h2>
              <p className="text-slate-400 text-sm">Please wait a moment...</p>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-emerald-400" />
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">{message}</h2>
              <p className="text-slate-400 text-sm">You will be redirected shortly.</p>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8 text-red-400" />
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">{message}</h2>
              <p className="text-slate-400 text-sm">Redirecting to login...</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
        </div>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}
