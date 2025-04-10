import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import { ChartConfig } from '@/components/Charts/ChartConfig';
import { ChartUtils } from '@/components/Charts/ChartUtils';
import { ChartDataPoint } from '@/components/interfaces/ChartTypes';

interface BSRTrendChartProps {
  data: ChartDataPoint[];
  showGrid?: boolean;
  height?: number;
  className?: string;
}

export const BSRTrendChart: React.FC<BSRTrendChartProps> = ({
  data,
  showGrid = true,
  height = ChartConfig.dimensions.default.height,
  className = ''
}) => {
  return (
    <div className={`w-full ${className}`} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart 
          data={data} 
          margin={ChartConfig.dimensions.default.margin}
        >
          {showGrid && <CartesianGrid strokeDasharray="3 3" />}
          <XAxis
            dataKey="timestamp"
            tickFormatter={ChartUtils.formatTimestamp}
            type="number"
            domain={['auto', 'auto']}
          />
          <YAxis
            reversed
            tickFormatter={(value) => ChartUtils.formatValue(value, 'bsr')}
          />
          <Tooltip
            formatter={(value: number) => [ChartUtils.formatValue(value, 'bsr'), 'Rank']}
            labelFormatter={ChartUtils.formatTimestamp}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={ChartConfig.colors.primary}
            strokeWidth={ChartConfig.line.main.width}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}; 