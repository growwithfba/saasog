'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/utils/supabaseClient';
import { ArrowRight, BarChart3, CheckCircle, Package, TrendingUp, Users, Zap, Star, Shield } from 'lucide-react';
import Link from 'next/link';

function Page() {
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        router.push('/dashboard');
      } else {
        setLoading(false);
      }
    };
    checkUser();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Navigation */}
      <nav className="bg-slate-900/50 backdrop-blur-xl border-b border-slate-700/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <img src="/Grow5.png" alt="Grow" className="h-10 w-auto" />
              <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
                GROW with FBA AI
              </h1>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/login" className="px-4 py-2 text-slate-300 hover:text-white transition-colors">
                Sign In
              </Link>
              <Link href="/register" className="px-4 py-2 bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 text-white font-medium rounded-lg transition-all">
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500/10 border border-blue-500/20 rounded-full mb-6">
              <Zap className="w-4 h-4 text-blue-400" />
              <span className="text-sm text-blue-400">AI-Powered Amazon FBA Analysis</span>
            </div>
            
            <h1 className="text-5xl sm:text-6xl font-bold text-white mb-6 leading-tight">
              Make Smarter FBA Decisions with{' '}
              <span className="bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
                AI Intelligence
              </span>
            </h1>
            
            <p className="text-xl text-slate-400 mb-8">
              Analyze competitors, predict market trends, and validate product opportunities 
              with our advanced AI-powered scoring system.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/register" className="px-8 py-4 bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 text-white font-medium rounded-lg transition-all flex items-center justify-center gap-2">
                Start Free Analysis
                <ArrowRight className="w-5 h-5" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

export default Page;
