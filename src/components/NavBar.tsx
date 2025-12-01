'use client';
import { useState } from 'react';
import Link from 'next/link';
import { User, LogOut, ChevronRight, PlayCircle, CreditCard } from 'lucide-react';
import { formatDate } from '@/utils/formatDate';
import { supabase } from '@/utils/supabaseClient';
import { useRouter } from 'next/navigation';
import { RootState } from '@/store';
import { useSelector } from 'react-redux';

interface NavBarProps {
  onLearnClick: () => void;
}

const NavBar = ({ onLearnClick }: NavBarProps) => {
  const { user } = useSelector((state: RootState) => state.auth);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const router = useRouter();
  
  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (!user) return null;

  return (
    <nav className="bg-slate-900/50 backdrop-blur-xl border-b border-slate-700/50 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo and Brand */}
            <div className="flex items-center gap-3">
              <img
                src="/grow-with-fba-banner.png"
                alt="Grow Logo"
                className="h-10 w-auto object-contain"
              />
              <div className="hidden sm:block">
                {/* <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
                  Grow With FBA AI
                </h1> */}
              </div>
            </div>

            {/* Right Side - Learn Button and User Menu */}
            <div className="flex items-center gap-4">
              <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800/50 hover:bg-slate-800/70 transition-all duration-200 transform hover:scale-105 border-b-2 border-r-2 border-lime-500">
                <Link href="/research">
                  <span className="hidden sm:inline font-medium">Research</span>
                </Link>
              </button>
              <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800/50 hover:bg-slate-800/70 transition-all duration-200 transform hover:scale-105 border-b-2 border-r-2 border-yellow-500">
                <Link href="/dashboard">
                  <span className="hidden sm:inline font-medium">Vetting</span>
                </Link>
              </button>
              <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800/50 hover:bg-slate-800/70 transition-all duration-200 transform hover:scale-105 border-b-2 border-r-2 border-orange-500">
                <Link href="/dashboard">
                  <span className="hidden sm:inline font-medium">Offer</span>
                </Link>
              </button>
              <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800/50 hover:bg-slate-800/70 transition-all duration-200 transform hover:scale-105 border-b-2 border-r-2 border-blue-500">
                <Link href="/dashboard">
                  <span className="hidden sm:inline font-medium">Sourcing</span>
                </Link>
              </button>
              {/* Learn Button */}
              <button
                onClick={onLearnClick}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500/20 to-blue-500/20 hover:from-purple-500/30 hover:to-blue-500/30 border border-purple-500/30 rounded-lg text-purple-300 hover:text-purple-200 transition-all duration-200 transform hover:scale-105"
              >
                <PlayCircle className="w-4 h-4" />
                <span className="hidden sm:inline font-medium">Learn</span>
              </button>
              
              {/* Profile Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setIsProfileOpen(!isProfileOpen)}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800/50 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 flex items-center justify-center">
                    <span className="text-white text-sm font-semibold">
                      {user.name?.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="hidden sm:block text-left">
                    <p className="text-sm font-medium text-white">{user.name}</p>
                    <p className="text-xs text-slate-400">{user.email}</p>
                  </div>
                  <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${isProfileOpen ? 'rotate-90' : ''}`} />
                </button>

                {/* Dropdown Menu */}
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
                        <User className="w-4 h-4 text-slate-400" />
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
            </div>
          </div>
        </div>
      </nav>
  );
};

export default NavBar;