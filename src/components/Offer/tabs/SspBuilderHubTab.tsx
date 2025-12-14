'use client';

import { useState } from 'react';
import { Sparkles, Loader2, CheckCircle, AlertCircle, Package, Zap, Award, Palette, Gift } from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';

interface ReviewInsights {
  topLikes: string;
  topDislikes: string;
  importantInsights: string;
  importantQuestions: string;
}

interface SspBuilderHubTabProps {
  productId: string | null;
  data?: {
    quantity: string;
    functionality: string;
    quality: string;
    aesthetic: string;
    bundle: string;
  };
  reviewInsights?: ReviewInsights;
  onChange: (data: {
    quantity: string;
    functionality: string;
    quality: string;
    aesthetic: string;
    bundle: string;
  }) => void;
}

export function SspBuilderHubTab({ productId, data, reviewInsights, onChange }: SspBuilderHubTabProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const ssp = data || {
    quantity: '',
    functionality: '',
    quality: '',
    aesthetic: '',
    bundle: ''
  };

  const handleChange = (field: keyof typeof ssp, value: string) => {
    onChange({
      ...ssp,
      [field]: value
    });
  };

  const handleGenerateWithAI = async () => {
    if (!productId) {
      setError('Please select a product');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/offer/analyze-reviews', {
        method: 'POST',
        body: JSON.stringify({ 
          productId, 
          generateSSP: true,
          reviewInsights: reviewInsights || null
        }),
        headers: {
          ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` })
        },
      });

      if (!response.ok) {
        throw new Error('Failed to generate SSP ideas');
      }

      const result = await response.json();

      if (result.success && result.data) {
        onChange(result.data.ssp || {});
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } else {
        throw new Error(result.error || 'Failed to generate SSP ideas');
      }
    } catch (error) {
      console.error('Error generating SSP:', error);
      setError(error instanceof Error ? error.message : 'Failed to generate SSP ideas');
    } finally {
      setLoading(false);
    }
  };

  const sspCategories = [
    {
      key: 'quantity' as const,
      title: 'Quantity',
      subtitle: 'Case pack, multi pack',
      value: ssp.quantity,
      icon: Package,
      color: 'purple',
      borderColor: 'border-purple-500/50',
      iconBg: 'bg-purple-500/20',
      iconColor: 'text-purple-400'
    },
    {
      key: 'functionality' as const,
      title: 'Functionality',
      subtitle: 'Ease of use, different uses, added features, size and shape',
      value: ssp.functionality,
      icon: Zap,
      color: 'red',
      borderColor: 'border-red-500/50',
      iconBg: 'bg-red-500/20',
      iconColor: 'text-red-400'
    },
    {
      key: 'quality' as const,
      title: 'Quality',
      subtitle: 'Materials used, construction',
      value: ssp.quality,
      icon: Award,
      color: 'green',
      borderColor: 'border-emerald-500/50',
      iconBg: 'bg-emerald-500/20',
      iconColor: 'text-emerald-400'
    },
    {
      key: 'aesthetic' as const,
      title: 'Aesthetic',
      subtitle: 'Design, pattern, color, style',
      value: ssp.aesthetic,
      icon: Palette,
      color: 'blue',
      borderColor: 'border-blue-500/50',
      iconBg: 'bg-blue-500/20',
      iconColor: 'text-blue-400'
    },
    {
      key: 'bundle' as const,
      title: 'Bundle',
      subtitle: 'Accessories, relevant items to add',
      value: ssp.bundle,
      icon: Gift,
      color: 'pink',
      borderColor: 'border-pink-500/50',
      iconBg: 'bg-pink-500/20',
      iconColor: 'text-pink-400'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header - WOW Factor */}
      <div className="bg-gradient-to-br from-purple-900/30 via-blue-900/20 to-slate-800/50 rounded-2xl border-2 border-purple-500/70 shadow-2xl shadow-purple-500/20 p-8 relative overflow-hidden">
        {/* Decorative background elements */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl"></div>
        
        <div className="flex items-start justify-between mb-2 relative z-10">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-blue-500 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/50">
                <Sparkles className="w-6 h-6 text-white" strokeWidth={2.5} fill="white" />
              </div>
              <div>
                <h3 className="text-4xl font-bold bg-gradient-to-r from-purple-400 via-blue-400 to-purple-400 bg-clip-text text-transparent mb-2">
                  SUPER SELLING POINTS
                </h3>
                <p className="text-slate-300 text-base font-medium">Builder Hub</p>
              </div>
            </div>
            <p className="text-slate-400 text-lg max-w-2xl">Create compelling selling points across five key dimensions that will make your product stand out and dominate the market</p>
          </div>
          <div className="hidden md:block">
            <div className="w-20 h-20 bg-gradient-to-br from-purple-500/20 to-blue-500/20 rounded-2xl flex items-center justify-center backdrop-blur-sm border border-purple-500/30">
              <Sparkles className="w-10 h-10 text-purple-400" strokeWidth={1.5} />
            </div>
          </div>
        </div>
      </div>

      {/* Generate With AI Button - Centered and Longer */}
      <div className="flex justify-center">
        <button
          onClick={handleGenerateWithAI}
          disabled={loading}
          className="px-8 py-4 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-all flex items-center gap-2 min-w-[300px] justify-center"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5" />
              GENERATE SSPs WITH AI
            </>
          )}
        </button>
      </div>

      {/* SSP Cards - Horizontal Scrollable Container */}
      <div className="overflow-x-auto pb-4 -mx-2 px-2">
        <div className="flex gap-6 min-w-max">
          {sspCategories.map((category) => {
            const IconComponent = category.icon;
            return (
              <div 
                key={category.key}
                className={`bg-slate-800/50 rounded-2xl border-2 ${category.borderColor} p-6 min-w-[500px] max-w-[500px] flex-shrink-0`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-14 h-14 ${category.iconBg} rounded-xl flex items-center justify-center flex-shrink-0`}>
                      <IconComponent className={`w-7 h-7 ${category.iconColor}`} strokeWidth={1.5} />
                    </div>
                    <div>
                      <h4 className="text-xl font-bold text-white mb-1">{category.title}</h4>
                      <p className="text-sm text-slate-400">{category.subtitle}</p>
                    </div>
                  </div>
                </div>
                <textarea
                  value={category.value}
                  onChange={(e) => handleChange(category.key, e.target.value)}
                  rows={20}
                  className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 resize-none"
                  placeholder={`Enter ${category.title.toLowerCase()} ideas...`}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Success Message */}
      {success && (
        <div className="p-4 bg-emerald-500/10 border-2 border-emerald-500/20 rounded-xl flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-emerald-400" />
          <span className="text-sm text-emerald-400 font-medium">
            SSP ideas generated successfully! Review and edit the suggestions above.
          </span>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="p-4 bg-red-500/10 border-2 border-red-500/20 rounded-xl flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <span className="text-sm text-red-400 font-medium">{error}</span>
        </div>
      )}
    </div>
  );
}
