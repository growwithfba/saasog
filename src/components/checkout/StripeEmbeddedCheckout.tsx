'use client';

import { useCallback, useMemo } from 'react';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from '@stripe/react-stripe-js';

/**
 * Phase 5.4-M Embedded Checkout wrapper.
 *
 * Renders Stripe's Embedded Checkout iframe inside any host (modal, page,
 * inline drawer). The caller supplies a `fetchClientSecret` async function
 * that calls our /api/stripe/embedded-checkout endpoint with whatever
 * tier/interval the user picked.
 *
 * Why this lives in its own component:
 *  - loadStripe() must run exactly once per page load. Co-locating it with
 *    the provider keeps the singleton pattern obvious.
 *  - The EmbeddedCheckoutProvider has strict requirements about what
 *    options it accepts on first render — wrapping in this component
 *    enforces the contract.
 *
 * Usage from /plans:
 *
 *   <StripeEmbeddedCheckout
 *     fetchClientSecret={async () => {
 *       const res = await fetch('/api/stripe/embedded-checkout', {
 *         method: 'POST',
 *         headers: { 'Content-Type': 'application/json' },
 *         body: JSON.stringify({ tier, billingInterval }),
 *       });
 *       const { clientSecret } = await res.json();
 *       return clientSecret;
 *     }}
 *   />
 */

interface Props {
  /** Async function that POSTs to our checkout endpoint and returns the Stripe client_secret. */
  fetchClientSecret: () => Promise<string>;
  /**
   * Optional callback fired when the user finishes checkout in-iframe.
   * Stripe will also redirect to the session's return_url after this; the
   * callback is mainly useful for in-app analytics or a brief "creating
   * your account…" spinner before the redirect lands.
   */
  onComplete?: () => void;
}

// Singleton — loadStripe() must only ever be called once per page load.
// Reuse the promise across re-renders so the SDK isn't re-fetched.
let cachedStripePromise: Promise<Stripe | null> | null = null;

function getStripePromise(): Promise<Stripe | null> {
  if (cachedStripePromise) return cachedStripePromise;
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!publishableKey) {
    console.error(
      'StripeEmbeddedCheckout: NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set. ' +
        'Add it to .env.local (test-mode) or your Vercel env (live-mode).',
    );
    cachedStripePromise = Promise.resolve(null);
    return cachedStripePromise;
  }
  cachedStripePromise = loadStripe(publishableKey);
  return cachedStripePromise;
}

export function StripeEmbeddedCheckout({ fetchClientSecret, onComplete }: Props) {
  const stripePromise = useMemo(() => getStripePromise(), []);
  const fetcher = useCallback(() => fetchClientSecret(), [fetchClientSecret]);

  return (
    <div id="stripe-embedded-checkout-host" className="min-h-[480px]">
      <EmbeddedCheckoutProvider
        stripe={stripePromise}
        options={{ fetchClientSecret: fetcher, onComplete }}
      >
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
