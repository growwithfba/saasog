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
        // Fetch user profile to get subscription status
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('subscription_status, subscription_type')
          .eq('id', user.id)
          .single();

        if (error) {
          console.error('Error fetching subscription status:', error);
          setIsChecking(false);
          return;
        }

        // Update user in Redux store with subscription info
        if (profile) {
          dispatch(setUser({
            ...user,
            subscription_status: profile.subscription_status,
            subscription_type: profile.subscription_type
          }));

          // Show modal if subscription is CANCELED or null (FREE behaves like ACTIVE — no modal)
          if (profile.subscription_status === 'CANCELED') {
            setModalReason('canceled');
            setShowModal(true);
          } else if (profile.subscription_status === null) {
            setModalReason('no_subscription');
            setShowModal(true);
          } else {
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
