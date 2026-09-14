'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronRight, CreditCard, LogOut, PlayCircle, User as UserIcon } from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';

import { RootState } from '@/store';
import { setUser as setReduxUser, logout as logoutRedux } from '@/store/authSlice';
import { supabase } from '@/utils/supabaseClient';
import { formatDate } from '@/utils/formatDate';
import type { User } from '@/models/user';
import { PhasePill } from '@/components/layout/PhasePill';
import { FunnelButton } from '@/components/layout/FunnelButton';
import { Logo } from '@/components/Logo';
import { HeaderFlourish } from '@/components/layout/HeaderFlourish';
import { LEARN_ENABLED } from '@/lib/featureFlags';
import { POPOVER } from '@/components/ui/surfaces';

type NavItem = { type: 'link'; href: string; label: string; phase: 'research' | 'vetting' | 'offer' | 'sourcing' };

// Mirrors NavBar's IA: My Funnel + Discovery / Vetting / Offering / Sourcing.
// This header is the shell for /research/[asin], /vetting/[asin], /learn,
// /support, /privacy, /terms — it previously still showed a "Research" pill
// to the superseded /research page, giving the app two different navs.
const NAV_ITEMS: NavItem[] = [
  { type: 'link', href: '/discovery', label: 'Discovery', phase: 'research' },
  { type: 'link', href: '/vetting', label: 'Vetting', phase: 'vetting' },
  { type: 'link', href: '/offer', label: 'Offering', phase: 'offer' },
  { type: 'link', href: '/sourcing', label: 'Sourcing', phase: 'sourcing' },
];

function isDashboardActive(pathname: string | null) {
  if (!pathname) return false;
  return pathname === '/vetting' || pathname.startsWith('/submission/');
}

function isActiveLink(pathname: string | null, href: string) {
  if (!pathname) return false;
  if (href === '/vetting') return isDashboardActive(pathname);
  if (href === '/discovery') return pathname === '/discovery' || pathname.startsWith('/discovery/');
  if (href === '/offer') return pathname === '/offer' || pathname.startsWith('/offer/');
  if (href === '/sourcing') return pathname === '/sourcing' || pathname.startsWith('/sourcing/');
  return pathname === href;
}

export default function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const dispatch = useDispatch();
  const reduxUser = useSelector((state: RootState) => state.auth.user);

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [fallbackUser, setFallbackUser] = useState<User | null>(null);

  const user: User | null = useMemo(() => reduxUser ?? fallbackUser, [reduxUser, fallbackUser]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateUser() {
      if (reduxUser) return;
      try {
        const { data, error } = await supabase.auth.getUser();
        if (cancelled) return;
        if (error || !data?.user) return;

        const supabaseUser = data.user;
        const nextUser: User = {
          id: supabaseUser.id,
          email: supabaseUser.email || '',
          name:
            supabaseUser.user_metadata?.full_name ||
            supabaseUser.user_metadata?.name ||
            supabaseUser.email?.split('@')[0] ||
            'User',
          created_at: supabaseUser.created_at,
        };

        setFallbackUser(nextUser);
        dispatch(setReduxUser(nextUser));
      } catch {
        // ignore - header should still render for logged-out routes
      }
    }

    hydrateUser();
    return () => {
      cancelled = true;
    };
  }, [dispatch, reduxUser]);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      dispatch(logoutRedux());
      setIsProfileOpen(false);
      router.push('/login');
    }
  };

  return (
    <nav className="relative bg-[#f8fafd]/85 dark:bg-[#0b1224]/80 backdrop-blur-xl sticky top-0 z-50 shadow-[0_1px_0_rgba(30,58,138,0.06)] dark:shadow-none">
      <HeaderFlourish />
      {/* Full window width, matching PageShell's body and NavBar on the MainTemplate pages. */}
      <div className="relative max-w-none mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center h-16">
          {/* Left: Logo */}
          <div className="min-w-0">
            <Logo variant="wordmark" href="/dashboard" className="h-10" alt="BloomEngine" />
          </div>

          {/* Center: Navigation */}
          <div className="flex items-center justify-center gap-3">
            <FunnelButton isActive={pathname === '/dashboard'} />
            <div className="hidden sm:block w-px h-6 bg-[#1e3a8a]/15 dark:bg-slate-700" />
            {NAV_ITEMS.map((item) => {
              const active = isActiveLink(pathname, item.href);

              return (
                <PhasePill
                  key={item.href}
                  phase={item.phase}
                  href={item.href}
                  label={item.label}
                  isActive={active}
                />
              );
            })}
          </div>

          {/* Right: User Menu */}
          <div className="flex items-center justify-end gap-4 min-w-0">
            {user ? (
              <div className="relative">
                <button
                  onClick={() => setIsProfileOpen((v) => !v)}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[#1e3a8a]/[0.06] dark:hover:bg-slate-800/50 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 flex items-center justify-center">
                    <span className="text-white text-sm font-semibold">
                      {user.name?.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="hidden sm:block text-left min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{user.name}</p>
                    <p className="text-xs text-gray-600 dark:text-slate-400 truncate">{user.email}</p>
                  </div>
                  <ChevronRight
                    className={[
                      'w-4 h-4 text-gray-600 dark:text-slate-400 transition-transform',
                      isProfileOpen ? 'rotate-90' : '',
                    ].join(' ')}
                  />
                </button>

                {isProfileOpen && (
                  <div className={`absolute right-0 mt-2 w-64 overflow-hidden ${POPOVER}`}>
                    <div className="p-4 border-b border-gray-200 dark:border-slate-700/50">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{user.name}</p>
                      <p className="text-xs text-gray-600 dark:text-slate-400 mt-1">{user.email}</p>
                      <p className="text-xs text-gray-500 dark:text-slate-500 mt-2">Member since {formatDate(user.created_at)}</p>
                    </div>

                    <div className="p-2">
                      <Link
                        href="/profile"
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700/50 transition-colors text-left"
                        onClick={() => setIsProfileOpen(false)}
                      >
                        <UserIcon className="w-4 h-4 text-gray-600 dark:text-slate-400" />
                        <span className="text-sm text-gray-700 dark:text-slate-300">Profile Settings</span>
                      </Link>
                      <Link
                        href="/subscription"
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700/50 transition-colors text-left"
                        onClick={() => setIsProfileOpen(false)}
                      >
                        <CreditCard className="w-4 h-4 text-gray-600 dark:text-slate-400" />
                        <span className="text-sm text-gray-700 dark:text-slate-300">Subscription</span>
                      </Link>
                      {LEARN_ENABLED && (
                        <Link
                          href="/learn"
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors text-left"
                          onClick={() => setIsProfileOpen(false)}
                        >
                          <PlayCircle className="w-4 h-4 text-violet-500 dark:text-violet-400" />
                          <span className="text-sm text-gray-700 dark:text-slate-300">Learning Hub</span>
                        </Link>
                      )}
                      <hr className="my-2 border-gray-200 dark:border-slate-700/50" />
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors text-left group"
                      >
                        <LogOut className="w-4 h-4 text-gray-600 dark:text-slate-400 group-hover:text-red-600 dark:group-hover:text-red-400" />
                        <span className="text-sm text-gray-700 dark:text-slate-300 group-hover:text-red-600 dark:group-hover:text-red-400">Sign Out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Link href="/login" className="px-3 py-2 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors">
                  Sign In
                </Link>
                <Link
                  href="/register"
                  className="px-4 py-2 bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 text-white font-medium rounded-lg transition-all"
                >
                  Get Started
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}


