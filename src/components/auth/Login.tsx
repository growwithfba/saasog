'use client';

import * as React from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/utils/supabaseClient';

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

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    // Auto-login immediately
    const { error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (loginError) {
      setMessage(loginError.message);
    } else {
      setMessage('Signup successful! Redirecting...');
      router.push('/dashboard'); // 🚪 Send them to the dashboard
    }
    
    setLoading(false);
  };

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
          <div className="space-y-8">
            {/* Signup Form */}
            <form className="space-y-6" onSubmit={handleSignup}>
              <h2 className="text-xl font-semibold text-white">Sign Up</h2>
              <div>
                <label htmlFor="signup-email" className="block text-sm font-medium text-slate-300 mb-2">
                  Email address
                </label>
                <input
                  id="signup-email"
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
                <label htmlFor="signup-password" className="block text-sm font-medium text-slate-300 mb-2">
                  Password
                </label>
                <input
                  id="signup-password"
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

              <button
                type="submit"
                disabled={loading}
                className="w-full px-6 py-3 bg-blue-500 hover:bg-blue-600 rounded-xl text-white 
                         font-semibold shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 
                         transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                Create Account
              </button>
            </form>

            <div className="text-center text-slate-400 text-sm">
              - OR -
            </div>

            {/* Login Form */}
            <form className="space-y-6" onSubmit={handleLogin}>
              <h2 className="text-xl font-semibold text-white">Login</h2>
              <div>
                <label htmlFor="login-email" className="block text-sm font-medium text-slate-300 mb-2">
                  Email address
                </label>
                <input
                  id="login-email"
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
                <label htmlFor="login-password" className="block text-sm font-medium text-slate-300 mb-2">
                  Password
                </label>
                <input
                  id="login-password"
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
                className="w-full px-6 py-3 bg-green-600 hover:bg-green-700 rounded-xl text-white 
                         font-semibold shadow-lg shadow-green-500/25 hover:shadow-green-500/40 
                         transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {loading ? 'Processing...' : 'Login'}
              </button>
            </form>
          </div>

          {message && (
            <div className="mt-6 text-center text-sm text-slate-400">
              {message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 