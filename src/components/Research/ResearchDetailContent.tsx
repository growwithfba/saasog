'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { useDispatch } from 'react-redux';
import { useRouter } from 'next/navigation';
import { AlertCircle, ChevronDown, Loader2, Search, X } from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';
import { RootState } from '@/store';
import { ProductHeaderBar } from '@/components/ProductHeaderBar';
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

const GROUP_ORDER: ResearchFieldGroup[] = ['Core', 'Market & Demand', 'Trends', 'Listing & Competition'];
const DEFAULT_EXPANDED_GROUPS = ['Core'];

export function ResearchDetailContent({ asin }: { asin: string }) {
  const { user } = useSelector((state: RootState) => state.auth);
  const titleByAsin = useSelector((state: RootState) => state.productTitles.byAsin);
  const router = useRouter();
  const dispatch = useDispatch();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [product, setProduct] = useState<any>(null);
  const [expandedGroups, setExpandedGroups] = useState<string[]>(DEFAULT_EXPANDED_GROUPS);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerSearch, setDrawerSearch] = useState('');
  const [showEmptyFields, setShowEmptyFields] = useState(false);

  const displayTitle = useMemo(() => {
    return titleByAsin?.[asin] || product?.display_title || product?.title || 'Untitled Product';
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
      if (match?.display_title) {
        dispatch(setDisplayTitle({ asin, title: match.display_title }));
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

  const statusItems = useMemo(
    () => [
      {
        label: 'Updated',
        value: product?.updated_at
          ? formatDate(product.updated_at)
          : product?.created_at
            ? formatDate(product.created_at)
            : '—',
      },
      {
        label: 'Funnel Status',
        value: product
          ? `${product.is_vetted ? 'Vetted' : 'Not Vetted'} • ${product.is_offered ? 'Offering Built' : 'No Offering'} • ${
              product.is_sourced ? 'Sourced' : 'Not Sourced'
            }`
          : '—',
      },
    ],
    [product]
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

  const groupedFields = useMemo(() => {
    return GROUP_ORDER.map((group) => ({
      group,
      fields: getResearchFieldDefinitionsByGroup(group).filter((field) => field.id !== 'progress'),
    }));
  }, []);

  const drawerGroups = useMemo(() => {
    const normalizedSearch = drawerSearch.trim().toLowerCase();
    return groupedFields
      .map(({ group, fields }) => {
        const filteredFields = fields.filter((field) => {
          const rawValue = getResearchFunnelColumnValue(product, field.id);
          const formatted = formatResearchFieldValue(rawValue, field.dataType);
          const isEmpty = formatted === '—';
          if (!showEmptyFields && isEmpty) return false;
          if (!normalizedSearch) return true;
          return field.label.toLowerCase().includes(normalizedSearch) || field.id.toLowerCase().includes(normalizedSearch);
        });
        return { group, fields: filteredFields };
      })
      .filter((group) => group.fields.length > 0);
  }, [drawerSearch, groupedFields, product, showEmptyFields]);

  useEffect(() => {
    if (!user?.id) return;
    try {
      const stored = window.localStorage.getItem(`research-detail:accordion:${user.id}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setExpandedGroups(parsed);
        }
      }
    } catch (storageError) {
      console.warn('[ResearchDetail] Failed to read accordion state:', storageError);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    try {
      window.localStorage.setItem(`research-detail:accordion:${user.id}`, JSON.stringify(expandedGroups));
    } catch (storageError) {
      console.warn('[ResearchDetail] Failed to persist accordion state:', storageError);
    }
  }, [expandedGroups, user?.id]);

  const toggleGroup = (group: string) => {
    setExpandedGroups((prev) =>
      prev.includes(group) ? prev.filter((item) => item !== group) : [...prev, group]
    );
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="h-12 w-12 text-blue-500 animate-spin mb-4" />
        <p className="text-gray-600 dark:text-slate-400">Loading research detail...</p>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="bg-white/90 dark:bg-slate-800/30 backdrop-blur-xl rounded-2xl border border-gray-200 dark:border-slate-700/50 p-12">
        <div className="flex items-start gap-3 text-gray-900 dark:text-slate-300">
          <AlertCircle className="w-5 h-5 text-red-400 mt-0.5" />
          <div className="min-w-0">
            <p className="font-medium">Could not load product</p>
            <p className="text-gray-600 dark:text-slate-400 mt-1">{error || 'Please return to Research and select a product.'}</p>
            <button
              onClick={() => router.push('/research')}
              className="mt-4 px-4 py-2 bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 rounded-lg text-gray-900 dark:text-white transition-colors"
            >
              Back to Research
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <ProductHeaderBar
        productId={product?.id}
        asin={asin}
        currentDisplayTitle={displayTitle}
        originalTitle={product?.title || displayTitle}
        currentPhase="research"
        leftButton={{ label: 'Back to Funnel', href: '/research', stage: 'research' }}
        rightButton={{ label: 'Vet This Product', onClick: goToVetting, stage: 'vetting' }}
      />

      <div className="space-y-6">
        <div className="bg-white/90 dark:bg-slate-800/30 backdrop-blur-xl rounded-2xl border border-gray-200 dark:border-slate-700/50 p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs text-gray-600 dark:text-slate-500 uppercase tracking-wider">Summary</p>
              <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">Top decision metrics at a glance.</p>
            </div>
            <button
              onClick={() => setIsDrawerOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition-colors shadow-md hover:shadow-lg"
            >
              View All Fields
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
            {summaryTiles.map((tile) => (
              <div
                key={tile.id}
                className="rounded-xl border border-gray-200 dark:border-slate-700/60 bg-white/70 dark:bg-slate-900/40 px-4 py-3 shadow-sm"
              >
                <p className="text-[11px] text-gray-500 dark:text-slate-400 uppercase tracking-wider">{tile.label}</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white mt-2">{tile.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white/90 dark:bg-slate-800/30 backdrop-blur-xl rounded-2xl border border-gray-200 dark:border-slate-700/50 p-6">
          <p className="text-xs text-gray-600 dark:text-slate-500 uppercase tracking-wider">Status</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-3">
            {statusItems.map((item) => (
              <div key={item.label}>
                <p className="text-xs text-gray-600 dark:text-slate-500 uppercase tracking-wider">{item.label}</p>
                <p className="text-gray-900 dark:text-slate-200 mt-1 break-words">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {groupedFields.map(({ group, fields }) => {
            const isExpanded = expandedGroups.includes(group);
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
                className="bg-white/90 dark:bg-slate-800/30 backdrop-blur-xl rounded-2xl border border-gray-200 dark:border-slate-700/50"
              >
                <button
                  type="button"
                  onClick={() => toggleGroup(group)}
                  className="w-full flex items-center justify-between px-6 py-4 text-left"
                >
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">{group}</span>
                  <ChevronDown
                    className={`h-4 w-4 text-gray-500 dark:text-slate-400 transition-transform ${
                      isExpanded ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {isExpanded ? (
                  <div className="px-6 pb-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {items.map((item) => (
                        <div key={item.id}>
                          <p className="text-xs text-gray-600 dark:text-slate-500 uppercase tracking-wider">{item.label}</p>
                          <p className="text-gray-900 dark:text-slate-200 mt-1 break-words">{item.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {isDrawerOpen ? (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setIsDrawerOpen(false)}
            aria-hidden="true"
          />
          <div className="relative ml-auto h-full w-full max-w-xl bg-white dark:bg-slate-900 border-l border-gray-200 dark:border-slate-700/60 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-slate-700/60">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">All Fields</p>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Search and review every available field.</p>
              </div>
              <button
                onClick={() => setIsDrawerOpen(false)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4 text-gray-600 dark:text-slate-300" />
              </button>
            </div>
            <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700/60 space-y-3">
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-slate-700/60 px-3 py-2 bg-white/80 dark:bg-slate-800/40">
                <Search className="h-4 w-4 text-gray-400" />
                <input
                  value={drawerSearch}
                  onChange={(event) => setDrawerSearch(event.target.value)}
                  placeholder="Search fields"
                  className="w-full bg-transparent text-sm text-gray-900 dark:text-slate-200 focus:outline-none"
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-slate-400">
                <input
                  type="checkbox"
                  checked={showEmptyFields}
                  onChange={(event) => setShowEmptyFields(event.target.checked)}
                  className="rounded border-gray-300 dark:border-slate-600"
                />
                Show empty fields
              </label>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
              {drawerGroups.length === 0 ? (
                <div className="text-sm text-gray-500 dark:text-slate-400">No fields match your search.</div>
              ) : (
                drawerGroups.map(({ group, fields }) => (
                  <div key={group}>
                    <p className="text-xs text-gray-600 dark:text-slate-500 uppercase tracking-wider">{group}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                      {fields.map((field) => {
                        const rawValue = getResearchFunnelColumnValue(product, field.id);
                        const formatted = formatResearchFieldValue(rawValue, field.dataType);
                        return (
                          <div key={field.id}>
                            <p className="text-xs text-gray-600 dark:text-slate-500 uppercase tracking-wider">
                              {field.label}
                            </p>
                            <p className="text-gray-900 dark:text-slate-200 mt-1 break-words">{formatted}</p>
                            <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-1">{field.id}</p>
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
      ) : null}
    </div>
  );
}


