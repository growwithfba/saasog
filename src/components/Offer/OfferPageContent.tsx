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
import { hydrateDisplayTitles } from '@/store/productTitlesSlice';
import LearnModal from '@/components/LearnModal';

type OfferLocalStatus = 'none' | 'working' | 'completed';
type OfferListStatusLabel = 'Not Started' | 'In Progress' | 'Completed';

type OfferListItem = {
  asin: string;
  title: string;
  brand: string | null;
  category: string | null;
  vettedStatus: string | null; // PASS/RISKY/FAIL if available
  offerStatus: OfferListStatusLabel;
  offerUpdatedAt: string | null;
  source: 'research_products' | 'submissions';
  updatedAt: string | null;
};

function getOfferStatusLabel(status: OfferLocalStatus | undefined): OfferListStatusLabel {
  if (status === 'completed') return 'Completed';
  if (status === 'working') return 'In Progress';
  return 'Not Started';
}

function getOfferStatusBadgeClasses(status: OfferListStatusLabel): string {
  switch (status) {
    case 'Completed':
      return 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-500 border-emerald-200 dark:border-emerald-500/20';
    case 'In Progress':
      return 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-500 border-amber-200 dark:border-amber-500/20';
    case 'Not Started':
    default:
      return 'bg-gray-50 dark:bg-slate-500/10 text-gray-600 dark:text-slate-300 border-gray-200 dark:border-slate-500/20';
  }
}

function readOfferLocalMeta(asin: string): { status: OfferLocalStatus; updatedAt: string | null } {
  try {
    const stored = localStorage.getItem(`offer_${asin}`);
    if (!stored) return { status: 'none', updatedAt: null };
    const parsed = JSON.parse(stored);
    const status: OfferLocalStatus =
      parsed?.status === 'completed' ? 'completed' : parsed?.status === 'working' ? 'working' : 'none';
    const updatedAt: string | null = typeof parsed?.updatedAt === 'string' ? parsed.updatedAt : null;
    return { status, updatedAt };
  } catch {
    return { status: 'none', updatedAt: null };
  }
}

export function OfferPageContent() {
  const { user } = useSelector((state: RootState) => state.auth);
  const titleByAsin = useSelector((state: RootState) => state.productTitles.byAsin);
  const dispatch = useDispatch();
  const router = useRouter();

  const [items, setItems] = useState<OfferListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLearnModalOpen, setIsLearnModalOpen] = useState(false);

  const fetchOfferList = async () => {
    if (!user) return;
    try {
      setLoading(true);
      setError(null);

      const { data: { session } } = await supabase.auth.getSession();

      const [researchRes] = await Promise.all([
        fetch('/api/research', {
          headers: { ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }) },
          credentials: 'include',
        }),
      ]);

      const combined: OfferListItem[] = [];

      if (researchRes.ok) {
        const data = await researchRes.json();
        if (data?.success && Array.isArray(data.data)) {
          for (const p of data.data) {
            if (p?.is_vetted !== true) continue;
            const asin = p?.asin || 'N/A';
            if (!asin || asin === 'N/A') continue;
            const meta = readOfferLocalMeta(asin);
            combined.push({
              asin,
              title: p.display_title || p.title || 'Untitled Product',
              brand: p.brand ?? null,
              category: p.category ?? null,
              vettedStatus: p?.extra_data?.status || null,
              offerStatus: getOfferStatusLabel(meta.status),
              offerUpdatedAt: meta.updatedAt,
              source: 'research_products',
              updatedAt: p.updated_at || p.created_at || null,
            });
          }
          dispatch(
            hydrateDisplayTitles(
              (data.data || [])
                .map((p: any) => ({ asin: p?.asin, title: p?.display_title || null }))
                .filter((x: any) => x.asin && x.title)
            )
          );
        }
      }


      // De-dupe by ASIN, prefer research_products entry (more canonical for funnel state)
      const unique = combined.reduce((acc: OfferListItem[], item) => {
        const existingIdx = acc.findIndex((x) => x.asin === item.asin);
        if (existingIdx === -1) {
          acc.push(item);
          return acc;
        }
        const existing = acc[existingIdx];
        if (existing.source !== 'research_products' && item.source === 'research_products') {
          acc[existingIdx] = item;
        }
        return acc;
      }, []);

      setItems(unique);
    } catch (e) {
      console.error('[Offer] Failed to fetch offers list:', e);
      setError(e instanceof Error ? e.message : 'Failed to load offer list');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOfferList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return items;
    const q = searchTerm.trim().toLowerCase();
    return items.filter((i) => {
      const resolvedTitle = titleByAsin?.[i.asin] || i.title || '';
      return (
        i.asin.toLowerCase().includes(q) ||
        resolvedTitle.toLowerCase().includes(q) ||
        (i.brand || '').toLowerCase().includes(q) ||
        (i.category || '').toLowerCase().includes(q)
      );
    });
  }, [items, searchTerm, titleByAsin]);

  const leftTabContent = (
    <>
      {loading && (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="h-12 w-12 text-blue-500 animate-spin mb-4" />
          <p className="text-gray-600 dark:text-slate-400">Loading your offers...</p>
        </div>
      )}

      {!loading && error && (
        <div className="flex flex-col items-center justify-center py-16">
          <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
          <p className="text-gray-900 dark:text-slate-300 mb-2">Failed to load offers</p>
          <p className="text-gray-600 dark:text-slate-400 mb-4">{error}</p>
          <button
            onClick={fetchOfferList}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg text-white transition-colors shadow-md"
          >
            Try Again
          </button>
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="text-center py-16">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No vetted products ready for offers</h3>
          <p className="text-gray-600 dark:text-slate-400">
            Vet products first, then come back here to build offers.
          </p>
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-600 dark:text-slate-400">
              Showing {filtered.length} {filtered.length === 1 ? 'product' : 'products'}
            </p>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-slate-700/50">
                <th className="text-left p-4 text-xs font-medium text-gray-600 dark:text-slate-400 uppercase tracking-wider">ASIN</th>
                <th className="text-left p-4 text-xs font-medium text-gray-600 dark:text-slate-400 uppercase tracking-wider">Product</th>
                <th className="text-left p-4 text-xs font-medium text-gray-600 dark:text-slate-400 uppercase tracking-wider">Brand</th>
                <th className="text-left p-4 text-xs font-medium text-gray-600 dark:text-slate-400 uppercase tracking-wider">Category</th>
                <th className="text-left p-4 text-xs font-medium text-gray-600 dark:text-slate-400 uppercase tracking-wider">Offer Status</th>
                <th className="text-left p-4 text-xs font-medium text-gray-600 dark:text-slate-400 uppercase tracking-wider">Last Updated</th>
                <th className="text-left p-4 text-xs font-medium text-gray-600 dark:text-slate-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700/30">
              {filtered.map((row) => (
                <tr
                  key={row.asin}
                  className="hover:bg-gray-50 dark:hover:bg-slate-700/20 transition-colors cursor-pointer"
                  onClick={(e) => {
                    const target = e.target as HTMLElement;
                    if (target.tagName === 'BUTTON' || target.closest('button')) return;
                    router.push(`/offer/${encodeURIComponent(row.asin)}`);
                  }}
                >
                  <td className="p-4 text-sm text-gray-700 dark:text-slate-300">{row.asin}</td>
                  <td className="p-4">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {titleByAsin?.[row.asin] || row.title || 'Untitled'}
                    </p>
                  </td>
                  <td className="p-4 text-sm text-gray-700 dark:text-slate-300">{row.brand || '—'}</td>
                  <td className="p-4 text-sm text-gray-700 dark:text-slate-300">{row.category || '—'}</td>
                  <td className="p-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getOfferStatusBadgeClasses(row.offerStatus)}`}>
                      {row.offerStatus}
                    </span>
                  </td>
                  <td className="p-4 text-sm text-gray-700 dark:text-slate-300">
                    {row.offerUpdatedAt ? formatDate(row.offerUpdatedAt) : (row.updatedAt ? formatDate(row.updatedAt) : '—')}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => router.push(`/offer/${encodeURIComponent(row.asin)}`)}
                        className="p-2 bg-blue-100 dark:bg-blue-500/20 hover:bg-blue-200 dark:hover:bg-blue-500/30 rounded-lg text-blue-600 dark:text-blue-400 transition-colors"
                        title="View offer"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          try {
                            localStorage.removeItem(`offer_${row.asin}`);
                          } catch {
                            // ignore
                          }
                          setItems((prev) =>
                            prev.map((p) =>
                              p.asin === row.asin ? { ...p, offerStatus: 'Not Started', offerUpdatedAt: null } : p
                            )
                          );
                        }}
                        className="p-2 bg-red-100 dark:bg-red-500/20 hover:bg-red-200 dark:hover:bg-red-500/30 rounded-lg text-red-600 dark:text-red-400 transition-colors"
                        title="Delete offer draft"
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
        </div>
      )}
    </>
  );

  const rightTabContent = (
    <div className="bg-white/80 dark:bg-slate-800/30 backdrop-blur-xl rounded-2xl border border-gray-200 dark:border-slate-700/50 p-12 flex items-center justify-center shadow-md">
      <div className="text-center">
        <p className="text-gray-800 dark:text-slate-300 font-medium mb-2">Offer Builder</p>
        <p className="text-gray-600 dark:text-slate-400">
          Select a product from the <span className="text-gray-900 dark:text-slate-200">Offers</span> tab to begin building an offer.
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
        titleLeftTab="Offers"
        titleRightTab="Offer Builder"
        leftTabContent={leftTabContent}
        rightTabContent={rightTabContent}
        defaultTab="left"
        showHeaderOn="left"
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search offers..."
      />
      <LearnModal 
        isOpen={isLearnModalOpen} 
        onClose={() => setIsLearnModalOpen(false)} 
        onAction={() => setIsLearnModalOpen(false)} 
      />
    </>
  );
}
