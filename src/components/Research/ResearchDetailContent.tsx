'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { useDispatch } from 'react-redux';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock,
  Loader2,
  RefreshCw,
  Search,
  Tag as TagIcon,
  X,
} from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';
import { RootState } from '@/store';
import { ProductHeader } from '@/components/Product/ProductHeader';
import { TagChip } from '@/components/Tags/TagChip';
import { setDisplayTitle } from '@/store/productTitlesSlice';
import { formatDate } from '@/utils/formatDate';
import {
  formatResearchFieldValue,
  getResearchFieldDefinitionsByGroup,
  getSummaryFieldDefinitions,
  type ResearchFieldGroup,
} from '@/utils/researchFieldDefinitions';
import { getResearchFunnelColumnValue } from '@/utils/researchFunnelTable';
import { buildVettingEngineUrl } from '@/utils/vettingNavigation';
import { getProductDisplayName } from '@/utils/product';

// Core fields are shown inside the hero summary — no need to also render
// them as a full accordion group below (avoids the duplicate-summary
// issue Dave flagged).
const GROUP_ORDER: ResearchFieldGroup[] = ['Market & Demand', 'Trends', 'Listing & Competition'];

// Pending fields Keepa cannot provide today — see the AsinSnapshot
// mapper (src/lib/keepa/mapSnapshotToResearch.ts) for the source of truth.
const PENDING_FIELD_LABELS: Record<string, string> = {
  net_price: 'Net Price',
  parent_level_sales: 'Parent-Level Sales',
  parent_level_revenue: 'Parent-Level Revenue',
  active_sellers: 'Active Sellers',
  fulfilled_by: 'Fulfilled By',
  sales_year_over_year: 'Sales YoY',
  monthly_units_sold: 'Monthly Units Sold',
  monthly_revenue: 'Monthly Revenue',
  last_year_sales: 'Last-Year Sales',
  sales_to_reviews: 'Sales → Reviews',
};

type Stage = 'research' | 'vetting' | 'offer' | 'sourcing';

const STAGE_LABELS: Record<Stage, string> = {
  research: 'Researched',
  vetting: 'Vetted',
  offer: 'Offering',
  sourcing: 'Sourced',
};

export function ResearchDetailContent({ asin }: { asin: string }) {
  const { user } = useSelector((state: RootState) => state.auth);
  const titleByAsin = useSelector((state: RootState) => state.productTitles.byAsin);
  const router = useRouter();
  const dispatch = useDispatch();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [product, setProduct] = useState<any>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerSearch, setDrawerSearch] = useState('');
  const [showEmptyFields, setShowEmptyFields] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshToast, setRefreshToast] = useState<null | { kind: 'ok' | 'err'; message: string }>(null);

  const displayTitle = useMemo(() => {
    return titleByAsin?.[asin] || getProductDisplayName(product);
  }, [product, titleByAsin, asin]);

  const fetchProduct = async () => {
    if (!user) return;
    try {
      setLoading(true);
      setError(null);

      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/research', {
        headers: { ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }) },
        credentials: 'include',
      });

      if (!res.ok) throw new Error(`Failed to fetch research products (HTTP ${res.status})`);
      const data = await res.json();
      const rows: any[] = Array.isArray(data?.data) ? data.data : [];
      const match = rows.find((p) => p?.asin === asin) || null;
      setProduct(match);
      if (match?.display_name) {
        dispatch(setDisplayTitle({ asin, title: match.display_name }));
      }
      if (!match) setError('Research product not found.');
    } catch (e) {
      console.error('[ResearchDetail] Failed to load:', e);
      setError(e instanceof Error ? e.message : 'Failed to load research detail');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProduct();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, asin]);

  const goToVetting = () => {
    router.push(
      buildVettingEngineUrl({
        productName: displayTitle,
        researchProductId: product?.id,
        asin,
      })
    );
  };

  const handleRefresh = async () => {
    if (refreshing || !product?.id) return;
    setRefreshing(true);
    setRefreshToast(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/research/${product.id}/refresh`, {
        method: 'POST',
        headers: {
          ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }),
        },
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Refresh failed');
      }
      await fetchProduct();
      setRefreshToast({ kind: 'ok', message: 'Product data refreshed.' });
    } catch (err) {
      setRefreshToast({
        kind: 'err',
        message: err instanceof Error ? err.message : 'Could not refresh data.',
      });
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!refreshToast) return;
    const t = window.setTimeout(() => setRefreshToast(null), 3500);
    return () => window.clearTimeout(t);
  }, [refreshToast]);

  const summaryFieldIds = useMemo(
    () => new Set(getSummaryFieldDefinitions().map((f) => f.id as string)),
    []
  );

  const summaryTiles = useMemo(() => {
    return getSummaryFieldDefinitions().map((field) => {
      const rawValue = getResearchFunnelColumnValue(product, field.id);
      const formatted = formatResearchFieldValue(rawValue, field.dataType);
      const hasValue = formatted !== '—';
      return {
        id: field.id,
        label: field.label,
        value: hasValue ? formatted : '—',
        hasValue,
      };
    });
  }, [product]);

  // Exclude summary-default fields from the detail groups below —
  // otherwise Price, Rating, Reviews, BSR etc. show up both in the
  // hero and in the group cards (what Dave called the duplicate).
  const groupedFields = useMemo(() => {
    return GROUP_ORDER.map((group) => ({
      group,
      fields: getResearchFieldDefinitionsByGroup(group).filter(
        (field) => field.id !== 'progress' && !summaryFieldIds.has(field.id as string)
      ),
    }));
  }, [summaryFieldIds]);

  const drawerGroups = useMemo(() => {
    // Drawer still exposes ALL groups (Core included) for users who
    // want the raw kitchen-sink view via search.
    const allGroups: ResearchFieldGroup[] = ['Core', 'Market & Demand', 'Trends', 'Listing & Competition'];
    const normalizedSearch = drawerSearch.trim().toLowerCase();
    return allGroups
      .map((group) => {
        const fields = getResearchFieldDefinitionsByGroup(group).filter((field) => field.id !== 'progress');
        const filtered = fields.filter((field) => {
          const rawValue = getResearchFunnelColumnValue(product, field.id);
          const formatted = formatResearchFieldValue(rawValue, field.dataType);
          const isEmpty = formatted === '—';
          if (!showEmptyFields && isEmpty) return false;
          if (!normalizedSearch) return true;
          return (
            field.label.toLowerCase().includes(normalizedSearch) ||
            field.id.toLowerCase().includes(normalizedSearch)
          );
        });
        return { group, fields: filtered };
      })
      .filter((group) => group.fields.length > 0);
  }, [drawerSearch, product, showEmptyFields]);

  // Funnel-stage indicator: which stages has this product reached?
  const stageStatus = useMemo(() => {
    const stages: { stage: Stage; reached: boolean }[] = [
      { stage: 'research', reached: true }, // always — it's in the research list
      { stage: 'vetting', reached: Boolean(product?.is_vetted) },
      { stage: 'offer', reached: Boolean(product?.is_offered) },
      { stage: 'sourcing', reached: Boolean(product?.is_sourced) },
    ];
    return stages;
  }, [product]);

  // Gather fields Keepa could not populate so the user knows what's
  // blocked on the Chrome extension / manual fill.
  const pendingFields = useMemo(() => {
    const pendingSources: Record<string, string> = product?.extra_data?.__pending_sources || {};
    const keys = Object.keys(pendingSources);
    return keys.map((key) => ({
      key,
      label: PENDING_FIELD_LABELS[key] || key,
      source: pendingSources[key],
    }));
  }, [product]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="h-12 w-12 text-blue-400 animate-spin mb-4" />
        <p className="text-slate-400">Loading research detail...</p>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="bg-slate-800/30 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-12">
        <div className="flex items-start gap-3 text-slate-300">
          <AlertCircle className="w-5 h-5 text-red-400 mt-0.5" />
          <div className="min-w-0">
            <p className="font-medium">Could not load product</p>
            <p className="text-slate-400 mt-1">
              {error || 'Please return to Research and select a product.'}
            </p>
            <button
              onClick={() => router.push('/research')}
              className="mt-4 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white transition-colors"
            >
              Back to Research
            </button>
          </div>
        </div>
      </div>
    );
  }

  const tags: any[] = Array.isArray(product?.tags) ? product.tags : [];
  const updatedLabel = product?.updated_at
    ? formatDate(product.updated_at)
    : product?.created_at
      ? formatDate(product.created_at)
      : '—';

  return (
    <div>
      <ProductHeader
        productId={product?.id}
        asin={asin}
        currentDisplayTitle={displayTitle}
        originalTitle={product?.title || displayTitle}
        currentPhase="research"
        stage={{
          vetted: !!product?.is_vetted,
          offered: !!product?.is_offered,
          sourced: !!product?.is_sourced,
        }}
        leftButton={{ label: 'Back to Funnel', href: '/research', stage: 'research' }}
        rightButton={{ label: 'Vet This Product', onClick: goToVetting, stage: 'vetting' }}
      />

      <div className="space-y-6">
        {/* HERO — headline numbers + status pills + tags, all in one block */}
        <div className="relative overflow-hidden rounded-2xl border border-blue-500/30 bg-gradient-to-br from-blue-900/25 via-slate-900/70 to-slate-900/60 shadow-lg shadow-blue-500/10 p-6">
          <div className="absolute -top-12 -right-12 h-40 w-40 rounded-full bg-blue-500/15 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />

          <div className="relative">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <p className="text-xs uppercase tracking-[0.2em] text-blue-300/90 font-semibold">
                Research Snapshot
              </p>
              <div className="inline-flex items-center gap-3">
                <div className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                  <Clock className="h-3.5 w-3.5" />
                  Updated {updatedLabel}
                </div>
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500/45 bg-blue-500/10 hover:bg-blue-500/20 hover:border-blue-500/70 px-2.5 py-1 text-xs font-medium text-blue-100 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  title="Pull the latest product data"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                  {refreshing ? 'Refreshing…' : 'Fetch Latest Data'}
                </button>
              </div>
            </div>

            {/* Summary tiles */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {summaryTiles.map((tile) => (
                <div
                  key={tile.id}
                  className="rounded-xl border border-blue-500/25 bg-slate-900/60 backdrop-blur-sm px-4 py-3.5 hover:border-blue-500/50 transition-colors"
                >
                  <p className="text-[10px] text-blue-300/80 uppercase tracking-wider font-semibold">
                    {tile.label}
                  </p>
                  <p className="text-xl font-bold text-white mt-1.5">{tile.value}</p>
                </div>
              ))}
            </div>

            {/* Stage progression pills */}
            <div className="mt-5">
              <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-2">
                Funnel progress
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {stageStatus.map(({ stage, reached }, i) => (
                  <div key={stage} className="flex items-center gap-2">
                    <StagePill stage={stage} reached={reached} />
                    {i < stageStatus.length - 1 && (
                      <span className="text-slate-600">→</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Tags */}
            {tags.length > 0 && (
              <div className="mt-5">
                <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-2 flex items-center gap-1.5">
                  <TagIcon className="h-3 w-3" /> Tags
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((tag: any) => (
                    <TagChip key={tag.id} tag={tag} size="sm" />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* DETAIL GROUPS — 3-column at lg so the three groups line up
            nicely with no awkward empty cell. */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {groupedFields.map(({ group, fields }) => {
            const items = fields
              .map((field) => {
                const rawValue = getResearchFunnelColumnValue(product, field.id);
                const formatted = formatResearchFieldValue(rawValue, field.dataType);
                return formatted === '—' ? null : { id: field.id, label: field.label, value: formatted };
              })
              .filter(Boolean) as { id: string; label: string; value: string }[];

            if (items.length === 0) return null;

            return (
              <div
                key={group}
                className="rounded-2xl border border-slate-700/60 bg-slate-900/40 backdrop-blur-sm overflow-hidden"
              >
                <div className="px-5 py-3 border-b border-slate-700/60 bg-slate-900/60 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">{group}</h3>
                  <span className="text-xs text-slate-500">{items.length} fields</span>
                </div>
                <dl className="p-5 space-y-3">
                  {items.map((item) => (
                    <div key={item.id} className="border-b border-slate-700/30 pb-2 last:border-b-0">
                      <dt className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                        {item.label}
                      </dt>
                      <dd className="text-sm text-white mt-1 break-words font-medium">{item.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            );
          })}
        </div>

        {/* PENDING FIELDS — what Keepa couldn't fill */}
        {pendingFields.length > 0 && (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 backdrop-blur-sm">
            <button
              type="button"
              onClick={() => setPendingOpen((v) => !v)}
              className="w-full flex items-center justify-between px-5 py-3 text-left"
            >
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-amber-200">
                  {pendingFields.length} field{pendingFields.length === 1 ? '' : 's'} pending
                </h3>
                <span className="text-xs text-amber-300/70">
                  — fills in when you upload a Helium 10 CSV or the Chrome extension lands
                </span>
              </div>
              <ChevronDown
                className={`h-4 w-4 text-amber-300 transition-transform ${pendingOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {pendingOpen && (
              <div className="px-5 pb-4 grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1.5 text-xs text-amber-200/80">
                {pendingFields.map((f) => (
                  <div key={f.key} className="truncate">• {f.label}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Secondary: browse all fields */}
        <div className="flex items-center justify-end pt-2">
          <button
            onClick={() => setIsDrawerOpen(true)}
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            <Search className="h-3.5 w-3.5" />
            Browse all fields
          </button>
        </div>
      </div>

      {/* Refresh status toast */}
      {refreshToast && (
        <div className="fixed bottom-4 right-4 z-[200]">
          <div
            className={`flex items-center gap-3 rounded-xl border px-4 py-3 shadow-lg ${
              refreshToast.kind === 'ok'
                ? 'bg-blue-600/95 text-white border-blue-400/40'
                : 'bg-red-700/95 text-white border-red-400/40'
            }`}
          >
            {refreshToast.kind === 'ok' ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <AlertCircle className="h-5 w-5" />
            )}
            <p className="text-sm font-medium">{refreshToast.message}</p>
          </div>
        </div>
      )}

      {/* Drawer (unchanged in behavior, slightly restyled copy) */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-[1100] flex">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setIsDrawerOpen(false)}
            aria-hidden="true"
          />
          <div className="relative ml-auto h-full w-full max-w-xl bg-slate-900 border-l border-slate-700/60 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/60">
              <div>
                <p className="text-sm font-semibold text-white">All fields</p>
                <p className="text-xs text-slate-400 mt-0.5">Search and review every available field.</p>
              </div>
              <button
                onClick={() => setIsDrawerOpen(false)}
                className="p-2 rounded-lg hover:bg-slate-800 transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4 text-slate-300" />
              </button>
            </div>
            <div className="px-6 py-4 border-b border-slate-700/60 space-y-3">
              <div className="flex items-center gap-2 rounded-lg border border-slate-700/60 px-3 py-2 bg-slate-800/40">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  value={drawerSearch}
                  onChange={(event) => setDrawerSearch(event.target.value)}
                  placeholder="Search fields"
                  className="w-full bg-transparent text-sm text-slate-200 focus:outline-none"
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-400">
                <input
                  type="checkbox"
                  checked={showEmptyFields}
                  onChange={(event) => setShowEmptyFields(event.target.checked)}
                  className="rounded border-slate-600"
                />
                Show empty fields
              </label>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
              {drawerGroups.length === 0 ? (
                <div className="text-sm text-slate-400">No fields match your search.</div>
              ) : (
                drawerGroups.map(({ group, fields }) => (
                  <div key={group}>
                    <p className="text-xs text-slate-500 uppercase tracking-wider">{group}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                      {fields.map((field) => {
                        const rawValue = getResearchFunnelColumnValue(product, field.id);
                        const formatted = formatResearchFieldValue(rawValue, field.dataType);
                        return (
                          <div key={field.id}>
                            <p className="text-xs text-slate-500 uppercase tracking-wider">{field.label}</p>
                            <p className="text-slate-200 mt-1 break-words">{formatted}</p>
                            <p className="text-[11px] text-slate-500 mt-1">{field.id}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Stage pill ----

const STAGE_PILL_STYLE: Record<Stage, { reached: string; idle: string }> = {
  research: {
    reached: 'border-blue-500/60 bg-blue-500/15 text-blue-200',
    idle: 'border-slate-700/60 bg-slate-800/40 text-slate-500',
  },
  vetting: {
    reached: 'border-cyan-500/60 bg-cyan-500/15 text-cyan-200',
    idle: 'border-slate-700/60 bg-slate-800/40 text-slate-500',
  },
  offer: {
    reached: 'border-emerald-500/60 bg-emerald-500/15 text-emerald-200',
    idle: 'border-slate-700/60 bg-slate-800/40 text-slate-500',
  },
  sourcing: {
    reached: 'border-teal-500/60 bg-teal-500/15 text-teal-200',
    idle: 'border-slate-700/60 bg-slate-800/40 text-slate-500',
  },
};

function StagePill({ stage, reached }: { stage: Stage; reached: boolean }) {
  const style = STAGE_PILL_STYLE[stage];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
        reached ? style.reached : style.idle
      }`}
    >
      {reached ? (
        <CheckCircle2 className="h-3 w-3" />
      ) : (
        <Circle className="h-3 w-3" />
      )}
      {STAGE_LABELS[stage]}
    </span>
  );
}
