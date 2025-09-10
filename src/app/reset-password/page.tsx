'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, CheckCircle, AlertCircle, Loader2, Lock, ArrowLeft } from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';

function ResetPasswordForm() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isValidSession, setIsValidSession] = useState<boolean | null>(null);
  
  const router = useRouter();
  const searchParams = useSearchParams();

  // Check if user has valid reset session
  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Session error:', error);
          setIsValidSession(false);
          return;
        }

        // Check if this is a password recovery session
        if (session && session.user) {
          setIsValidSession(true);
        } else {
          // Check URL parameters for access token (from email link)
          const accessToken = searchParams.get('access_token');
          const refreshToken = searchParams.get('refresh_token');
          
          if (accessToken && refreshToken) {
            // Set the session from URL parameters
            const { error: sessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken
            });
            
            if (sessionError) {
              console.error('Error setting session:', sessionError);
              setIsValidSession(false);
            } else {
              setIsValidSession(true);
            }
          } else {
            setIsValidSession(false);
          }
        }
      } catch (error) {
        console.error('Error checking session:', error);
        setIsValidSession(false);
      }
    };

    checkSession();
  }, [searchParams]);

  const validatePassword = (pwd: string) => {
    if (pwd.length < 8) {
      return 'Password must be at least 8 characters long';
    }
    if (!/(?=.*[a-z])/.test(pwd)) {
      return 'Password must contain at least one lowercase letter';
    }
    if (!/(?=.*[A-Z])/.test(pwd)) {
      return 'Password must contain at least one uppercase letter';
    }
    if (!/(?=.*\d)/.test(pwd)) {
      return 'Password must contain at least one number';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!password.trim()) {
      setError('Please enter a new password');
      return;
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.updateUser({
        password: password
      });

      if (error) {
        throw error;
      }

      setIsSuccess(true);
      
      // Redirect to login after a delay
      setTimeout(() => {
        router.push('/login?message=Password updated successfully');
      }, 3000);
      
    } catch (error) {
      console.error('Error updating password:', error);
      setError(error instanceof Error ? error.message : 'Failed to update password');
    } finally {
      setIsLoading(false);
    }
  };

  // Loading state while checking session
  if (isValidSession === null) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl p-8 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-400 mx-auto mb-4" />
          <p className="text-slate-300">Verifying reset link...</p>
        </div>
      </div>
    );
  }

  // Invalid session state
  if (isValidSession === false) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-8 text-center">
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-8 h-8 text-red-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-4">Invalid Reset Link</h1>
            <p className="text-slate-300 mb-6">
              This password reset link is invalid or has expired. Please request a new one.
            </p>
            <div className="space-y-3">
              <Link
                href="/forgot-password"
                className="w-full px-4 py-3 bg-blue-500 hover:bg-blue-600 rounded-lg text-white font-medium transition-colors flex items-center justify-center gap-2"
              >
                Request New Reset Link
              </Link>
              <Link
                href="/login"
                className="w-full px-4 py-3 bg-slate-700/50 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Login
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Success state
  if (isSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-8 text-center">
            <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-8 h-8 text-emerald-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-4">Password Updated!</h1>
            <p className="text-slate-300 mb-6">
              Your password has been successfully updated. You can now log in with your new password.
            </p>
            <p className="text-slate-400 text-sm mb-6">
              Redirecting to login page in a few seconds...
            </p>
            <Link
              href="/login"
              className="w-full px-4 py-3 bg-blue-500 hover:bg-blue-600 rounded-lg text-white font-medium transition-colors flex items-center justify-center gap-2"
            >
              Continue to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Password reset form
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <Lock className="w-8 h-8 text-blue-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Set New Password</h1>
            <p className="text-slate-400">
              Please enter your new password below.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* New Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
                New Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="w-full px-4 py-3 pr-12 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-colors"
                  disabled={isLoading}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                  disabled={isLoading}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              
              {/* Password Requirements */}
              <div className="mt-2 space-y-1">
                <p className="text-xs text-slate-400">Password must contain:</p>
                <div className="grid grid-cols-2 gap-1 text-xs">
                  <div className={`flex items-center gap-1 ${password.length >= 8 ? 'text-emerald-400' : 'text-slate-500'}`}>
                    <div className={`w-1 h-1 rounded-full ${password.length >= 8 ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                    8+ characters
                  </div>
                  <div className={`flex items-center gap-1 ${/(?=.*[a-z])/.test(password) ? 'text-emerald-400' : 'text-slate-500'}`}>
                    <div className={`w-1 h-1 rounded-full ${/(?=.*[a-z])/.test(password) ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                    Lowercase
                  </div>
                  <div className={`flex items-center gap-1 ${/(?=.*[A-Z])/.test(password) ? 'text-emerald-400' : 'text-slate-500'}`}>
                    <div className={`w-1 h-1 rounded-full ${/(?=.*[A-Z])/.test(password) ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                    Uppercase
                  </div>
                  <div className={`flex items-center gap-1 ${/(?=.*\d)/.test(password) ? 'text-emerald-400' : 'text-slate-500'}`}>
                    <div className={`w-1 h-1 rounded-full ${/(?=.*\d)/.test(password) ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                    Number
                  </div>
                </div>
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-300 mb-2">
                Confirm New Password
              </label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className="w-full px-4 py-3 pr-12 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-colors"
                  disabled={isLoading}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                  disabled={isLoading}
                >
                  {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              
              {/* Password Match Indicator */}
              {confirmPassword && (
                <div className={`mt-2 flex items-center gap-2 text-xs ${
                  password === confirmPassword ? 'text-emerald-400' : 'text-red-400'
                }`}>
                  <div className={`w-1 h-1 rounded-full ${
                    password === confirmPassword ? 'bg-emerald-400' : 'bg-red-400'
                  }`} />
                  {password === confirmPassword ? 'Passwords match' : 'Passwords do not match'}
                </div>
              )}
            </div>

            {/* Error Message */}
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading || !password.trim() || !confirmPassword.trim() || password !== confirmPassword}
              className="w-full px-4 py-3 bg-blue-500 hover:bg-blue-600 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-colors flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Updating Password...
                </>
              ) : (
                <>
                  <Lock className="w-5 h-5" />
                  Update Password
                </>
              )}
            </button>
          </form>

          {/* Back to Login */}
          <div className="mt-6 text-center">
            <Link
              href="/login"
              className="text-slate-400 hover:text-white transition-colors flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// Loading component for Suspense fallback
function ResetPasswordLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl p-8 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400 mx-auto mb-4" />
        <p className="text-slate-300">Loading reset form...</p>
      </div>
    </div>
  );
}

// Main export with Suspense boundary
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetPasswordLoading />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
