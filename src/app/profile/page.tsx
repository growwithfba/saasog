'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  User, 
  Mail, 
  Calendar, 
  Save, 
  LogOut, 
  ArrowLeft, 
  Edit3, 
  CheckCircle, 
  AlertCircle,
  Settings,
  CreditCard
} from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';

export default function ProfilePage() {
  const [user, setUser] = useState<any>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user: supabaseUser }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !supabaseUser) {
        router.push('/login');
        return;
      }
      
      setUser(supabaseUser);
      setName(supabaseUser.user_metadata?.full_name || supabaseUser.user_metadata?.name || '');
      setEmail(supabaseUser.email || '');
      setLoading(false);
    };
    
    checkUser();
  }, [router]);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Name cannot be empty');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      // Update user metadata
      const { error: updateError } = await supabase.auth.updateUser({
        data: { 
          full_name: name.trim(),
          name: name.trim()
        }
      });

      if (updateError) throw updateError;

      // Update profile table if it exists
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({ 
          id: user.id, 
          full_name: name.trim(),
          updated_at: new Date().toISOString()
        });

      if (profileError) {
        console.log('Profile update error (non-critical):', profileError);
      }

      setSuccess('Profile updated successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (error: any) {
      setError(error.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Background Elements */}
      <div className="absolute inset-0 bg-slate-700 opacity-10"></div>
      <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl animate-pulse"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>

      <div className="relative min-h-screen p-6">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-4 mb-8">
            <Link 
              href="/research" 
              className="p-3 bg-slate-800/50 hover:bg-slate-700/50 rounded-xl transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-slate-400" />
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-white">Profile Settings</h1>
              <p className="text-slate-400">Manage your account information</p>
            </div>
          </div>

          {/* Main Content */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Profile Info Card */}
            <div className="lg:col-span-2">
              <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-8">
                <div className="flex items-center gap-4 mb-8">
                  <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-2xl flex items-center justify-center">
                    <User className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white">Personal Information</h2>
                    <p className="text-slate-400">Update your profile details</p>
                  </div>
                </div>

                {/* Success Message */}
                {success && (
                  <div className="mb-6 bg-emerald-900/20 border border-emerald-500/50 rounded-xl p-4">
                    <div className="flex items-center gap-3">
                      <CheckCircle className="w-5 h-5 text-emerald-400" />
                      <p className="text-emerald-300">{success}</p>
                    </div>
                  </div>
                )}

                {/* Error Message */}
                {error && (
                  <div className="mb-6 bg-red-900/20 border border-red-500/50 rounded-xl p-4">
                    <div className="flex items-center gap-3">
                      <AlertCircle className="w-5 h-5 text-red-400" />
                      <p className="text-red-300">{error}</p>
                    </div>
                  </div>
                )}

                <div className="space-y-6">
                  {/* Name Field */}
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-slate-300 mb-2">
                      Full Name
                    </label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                      <input
                        type="text"
                        id="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full pl-11 pr-4 py-3 bg-slate-900/50 border border-slate-600 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                        placeholder="Enter your full name"
                      />
                    </div>
                  </div>

                  {/* Email Field (Read-only) */}
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                      Email Address
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                      <input
                        type="email"
                        id="email"
                        value={email}
                        readOnly
                        className="w-full pl-11 pr-4 py-3 bg-slate-900/30 border border-slate-600/50 rounded-xl text-slate-400 cursor-not-allowed"
                      />
                    </div>
                    <p className="text-xs text-slate-500 mt-2">
                      Email cannot be changed. Contact support if you need to update your email address.
                    </p>
                  </div>

                  {/* Account Created */}
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Member Since
                    </label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                      <input
                        type="text"
                        value={new Date(user?.created_at).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                        readOnly
                        className="w-full pl-11 pr-4 py-3 bg-slate-900/30 border border-slate-600/50 rounded-xl text-slate-400 cursor-not-allowed"
                      />
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-4 mt-8 pt-6 border-t border-slate-700/50">
                  <button
                    onClick={handleSave}
                    disabled={saving || !name.trim()}
                    className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 disabled:from-slate-600 disabled:to-slate-700 text-white font-medium rounded-xl transition-all disabled:cursor-not-allowed"
                  >
                    {saving ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        Save Changes
                      </>
                    )}
                  </button>
                  
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-2 px-6 py-3 bg-slate-700/50 hover:bg-red-500/20 border border-slate-600/50 hover:border-red-500/50 text-slate-300 hover:text-red-400 font-medium rounded-xl transition-all"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </button>
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Quick Actions */}
              <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center">
                    <Settings className="w-5 h-5 text-purple-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">Quick Actions</h3>
                  </div>
                </div>
                <div className="space-y-3">
                  <Link 
                    href="/research" 
                    className="block w-full text-left px-4 py-2 bg-slate-700/30 hover:bg-slate-700/50 rounded-lg text-slate-300 hover:text-white transition-colors"
                  >
                    Back to Research
                  </Link>
                  <Link 
                    href="/subscription" 
                    className="block w-full text-left px-4 py-2 bg-slate-700/30 hover:bg-slate-700/50 rounded-lg text-slate-300 hover:text-white transition-colors flex items-center gap-2"
                  >
                    <CreditCard className="w-4 h-4" />
                    Subscription Plans
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
