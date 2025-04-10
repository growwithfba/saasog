import React from 'react';
import { motion } from 'framer-motion';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { formatCurrency } from '../../utils/formatters';

interface MarketInsightsProps {
  data: {
    marketEntry: {
      status: 'PASS' | 'FAIL' | 'RISKY';
      score: number;
      message: string;
    };
    marketHealth: {
      score: number;
      listingQualityDistribution: {
        exceptional: number;
        decent: number;
        poor: number;
      };
      revenuePerCompetitor: number;
      marketConcentration: number;
    };
    competitors: {
      tiers: {
        strong: number;
        decent: number;
        weak: number;
      };
      fulfillment: {
        fba: number;
        fbm: number;
        amazon: number;
      };
      pricePoints: {
        high: number;
        mid: number;
        low: number;
      };
    };
  };
}

export const MarketInsights: React.FC<MarketInsightsProps> = ({ data }) => {
  const { marketEntry, marketHealth, competitors } = data;

  const getStatusStyles = (status: 'PASS' | 'FAIL' | 'RISKY') => ({
    PASS: 'bg-emerald-900/20 text-emerald-400 border-emerald-500/20',
    FAIL: 'bg-red-900/20 text-red-400 border-red-500/20',
    RISKY: 'bg-amber-900/20 text-amber-400 border-amber-500/20'
  }[status]);

  const COLORS = {
    strong: '#22c55e',
    decent: '#3b82f6',
    weak: '#ef4444',
    exceptional: '#22c55e',
    decent2: '#3b82f6',
    poor: '#ef4444',
    fba: '#22c55e',
    fbm: '#3b82f6',
    amazon: '#8b5cf6'
  };

  return (
    <div className="space-y-6">
      {/* Market Entry Score */}
      <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 overflow-hidden">
        <div className="p-6 flex items-center justify-between border-b border-slate-700/50">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-white">Market Entry Assessment</h2>
            <p className="text-sm text-slate-400">Overall market viability score</p>
          </div>
          <div className={`px-4 py-2 rounded-xl border ${getStatusStyles(marketEntry.status)}`}>
            <div className="flex items-center gap-2">
              <span className="text-2xl">
                {marketEntry.status === 'PASS' ? '✨' : 
                 marketEntry.status === 'RISKY' ? '⚠️' : '❌'}
              </span>
              <div>
                <div className="font-semibold">{marketEntry.status}</div>
                <div className="text-sm opacity-80">{marketEntry.score}%</div>
              </div>
            </div>
          </div>
        </div>
        <div className="p-6">
          <div className="text-sm text-slate-300 leading-relaxed">
            {marketEntry.message}
          </div>
        </div>
      </div>

      {/* Market Health Score */}
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-6">
          <div className="space-y-1 mb-6">
            <h3 className="text-lg font-semibold text-white">Market Health</h3>
            <p className="text-sm text-slate-400">Combined market quality indicators</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="text-sm text-slate-400">Overall Health</div>
              <div className="text-3xl font-bold text-white">{marketHealth.score}%</div>
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-emerald-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${marketHealth.score}%` }}
                  transition={{ duration: 1, ease: "easeOut" }}
                />
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-sm text-slate-400">Revenue/Competitor</div>
              <div className="text-3xl font-bold text-white">
                {formatCurrency(marketHealth.revenuePerCompetitor)}
              </div>
              <div className="text-sm text-slate-400">Monthly Average</div>
            </div>
          </div>
        </div>

        {/* Listing Quality Distribution */}
        <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-6">
          <div className="space-y-1 mb-6">
            <h3 className="text-lg font-semibold text-white">Listing Quality</h3>
            <p className="text-sm text-slate-400">Distribution across competitors</p>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {Object.entries(marketHealth.listingQualityDistribution).map(([quality, value]) => (
              <div key={quality} className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-700/50 mb-2">
                  <div className="text-2xl font-bold text-white">{value}%</div>
                </div>
                <div className="text-sm text-slate-400 capitalize">{quality}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Competitor Analysis */}
      <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-6">
        <div className="space-y-1 mb-6">
          <h3 className="text-lg font-semibold text-white">Competitor Analysis</h3>
          <p className="text-sm text-slate-400">Market composition breakdown</p>
        </div>
        <div className="grid grid-cols-3 gap-8">
          {/* Competitor Tiers */}
          <div className="space-y-4">
            <div className="text-sm font-medium text-slate-300">Competitor Tiers</div>
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Strong', value: competitors.tiers.strong },
                      { name: 'Decent', value: competitors.tiers.decent },
                      { name: 'Weak', value: competitors.tiers.weak }
                    ]}
                    innerRadius={25}
                    outerRadius={50}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    <Cell fill={COLORS.strong} />
                    <Cell fill={COLORS.decent} />
                    <Cell fill={COLORS.weak} />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="space-y-1">
                <div className="w-3 h-3 rounded-full bg-emerald-500 mx-auto" />
                <div className="text-slate-400">Strong</div>
                <div className="text-white font-medium">{competitors.tiers.strong}%</div>
              </div>
              <div className="space-y-1">
                <div className="w-3 h-3 rounded-full bg-blue-500 mx-auto" />
                <div className="text-slate-400">Decent</div>
                <div className="text-white font-medium">{competitors.tiers.decent}%</div>
              </div>
              <div className="space-y-1">
                <div className="w-3 h-3 rounded-full bg-red-500 mx-auto" />
                <div className="text-slate-400">Weak</div>
                <div className="text-white font-medium">{competitors.tiers.weak}%</div>
              </div>
            </div>
          </div>

          {/* Fulfillment Methods */}
          <div className="space-y-4">
            <div className="text-sm font-medium text-slate-300">Fulfillment Methods</div>
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: 'FBA', value: competitors.fulfillment.fba },
                      { name: 'FBM', value: competitors.fulfillment.fbm },
                      { name: 'Amazon', value: competitors.fulfillment.amazon }
                    ]}
                    innerRadius={25}
                    outerRadius={50}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    <Cell fill={COLORS.fba} />
                    <Cell fill={COLORS.fbm} />
                    <Cell fill={COLORS.amazon} />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="space-y-1">
                <div className="w-3 h-3 rounded-full bg-emerald-500 mx-auto" />
                <div className="text-slate-400">FBA</div>
                <div className="text-white font-medium">{competitors.fulfillment.fba}%</div>
              </div>
              <div className="space-y-1">
                <div className="w-3 h-3 rounded-full bg-blue-500 mx-auto" />
                <div className="text-slate-400">FBM</div>
                <div className="text-white font-medium">{competitors.fulfillment.fbm}%</div>
              </div>
              <div className="space-y-1">
                <div className="w-3 h-3 rounded-full bg-purple-500 mx-auto" />
                <div className="text-slate-400">Amazon</div>
                <div className="text-white font-medium">{competitors.fulfillment.amazon}%</div>
              </div>
            </div>
          </div>

          {/* Price Distribution */}
          <div className="space-y-4">
            <div className="text-sm font-medium text-slate-300">Price Distribution</div>
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: 'High', value: competitors.pricePoints.high },
                      { name: 'Mid', value: competitors.pricePoints.mid },
                      { name: 'Low', value: competitors.pricePoints.low }
                    ]}
                    innerRadius={25}
                    outerRadius={50}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    <Cell fill={COLORS.strong} />
                    <Cell fill={COLORS.decent} />
                    <Cell fill={COLORS.weak} />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="space-y-1">
                <div className="w-3 h-3 rounded-full bg-emerald-500 mx-auto" />
                <div className="text-slate-400">High</div>
                <div className="text-white font-medium">{competitors.pricePoints.high}%</div>
              </div>
              <div className="space-y-1">
                <div className="w-3 h-3 rounded-full bg-blue-500 mx-auto" />
                <div className="text-slate-400">Mid</div>
                <div className="text-white font-medium">{competitors.pricePoints.mid}%</div>
              </div>
              <div className="space-y-1">
                <div className="w-3 h-3 rounded-full bg-red-500 mx-auto" />
                <div className="text-slate-400">Low</div>
                <div className="text-white font-medium">{competitors.pricePoints.low}%</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};