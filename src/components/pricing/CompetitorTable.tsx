'use client';

import { Check, Minus } from 'lucide-react';
import { COMPETITOR_ROWS, COMPETITOR_PRICING_AS_OF } from '@/lib/pricing/competitors';

export function CompetitorTable() {
  return (
    <section className="mb-12 max-w-5xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-white mb-2">Why sellers switch to BloomEngine</h2>
        <p className="text-slate-400">
          Comparable Amazon-research tooling, side by side.
        </p>
      </div>

      <div className="bg-slate-800/40 backdrop-blur-xl rounded-2xl border border-slate-700/50 overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left p-5 text-slate-300 font-medium text-sm uppercase tracking-wide">
                  Tool
                </th>
                <th className="p-4 text-center text-slate-300 font-medium text-xs uppercase tracking-wide">
                  Entry tier
                </th>
                <th className="p-4 text-center text-slate-300 font-medium text-xs uppercase tracking-wide">
                  Top tier
                </th>
                <th className="p-4 text-center text-slate-300 font-medium text-xs uppercase tracking-wide">
                  AI scoring
                </th>
                <th className="p-4 text-center text-slate-300 font-medium text-xs uppercase tracking-wide">
                  Chrome lens
                </th>
                <th className="p-4 text-center text-slate-300 font-medium text-xs uppercase tracking-wide">
                  Supplier tracking
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPETITOR_ROWS.map((row) => (
                <tr
                  key={row.name}
                  className={`border-t border-slate-800/60 ${
                    row.isUs ? 'bg-emerald-500/5' : ''
                  }`}
                >
                  <td className="p-5">
                    <div className="flex items-center gap-2">
                      <span
                        className={`font-semibold ${row.isUs ? 'text-emerald-300' : 'text-white'}`}
                      >
                        {row.name}
                      </span>
                      {row.isUs && (
                        <span className="text-[10px] font-bold bg-gradient-to-r from-emerald-500 to-blue-500 text-white px-1.5 py-0.5 rounded-full">
                          YOU&apos;RE HERE
                        </span>
                      )}
                    </div>
                    <div className="text-slate-500 text-xs mt-1 leading-snug">
                      {row.positioning}
                    </div>
                  </td>
                  <td className="p-4 text-center text-white text-sm">{row.entryPrice}</td>
                  <td className="p-4 text-center text-slate-300 text-sm">{row.topPrice}</td>
                  <td className="p-4 text-center">
                    <div className="flex justify-center">
                      {row.hasAiScoring ? (
                        <Check className="w-5 h-5 text-emerald-400" />
                      ) : (
                        <Minus className="w-5 h-5 text-slate-600" />
                      )}
                    </div>
                  </td>
                  <td className="p-4 text-center">
                    <div className="flex justify-center">
                      {row.hasChromeLens ? (
                        <Check className="w-5 h-5 text-emerald-400" />
                      ) : (
                        <Minus className="w-5 h-5 text-slate-600" />
                      )}
                    </div>
                  </td>
                  <td className="p-4 text-center">
                    <div className="flex justify-center">
                      {row.hasSupplierTracking ? (
                        <Check className="w-5 h-5 text-emerald-400" />
                      ) : (
                        <Minus className="w-5 h-5 text-slate-600" />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-center text-slate-500 text-xs mt-4">
        Competitor pricing as of {COMPETITOR_PRICING_AS_OF}. Tool offerings change frequently —
        verify on each vendor&apos;s pricing page before comparing.
      </p>
    </section>
  );
}
