'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export function Login() {
  const router = useRouter();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [validatingToken, setValidatingToken] = React.useState(true);

  // Check for existing token when component mounts
  React.useEffect(() => {
    const validateToken = async () => {
      const token = localStorage.getItem('token');
      const storedUser = localStorage.getItem('user');
      
      if (!token || !storedUser) {
        setValidatingToken(false);
        return;
      }
      
      try {
        // Call validation endpoint
        const response = await fetch('/api/auth', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        const data = await response.json();
        
        if (data.success) {
          // Token is valid, redirect to dashboard
          router.push('/dashboard');
        } else {
          // Token is invalid, clear storage
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setValidatingToken(false);
        }
      } catch (error) {
        console.error('Token validation error:', error);
        setValidatingToken(false);
      }
    };
    
    validateToken();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, action: 'login' }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Store user info in localStorage
        localStorage.setItem('user', JSON.stringify(data.user));
        localStorage.setItem('token', data.token || 'beta-token');
        
        // Redirect to dashboard
        router.push('/dashboard');
      } else {
        setError(data.error || 'Invalid credentials');
      }
    } catch (error) {
      console.error('Login error:', error);
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const useTestCredentials = () => {
    setEmail('test@test.com');
    setPassword('test');
  };

  // Show loading state while validating token
  if (validatingToken) {
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
          <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-3">
                <p className="text-red-400 text-sm">{error}</p>
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
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link 
              href="/register" 
              className="text-blue-400 hover:text-blue-300 text-sm transition-colors"
            >
              Need an account? Register
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
} 