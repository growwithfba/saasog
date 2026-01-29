import React, { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid
} from 'recharts';
import type { KeepaAnalysisSnapshot } from './KeepaTypes';

interface KeepaSeasonalityTabProps {
  analysis: KeepaAnalysisSnapshot;
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const isValidNumber = (value?: number | null): value is number =>
  value !== null && value !== undefined && Number.isFinite(value);

const formatSeasonalityValue = (value: number | null) =>
  isValidNumber(value) ? value.toFixed(1) : '';

const KeepaSeasonalityTab: React.FC<KeepaSeasonalityTabProps> = ({ analysis }) => {
  const curve = useMemo(
    () =>
      analysis.computed.seasonality.curve.map(entry => ({
        month: MONTH_LABELS[entry.month - 1],
        value: entry.index
      })),
    [analysis]
  );

  const hasSeasonality = isValidNumber(analysis.computed.seasonality.score);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
        {hasSeasonality ? (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={curve}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.15)" />
                <XAxis dataKey="month" stroke="#94a3b8" />
                <YAxis tickFormatter={formatSeasonalityValue} stroke="#94a3b8" />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(15, 23, 42, 0.9)',
                    border: '1px solid rgba(148, 163, 184, 0.2)',
                    borderRadius: 8,
                    fontSize: 12,
                    maxWidth: 200
                  }}
                  formatter={(value: number | null) =>
                    isValidNumber(value) ? [`${value.toFixed(1)}`, 'Demand index'] : ['', 'Demand index']
                  }
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#38bdf8"
                  strokeWidth={3}
                  dot={false}
                  name="Market"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="text-sm text-slate-400">Not enough history to build seasonality.</div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-400">Peak months</div>
          <div className="mt-2 text-lg font-semibold text-white">
            {analysis.computed.seasonality.peakMonths?.length
              ? analysis.computed.seasonality.peakMonths.map(month => MONTH_LABELS[month - 1]).join(', ')
              : 'N/A'}
          </div>
        </div>
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-400">Trough months</div>
          <div className="mt-2 text-lg font-semibold text-white">
            {analysis.computed.seasonality.troughMonths?.length
              ? analysis.computed.seasonality.troughMonths.map(month => MONTH_LABELS[month - 1]).join(', ')
              : 'N/A'}
          </div>
        </div>
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-400">Seasonality score</div>
          <div className="mt-2 text-lg font-semibold text-white">
            {isValidNumber(analysis.computed.seasonality.score) ? analysis.computed.seasonality.score : 'N/A'}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
        <div className="text-sm text-slate-400">Simple takeaway</div>
        <div className="mt-2 text-sm text-slate-200">{analysis.computed.seasonality.takeaway}</div>
      </div>
    </div>
  );
};

export default KeepaSeasonalityTab;
