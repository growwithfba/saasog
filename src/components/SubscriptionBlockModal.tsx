'use client';

import { CreditCard, AlertTriangle, ArrowRight, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/utils/supabaseClient';

interface SubscriptionBlockModalProps {
  isOpen: boolean;
  reason?: 'canceled' | 'no_subscription';
}

const SubscriptionBlockModal = ({ isOpen, reason = 'canceled' }: SubscriptionBlockModalProps) => {
  const router = useRouter();

  if (!isOpen) return null;

  const handleGoToSubscription = () => {
    router.push('/subscription');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const isNoSubscription = reason === 'no_subscription';

  const title = isNoSubscription ? 'Get Started with BloomEngine' : 'Subscription Cancelled';
  const description = isNoSubscription
    ? 'You need an active subscription to start using BloomEngine. Choose a plan and unlock all the tools you need to grow your business.'
    : 'Your subscription has been cancelled. To continue using BloomEngine and access all features, please resubscribe to one of our plans.';
  const buttonLabel = isNoSubscription ? 'View Subscription Plans' : 'View Subscription Plans';

  return (
    <>
      {/* Backdrop - blocks all interaction */}
      <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-[9999] p-4">
        {/* Modal */}
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl max-w-md w-full border-2 border-red-500/50 shadow-2xl">
          {/* Header with Alert Icon */}
          <div className="flex items-center justify-center p-6 border-b border-slate-700/50">
            <div className="w-16 h-16 bg-gradient-to-r from-red-500 to-orange-500 rounded-full flex items-center justify-center animate-pulse">
              <AlertTriangle className="w-8 h-8 text-white" />
            </div>
          </div>

          {/* Content */}
          <div className="p-8 text-center">
            <h2 className="text-2xl font-bold text-white mb-4">
              {title}
            </h2>
            <p className="text-slate-300 mb-6 leading-relaxed">
              {description}
            </p>

            {/* Feature List */}
            <div className="bg-slate-900/50 rounded-xl p-4 mb-6 text-left">
              <p className="text-sm font-semibold text-slate-400 mb-3">With an active subscription you get:</p>
              <ul className="text-sm text-slate-300 space-y-2">
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></div>
                  Unlimited product research
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></div>
                  Advanced market analysis
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></div>
                  Competitor insights and tracking
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></div>
                  AI-powered recommendations
                </li>
              </ul>
            </div>

            {/* CTA Button */}
            <button
              onClick={handleGoToSubscription}
              className="w-full py-4 px-6 bg-gradient-to-r from-emerald-500 to-blue-500 hover:from-emerald-600 hover:to-blue-600 rounded-xl font-semibold text-white transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center gap-3 group"
            >
              <CreditCard className="w-5 h-5" />
              {buttonLabel}
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>

            <button
              onClick={handleLogout}
              className="w-full mt-3 py-3 px-6 rounded-xl font-medium text-slate-400 hover:text-white hover:bg-slate-700/50 transition-all duration-200 flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>

            <p className="text-xs text-slate-500 mt-4">
              Cancel anytime • Need help? <a href="mailto:support@bloomengine.ai" className="text-blue-400 hover:text-blue-300">Contact Support</a>
            </p>
          </div>
        </div>
      </div>
    </>
  );
};

export default SubscriptionBlockModal;
