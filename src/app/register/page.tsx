'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/utils/supabaseClient';
import { 
  Eye, 
  EyeOff, 
  Mail, 
  User, 
  Lock, 
  ArrowRight, 
  CheckCircle, 
  AlertCircle,
  Sparkles,
  TrendingUp,
  Shield,
  Zap
} from 'lucide-react';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState(0);
  const router = useRouter();

  // Password strength calculator
  const calculatePasswordStrength = (password: string) => {
    let strength = 0;
    if (password.length >= 8) strength += 1;
    if (/[a-z]/.test(password)) strength += 1;
    if (/[A-Z]/.test(password)) strength += 1;
    if (/[0-9]/.test(password)) strength += 1;
    if (/[^A-Za-z0-9]/.test(password)) strength += 1;
    return strength;
  };

  const handlePasswordChange = (newPassword: string) => {
    setPassword(newPassword);
    setPasswordStrength(calculatePasswordStrength(newPassword));
  };

  const getPasswordStrengthColor = () => {
    if (passwordStrength <= 2) return 'bg-red-500';
    if (passwordStrength <= 3) return 'bg-amber-500';
    return 'bg-emerald-500';
  };

  const getPasswordStrengthText = () => {
    if (passwordStrength <= 2) return 'Weak';
    if (passwordStrength <= 3) return 'Medium';
    return 'Strong';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    // Validation
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    if (passwordStrength < 3) {
      setError('Please use a stronger password (at least 8 characters with uppercase, lowercase, and numbers)');
      setLoading(false);
      return;
    }
    
    try {
      // Register with Supabase Auth
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name,
            full_name: name,
          }
        }
      });
      
      if (signUpError) {
        throw signUpError;
      }
      
      // The profile will be automatically created by the trigger
      // But we can update it with additional info if needed
      if (data.user?.id) {
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert({
            id: data.user.id,
            full_name: name,
            username: email.split('@')[0] // Use email prefix as default username
          });
        
        if (profileError) {
          console.error("Error updating profile:", profileError);
        }
      }
      
      // Check if email confirmation is required
      if (data.user && !data.session) {
        setSuccess('Account created successfully! Please check your email and click the confirmation link to complete your registration.');
        return;
      }
      
      // If user is automatically signed in, redirect to dashboard
      if (data.session) {
        router.push('/dashboard');
      } else {
        // Auto-login the user if not already logged in
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        
        if (signInError) {
          throw signInError;
        }
        
        router.push('/dashboard');
      }
    } catch (error: any) {
      console.error('Registration error:', error);
      setError(error.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute inset-0 bg-slate-700 opacity-10"></div>
      
      {/* Floating Orbs */}
      <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl animate-pulse"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
      
      <div className="relative min-h-screen flex">
        {/* Left Side - Branding & Features */}
        <div className="hidden lg:flex lg:w-1/2 flex-col justify-center px-12 xl:px-16">
          <div className="max-w-lg">
            {/* Logo */}
            <div className="flex items-center gap-3 mb-8">
              <img
                src="/Grow5.png"
                alt="Grow Logo"
                className="h-12 w-auto object-contain"
              />
              <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
                GROW with FBA AI
              </h1>
            </div>
            
            {/* Hero Text */}
            <h2 className="text-4xl font-bold text-white mb-6 leading-tight">
              Start Your FBA Journey with
              <span className="bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent"> AI-Powered </span>
              Market Analysis
            </h2>
            
            <p className="text-xl text-slate-300 mb-12 leading-relaxed">
              Join thousands of successful Amazon sellers who use our advanced analytics to identify profitable products and dominate their markets.
            </p>
            
            {/* Feature List */}
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-white font-semibold">Market Intelligence</h3>
                  <p className="text-slate-400">Advanced competitor analysis and market trends</p>
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center">
                  <Zap className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-white font-semibold">Instant Analysis</h3>
                  <p className="text-slate-400">Get product scores and insights in seconds</p>
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center">
                  <Shield className="w-6 h-6 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-white font-semibold">Risk Assessment</h3>
                  <p className="text-slate-400">Minimize risks with data-driven recommendations</p>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Right Side - Registration Form */}
        <div className="flex-1 lg:w-1/2 flex items-center justify-center p-6 lg:p-12">
          <div className="w-full max-w-md">
            {/* Mobile Logo */}
            <div className="lg:hidden text-center mb-8">
              <img
                src="/Grow5.png"
                alt="Grow Logo"
                className="h-16 w-auto mx-auto mb-4"
              />
              <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
                GROW with FBA AI
              </h1>
            </div>
            
            <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-700/50 p-8">
              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-2xl mb-4">
                  <Sparkles className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Create Your Account</h2>
                <p className="text-slate-400">Start analyzing profitable products today</p>
              </div>

              <form className="space-y-6" onSubmit={handleSubmit}>
                {/* Error Message */}
                {error && (
                  <div className="bg-red-900/20 border border-red-500/50 rounded-xl p-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                    <p className="text-red-400 text-sm">{error}</p>
                  </div>
                )}

                {/* Success Message */}
                {success && (
                  <div className="bg-emerald-900/20 border border-emerald-500/50 rounded-xl p-4 flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <p className="text-emerald-400 text-sm">{success}</p>
                  </div>
                )}
                
                {/* Full Name Field */}
                <div className="space-y-2">
                  <label htmlFor="name" className="block text-sm font-medium text-slate-300">
                    Full Name
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      id="name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full pl-12 pr-4 py-3 bg-slate-900/50 border border-slate-600 rounded-xl 
                               text-white placeholder-slate-400 focus:outline-none focus:ring-2 
                               focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                      placeholder="Enter your full name"
                      required
                    />
                  </div>
                </div>

                {/* Email Field */}
                <div className="space-y-2">
                  <label htmlFor="email" className="block text-sm font-medium text-slate-300">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-12 pr-4 py-3 bg-slate-900/50 border border-slate-600 rounded-xl 
                               text-white placeholder-slate-400 focus:outline-none focus:ring-2 
                               focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                      placeholder="Enter your email"
                      required
                    />
                  </div>
                </div>

                {/* Password Field */}
                <div className="space-y-2">
                  <label htmlFor="password" className="block text-sm font-medium text-slate-300">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => handlePasswordChange(e.target.value)}
                      className="w-full pl-12 pr-12 py-3 bg-slate-900/50 border border-slate-600 rounded-xl 
                               text-white placeholder-slate-400 focus:outline-none focus:ring-2 
                               focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                      placeholder="Create a strong password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-300 transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  
                  {/* Password Strength Indicator */}
                  {password && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-slate-700 rounded-full h-2 overflow-hidden">
                          <div 
                            className={`h-full transition-all duration-300 ${getPasswordStrengthColor()}`}
                            style={{ width: `${(passwordStrength / 5) * 100}%` }}
                          />
                        </div>
                        <span className={`text-xs font-medium ${
                          passwordStrength <= 2 ? 'text-red-400' :
                          passwordStrength <= 3 ? 'text-amber-400' : 'text-emerald-400'
                        }`}>
                          {getPasswordStrengthText()}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Confirm Password Field */}
                <div className="space-y-2">
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-300">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      id="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full pl-12 pr-12 py-3 bg-slate-900/50 border border-slate-600 rounded-xl 
                               text-white placeholder-slate-400 focus:outline-none focus:ring-2 
                               focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                      placeholder="Confirm your password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-300 transition-colors"
                    >
                      {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  
                  {/* Password Match Indicator */}
                  {confirmPassword && (
                    <div className="flex items-center gap-2 mt-2">
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


                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={loading || password !== confirmPassword || passwordStrength < 3}
                  className="w-full group relative overflow-hidden bg-gradient-to-r from-blue-500 to-emerald-500 
                           hover:from-blue-600 hover:to-emerald-600 text-white font-semibold py-3 px-6 rounded-xl 
                           shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all duration-200 
                           disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-blue-500/25"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <span className="relative flex items-center justify-center gap-2">
                    {loading ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Creating Account...
                      </>
                    ) : (
                      <>
                        Create Account
                        <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                      </>
                    )}
                  </span>
                </button>
              </form>

              {/* Login Link */}
              <div className="mt-8 text-center">
                <p className="text-slate-400 text-sm">
                  Already have an account?{' '}
                  <Link 
                    href="/login" 
                    className="text-blue-400 hover:text-blue-300 font-medium transition-colors"
                  >
                    Sign in here
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 