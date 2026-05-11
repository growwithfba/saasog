'use client';

import { Quote, Star } from 'lucide-react';
import { TESTIMONIALS, TRUST_STATS } from '@/lib/pricing/testimonials';

export function SocialProof() {
  return (
    <section className="mb-12 max-w-5xl mx-auto">
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-1 mb-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} className="w-5 h-5 fill-amber-400 text-amber-400" />
          ))}
        </div>
        <h2 className="text-3xl font-bold text-white mb-2">
          Trusted by {TRUST_STATS.sellersServed} Amazon sellers
        </h2>
        <p className="text-slate-400">
          {TRUST_STATS.productsVetted} products vetted · {TRUST_STATS.categoriesCalibrated} categories
          calibrated
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {TESTIMONIALS.map((t) => (
          <div
            key={t.name}
            className="bg-slate-800/40 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-6 shadow-md hover:border-slate-600/50 transition-colors"
          >
            <Quote className="w-7 h-7 text-blue-400/40 mb-3" />
            <p className="text-slate-200 text-sm leading-relaxed mb-5">&ldquo;{t.quote}&rdquo;</p>
            <div className="flex items-center gap-3 pt-4 border-t border-slate-700/50">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm ${t.accentClass}`}
              >
                {t.initials}
              </div>
              <div>
                <div className="text-white text-sm font-medium">{t.name}</div>
                <div className="text-slate-500 text-xs">{t.role}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
