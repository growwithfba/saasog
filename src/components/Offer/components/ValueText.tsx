'use client';

import { ReactNode } from 'react';
import { getMetricColor, MetricType } from '@/utils/metricColors';

interface ValueTextProps {
  value: number | string | null | undefined;
  metricType: MetricType;
  className?: string;
  children?: ReactNode;
  /**
   * If provided, this will be used as the display value instead of the raw value.
   * Useful for formatted strings like "$1,234.56" or "23.5%"
   */
  displayValue?: string | number;
}

/**
 * ValueText component that applies semantic color classes to numeric metric values.
 * This ensures that the actual number/text is colored, not just badges or containers.
 */
export function ValueText({ 
  value, 
  metricType, 
  className = '', 
  children,
  displayValue 
}: ValueTextProps) {
  // Handle null/undefined values
  if (value === null || value === undefined) {
    return (
      <span className={`text-slate-400 ${className}`}>
        {children || 'Not available'}
      </span>
    );
  }

  // Extract numeric value for color calculation
  let numericValue: number | null = null;
  
  if (typeof value === 'number') {
    numericValue = value;
  } else if (typeof value === 'string') {
    // Try to extract number from string (handles "$1,234.56", "23.5%", "14 months", etc.)
    const cleaned = value.replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(cleaned);
    if (!isNaN(parsed)) {
      numericValue = parsed;
    }
  }

  // Get color based on metric type and numeric value
  const colorResult = getMetricColor(metricType, numericValue);
  
  // Use displayValue if provided, otherwise use children, otherwise use value
  const content = displayValue !== undefined 
    ? String(displayValue)
    : children !== undefined
    ? children
    : String(value);

  return (
    <span className={`${colorResult.text} ${className}`}>
      {content}
    </span>
  );
}

