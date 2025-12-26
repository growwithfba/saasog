'use client';

import { useState, useEffect } from 'react';
import { Sparkles, Loader2, CheckCircle, AlertCircle, Package, Zap, Award, Palette, Gift, Brain, FileSearch, Lightbulb, PenTool } from 'lucide-react';
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

const progressSteps = [
  { icon: FileSearch, label: 'Analyzing review insights...', duration: 2000 },
  { icon: Brain, label: 'Processing customer feedback...', duration: 3000 },
  { icon: Lightbulb, label: 'Generating SSP ideas...', duration: 4000 },
  { icon: PenTool, label: 'Crafting compelling selling points...', duration: 3000 },
];

export function SspBuilderHubTab({ productId, data, reviewInsights, onChange }: SspBuilderHubTabProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);

  // Progress step animation
  useEffect(() => {
    if (!loading) {
      setCurrentStep(0);
      setElapsedTime(0);
      return;
    }

    const stepInterval = setInterval(() => {
      setCurrentStep((prev) => (prev < progressSteps.length - 1 ? prev + 1 : prev));
    }, 3000);

    const timeInterval = setInterval(() => {
      setElapsedTime((prev) => prev + 1);
    }, 1000);

    return () => {
      clearInterval(stepInterval);
      clearInterval(timeInterval);
    };
  }, [loading]);

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
        // Persist SSP improvements to offer_products
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const userId = session?.user?.id;
          const { error: upsertError } = await supabase
            .from('offer_products')
            .upsert(
              {
                product_id: productId,
                improvements: result.data.ssp || {},
                user_id: userId || null
              },
              { onConflict: 'product_id' }
            );
          if (upsertError) {
            console.error('Error saving improvements to offer_products:', upsertError);
          } else {
            console.log('Improvements saved to offer_products');
          }
        } catch (persistError) {
          console.error('Error persisting improvements:', persistError);
        }
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

      {/* Loading Progress Overlay */}
      {loading && (
        <div className="bg-gradient-to-br from-slate-900/95 via-purple-900/30 to-slate-900/95 rounded-2xl border-2 border-purple-500/50 p-8 relative overflow-hidden">
          {/* Animated background effect */}
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-purple-500/10 to-transparent rounded-full animate-pulse"></div>
            <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-tl from-blue-500/10 to-transparent rounded-full animate-pulse" style={{ animationDelay: '1s' }}></div>
          </div>

          <div className="relative z-10">
            {/* Main loading indicator */}
            <div className="flex flex-col items-center mb-8">
              <div className="relative">
                {/* Spinning outer ring */}
                <div className="w-24 h-24 rounded-full border-4 border-purple-500/20 border-t-purple-500 animate-spin"></div>
                {/* Inner icon */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full flex items-center justify-center shadow-lg shadow-purple-500/50">
                    <Brain className="w-8 h-8 text-white animate-pulse" />
                  </div>
                </div>
              </div>
              <h4 className="text-2xl font-bold text-white mt-6 mb-2">AI Analysis in Progress</h4>
              <p className="text-slate-400 text-sm">Please wait while we generate your Super Selling Points</p>
            </div>

            {/* Progress steps */}
            <div className="max-w-md mx-auto space-y-3">
              {progressSteps.map((step, index) => {
                const StepIcon = step.icon;
                const isActive = index === currentStep;
                const isCompleted = index < currentStep;
                
                return (
                  <div 
                    key={index}
                    className={`flex items-center gap-4 p-3 rounded-xl transition-all duration-500 ${
                      isActive 
                        ? 'bg-purple-500/20 border border-purple-500/50' 
                        : isCompleted 
                          ? 'bg-emerald-500/10 border border-emerald-500/30' 
                          : 'bg-slate-800/30 border border-slate-700/30'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-500 ${
                      isActive 
                        ? 'bg-purple-500/30' 
                        : isCompleted 
                          ? 'bg-emerald-500/20' 
                          : 'bg-slate-700/30'
                    }`}>
                      {isCompleted ? (
                        <CheckCircle className="w-5 h-5 text-emerald-400" />
                      ) : isActive ? (
                        <StepIcon className="w-5 h-5 text-purple-400 animate-pulse" />
                      ) : (
                        <StepIcon className="w-5 h-5 text-slate-500" />
                      )}
                    </div>
                    <span className={`text-sm font-medium transition-all duration-500 ${
                      isActive 
                        ? 'text-purple-300' 
                        : isCompleted 
                          ? 'text-emerald-400' 
                          : 'text-slate-500'
                    }`}>
                      {step.label}
                    </span>
                    {isActive && (
                      <Loader2 className="w-4 h-4 text-purple-400 animate-spin ml-auto" />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Elapsed time */}
            <div className="text-center mt-6">
              <span className="text-slate-500 text-sm">
                Elapsed time: <span className="text-purple-400 font-mono">{elapsedTime}s</span>
              </span>
            </div>

            {/* Tip message */}
            <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl">
              <div className="flex items-start gap-3">
                <Lightbulb className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-blue-300">
                  <span className="font-semibold">Pro Tip:</span> The AI analyzes customer reviews to identify pain points and opportunities, then generates tailored selling point suggestions for each category.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

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
