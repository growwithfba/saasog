'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { useDispatch } from 'react-redux';
import { useRouter } from 'next/navigation';
import { AlertCircle, Eye, Loader2, Trash2 } from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';
import { RootState } from '@/store';
import { formatDate } from '@/utils/formatDate';
import { StageWorkContainer } from '@/components/stage/StageWorkContainer';
import { loadSourcingData } from './sourcingStorage';
import { hydrateDisplayTitles } from '@/store/productTitlesSlice';

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

export function SourcingPageContent() {
  const { user } = useSelector((state: RootState) => state.auth);
  const titleByAsin = useSelector((state: RootState) => state.productTitles.byAsin);
  const dispatch = useDispatch();
  const router = useRouter();

  const [items, setItems] = useState<SourcingListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

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
          <p className="text-slate-400">Loading your sourced products...</p>
        </div>
      )}

      {!loading && error && (
        <div className="flex flex-col items-center justify-center py-16">
          <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
          <p className="text-slate-300 mb-2">Failed to load sourced products</p>
          <p className="text-slate-400 mb-4">{error}</p>
          <button
            onClick={fetchSourcingList}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg text-white transition-colors"
          >
            Try Again
          </button>
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="text-center py-16">
          <h3 className="text-xl font-semibold text-white mb-2">No products ready for sourcing</h3>
          <p className="text-slate-400">
            Build an offer first, then click “Begin Sourcing” to move a product here.
          </p>
          <button
            onClick={() => router.push('/offer')}
            className="mt-6 px-6 py-2.5 bg-orange-500 hover:bg-orange-600 rounded-lg text-white font-medium transition-colors"
          >
            Go to Offer
          </button>
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">ASIN</th>
                <th className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Product</th>
                <th className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Supplier Status</th>
                <th className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Target Cost</th>
                <th className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Est. Margin</th>
                <th className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Last Updated</th>
                <th className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/30">
              {filtered.map((row) => (
                <tr
                  key={row.asin}
                  className="hover:bg-slate-700/20 transition-colors cursor-pointer"
                  onClick={(e) => {
                    const target = e.target as HTMLElement;
                    if (target.tagName === 'BUTTON' || target.closest('button')) return;
                    router.push(`/sourcing/${encodeURIComponent(row.asin)}`);
                  }}
                >
                  <td className="p-4 text-sm text-slate-300">{row.asin}</td>
                  <td className="p-4">
                    <p className="text-sm font-medium text-white">
                      {titleByAsin?.[row.asin] || row.title || 'Untitled'}
                    </p>
                  </td>
                  <td className="p-4 text-sm text-slate-300">{row.supplierStatus}</td>
                  <td className="p-4 text-sm text-slate-300">
                    {typeof row.targetCost === 'number' ? `$${row.targetCost.toFixed(2)}` : '—'}
                  </td>
                  <td className="p-4 text-sm text-slate-300">
                    {typeof row.estMarginPct === 'number' ? `${row.estMarginPct.toFixed(1)}%` : '—'}
                  </td>
                  <td className="p-4 text-sm text-slate-300">
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
                        className="p-2 bg-blue-500/20 hover:bg-blue-500/30 rounded-lg text-blue-400 transition-colors"
                        title="View sourcing"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
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
                        className="p-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-red-400 transition-colors"
                        title="Delete sourcing draft"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );

  const rightTabContent = (
    <div className="bg-slate-800/30 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-12 flex items-center justify-center">
      <div className="text-center">
        <p className="text-slate-300 font-medium mb-2">Sourcing Hub</p>
        <p className="text-slate-400">
          Select a product from the <span className="text-slate-200">Sourced Products</span> tab to begin.
        </p>
      </div>
    </div>
  );

  return (
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
  );
}
