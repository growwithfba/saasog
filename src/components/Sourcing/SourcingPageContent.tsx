'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { useDispatch } from 'react-redux';
import { useRouter } from 'next/navigation';
import { AlertCircle, Eye, Loader2, PlayCircle, Trash2 } from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';
import { RootState } from '@/store';
import { formatDate } from '@/utils/formatDate';
import { StageWorkContainer } from '@/components/stage/StageWorkContainer';
import { loadSourcingData } from './sourcingStorage';
import { hydrateDisplayTitles } from '@/store/productTitlesSlice';
import LearnModal from '@/components/LearnModal';

type SourcingListStatusLabel = 'Not Started' | 'In Progress' | 'Ordered';

type SourcingListItem = {
  asin: string;
  title: string;
  supplierStatus: SourcingListStatusLabel;
  targetCost: number | null;
  estMarginPct: number | null;
  updatedAt: string | null;
  sourcingUpdatedAt: string | null;
};

function statusLabelFromLocal(status: string | undefined): SourcingListStatusLabel {
  if (status === 'completed') return 'Ordered';
  if (status === 'working') return 'In Progress';
  return 'Not Started';
}

function getSourcingStatusBadge(status: SourcingListStatusLabel): string {
  switch (status) {
    case 'Ordered':
      return 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-500 border-emerald-200 dark:border-emerald-500/20';
    case 'In Progress':
      return 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-500 border-amber-200 dark:border-amber-500/20';
    case 'Not Started':
    default:
      return 'bg-gray-50 dark:bg-slate-500/10 text-gray-600 dark:text-slate-300 border-gray-200 dark:border-slate-500/20';
  }
}

export function SourcingPageContent() {
  const { user } = useSelector((state: RootState) => state.auth);
  const titleByAsin = useSelector((state: RootState) => state.productTitles.byAsin);
  const dispatch = useDispatch();
  const router = useRouter();

  const [items, setItems] = useState<SourcingListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLearnModalOpen, setIsLearnModalOpen] = useState(false);

  const fetchSourcingList = async () => {
    if (!user) return;
    try {
      setLoading(true);
      setError(null);

      const { data: { session } } = await supabase.auth.getSession();
      const researchRes = await fetch('/api/research', {
        headers: { ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }) },
        credentials: 'include',
      });

      if (!researchRes.ok) {
        throw new Error(`Failed to fetch products (HTTP ${researchRes.status})`);
      }

      const data = await researchRes.json();
      const rows: any[] = Array.isArray(data?.data) ? data.data : [];
      dispatch(
        hydrateDisplayTitles(
          rows
            .map((p: any) => ({ asin: p?.asin, title: p?.display_title || null }))
            .filter((x: any) => x.asin && x.title)
        )
      );

      const sourced = rows
        .filter((p) => p?.is_offered === true || p?.is_sourced === true)
        .map((p) => {
          const asin = p?.asin || 'N/A';
          const sourcing = asin && asin !== 'N/A' ? loadSourcingData(asin) : null;
          const pc = sourcing?.profitCalculator;
          const salesPrice = pc?.salesPrice ?? null;
          const exwUnitCost = pc?.exwUnitCost ?? null;
          const estMarginPct =
            salesPrice && exwUnitCost !== null && salesPrice > 0
              ? ((salesPrice - exwUnitCost) / salesPrice) * 100
              : null;

          return {
            asin,
            title: p?.display_title || p?.title || 'Untitled Product',
            supplierStatus: sourcing ? statusLabelFromLocal(sourcing.status) : 'Not Started',
            targetCost: typeof exwUnitCost === 'number' ? exwUnitCost : null,
            estMarginPct: typeof estMarginPct === 'number' ? estMarginPct : null,
            updatedAt: p?.updated_at || p?.created_at || null,
            sourcingUpdatedAt: sourcing?.updatedAt || null,
          } satisfies SourcingListItem;
        })
        .filter((x) => x.asin && x.asin !== 'N/A');

      setItems(sourced);
    } catch (e) {
      console.error('[Sourcing] Failed to fetch list:', e);
      setError(e instanceof Error ? e.message : 'Failed to load sourcing list');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSourcingList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return items;
    const q = searchTerm.trim().toLowerCase();
    return items.filter((i) => {
      const resolvedTitle = titleByAsin?.[i.asin] || i.title || '';
      return i.asin.toLowerCase().includes(q) || resolvedTitle.toLowerCase().includes(q);
    });
  }, [items, searchTerm, titleByAsin]);

  const leftTabContent = (
    <>
      {loading && (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="h-12 w-12 text-blue-500 animate-spin mb-4" />
          <p className="text-gray-600 dark:text-slate-400">Loading your sourced products...</p>
        </div>
      )}

      {!loading && error && (
        <div className="flex flex-col items-center justify-center py-16">
          <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
          <p className="text-gray-800 dark:text-slate-300 mb-2">Failed to load sourced products</p>
          <p className="text-gray-600 dark:text-slate-400 mb-4">{error}</p>
          <button
            onClick={fetchSourcingList}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg text-white transition-colors shadow-md hover:shadow-lg"
          >
            Try Again
          </button>
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-slate-800/50 mb-4">
            <AlertCircle className="h-8 w-8 text-gray-400 dark:text-slate-400" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No products ready for sourcing</h3>
          <p className="text-gray-600 dark:text-slate-400 mb-6">
            Build an offer first, then click "Begin Sourcing" to move a product here.
          </p>
          <button
            onClick={() => router.push('/offer')}
            className="mt-6 px-6 py-2.5 bg-orange-500 hover:bg-orange-600 rounded-lg text-white font-medium transition-colors shadow-md hover:shadow-lg"
          >
            Go to Offer
          </button>
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <>
          <p className="text-sm text-gray-600 dark:text-slate-400 mb-4">
            Showing {filtered.length} {filtered.length === 1 ? 'result' : 'results'}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-gray-200 dark:border-slate-700/50">
                  <th className="text-left p-4 text-xs font-medium text-gray-600 dark:text-slate-400 uppercase tracking-wider">ASIN</th>
                  <th className="text-left p-4 text-xs font-medium text-gray-600 dark:text-slate-400 uppercase tracking-wider">Product</th>
                  <th className="text-left p-4 text-xs font-medium text-gray-600 dark:text-slate-400 uppercase tracking-wider">Supplier Status</th>
                  <th className="text-left p-4 text-xs font-medium text-gray-600 dark:text-slate-400 uppercase tracking-wider">Target Cost</th>
                  <th className="text-left p-4 text-xs font-medium text-gray-600 dark:text-slate-400 uppercase tracking-wider">Est. Margin</th>
                  <th className="text-left p-4 text-xs font-medium text-gray-600 dark:text-slate-400 uppercase tracking-wider">Last Updated</th>
                  <th className="text-left p-4 text-xs font-medium text-gray-600 dark:text-slate-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700/30">
                {filtered.map((row) => {
                  const statusBadge = getSourcingStatusBadge(row.supplierStatus);
                  return (
                    <tr
                      key={row.asin}
                      className="hover:bg-gray-50 dark:hover:bg-slate-700/20 transition-colors cursor-pointer"
                      onClick={(e) => {
                        const target = e.target as HTMLElement;
                        if (target.tagName === 'BUTTON' || target.closest('button')) return;
                        router.push(`/sourcing/${encodeURIComponent(row.asin)}`);
                      }}
                    >
                      <td className="p-4 text-sm text-gray-700 dark:text-slate-300">{row.asin}</td>
                      <td className="p-4">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {titleByAsin?.[row.asin] || row.title || 'Untitled'}
                        </p>
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusBadge}`}>
                          {row.supplierStatus}
                        </span>
                      </td>
                      <td className="p-4 text-sm text-gray-700 dark:text-slate-300">
                        {typeof row.targetCost === 'number' ? `$${row.targetCost.toFixed(2)}` : '—'}
                      </td>
                      <td className="p-4 text-sm text-gray-700 dark:text-slate-300">
                        {typeof row.estMarginPct === 'number' ? `${row.estMarginPct.toFixed(1)}%` : '—'}
                      </td>
                      <td className="p-4 text-sm text-gray-700 dark:text-slate-300">
                        {row.sourcingUpdatedAt
                          ? formatDate(row.sourcingUpdatedAt)
                          : row.updatedAt
                            ? formatDate(row.updatedAt)
                            : '—'}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => router.push(`/sourcing/${encodeURIComponent(row.asin)}`)}
                            className="p-2 bg-blue-50 dark:bg-blue-500/20 hover:bg-blue-100 dark:hover:bg-blue-500/30 rounded-lg text-blue-600 dark:text-blue-400 transition-colors"
                            title="View sourcing"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              try {
                                localStorage.removeItem(`sourcing_${row.asin}`);
                              } catch {
                                // ignore
                              }
                              setItems((prev) =>
                                prev.map((p) =>
                                  p.asin === row.asin
                                    ? { ...p, supplierStatus: 'Not Started', targetCost: null, estMarginPct: null, sourcingUpdatedAt: null }
                                    : p
                                )
                              );
                            }}
                            className="p-2 bg-red-50 dark:bg-red-500/20 hover:bg-red-100 dark:hover:bg-red-500/30 rounded-lg text-red-600 dark:text-red-400 transition-colors"
                            title="Delete sourcing draft"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );

  const rightTabContent = (
    <div className="bg-white/90 dark:bg-slate-800/30 backdrop-blur-xl rounded-2xl border border-gray-200 dark:border-slate-700/50 p-12 flex items-center justify-center">
      <div className="text-center">
        <p className="text-gray-900 dark:text-slate-300 font-medium mb-2">Sourcing Hub</p>
        <p className="text-gray-600 dark:text-slate-400">
          Select a product from the <span className="text-gray-900 dark:text-slate-200">Sourced Products</span> tab to begin.
        </p>
      </div>
    </div>
  );

  const learnButton = (
    <button
      onClick={() => setIsLearnModalOpen(true)}
      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500/20 to-blue-500/20 hover:from-purple-500/30 hover:to-blue-500/30 border border-purple-500/30 rounded-lg text-purple-600 dark:text-purple-300 hover:text-purple-700 dark:hover:text-purple-200 transition-all duration-200 transform hover:scale-105"
    >
      <PlayCircle className="w-4 h-4" />
      <span className="font-medium">Learn</span>
    </button>
  );

  return (
    <>
      <div className="flex items-center justify-end mb-4">
        {learnButton}
      </div>
      <StageWorkContainer
        titleLeftTab="Sourced Products"
        titleRightTab="Sourcing Hub"
        leftTabContent={leftTabContent}
        rightTabContent={rightTabContent}
        defaultTab="left"
        showHeaderOn="left"
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search sourced products..."
      />
      <LearnModal 
        isOpen={isLearnModalOpen} 
        onClose={() => setIsLearnModalOpen(false)} 
        onAction={() => setIsLearnModalOpen(false)} 
      />
    </>
  );
}
