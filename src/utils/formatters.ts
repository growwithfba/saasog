// src/utils/formatters.ts

export const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };
  
  export const formatNumber = (value: number): string => {
    return new Intl.NumberFormat('en-US').format(value);
  };