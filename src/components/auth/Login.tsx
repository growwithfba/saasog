'use client';

import * as React from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/utils/supabaseClient';
import Link from 'next/link';

export function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [validatingSession, setValidatingSession] = useState(true);

  // Check for existing session when component mounts
  React.useEffect(() => {
    const checkSession = async () => {
      const { data, error } = await supabase.auth.getSession();
      
      if (error) {
        console.error('Session check error:', error);
        setValidatingSession(false);
        return;
      }
      
      if (data?.session) {
        // User is already signed in, redirect to dashboard
        router.push('/dashboard');
      } else {
        setValidatingSession(false);
      }
    };
    
    checkSession();
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMessage(error.message);
    } else {
      setMessage('Login successful! Redirecting...');
      router.push('/dashboard');
    }
    
    setLoading(false);
  };

  const useTestCredentials = () => {
    setEmail('test@test.com');
    setPassword('test');
  };

  // Show loading state while validating session
  if (validatingSession) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center p-6">
        <div className="text-white">Verifying session...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md mb-8">
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl shadow-xl border border-slate-700/50 p-8 flex flex-col items-center">
          <img 
            src="/Elevate 2 - Icon.png"
            alt="Elevate Icon"
            className="h-24 w-auto mb-6"
          />
          <img 
            src="/ElevateAI.png"
            alt="Elevate Logo"
            className="h-12 w-auto mb-4"
          />
          <p className="text-slate-400 text-center">
            Sign in to analyze market potential
          </p>
        </div>
      </div>

      <div className="w-full max-w-md">
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl shadow-xl border border-slate-700/50 p-8">
          <form className="space-y-6" onSubmit={handleLogin}>
            {message && (
              <div className={`p-3 rounded-lg ${message.includes('successful') ? 'bg-green-900/20 border border-green-500/50 text-green-400' : 'bg-red-900/20 border border-red-500/50 text-red-400'}`}>
                <p className="text-sm">{message}</p>
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-xl 
                         text-white placeholder-slate-400 focus:outline-none focus:ring-2 
                         focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="Enter your email"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-xl 
                         text-white placeholder-slate-400 focus:outline-none focus:ring-2 
                         focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="••••••••"
              />
            </div>

            <div className="flex justify-between items-center">
              <button
                type="button"
                onClick={useTestCredentials}
                className="text-xs text-slate-400 hover:text-blue-400"
              >
                Use test account
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full px-6 py-3 bg-blue-500 hover:bg-blue-600 rounded-xl text-white 
                       font-semibold shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 
                       transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Signing in...
                </span>
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link 
              href="/register" 
              className="text-blue-400 hover:text-blue-300 text-sm transition-colors"
            >
              Don't have an account? Sign up here
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
} 