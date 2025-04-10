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
import { ChartConfig } from '../../Charts/ChartConfig';
import { ChartUtils } from '../../Charts/ChartUtils';
import { ChartDataPoint } from '../../../interfaces/ChartTypes';

interface PriceAnalysisChartProps {
  data: ChartDataPoint[];
  showGrid?: boolean;
  height?: number;
  className?: string;
}

export const PriceAnalysisChart: React.FC<PriceAnalysisChartProps> = ({
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
            tickFormatter={(value) => ChartUtils.formatValue(value, 'price')}
          />
          <Tooltip
            formatter={(value: number) => [ChartUtils.formatValue(value, 'price'), 'Price']}
            labelFormatter={ChartUtils.formatTimestamp}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={ChartConfig.colors.trend}
            strokeWidth={ChartConfig.line.main.width}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}; 