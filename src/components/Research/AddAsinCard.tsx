'use client';

import { useState } from 'react';
import { AlertCircle, CheckCircle2, Hash, Loader2, Plus } from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';

interface AddAsinCardProps {
  /** Called after a successful insert so the parent can refresh its list. */
  onAdded?: () => void | Promise<void>;
}

type PreviewSnapshot = {
  asin: string;
  title: string | null;
  brand: string | null;
  category: string | null;
  price: number | null;
  monthly_revenue: number | null;
  monthly_units_sold: number | null;
  bsr: number | null;
  rating: number | null;
  review: number | null;
  weight: number | null;
  number_of_images: number | null;
  size_tier: string | null;
  price_trend: number | null;
  sales_trend: number | null;
  last_year_sales: number | null;
  sales_year_over_year: number | null;
  sales_to_reviews: number | null;
  best_sales_period: string | null;
  date_first_available: string | null;
  variation_count: number | null;
  pending_sources: Record<string, string>;
};

const ASIN_REGEX = /^[A-Z0-9]{10}$/;

const formatNumber = (value: number | null, opts: { currency?: boolean; percent?: boolean; decimals?: number } = {}) => {
  if (value == null || !Number.isFinite(value)) return null;
  const { currency, percent, decimals } = opts;
  if (currency) {
    return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  }
  if (percent) {
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
  }
  return value.toLocaleString('en-US', { maximumFractionDigits: decimals ?? 2 });
};

export function AddAsinCard({ onAdded }: AddAsinCardProps) {
  const [asinInput, setAsinInput] = useState('');
  const [stage, setStage] = useState<'idle' | 'previewing' | 'confirming' | 'added'>('idle');
  const [preview, setPreview] = useState<PreviewSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sanitized = asinInput.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const isValidAsin = ASIN_REGEX.test(sanitized);

  const reset = () => {
    setAsinInput('');
    setPreview(null);
    setError(null);
    setStage('idle');
  };

  const handleFetchPreview = async () => {
    if (!isValidAsin || stage === 'previewing') return;
    setError(null);
    setStage('previewing');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/research/add-asin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }),
        },
        body: JSON.stringify({ asin: sanitized, preview: true }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Lookup failed (HTTP ${res.status})`);
      }
      setPreview(data.snapshot);
      setStage('idle');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lookup failed');
      setStage('idle');
    }
  };

  const handleConfirm = async () => {
    if (!preview || stage === 'confirming') return;
    setError(null);
    setStage('confirming');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/research/add-asin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }),
        },
        body: JSON.stringify({ asin: preview.asin }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Add failed (HTTP ${res.status})`);
      }
      setStage('added');
      await onAdded?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Add failed');
      setStage('idle');
    }
  };

  // --- Render ---

  if (stage === 'added') {
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400 mb-3" />
        <h4 className="text-lg font-semibold text-white mb-2">Added to your funnel</h4>
        <p className="text-sm text-emerald-200/80 mb-4">
          {preview?.asin} is now in your research list.
        </p>
        <button
          onClick={reset}
          className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium transition-colors"
        >
          Add another ASIN
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-700/60 bg-slate-800/40 p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h4 className="text-lg font-semibold text-white flex items-center gap-2">
            <Hash className="h-5 w-5 text-blue-400" /> Add a single ASIN
          </h4>
          <p className="text-sm text-slate-400 mt-1">
            Skip the CSV. Paste an ASIN and BloomEngine will fetch the product data.
          </p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-3">
        <input
          type="text"
          value={asinInput}
          onChange={(e) => {
            setAsinInput(e.target.value);
            if (preview) setPreview(null);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && isValidAsin) handleFetchPreview();
          }}
          placeholder="B0ABCDE123"
          maxLength={12}
          className="flex-1 rounded-lg border border-slate-700/60 bg-slate-900/60 px-4 py-3 text-white placeholder-slate-500 tracking-wider focus:outline-none focus:border-blue-500/60"
          disabled={stage === 'previewing' || stage === 'confirming'}
        />
        <button
          onClick={handleFetchPreview}
          disabled={!isValidAsin || stage !== 'idle'}
          className={`inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg font-medium transition-colors ${
            isValidAsin && stage === 'idle'
              ? 'bg-blue-500 hover:bg-blue-600 text-white'
              : 'bg-slate-700/50 text-slate-400 cursor-not-allowed'
          }`}
        >
          {stage === 'previewing' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {stage === 'previewing' ? 'Looking up…' : 'Preview ASIN'}
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {preview && <PreviewPanel snapshot={preview} onConfirm={handleConfirm} busy={stage === 'confirming'} />}
    </div>
  );
}

// ---- Preview sub-component ----

function PreviewPanel({
  snapshot,
  onConfirm,
  busy,
}: {
  snapshot: PreviewSnapshot;
  onConfirm: () => void;
  busy: boolean;
}) {
  // Only render fields that we actually have data for. Brand + title are
  // pulled out of the data grid and rendered as a product header above.
  // Pending fields (monthly units sold, revenue, etc.) are saved into the
  // row but hidden here — they surface as "Pending" in the research table
  // once the user views those columns.
  const allRows: Array<{ label: string; value: string | null }> = [
    { label: 'Category', value: snapshot.category },
    { label: 'Price', value: formatNumber(snapshot.price, { currency: true }) },
    { label: 'BSR', value: formatNumber(snapshot.bsr, { decimals: 0 }) },
    { label: 'Rating', value: snapshot.rating != null ? `${snapshot.rating.toFixed(1)} ★` : null },
    { label: 'Review count', value: formatNumber(snapshot.review, { decimals: 0 }) },
    { label: 'Weight (lb)', value: formatNumber(snapshot.weight, { decimals: 2 }) },
    { label: 'Size tier', value: snapshot.size_tier },
    { label: 'Number of images', value: formatNumber(snapshot.number_of_images, { decimals: 0 }) },
    { label: 'Variation count', value: formatNumber(snapshot.variation_count, { decimals: 0 }) },
    { label: 'Price trend (90d)', value: formatNumber(snapshot.price_trend, { percent: true }) },
    { label: 'Sales trend (90d)', value: formatNumber(snapshot.sales_trend, { percent: true }) },
    { label: 'Best sales period', value: snapshot.best_sales_period },
    {
      label: 'First available',
      value: snapshot.date_first_available
        ? new Date(snapshot.date_first_available).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })
        : null,
    },
  ];

  const rows = allRows.filter((r) => r.value != null && r.value !== '');

  return (
    <div className="mt-5 rounded-xl border border-slate-700/60 bg-slate-900/40 p-5">
      {/* Product header — Brand prominent, title smaller, ASIN as a subtle pill */}
      <div className="mb-5 pb-4 border-b border-slate-700/60">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-lg font-semibold text-white truncate">
              {snapshot.brand || 'Unknown brand'}
            </p>
            {snapshot.title && (
              <p className="text-sm text-slate-400 mt-1 line-clamp-2">{snapshot.title}</p>
            )}
          </div>
          <span className="shrink-0 rounded-md bg-slate-800/60 border border-slate-700/60 px-2 py-1 text-xs text-slate-300 tracking-wide">
            {snapshot.asin}
          </span>
        </div>
      </div>

      {/* Data rows */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 mb-5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between border-b border-slate-700/30 py-1.5">
            <span className="text-xs uppercase tracking-wide text-slate-500">{row.label}</span>
            <span className="text-sm text-white font-medium truncate ml-4 max-w-[60%]" title={row.value ?? undefined}>
              {row.value}
            </span>
          </div>
        ))}
      </div>

      <button
        onClick={onConfirm}
        disabled={busy}
        className={`w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg font-medium transition-colors ${
          busy
            ? 'bg-slate-700/50 text-slate-400 cursor-not-allowed'
            : 'bg-emerald-500 hover:bg-emerald-600 text-white'
        }`}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        {busy ? 'Adding to funnel…' : 'Add to research funnel'}
      </button>
    </div>
  );
}
