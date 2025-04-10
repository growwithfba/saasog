import { ChartDataPoint, TrendLineData, VolatilityBands } from '@/components/interfaces/ChartTypes';

export class ChartUtils {
  /**
   * Calculates trend line data from chart points
   */
  static calculateTrendLine(data: ChartDataPoint[]): TrendLineData {
    const n = data.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

    data.forEach((point, index) => {
      sumX += index;
      sumY += point.value;
      sumXY += index * point.value;
      sumX2 += index * index;
    });

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    // Calculate R-squared
    const yMean = sumY / n;
    let totalSS = 0, residualSS = 0;
    
    data.forEach((point, index) => {
      const yPred = slope * index + intercept;
      totalSS += Math.pow(point.value - yMean, 2);
      residualSS += Math.pow(point.value - yPred, 2);
    });

    const r2 = 1 - (residualSS / totalSS);

    return { slope, intercept, r2 };
  }

  /**
   * Calculates volatility bands
   */
  static calculateVolatilityBands(data: ChartDataPoint[], period: number = 20): VolatilityBands {
    const upper: ChartDataPoint[] = [];
    const lower: ChartDataPoint[] = [];
    const mean: ChartDataPoint[] = [];

    for (let i = period - 1; i < data.length; i++) {
      const slice = data.slice(i - period + 1, i + 1);
      const values = slice.map(point => point.value);
      
      const avg = values.reduce((a, b) => a + b) / period;
      const stdDev = Math.sqrt(
        values.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / period
      );

      const timestamp = data[i].timestamp;
      mean.push({ timestamp, value: avg });
      upper.push({ timestamp, value: avg + 2 * stdDev });
      lower.push({ timestamp, value: avg - 2 * stdDev });
    }

    return { upper, lower, mean };
  }

  /**
   * Formats timestamp for display
   */
  static formatTimestamp(timestamp: number): string {
    return new Date(timestamp).toLocaleDateString();
  }

  /**
   * Formats value for display based on type
   */
  static formatValue(value: number, type: 'bsr' | 'price'): string {
    if (type === 'price') {
      return `$${value.toFixed(2)}`;
    }
    return value.toLocaleString();
  }

  /**
   * Calculates chart dimensions and margins
   */
  static getChartDimensions(width?: number, height?: number) {
    const margin = { top: 20, right: 30, bottom: 30, left: 60 };
    const chartWidth = (width || 600) - margin.left - margin.right;
    const chartHeight = (height || 400) - margin.top - margin.bottom;

    return { margin, chartWidth, chartHeight };
  }

  /**
   * Detects stability periods in data
   */
  static detectStabilityPeriods(data: ChartDataPoint[], threshold: number = 0.02): {
    start: number;
    end: number;
    avgValue: number;
  }[] {
    const periods: { start: number; end: number; avgValue: number }[] = [];
    let currentPeriod: { start: number; values: number[] } | null = null;

    for (let i = 1; i < data.length; i++) {
      const change = Math.abs(
        (data[i].value - data[i - 1].value) / data[i - 1].value
      );

      if (change <= threshold) {
        if (!currentPeriod) {
          currentPeriod = {
            start: data[i - 1].timestamp,
            values: [data[i - 1].value]
          };
        }
        currentPeriod.values.push(data[i].value);
      } else if (currentPeriod && currentPeriod.values.length >= 7) {
        // Minimum 7 days for stability period
        periods.push({
          start: currentPeriod.start,
          end: data[i - 1].timestamp,
          avgValue: currentPeriod.values.reduce((a, b) => a + b) / currentPeriod.values.length
        });
        currentPeriod = null;
      } else {
        currentPeriod = null;
      }
    }

    // Handle last period
    if (currentPeriod && currentPeriod.values.length >= 7) {
      periods.push({
        start: currentPeriod.start,
        end: data[data.length - 1].timestamp,
        avgValue: currentPeriod.values.reduce((a, b) => a + b) / currentPeriod.values.length
      });
    }

    return periods;
  }
} 