'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '@/utils/supabaseClient';
import { useUser } from '@/context/UserContext';
import { useDispatch } from 'react-redux';
import { setUser } from '@/store/authSlice';
import SubscriptionBlockModal from './SubscriptionBlockModal';

const SubscriptionCheck = ({ children }: { children: React.ReactNode }) => {
  const pathname = usePathname();
  const { user } = useUser();
  const dispatch = useDispatch();
  const [showModal, setShowModal] = useState(false);
  const [modalReason, setModalReason] = useState<'canceled' | 'no_subscription'>('canceled');
  const [isChecking, setIsChecking] = useState(true);

  // Pages that are excluded from the subscription check
  const excludedPaths = ['/profile', '/subscription', '/plans', '/login', '/register', '/auth', '/forgot-password', '/reset-password', '/reset'];

  // Check if current path is excluded
  const isExcludedPath = excludedPaths.some(path => pathname.startsWith(path));

  useEffect(() => {
    const checkSubscriptionStatus = async () => {
      // Skip check for excluded paths
      if (isExcludedPath) {
        setShowModal(false);
        setIsChecking(false);
        return;
      }

      // Skip check if no user is logged in
      if (!user) {
        setIsChecking(false);
        return;
      }

      try {
        // Phase 5.4-M: tier is the new source of truth. The legacy
        // subscription_status column is preserved but no longer the
        // sole gate — a user with tier='core' or tier='pro' is by
        // definition paying (or in trial) and must not see the
        // paywall. Bug this fixes: 13 mentorship clients backfilled
        // to tier='pro' had subscription_status=NULL and were being
        // shown the "Get Started" modal on every page.
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('subscription_status, subscription_type, tier, trial_ends_at')
          .eq('id', user.id)
          .single();

        if (error) {
          console.error('Error fetching subscription status:', error);
          setIsChecking(false);
          return;
        }

        if (profile) {
          dispatch(setUser({
            ...user,
            subscription_status: profile.subscription_status,
            subscription_type: profile.subscription_type
          }));

          const trialIsActive = !!(
            profile.trial_ends_at &&
            new Date(profile.trial_ends_at).getTime() > Date.now()
          );
          const hasTier = profile.tier === 'core' || profile.tier === 'pro';

          // New gate: any tier OR an active trial = access. Fall back
          // to the legacy subscription_status check only when the new
          // columns are unpopulated (true brand-new users who haven't
          // hit Stripe yet).
          if (hasTier || trialIsActive) {
            setShowModal(false);
          } else if (profile.subscription_status === 'CANCELED') {
            setModalReason('canceled');
            setShowModal(true);
          } else if (
            profile.subscription_status === null ||
            profile.subscription_status === undefined
          ) {
            setModalReason('no_subscription');
            setShowModal(true);
          } else {
            // Active legacy enum (ACTIVE / TRIALING / FREE) without
            // the new tier columns — still grants access.
            setShowModal(false);
          }
        }
      } catch (error) {
        console.error('Error checking subscription:', error);
      } finally {
        setIsChecking(false);
      }
    };

    checkSubscriptionStatus();
  }, [pathname, user?.id, isExcludedPath, dispatch]);

  // Show loading state while checking
  if (isChecking && !isExcludedPath && user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
        <div className="text-gray-900 dark:text-white">Checking subscription...</div>
      </div>
    );
  }

  return (
    <>
      {children}
      <SubscriptionBlockModal isOpen={showModal} reason={modalReason} />
    </>
  );
};

export default SubscriptionCheck;
