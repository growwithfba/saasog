export interface BSRHistory {
  timestamp: number;
  value: number;
}

export interface ChartIndicators {
  trendline: boolean;
  volatilityBands: boolean;
  seasonalMarkers: boolean;
}

export interface ChartElements {
  trendLine: boolean;
  stabilityPeriods: boolean;
  seasonalOverlay: boolean;
}

export interface DataVisualization {
  charts: {
    bsrTrend: {
      type: 'lineChart';
      data: BSRHistory[];
      indicators: ChartIndicators;
    };
    priceAnalysis: {
      type: 'combinedChart';
      elements: ChartElements;
    }
  }
}

export interface ResultsDisplayMetrics {
  bsr: {
    current: number;
    trend: string;
    stability: number;
    confidence: number;
  };
  price: {
    current: number;
    range: string;
    stability: number;
    seasonality?: string;
  }
}

export interface ResultsDisplay {
  keepaData: {
    metrics: ResultsDisplayMetrics;
    visualization: {
      trendCharts: boolean;
      scoreBreakdown: boolean;
      insightCards: boolean;
    }
  }
}

export type ChartDataPoint = BSRHistory; 