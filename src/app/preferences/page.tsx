'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  Settings, 
  ArrowLeft, 
  Bell, 
  Moon, 
  Sun, 
  Monitor, 
  Globe, 
  Download,
  Mail,
  Smartphone,
  BarChart3,
  Save,
  CheckCircle,
  AlertCircle,
  Volume2,
  Eye,
  Shield,
  Database
} from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';

export default function PreferencesPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  // Preference states
  const [theme, setTheme] = useState('dark');
  const [language, setLanguage] = useState('en');
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(false);
  const [analysisAlerts, setAnalysisAlerts] = useState(true);
  const [marketingEmails, setMarketingEmails] = useState(false);
  const [autoDownload, setAutoDownload] = useState(false);
  const [dataRetention, setDataRetention] = useState('1year');
  const [analyticsTracking, setAnalyticsTracking] = useState(true);
  const [soundEffects, setSoundEffects] = useState(true);
  const [compactView, setCompactView] = useState(false);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user: supabaseUser }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !supabaseUser) {
        router.push('/login');
        return;
      }
      
      setUser(supabaseUser);
      
      // Load preferences from user metadata or localStorage
      const preferences = supabaseUser.user_metadata?.preferences || {};
      setTheme(preferences.theme || 'dark');
      setLanguage(preferences.language || 'en');
      setEmailNotifications(preferences.emailNotifications ?? true);
      setPushNotifications(preferences.pushNotifications ?? false);
      setAnalysisAlerts(preferences.analysisAlerts ?? true);
      setMarketingEmails(preferences.marketingEmails ?? false);
      setAutoDownload(preferences.autoDownload ?? false);
      setDataRetention(preferences.dataRetention || '1year');
      setAnalyticsTracking(preferences.analyticsTracking ?? true);
      setSoundEffects(preferences.soundEffects ?? true);
      setCompactView(preferences.compactView ?? false);
      
      setLoading(false);
    };
    
    checkUser();
  }, [router]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const preferences = {
        theme,
        language,
        emailNotifications,
        pushNotifications,
        analysisAlerts,
        marketingEmails,
        autoDownload,
        dataRetention,
        analyticsTracking,
        soundEffects,
        compactView
      };

      // Update user metadata
      const { error: updateError } = await supabase.auth.updateUser({
        data: { 
          preferences,
          ...user.user_metadata
        }
      });

      if (updateError) throw updateError;

      setSuccess('Preferences saved successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (error: any) {
      setError(error.message || 'Failed to save preferences');
    } finally {
      setSaving(false);
    }
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
      <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl animate-pulse"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>

      <div className="relative min-h-screen p-6">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-4 mb-8">
            <Link 
              href="/dashboard" 
              className="p-3 bg-slate-800/50 hover:bg-slate-700/50 rounded-xl transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-slate-400" />
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-white">Preferences</h1>
              <p className="text-slate-400">Customize your app experience</p>
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

          {/* Preferences Sections */}
          <div className="space-y-8">
            {/* Appearance */}
            <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-8">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center">
                  <Eye className="w-6 h-6 text-purple-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Appearance</h2>
                  <p className="text-slate-400">Customize the look and feel</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-3">Theme</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: 'light', icon: Sun, label: 'Light' },
                      { value: 'dark', icon: Moon, label: 'Dark' },
                      { value: 'system', icon: Monitor, label: 'System' }
                    ].map((option) => (
                      <button
                        key={option.value}
                        onClick={() => setTheme(option.value)}
                        className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-all ${
                          theme === option.value
                            ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                            : 'bg-slate-700/30 border-slate-600/50 text-slate-400 hover:bg-slate-700/50'
                        }`}
                      >
                        <option.icon className="w-5 h-5" />
                        <span className="text-xs font-medium">{option.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-3">Language</label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  >
                    <option value="en">English</option>
                    <option value="es">Español</option>
                    <option value="fr">Français</option>
                    <option value="de">Deutsch</option>
                    <option value="pt">Português</option>
                  </select>
                </div>
              </div>

              <div className="mt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-slate-300">Compact View</label>
                    <p className="text-xs text-slate-500">Show more data in less space</p>
                  </div>
                  <button
                    onClick={() => setCompactView(!compactView)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      compactView ? 'bg-blue-500' : 'bg-slate-600'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        compactView ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>

            {/* Notifications */}
            <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-8">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center">
                  <Bell className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Notifications</h2>
                  <p className="text-slate-400">Manage how you receive updates</p>
                </div>
              </div>

              <div className="space-y-4">
                {[
                  {
                    key: 'emailNotifications',
                    value: emailNotifications,
                    setter: setEmailNotifications,
                    icon: Mail,
                    title: 'Email Notifications',
                    description: 'Receive updates via email'
                  },
                  {
                    key: 'pushNotifications',
                    value: pushNotifications,
                    setter: setPushNotifications,
                    icon: Smartphone,
                    title: 'Push Notifications',
                    description: 'Browser and mobile notifications'
                  },
                  {
                    key: 'analysisAlerts',
                    value: analysisAlerts,
                    setter: setAnalysisAlerts,
                    icon: BarChart3,
                    title: 'Analysis Alerts',
                    description: 'Notify when analysis is complete'
                  },
                  {
                    key: 'marketingEmails',
                    value: marketingEmails,
                    setter: setMarketingEmails,
                    icon: Mail,
                    title: 'Marketing Emails',
                    description: 'Product updates and tips'
                  }
                ].map((setting) => (
                  <div key={setting.key} className="flex items-center justify-between p-4 bg-slate-900/30 rounded-lg">
                    <div className="flex items-center gap-3">
                      <setting.icon className="w-5 h-5 text-slate-400" />
                      <div>
                        <p className="text-sm font-medium text-slate-300">{setting.title}</p>
                        <p className="text-xs text-slate-500">{setting.description}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setting.setter(!setting.value)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        setting.value ? 'bg-emerald-500' : 'bg-slate-600'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          setting.value ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Data & Privacy */}
            <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-8">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-amber-500/20 rounded-xl flex items-center justify-center">
                  <Shield className="w-6 h-6 text-amber-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Data & Privacy</h2>
                  <p className="text-slate-400">Control your data and privacy settings</p>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-3">Data Retention</label>
                  <select
                    value={dataRetention}
                    onChange={(e) => setDataRetention(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  >
                    <option value="3months">3 Months</option>
                    <option value="6months">6 Months</option>
                    <option value="1year">1 Year</option>
                    <option value="2years">2 Years</option>
                    <option value="forever">Keep Forever</option>
                  </select>
                  <p className="text-xs text-slate-500 mt-2">How long to keep your analysis data</p>
                </div>

                <div className="space-y-4">
                  {[
                    {
                      key: 'autoDownload',
                      value: autoDownload,
                      setter: setAutoDownload,
                      icon: Download,
                      title: 'Auto-download Reports',
                      description: 'Automatically save analysis reports'
                    },
                    {
                      key: 'analyticsTracking',
                      value: analyticsTracking,
                      setter: setAnalyticsTracking,
                      icon: Database,
                      title: 'Analytics Tracking',
                      description: 'Help improve the app with usage data'
                    },
                    {
                      key: 'soundEffects',
                      value: soundEffects,
                      setter: setSoundEffects,
                      icon: Volume2,
                      title: 'Sound Effects',
                      description: 'Play sounds for notifications and actions'
                    }
                  ].map((setting) => (
                    <div key={setting.key} className="flex items-center justify-between p-4 bg-slate-900/30 rounded-lg">
                      <div className="flex items-center gap-3">
                        <setting.icon className="w-5 h-5 text-slate-400" />
                        <div>
                          <p className="text-sm font-medium text-slate-300">{setting.title}</p>
                          <p className="text-xs text-slate-500">{setting.description}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => setting.setter(!setting.value)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          setting.value ? 'bg-amber-500' : 'bg-slate-600'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            setting.value ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 disabled:from-slate-600 disabled:to-slate-700 text-white font-medium rounded-xl transition-all disabled:cursor-not-allowed"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save Preferences
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
