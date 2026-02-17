export type MetricBand = 'low' | 'mid' | 'high';

type BandThresholds = {
  low: number;
  high: number;
};

type BandOverrides = {
  lowOverride?: number;
  highOverride?: number;
};

type BandClasses = {
  low: string;
  mid: string;
  high: string;
};

const getPercentile = (sorted: number[], percentile: number) => {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * percentile;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
};

export const getPercentileThresholds = (
  values: number[],
  options?: { low?: number; high?: number }
): BandThresholds => {
  const cleaned = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!cleaned.length) {
    return { low: 0, high: 0 };
  }
  const lowPercentile = options?.low ?? 0.2;
  const highPercentile = options?.high ?? 0.8;
  return {
    low: getPercentile(cleaned, lowPercentile),
    high: getPercentile(cleaned, highPercentile)
  };
};

export const getBand = (
  value: number | undefined | null,
  thresholds: BandThresholds,
  overrides?: BandOverrides
): MetricBand => {
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return 'mid';
  }
  const isLow =
    (overrides?.lowOverride !== undefined && value <= overrides.lowOverride) ||
    (Number.isFinite(thresholds.low) && value <= thresholds.low);
  const isHigh =
    (overrides?.highOverride !== undefined && value >= overrides.highOverride) ||
    (Number.isFinite(thresholds.high) && value >= thresholds.high);

  if (isHigh && !isLow) return 'high';
  if (isLow && !isHigh) return 'low';
  return 'mid';
};

export const getBandClasses = (band: MetricBand, classes: BandClasses) => {
  if (band === 'low') return classes.low;
  if (band === 'high') return classes.high;
  return classes.mid;
};
