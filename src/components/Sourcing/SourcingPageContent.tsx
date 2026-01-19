'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { useDispatch } from 'react-redux';
import { useRouter } from 'next/navigation';
import { AlertCircle, Loader2, Trash2, X, CheckCircle, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';
import { RootState } from '@/store';
import { formatDate } from '@/utils/formatDate';
import { StageWorkContainer } from '@/components/stage/StageWorkContainer';
import { loadSourcingData, saveSourcingData, getDefaultSourcingData } from './sourcingStorage';
import { hydrateDisplayTitles } from '@/store/productTitlesSlice';
import { 
  getSupplierStatus, 
  getSupplierStatusBadge,
  type SupplierStatusLabel 
} from './sourcingStatusHelpers';
import { calculateQuoteMetrics, getRoiTier, getMarginTier } from './tabs/SupplierQuotesTab';
import { Checkbox } from '@/components/ui/Checkbox';
import { SourcingSandbox } from './tabs/SourcingSandbox';

type SourcingListItem = {
  asin: string;
  title: string;
  supplierStatus: SupplierStatusLabel;
  highestMargin: number | null;
  highestROI: number | null;
  updatedAt: string | null;
  sourcingUpdatedAt: string | null;
};

export function SourcingPageContent() {
  const { user } = useSelector((state: RootState) => state.auth);
  const titleByAsin = useSelector((state: RootState) => state.productTitles.byAsin);
  const dispatch = useDispatch();
  const router = useRouter();

  const [items, setItems] = useState<SourcingListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAsins, setSelectedAsins] = useState<Set<string>>(new Set());
  const [showClearModal, setShowClearModal] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [sortField, setSortField] = useState<keyof SourcingListItem | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

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
          
          // Calculate highest margin and ROI from supplier quotes
          let highestMargin: number | null = null;
          let highestROI: number | null = null;
          
          if (sourcing && sourcing.supplierQuotes.length > 0) {
            // Calculate metrics for each quote and find max
            const quotesWithMetrics = sourcing.supplierQuotes.map(quote => 
              calculateQuoteMetrics(quote, sourcing.sourcingHub, p)
            );
            
            // Find highest margin
            const margins = quotesWithMetrics
              .map(q => q.marginPct)
              .filter((m): m is number => m !== null && !isNaN(m));
            if (margins.length > 0) {
              highestMargin = Math.max(...margins);
            }
            
            // Find highest ROI
            const rois = quotesWithMetrics
              .map(q => q.roiPct)
              .filter((r): r is number => r !== null && !isNaN(r));
            if (rois.length > 0) {
              highestROI = Math.max(...rois);
            }
          }

          // Get supplier status using new helper
          const supplierStatus = getSupplierStatus(asin, sourcing);

          return {
            asin,
            title: p?.display_title || p?.title || 'Untitled Product',
            supplierStatus,
            highestMargin,
            highestROI,
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
    let result = items;
    
    // Apply search filter
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      result = result.filter((i) => {
        const resolvedTitle = titleByAsin?.[i.asin] || i.title || '';
        return i.asin.toLowerCase().includes(q) || resolvedTitle.toLowerCase().includes(q);
      });
    }
    
    // Apply sorting
    if (sortField) {
      result = [...result].sort((a, b) => {
        let aVal: any = a[sortField];
        let bVal: any = b[sortField];
        
        // Handle dates - use sourcingUpdatedAt with fallback to updatedAt
        if (sortField === 'sourcingUpdatedAt') {
          const aDate = aVal ? new Date(aVal).getTime() : (a.updatedAt ? new Date(a.updatedAt).getTime() : 0);
          const bDate = bVal ? new Date(bVal).getTime() : (b.updatedAt ? new Date(b.updatedAt).getTime() : 0);
          return sortDirection === 'asc' ? aDate - bDate : bDate - aDate;
        }
        
        // Handle numbers
        if (sortField === 'highestMargin' || sortField === 'highestROI') {
          const aNum = typeof aVal === 'number' && !isNaN(aVal) ? aVal : -Infinity;
          const bNum = typeof bVal === 'number' && !isNaN(bVal) ? bVal : -Infinity;
          return sortDirection === 'asc' ? aNum - bNum : bNum - aNum;
        }
        
        // Handle strings (asin, title, supplierStatus)
        if (sortField === 'asin' || sortField === 'title' || sortField === 'supplierStatus') {
          // For title, use resolved title from titleByAsin
          if (sortField === 'title') {
            aVal = titleByAsin?.[a.asin] || a.title || '';
            bVal = titleByAsin?.[b.asin] || b.title || '';
          }
          
          // Handle null/undefined values
          if (aVal === null || aVal === undefined) aVal = '';
          if (bVal === null || bVal === undefined) bVal = '';
          
          return sortDirection === 'asc' 
            ? String(aVal).localeCompare(String(bVal))
            : String(bVal).localeCompare(String(aVal));
        }
        
        return 0;
      });
    }
    
    return result;
  }, [items, searchTerm, titleByAsin, sortField, sortDirection]);

  // Handle checkbox selection
  const handleToggleSelection = (asin: string) => {
    setSelectedAsins(prev => {
      const next = new Set(prev);
      if (next.has(asin)) {
        next.delete(asin);
      } else {
        next.add(asin);
      }
      return next;
    });
  };

  // Handle select all on current page
  const handleSelectAll = () => {
    const allSelected = filtered.every(row => selectedAsins.has(row.asin));
    if (allSelected) {
      // Deselect all visible
      setSelectedAsins(prev => {
        const next = new Set(prev);
        filtered.forEach(row => next.delete(row.asin));
        return next;
      });
    } else {
      // Select all visible
      setSelectedAsins(prev => {
        const next = new Set(prev);
        filtered.forEach(row => next.add(row.asin));
        return next;
      });
    }
  };

  // Handle column sorting
  const handleSort = (field: keyof SourcingListItem) => {
    if (sortField === field) {
      // Toggle direction if same field
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      // New field, default to ascending
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Get sort icon for a column
  const getSortIcon = (field: keyof SourcingListItem) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 opacity-50" />;
    }
    return sortDirection === 'asc' 
      ? <ArrowUp className="w-3 h-3 text-blue-400" />
      : <ArrowDown className="w-3 h-3 text-blue-400" />;
  };

  // Handle clear data
  const handleClearData = () => {
    selectedAsins.forEach(asin => {
      try {
        // Clear sourcing data
        const defaultData = getDefaultSourcingData(asin);
        saveSourcingData(asin, defaultData);
        
        // Clear place order draft
        localStorage.removeItem(`placeOrderDraft_${asin}`);
      } catch (e) {
        console.error(`[Sourcing] Failed to clear data for ${asin}:`, e);
      }
    });
    
    // Refresh the list
    fetchSourcingList();
    
    // Clear selection
    setSelectedAsins(new Set());
    setShowClearModal(false);
    setShowSuccessToast(true);
    setTimeout(() => setShowSuccessToast(false), 3000);
  };

  const selectedCount = selectedAsins.size;
  const allVisibleSelected = filtered.length > 0 && filtered.every(row => selectedAsins.has(row.asin));

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
            Go to Offering
          </button>
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-600 dark:text-slate-400">
              Showing {filtered.length} {filtered.length === 1 ? 'result' : 'results'}
            </p>
            {selectedCount > 0 && (
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-600 dark:text-slate-400">
                  {selectedCount} {selectedCount === 1 ? 'product' : 'products'} selected
                </span>
                <button
                  onClick={() => setShowClearModal(true)}
                  className="px-4 py-2 bg-red-500 hover:bg-red-600 rounded-lg text-white font-medium transition-colors flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Clear Data
                </button>
              </div>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-gray-200 dark:border-slate-700/50">
                  <th className="text-left p-4 text-xs font-medium text-gray-600 dark:text-slate-400 uppercase tracking-wider">
                    <div className="flex items-center">
                      <Checkbox
                        size="sm"
                        checked={allVisibleSelected}
                        onChange={handleSelectAll}
                        onClick={(e) => e.stopPropagation()}
                        title="Select all on page"
                      />
                    </div>
                  </th>
                  <th 
                    className="text-left p-4 text-xs font-medium text-gray-600 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors"
                    onClick={() => handleSort('asin')}
                  >
                    <div className="flex items-center gap-1.5">
                      ASIN
                      {getSortIcon('asin')}
                    </div>
                  </th>
                  <th 
                    className="text-left p-4 text-xs font-medium text-gray-600 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors"
                    onClick={() => handleSort('title')}
                  >
                    <div className="flex items-center gap-1.5">
                      Product
                      {getSortIcon('title')}
                    </div>
                  </th>
                  <th 
                    className="text-left p-4 text-xs font-medium text-gray-600 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors"
                    onClick={() => handleSort('supplierStatus')}
                  >
                    <div className="flex items-center gap-1.5">
                      Supplier Status
                      {getSortIcon('supplierStatus')}
                    </div>
                  </th>
                  <th 
                    className="text-left p-4 text-xs font-medium text-gray-600 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors"
                    onClick={() => handleSort('highestMargin')}
                  >
                    <div className="flex items-center gap-1.5">
                      Highest Margin
                      {getSortIcon('highestMargin')}
                    </div>
                  </th>
                  <th 
                    className="text-left p-4 text-xs font-medium text-gray-600 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors"
                    onClick={() => handleSort('highestROI')}
                  >
                    <div className="flex items-center gap-1.5">
                      Highest ROI
                      {getSortIcon('highestROI')}
                    </div>
                  </th>
                  <th 
                    className="text-left p-4 text-xs font-medium text-gray-600 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors"
                    onClick={() => handleSort('sourcingUpdatedAt')}
                  >
                    <div className="flex items-center gap-1.5">
                      Last Updated
                      {getSortIcon('sourcingUpdatedAt')}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700/30">
                {filtered.map((row) => {
                  const statusBadge = getSupplierStatusBadge(row.supplierStatus);
                  const isSelected = selectedAsins.has(row.asin);
                  
                  // Get color coding for ROI and Margin
                  const roiTier = getRoiTier(row.highestROI);
                  const marginTier = getMarginTier(row.highestMargin);
                  
                  return (
                    <tr
                      key={row.asin}
                      className="hover:bg-gray-50 dark:hover:bg-slate-700/20 transition-colors cursor-pointer"
                      onClick={(e) => {
                        const target = e.target as HTMLElement;
                        // Don't navigate if clicking checkbox or its container
                        if (target.tagName === 'INPUT' || target.closest('input[type="checkbox"]') || target.closest('[role="checkbox"]')) {
                          return;
                        }
                        router.push(`/sourcing/${encodeURIComponent(row.asin)}`);
                      }}
                    >
                      <td className="p-4" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          size="sm"
                          checked={isSelected}
                          onChange={() => handleToggleSelection(row.asin)}
                          onClick={(e) => e.stopPropagation()}
                          title="Select product"
                        />
                      </td>
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
                      <td className="p-4">
                        <div className={`inline-flex items-center px-2.5 py-1 rounded-md border ${marginTier.bgColor} ${marginTier.borderColor}`}>
                          <span className={`text-sm font-semibold ${marginTier.textColor}`}>
                            {marginTier.label}
                          </span>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className={`inline-flex items-center px-2.5 py-1 rounded-md border ${roiTier.bgColor} ${roiTier.borderColor}`}>
                          <span className={`text-sm font-semibold ${roiTier.textColor}`}>
                            {roiTier.label}
                          </span>
                        </div>
                      </td>
                      <td className="p-4 text-sm text-gray-700 dark:text-slate-300">
                        {row.sourcingUpdatedAt
                          ? formatDate(row.sourcingUpdatedAt)
                          : row.updatedAt
                            ? formatDate(row.updatedAt)
                            : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Clear Data Confirmation Modal */}
      {showClearModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl p-6 max-w-md w-full border border-slate-700/50">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center">
                <Trash2 className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">
                  Clear all Sourcing data for selected product{selectedCount > 1 ? 's' : ''}?
                </h3>
                <p className="text-slate-400 text-sm">This action cannot be undone.</p>
              </div>
            </div>
            
            <p className="text-slate-300 mb-6">
              This will remove all Supplier Info, Sample/Order progress, and Place Order data for the selected product{selectedCount > 1 ? 's' : ''}.
            </p>
            
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowClearModal(false)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleClearData}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 rounded-lg text-white transition-colors flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Clear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Toast */}
      {showSuccessToast && (
        <div className="fixed bottom-4 right-4 z-50">
          <div className="bg-emerald-600 text-white px-6 py-4 rounded-xl shadow-lg flex items-center gap-3 animate-in slide-in-from-bottom-2 duration-300">
            <CheckCircle className="w-5 h-5" />
            <div>
              <p className="font-medium">Cleared sourcing data for {selectedCount} product{selectedCount > 1 ? 's' : ''}.</p>
            </div>
            <button
              onClick={() => setShowSuccessToast(false)}
              className="ml-2 hover:bg-emerald-700 rounded p-1 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );

  const rightTabContent = <SourcingSandbox />;

  return (
    <StageWorkContainer
      titleLeftTab="Sourced Products"
      titleRightTab="+ Sandbox"
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
