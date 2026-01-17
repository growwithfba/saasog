'use client';
import { useState } from 'react';
import Link from 'next/link';
import { User, LogOut, ChevronRight, PlayCircle, CreditCard } from 'lucide-react';
import { formatDate } from '@/utils/formatDate';
import { supabase } from '@/utils/supabaseClient';
import { useRouter, usePathname } from 'next/navigation';
import { RootState } from '@/store';
import { useSelector } from 'react-redux';
import { PhasePill } from '@/components/layout/PhasePill';
import { Logo } from '@/components/Logo';


const NavBar = () => {
  const { user } = useSelector((state: RootState) => state.auth);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  
  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (!user) return null;

  return (
    <nav className="bg-white/80 dark:bg-slate-900/50 backdrop-blur-xl border-b border-gray-200 dark:border-slate-700/50 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo and Brand */}
            <div className="flex items-center gap-3">
              <Logo variant="wordmark" className="h-10" alt="BloomEngine" />
              <div className="hidden sm:block">
                {/* <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
                  Grow With FBA AI
                </h1> */}
              </div>
            </div>

            {/* Right Side - Learn Button and User Menu */}
            <div className="flex items-center gap-3">
              <PhasePill
                phase="research"
                href="/research"
                label="Research"
                isActive={pathname === '/research' || pathname?.startsWith('/research/')}
              />
              <PhasePill
                phase="vetting"
                href="/vetting"
                label="Vetting"
                isActive={pathname === '/vetting' || pathname?.startsWith('/vetting/') || pathname?.startsWith('/submission/')}
              />
              <PhasePill
                phase="offer"
                href="/offer"
                label="Offering"
                isActive={pathname === '/offer' || pathname?.startsWith('/offer/')}
              />
              <PhasePill
                phase="sourcing"
                href="/sourcing"
                label="Sourcing"
                isActive={pathname === '/sourcing' || pathname?.startsWith('/sourcing/')}
              />
              
              {/* Profile Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setIsProfileOpen(!isProfileOpen)}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 flex items-center justify-center">
                    <span className="text-white text-sm font-semibold">
                      {user.name?.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="hidden sm:block text-left">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{user.name}</p>
                    <p className="text-xs text-gray-600 dark:text-slate-400">{user.email}</p>
                  </div>
                  <ChevronRight className={`w-4 h-4 text-gray-600 dark:text-slate-400 transition-transform ${isProfileOpen ? 'rotate-90' : ''}`} />
                </button>

                {/* Dropdown Menu */}
                {isProfileOpen && (
                  <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-gray-200 dark:border-slate-700/50 overflow-hidden">
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
                        <User className="w-4 h-4 text-gray-600 dark:text-slate-400" />
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
            </div>
          </div>
        </div>
      </nav>
  );
};

export default NavBar;