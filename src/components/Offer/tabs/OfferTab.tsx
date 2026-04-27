'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  ArrowRight,
  DollarSign,
  Package,
  Wrench,
  Shield,
  Gift,
  Lock,
  ExternalLink,
} from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';
import type { OfferData, SSPItem } from '../types';
import { formatCurrency } from '@/utils/formatters';

interface OfferTabProps {
  productId: string | null;
  asin: string;
  offerData: OfferData;
  product: any;
  onJumpToCustomerVoice: () => void;
}

// 5 SSP categories in the order the UI renders them. Labels + icons
// mirror the SSP Builder hub for visual consistency.
const CATEGORY_META: Array<{ key: keyof OfferData['ssp']; label: string; icon: any; accent: string }> = [
  { key: 'quantity',      label: 'Quantity',      icon: Package,  accent: 'text-indigo-300 bg-indigo-500/10 border-indigo-500/30' },
  { key: 'functionality', label: 'Functionality', icon: Wrench,   accent: 'text-amber-300 bg-amber-500/10 border-amber-500/30' },
  { key: 'quality',       label: 'Quality',       icon: Shield,   accent: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' },
  { key: 'aesthetic',     label: 'Aesthetic',     icon: Sparkles, accent: 'text-pink-300 bg-pink-500/10 border-pink-500/30' },
  { key: 'bundle',        label: 'Bundle',        icon: Gift,     accent: 'text-sky-300 bg-sky-500/10 border-sky-500/30' },
];

type PriceStrategy = 'premium' | 'competitive' | 'value';

interface PriceBand {
  median: number | null;
  top5Avg: number | null;
  premium: number | null;   // 75th percentile of competitor prices
  value: number | null;     // 25th percentile of competitor prices
  sampleSize: number;
}

function quantile(sorted: number[], q: number): number | null {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined
    ? sorted[base] + rest * (sorted[base + 1] - sorted[base])
    : sorted[base];
}

function derivePriceBand(competitors: any[]): PriceBand {
  const prices = (competitors || [])
    .map((c) => Number(c?.price))
    .filter((p) => Number.isFinite(p) && p > 0)
    .sort((a, b) => a - b);
  if (!prices.length) {
    return { median: null, top5Avg: null, premium: null, value: null, sampleSize: 0 };
  }
  const median = quantile(prices, 0.5);
  const value = quantile(prices, 0.25);
  const premium = quantile(prices, 0.75);

  const sortedByRevenue = [...(competitors || [])]
    .filter((c) => Number.isFinite(Number(c?.price)) && Number(c?.price) > 0)
    .sort((a, b) => Number(b?.monthlyRevenue || 0) - Number(a?.monthlyRevenue || 0))
    .slice(0, 5);
  const top5Avg = sortedByRevenue.length
    ? sortedByRevenue.reduce((s, c) => s + Number(c?.price), 0) / sortedByRevenue.length
    : null;

  return { median, top5Avg, premium, value, sampleSize: prices.length };
}

function defaultPriceForStrategy(strategy: PriceStrategy, band: PriceBand): number | null {
  if (strategy === 'premium')     return band.premium ?? band.top5Avg ?? band.median;
  if (strategy === 'value')       return band.value   ?? band.median;
  return band.top5Avg ?? band.median ?? band.premium;
}

function formatPrice(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return formatCurrency(value);
}

/**
 * Phase 2.6 — The Offer tab is where customer insights + SSPs become
 * a positioning decision. Intentionally scoped tight: the user locks
 * in SSPs (done on the Customer Voice tab), chooses a price-band
 * positioning, then hands off to Sourcing where cost/margin math
 * lives (Phase 5). We do NOT show FBA fees, landed cost, or margin
 * projections here — those are Sourcing's job.
 */
export function OfferTab({
  productId,
  asin,
  offerData,
  product,
  onJumpToCustomerVoice,
}: OfferTabProps) {
  const router = useRouter();

  // --- Locked SSPs across all 5 categories ---
  const lockedByCategory = useMemo(() => {
    const out: Array<{ key: string; label: string; icon: any; accent: string; items: SSPItem[] }> = [];
    for (const meta of CATEGORY_META) {
      const items = (offerData.ssp?.[meta.key] || []).filter((i) => i.status === 'locked');
      if (items.length > 0) {
        out.push({ key: String(meta.key), label: meta.label, icon: meta.icon, accent: meta.accent, items });
      }
    }
    return out;
  }, [offerData.ssp]);

  const totalLocked = lockedByCategory.reduce((s, c) => s + c.items.length, 0);

  // --- Price positioning ---
  const priceBand = useMemo(() => {
    const competitors = product?.productData?.competitors || [];
    return derivePriceBand(competitors);
  }, [product]);

  const [strategy, setStrategy] = useState<PriceStrategy>('competitive');
  const [targetPrice, setTargetPrice] = useState<number | null>(null);

  useEffect(() => {
    // When the strategy changes (or the vetting-derived band loads),
    // preset the target price to that strategy's suggestion. User can
    // still override in the input below.
    setTargetPrice(defaultPriceForStrategy(strategy, priceBand));
  }, [strategy, priceBand]);

  // --- Sourcing handoff ---
  const [pushing, setPushing] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);

  const handleContinueToSourcing = async () => {
    if (!asin || pushing) return;
    setPushing(true);
    setPushError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/sourcing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          productId,
          asin,
          offerContext: {
            lockedSsps: lockedByCategory.flatMap((c) =>
              c.items.map((item) => ({ category: c.key, ...item }))
            ),
            targetPrice,
            priceStrategy: strategy,
          },
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        // Sourcing endpoint may not exist yet / may not accept this payload —
        // fall back to the existing navigation flow the user already has.
        if (res.status === 404 || res.status === 405) {
          router.push(`/sourcing/${encodeURIComponent(asin)}`);
          return;
        }
        throw new Error(payload?.error || 'Could not start sourcing.');
      }
      router.push(`/sourcing/${encodeURIComponent(asin)}`);
    } catch (e) {
      setPushError(e instanceof Error ? e.message : 'Could not start sourcing.');
    } finally {
      setPushing(false);
    }
  };

  const noLocked = totalLocked === 0;
  const noPriceData = priceBand.sampleSize === 0;

  return (
    <div className="space-y-8">
      {/* ===================== YOUR LOCKED SSPs ===================== */}
      <section>
        <div className="mb-4 flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-purple-500 to-indigo-500 rounded-lg flex items-center justify-center shadow-md shadow-purple-500/30 shrink-0">
            <Lock className="w-5 h-5 text-white" strokeWidth={2.5} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Your offer's positioning</h2>
            <p className="text-sm text-slate-400 mt-0.5">
              The Super Selling Points you've locked in — the reasons a customer picks your product over the competition.
            </p>
          </div>
        </div>

        {noLocked ? (
          <div className="rounded-2xl border border-dashed border-slate-700/60 bg-slate-800/30 p-8 text-center">
            <Sparkles className="w-6 h-6 text-slate-500 mx-auto mb-3" />
            <p className="text-slate-300 font-medium mb-1">
              No SSPs locked yet.
            </p>
            <p className="text-sm text-slate-500 max-w-md mx-auto mb-5">
              Head over to the Customer Voice tab, generate your SSPs, and lock in the ones you want your offer to stand on.
            </p>
            <button
              type="button"
              onClick={onJumpToCustomerVoice}
              className="inline-flex items-center gap-2 px-4 py-2 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 rounded-lg text-sm font-medium text-purple-200 transition-colors"
            >
              Go to Customer Voice
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {lockedByCategory.map((cat) => {
              const Icon = cat.icon;
              return (
                <div key={cat.key} className="rounded-xl border border-slate-700/60 bg-slate-800/40 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider border ${cat.accent}`}>
                      <Icon className="w-3 h-3" />
                      {cat.label}
                    </div>
                    <span className="text-[11px] text-slate-500">
                      {cat.items.length} locked
                    </span>
                  </div>
                  <ul className="space-y-2">
                    {cat.items.map((item, i) => (
                      <li key={i} className="flex gap-3 text-sm">
                        <span className="text-slate-500 tabular-nums w-5 shrink-0">{i + 1}.</span>
                        <div className="flex-1">
                          <p className="text-slate-100 font-medium leading-snug">{item.recommendation}</p>
                          {item.why_it_matters && (
                            <p className="text-slate-400 text-[13px] mt-0.5 leading-relaxed">{item.why_it_matters}</p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ===================== TARGET LAUNCH PRICE ===================== */}
      <section>
        <div className="mb-4 flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-lg flex items-center justify-center shadow-md shadow-emerald-500/30 shrink-0">
            <DollarSign className="w-5 h-5 text-white" strokeWidth={2.5} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Target launch price</h2>
            <p className="text-sm text-slate-400 mt-0.5">
              Where you'll position your product in the market. This becomes the target price for Sourcing to work backwards from.
            </p>
          </div>
        </div>

        {noPriceData ? (
          <div className="rounded-2xl border border-dashed border-slate-700/60 bg-slate-800/30 p-6 text-center">
            <p className="text-slate-400 text-sm">
              No competitor pricing data found on this product's vetting submission. Run or re-open the vetting to populate pricing.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-700/60 bg-slate-800/40 p-6 space-y-5">
            {/* Competitive frame */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <PriceStat label="Value band (25th)" value={priceBand.value} tone="text-emerald-300" />
              <PriceStat label="Market median"      value={priceBand.median} tone="text-slate-200" />
              <PriceStat label="Top-5 avg"           value={priceBand.top5Avg} tone="text-blue-300" />
              <PriceStat label="Premium band (75th)" value={priceBand.premium} tone="text-amber-300" />
            </div>

            {/* Strategy selector */}
            <div className="grid grid-cols-3 gap-3">
              <StrategyCard
                active={strategy === 'value'}
                onClick={() => setStrategy('value')}
                title="Value"
                subtitle="Undercut the market"
                price={priceBand.value}
                accent="emerald"
              />
              <StrategyCard
                active={strategy === 'competitive'}
                onClick={() => setStrategy('competitive')}
                title="Competitive"
                subtitle="Match the market"
                price={priceBand.top5Avg ?? priceBand.median}
                accent="blue"
              />
              <StrategyCard
                active={strategy === 'premium'}
                onClick={() => setStrategy('premium')}
                title="Premium"
                subtitle="Price above the field"
                price={priceBand.premium}
                accent="amber"
              />
            </div>

            {/* Override input */}
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-2">
                Your target launch price
              </label>
              <div className="relative max-w-xs">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={targetPrice ?? ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    setTargetPrice(val === '' ? null : Number(val));
                  }}
                  className="w-full pl-7 pr-3 py-2.5 bg-slate-900/60 border border-slate-700/60 focus:border-emerald-500/60 rounded-lg text-white tabular-nums text-lg font-semibold focus:outline-none transition-colors"
                  placeholder="0.00"
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5">
                Set by your {strategy} strategy — tweak if you want a different number.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* ===================== HAND OFF TO SOURCING ===================== */}
      <section>
        <div className="rounded-2xl border border-slate-700/60 bg-gradient-to-br from-blue-900/20 via-slate-800/40 to-emerald-900/20 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="max-w-xl">
              <h3 className="text-lg font-bold text-white mb-1">Ready to source it?</h3>
              <p className="text-sm text-slate-400">
                We'll carry your {totalLocked} locked SSP{totalLocked === 1 ? '' : 's'} and target launch price of{' '}
                <span className="text-slate-200 font-semibold">{formatPrice(targetPrice)}</span> into Sourcing, where you'll lock in a supplier, landed cost, and margin.
              </p>
              {pushError && (
                <p className="text-sm text-red-300 mt-2">{pushError}</p>
              )}
            </div>
            <button
              type="button"
              onClick={handleContinueToSourcing}
              disabled={pushing || !asin}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white font-semibold shadow-lg shadow-emerald-500/20 transition-all"
            >
              Continue to Sourcing
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function PriceStat({ label, value, tone }: { label: string; value: number | null; tone: string }) {
  return (
    <div className="rounded-lg bg-slate-900/40 border border-slate-700/50 px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${tone}`}>{formatPrice(value)}</div>
    </div>
  );
}

function StrategyCard({
  active,
  onClick,
  title,
  subtitle,
  price,
  accent,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
  price: number | null;
  accent: 'emerald' | 'blue' | 'amber';
}) {
  const ring = active
    ? accent === 'emerald'
      ? 'border-emerald-500/60 bg-emerald-500/10 shadow-lg shadow-emerald-500/10'
      : accent === 'amber'
        ? 'border-amber-500/60 bg-amber-500/10 shadow-lg shadow-amber-500/10'
        : 'border-blue-500/60 bg-blue-500/10 shadow-lg shadow-blue-500/10'
    : 'border-slate-700/60 bg-slate-900/40 hover:border-slate-500/60';
  const valueTone = active
    ? accent === 'emerald' ? 'text-emerald-300'
    : accent === 'amber' ? 'text-amber-300'
    : 'text-blue-300'
    : 'text-slate-300';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-xl border-2 px-4 py-3 transition-all ${ring}`}
    >
      <div className="text-sm font-semibold text-white">{title}</div>
      <div className="text-[11px] text-slate-400 mb-2">{subtitle}</div>
      <div className={`text-xl font-bold tabular-nums ${valueTone}`}>{formatPrice(price)}</div>
    </button>
  );
}
