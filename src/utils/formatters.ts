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

  // Appends "lbs" when the input is purely numeric. Leaves strings that
  // already include a unit (e.g. "2.5 oz", "1.2 lb") untouched so we don't
  // double-suffix Helium 10 exports that come with units baked in.
  export const formatWeight = (value: string | number | null | undefined): string => {
    if (value === null || value === undefined || value === '') return '—';
    const str = String(value).trim();
    if (!str) return '—';
    const numeric = parseFloat(str);
    if (!Number.isFinite(numeric)) return str;
    // If the trimmed string is *only* a number (optionally with a leading sign),
    // we own the formatting and can safely add the unit.
    if (/^-?\d*\.?\d+$/.test(str)) {
      return `${numeric} lbs`;
    }
    return str;
  };