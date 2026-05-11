'use client';

import { Fragment } from 'react';
import { Check, Minus } from 'lucide-react';
import { FEATURE_MATRIX, type MatrixValue } from '@/lib/pricing/featureMatrix';

function renderValue(value: MatrixValue) {
  if (value === true) {
    return <Check className="w-5 h-5 text-emerald-400" />;
  }
  if (value === false) {
    return <Minus className="w-5 h-5 text-slate-600" />;
  }
  return <span className="text-sm font-semibold text-white">{value}</span>;
}

export function FeatureMatrix() {
  return (
    <section className="mb-12 max-w-5xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-white mb-2">Compare features in detail</h2>
        <p className="text-slate-400">Every feature, every tier. No fine print.</p>
      </div>

      <div className="bg-slate-800/40 backdrop-blur-xl rounded-2xl border border-slate-700/50 overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left p-5 text-slate-300 font-medium text-sm uppercase tracking-wide">
                  Feature
                </th>
                <th className="p-5 text-center text-slate-300 font-semibold w-40">
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-base">Core</span>
                    <span className="text-xs font-normal text-slate-500">$39 / mo</span>
                  </div>
                </th>
                <th className="p-5 text-center text-white font-semibold w-40 bg-emerald-500/5">
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-base inline-flex items-center gap-1.5">
                      Pro
                      <span className="text-[9px] font-bold bg-gradient-to-r from-emerald-500 to-blue-500 text-white px-1.5 py-0.5 rounded-full">
                        POPULAR
                      </span>
                    </span>
                    <span className="text-xs font-normal text-slate-400">$99 / mo</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {FEATURE_MATRIX.map((group) => (
                <Fragment key={group.group}>
                  <tr className="bg-slate-900/40">
                    <td
                      colSpan={3}
                      className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-blue-300"
                    >
                      {group.group}
                    </td>
                  </tr>
                  {group.rows.map((row) => (
                    <tr
                      key={`${group.group}-${row.feature}`}
                      className="border-t border-slate-800/60 hover:bg-slate-800/30 transition-colors"
                    >
                      <td className="p-4 align-top">
                        <div className="text-white text-sm font-medium">{row.feature}</div>
                        {row.description && (
                          <div className="text-slate-500 text-xs mt-1 leading-relaxed">
                            {row.description}
                          </div>
                        )}
                      </td>
                      <td className="p-4 text-center align-top">
                        <div className="flex justify-center pt-0.5">{renderValue(row.values.core)}</div>
                      </td>
                      <td className="p-4 text-center align-top bg-emerald-500/[0.03]">
                        <div className="flex justify-center pt-0.5">{renderValue(row.values.pro)}</div>
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
