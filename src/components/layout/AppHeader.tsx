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
import LearnModal from '@/components/LearnModal';
import type { User } from '@/models/user';

type NavItem =
  | { type: 'link'; href: string; label: string; accent: 'lime' | 'yellow' | 'orange' | 'blue' }
  | { type: 'learn'; label: string };

const NAV_ITEMS: NavItem[] = [
  { type: 'link', href: '/research', label: 'Research', accent: 'lime' },
  { type: 'link', href: '/vetting', label: 'Vetting', accent: 'yellow' },
  { type: 'link', href: '/offer', label: 'Offer', accent: 'orange' },
  { type: 'link', href: '/sourcing', label: 'Sourcing', accent: 'blue' },
  { type: 'learn', label: 'Learn' },
];

function getAccentClasses(accent: 'lime' | 'yellow' | 'orange' | 'blue') {
  switch (accent) {
    case 'lime':
      return { border: 'border-lime-500', ring: 'ring-lime-500/40' };
    case 'yellow':
      return { border: 'border-yellow-500', ring: 'ring-yellow-500/40' };
    case 'orange':
      return { border: 'border-orange-500', ring: 'ring-orange-500/40' };
    case 'blue':
      return { border: 'border-blue-500', ring: 'ring-blue-500/40' };
  }
}

function isDashboardActive(pathname: string | null) {
  if (!pathname) return false;
  return pathname === '/vetting' || pathname.startsWith('/submission/');
}

function isActiveLink(pathname: string | null, href: string) {
  if (!pathname) return false;
  if (href === '/vetting') return isDashboardActive(pathname);
  if (href === '/research') return pathname === '/research';
  if (href === '/offer') return pathname === '/offer';
  if (href === '/sourcing') return pathname === '/sourcing';
  return pathname === href;
}

export default function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const dispatch = useDispatch();
  const reduxUser = useSelector((state: RootState) => state.auth.user);

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isLearnModalOpen, setIsLearnModalOpen] = useState(false);
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

  const handleLearnModalAction = () => {
    setIsLearnModalOpen(false);
    setTimeout(() => {
      const element = document.getElementById('keep-building-section');
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  return (
    <nav className="bg-slate-900/50 backdrop-blur-xl border-b border-slate-700/50 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center h-16">
          {/* Left: Logo */}
          <div className="min-w-0">
            <Link href="/research" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              <img
                src="/grow-with-fba-banner.png"
                alt="Grow With FBA AI"
                className="h-10 w-auto object-contain"
              />
            </Link>
          </div>

          {/* Center: Navigation */}
          <div className="flex items-center justify-center gap-2">
            {NAV_ITEMS.map((item) => {
              if (item.type === 'learn') {
                const learnActive = pathname?.startsWith('/learn') ?? false;
                return (
                  <button
                    key="learn"
                    onClick={() => setIsLearnModalOpen(true)}
                    className={[
                      'flex items-center gap-2 px-3 py-2 rounded-lg',
                      'bg-gradient-to-r from-purple-500/20 to-blue-500/20 hover:from-purple-500/30 hover:to-blue-500/30',
                      'border border-purple-500/30 text-purple-300 hover:text-purple-200',
                      'transition-all duration-200 transform hover:scale-105',
                      learnActive ? 'ring-1 ring-purple-500/40' : '',
                    ].join(' ')}
                  >
                    <PlayCircle className="w-4 h-4" />
                    <span className="hidden sm:inline font-medium">{item.label}</span>
                  </button>
                );
              }

              const active = isActiveLink(pathname, item.href);
              const accent = getAccentClasses(item.accent);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    'flex items-center gap-2 px-3 py-2 rounded-lg',
                    'bg-slate-800/50 hover:bg-slate-800/70',
                    'transition-all duration-200 transform hover:scale-105',
                    'border-b-2 border-r-2',
                    accent.border,
                    active ? `text-white bg-slate-800/70 ring-1 ${accent.ring}` : 'text-slate-300',
                  ].join(' ')}
                >
                  <span className="hidden sm:inline font-medium">{item.label}</span>
                  <span className="sm:hidden font-medium">{item.label[0]}</span>
                </Link>
              );
            })}
          </div>

          {/* Right: User Menu */}
          <div className="flex items-center justify-end gap-4 min-w-0">
            {user ? (
              <div className="relative">
                <button
                  onClick={() => setIsProfileOpen((v) => !v)}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800/50 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 flex items-center justify-center">
                    <span className="text-white text-sm font-semibold">
                      {user.name?.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="hidden sm:block text-left min-w-0">
                    <p className="text-sm font-medium text-white truncate">{user.name}</p>
                    <p className="text-xs text-slate-400 truncate">{user.email}</p>
                  </div>
                  <ChevronRight
                    className={[
                      'w-4 h-4 text-slate-400 transition-transform',
                      isProfileOpen ? 'rotate-90' : '',
                    ].join(' ')}
                  />
                </button>

                {isProfileOpen && (
                  <div className="absolute right-0 mt-2 w-64 bg-slate-800 rounded-xl shadow-xl border border-slate-700/50 overflow-hidden">
                    <div className="p-4 border-b border-slate-700/50">
                      <p className="text-sm font-medium text-white">{user.name}</p>
                      <p className="text-xs text-slate-400 mt-1">{user.email}</p>
                      <p className="text-xs text-slate-500 mt-2">Member since {formatDate(user.created_at)}</p>
                    </div>

                    <div className="p-2">
                      <Link
                        href="/profile"
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-700/50 transition-colors text-left"
                        onClick={() => setIsProfileOpen(false)}
                      >
                        <UserIcon className="w-4 h-4 text-slate-400" />
                        <span className="text-sm text-slate-300">Profile Settings</span>
                      </Link>
                      <Link
                        href="/subscription"
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-700/50 transition-colors text-left"
                        onClick={() => setIsProfileOpen(false)}
                      >
                        <CreditCard className="w-4 h-4 text-slate-400" />
                        <span className="text-sm text-slate-300">Subscription</span>
                      </Link>
                      <hr className="my-2 border-slate-700/50" />
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-red-500/10 transition-colors text-left group"
                      >
                        <LogOut className="w-4 h-4 text-slate-400 group-hover:text-red-400" />
                        <span className="text-sm text-slate-300 group-hover:text-red-400">Sign Out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Link href="/login" className="px-3 py-2 text-slate-300 hover:text-white transition-colors">
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

      {isLearnModalOpen && (
        <LearnModal
          isOpen={isLearnModalOpen}
          onClose={() => setIsLearnModalOpen(false)}
          onAction={handleLearnModalAction}
        />
      )}
    </nav>
  );
}


