export interface ChartDataPoint {
  timestamp: number;
  value: number;
}

export interface TrendLineData {
  slope: number;
  intercept: number;
  r2: number;
}

export interface VolatilityBands {
  upper: ChartDataPoint[];
  lower: ChartDataPoint[];
  mean: ChartDataPoint[];
}

export interface BSRChartProps {
  data: ChartDataPoint[];
  indicators: {
    trendline?: boolean;
    volatilityBands?: boolean;
    seasonalMarkers?: boolean;
  };
  width?: number;
  height?: number;
}

export interface PriceChartProps {
  data: ChartDataPoint[];
  elements: {
    trendLine?: boolean;
    stabilityPeriods?: boolean;
    seasonalOverlay?: boolean;
  };
  width?: number;
  height?: number;
} 