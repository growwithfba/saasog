'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/utils/supabaseClient';
import {
  Eye,
  EyeOff,
  User,
  Lock,
  ArrowRight,
  CheckCircle,
  AlertCircle,
  Sparkles,
  Shield,
  Loader2,
  Mail,
  CreditCard,
} from 'lucide-react';
import { Footer } from '@/components/layout/Footer';
import { Logo } from '@/components/Logo';

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: 1 | 2 | 3 | 4 }) {
  const steps = [
    { n: 1, label: 'Choose Plan' },
    { n: 2, label: 'Payment' },
    { n: 3, label: 'Create Account' },
    { n: 4, label: 'Confirm Email' },
  ];
  return (
    <div className="flex items-center justify-center gap-0 mb-8 flex-wrap gap-y-2">
      {steps.map((step, i) => (
        <div key={step.n} className="flex items-center">
          <div className="flex items-center gap-1.5">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                step.n < current
                  ? 'bg-emerald-500 text-white'
                  : step.n === current
                  ? 'bg-blue-500 text-white'
                  : 'bg-slate-700 text-slate-400'
              }`}
            >
              {step.n < current ? '✓' : step.n}
            </div>
            <span
              className={`text-xs font-medium hidden sm:inline ${
                step.n < current
                  ? 'text-emerald-400'
                  : step.n === current
                  ? 'text-blue-400'
                  : 'text-slate-500'
              }`}
            >
              {step.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className="w-6 h-px bg-slate-600 mx-1.5" />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main form ────────────────────────────────────────────────────────────────

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');

  // Session data from Stripe
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [planType, setPlanType] = useState<'MONTHLY' | 'YEARLY' | null>(null);
  const [sessionLoading, setSessionLoading] = useState(!!sessionId);
  const [sessionError, setSessionError] = useState('');

  // Form fields
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState(0);

  // Submission state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successEmail, setSuccessEmail] = useState(''); // email for confirmation screen

  // ── Fetch Stripe session info ─────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) return;

    const fetchSession = async () => {
      try {
        const res = await fetch(`/api/stripe/get-session?session_id=${sessionId}`);
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Failed to load session');
        setSessionEmail(data.data.email);
        setPlanType(data.data.planType);
      } catch (err) {
        console.error('Error fetching Stripe session:', err);
        setSessionError('Could not load your checkout session. Please try again or contact support.');
      } finally {
        setSessionLoading(false);
      }
    };

    fetchSession();
  }, [sessionId]);

  // ── Password helpers ──────────────────────────────────────────────────────
  const calcStrength = (p: string) => {
    let s = 0;
    if (p.length >= 8) s++;
    if (/[a-z]/.test(p)) s++;
    if (/[A-Z]/.test(p)) s++;
    if (/[0-9]/.test(p)) s++;
    if (/[^A-Za-z0-9]/.test(p)) s++;
    return s;
  };

  const strengthColor =
    passwordStrength <= 2 ? 'bg-red-500' : passwordStrength <= 3 ? 'bg-amber-500' : 'bg-emerald-500';
  const strengthText =
    passwordStrength <= 2 ? 'Weak' : passwordStrength <= 3 ? 'Medium' : 'Strong';
  const strengthTextColor =
    passwordStrength <= 2 ? 'text-red-400' : passwordStrength <= 3 ? 'text-amber-400' : 'text-emerald-400';

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const email = sessionEmail ?? '';

    if (!email) {
      setError('Could not determine your email address. Please start over.');
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      setLoading(false);
      return;
    }

    if (passwordStrength < 3) {
      setError('Please use a stronger password (at least 8 characters with uppercase, lowercase, and numbers).');
      setLoading(false);
      return;
    }

    try {
      // 1. Create Supabase account
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name, full_name: name },
        },
      });

      if (signUpError) throw signUpError;

      const userId = data.user?.id;
      if (!userId) throw new Error('Account creation failed — no user ID returned.');

      // 2. Upsert profile with name
      await supabase.from('profiles').upsert({
        id: userId,
        full_name: name,
        username: email.split('@')[0],
      });

      // 3. Link the Stripe session to the new account
      if (sessionId) {
        const linkRes = await fetch('/api/stripe/link-account', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, userId }),
        });
        const linkData = await linkRes.json();
        if (!linkData.success) {
          // Non-fatal: log and continue — user can still use the app
          console.error('Failed to link Stripe account:', linkData.error);
        }
      }

      // 4a. Email confirmation is enabled → show confirmation screen
      if (data.user && !data.session) {
        setSuccessEmail(email);
        return;
      }

      // 4b. Auto-login (confirmations disabled) → go to app
      router.push('/research');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Registration failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // ── Confirmation screen ───────────────────────────────────────────────────
  if (successEmail) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-6">
        <div className="text-center max-w-md w-full">
          <Logo variant="horizontal" className="h-16 mx-auto mb-8" alt="BloomEngine" priority />
          <StepIndicator current={4} />
          <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-8">
            <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Mail className="w-8 h-8 text-emerald-400" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-3">Check your inbox!</h2>
            <p className="text-slate-400 mb-4">
              We sent a confirmation link to{' '}
              <span className="text-white font-medium">{successEmail}</span>.
            </p>
            <p className="text-slate-400 text-sm">
              Click the link in the email to confirm your account. Once confirmed, you can sign in
              and start using BloomEngine — your subscription is already active!
            </p>
            <div className="mt-6 pt-6 border-t border-slate-700/50">
              <p className="text-slate-500 text-xs">
                Didn&apos;t receive it? Check your spam folder or{' '}
                <Link href="/login" className="text-blue-400 hover:text-blue-300 transition-colors">
                  sign in
                </Link>{' '}
                to resend.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Loading Stripe session ────────────────────────────────────────────────
  if (sessionLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-blue-400 animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Loading your checkout details...</p>
        </div>
      </div>
    );
  }

  // ── Session error (invalid/expired session_id) ────────────────────────────
  if (sessionError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-6">
        <div className="text-center max-w-md w-full">
          <Logo variant="horizontal" className="h-16 mx-auto mb-8" alt="BloomEngine" priority />
          <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-red-500/30 p-8">
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-red-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-3">Session not found</h2>
            <p className="text-slate-400 text-sm mb-6">{sessionError}</p>
            <Link
              href="/plans"
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-emerald-500 text-white font-semibold rounded-xl transition-all hover:from-blue-600 hover:to-emerald-600"
            >
              Back to Plans
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── No session_id → redirect to plans ────────────────────────────────────
  if (!sessionId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-6">
        <div className="text-center max-w-md w-full">
          <Logo variant="horizontal" className="h-16 mx-auto mb-8" alt="BloomEngine" priority />
          <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-8">
            <h2 className="text-xl font-bold text-white mb-3">Choose a plan first</h2>
            <p className="text-slate-400 text-sm mb-6">
              Please select a subscription plan before creating your account.
            </p>
            <Link
              href="/plans"
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-emerald-500 text-white font-semibold rounded-xl transition-all hover:from-blue-600 hover:to-emerald-600"
            >
              View Plans
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <p className="text-slate-500 text-sm mt-6">
            Already have an account?{' '}
            <Link href="/login" className="text-blue-400 hover:text-blue-300 transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    );
  }

  // ── Main registration form (after Stripe checkout) ────────────────────────
  const planLabel =
    planType === 'MONTHLY' ? 'Monthly Plan' : planType === 'YEARLY' ? 'Annual Plan' : 'Subscription';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 relative overflow-hidden flex flex-col">
      {/* Background blobs */}
      <div className="absolute inset-0 bg-slate-700 opacity-10 pointer-events-none" />
      <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl animate-pulse pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl animate-pulse delay-1000 pointer-events-none" />

      <div className="relative flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="text-center mb-2">
            <Logo variant="horizontal" className="h-16 mx-auto" alt="BloomEngine" priority />
          </div>

          {/* Step indicator */}
          <StepIndicator current={3} />

          {/* Card */}
          <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-700/50 p-8">
            {/* Header */}
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-2xl mb-4">
                <Sparkles className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-1">Create Your Account</h2>
              <p className="text-slate-400 text-sm">Your payment is complete — set up your login.</p>
            </div>

            {/* Plan badge */}
            <div className="mb-6 flex items-center gap-3 bg-emerald-900/30 border border-emerald-500/40 rounded-xl px-4 py-3">
              <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-emerald-400 text-sm font-semibold">
                  {planLabel} — Payment complete!
                </p>
                <p className="text-slate-400 text-xs">
                  {sessionEmail ?? 'Your email was collected during checkout'}
                </p>
              </div>
              <CreditCard className="w-4 h-4 text-emerald-500 flex-shrink-0" />
            </div>

            {/* Email display (read-only, pre-filled from Stripe) */}
            <div className="mb-5 space-y-2">
              <label className="block text-sm font-medium text-slate-300">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <div className="w-full pl-12 pr-4 py-3 bg-slate-900/30 border border-slate-700 rounded-xl text-slate-400 text-sm select-all cursor-default">
                  {sessionEmail ?? '—'}
                </div>
              </div>
              <p className="text-slate-500 text-xs">Collected during checkout — this will be your login email.</p>
            </div>

            <form className="space-y-5" onSubmit={handleSubmit}>
              {/* Error */}
              {error && (
                <div className="bg-red-900/20 border border-red-500/50 rounded-xl p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}

              {/* Full Name */}
              <div className="space-y-2">
                <label htmlFor="name" className="block text-sm font-medium text-slate-300">
                  Full Name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-slate-900/50 border border-slate-600 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                    placeholder="Your full name"
                    required
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-2">
                <label htmlFor="password" className="block text-sm font-medium text-slate-300">
                  Create Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setPasswordStrength(calcStrength(e.target.value));
                    }}
                    className="w-full pl-12 pr-12 py-3 bg-slate-900/50 border border-slate-600 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                    placeholder="Create a strong password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {password && (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-slate-700 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${strengthColor}`}
                        style={{ width: `${(passwordStrength / 5) * 100}%` }}
                      />
                    </div>
                    <span className={`text-xs font-medium ${strengthTextColor}`}>{strengthText}</span>
                  </div>
                )}
              </div>

              {/* Confirm Password */}
              <div className="space-y-2">
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-300">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full pl-12 pr-12 py-3 bg-slate-900/50 border border-slate-600 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                    placeholder="Confirm your password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300 transition-colors"
                  >
                    {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {confirmPassword && (
                  <div className="flex items-center gap-2">
                    {password === confirmPassword ? (
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-400" />
                    )}
                    <span className={`text-xs ${password === confirmPassword ? 'text-emerald-400' : 'text-red-400'}`}>
                      {password === confirmPassword ? 'Passwords match' : 'Passwords do not match'}
                    </span>
                  </div>
                )}
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading || password !== confirmPassword || passwordStrength < 3 || !sessionEmail}
                className="w-full group relative overflow-hidden bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 text-white font-semibold py-3 px-6 rounded-xl shadow-lg shadow-blue-500/25 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="relative flex items-center justify-center gap-2">
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Creating your account...
                    </>
                  ) : (
                    <>
                      Create Account
                      <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </span>
              </button>

              <div className="flex items-center justify-center gap-2 text-slate-500 text-xs">
                <Shield className="w-3 h-3" />
                <span>Your subscription is already active and secured by Stripe</span>
              </div>
            </form>

            <div className="mt-6 text-center">
              <p className="text-slate-400 text-sm">
                Already have an account?{' '}
                <Link href="/login" className="text-blue-400 hover:text-blue-300 font-medium transition-colors">
                  Sign in here
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}

// ─── Suspense wrapper (required for useSearchParams) ──────────────────────────

function RegisterLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<RegisterLoading />}>
      <RegisterForm />
    </Suspense>
  );
}
