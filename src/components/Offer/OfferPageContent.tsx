'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { useDispatch } from 'react-redux';
import { useRouter } from 'next/navigation';
import { AlertCircle, Loader2, Trash2, X, CheckCircle, ArrowUp, ArrowDown, ArrowUpDown, Rocket, Sparkles } from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';
import { RootState } from '@/store';
import { formatDate } from '@/utils/formatDate';
import { StageWorkContainer } from '@/components/stage/StageWorkContainer';
import { hydrateDisplayTitles } from '@/store/productTitlesSlice';
import { Checkbox } from '@/components/ui/Checkbox';
import { Pagination } from '@/components/ui/Pagination';
import type { OfferData, SspCategories } from './types';

type OfferingStatus = 'Not Started' | 'Reviews Analyzed' | 'Building SSPs' | 'SSPs Finalized' | 'Completed';

function getDefaultOfferData(asin: string): OfferData {
  return {
    productId: asin,
    reviewInsights: {
      topLikes: '',
      topDislikes: '',
      importantInsights: '',
      importantQuestions: '',
      strengthsTakeaway: '',
      painPointsTakeaway: '',
      insightsTakeaway: '',
      questionsTakeaway: '',
      totalReviewCount: 0,
      positiveReviewCount: 0,
      neutralReviewCount: 0,
      negativeReviewCount: 0
    },
    ssp: {
      quantity: [],
      functionality: [],
      quality: [],
      aesthetic: [],
      bundle: [],
    },
    supplierInfo: {
      supplierName: '',
      contact: '',
      fobPrice: '',
      landedCost: '',
      moq: '',
      leadTime: '',
      notes: '',
    },
    status: 'none',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

type OfferListItem = {
  asin: string;
  title: string;
  category: string | null;
  offeringStatus: OfferingStatus;
  vettingStatus: string | null; // PASS/RISKY/FAIL
  vettingScore: number | null;
  salesPrice: number | null;
  offerUpdatedAt: string | null;
  updatedAt: string | null;
};

/**
 * Determines the offering status based on offer data
 * Priority: Completed > SSPs Finalized > Building SSPs > Reviews Analyzed > Not Started
 */
function getOfferingStatus(
  offerData: any,
  localStatus: 'none' | 'working' | 'completed'
): OfferingStatus {
  // 1. Completed (highest priority)
  if (localStatus === 'completed') {
    return 'Completed';
  }

  const insights = offerData?.insights || offerData?.reviewInsights;
  const improvements = offerData?.improvements || offerData?.ssp;

  // Check if review insights exist
  const hasReviewInsights = insights && (
    insights.topLikes?.trim() ||
    insights.topDislikes?.trim() ||
    insights.importantInsights?.trim() ||
    insights.importantQuestions?.trim()
  );

  // Check if SSPs exist
  const hasSSPs = (() => {
    if (!improvements) return false;
    const keys: (keyof SspCategories)[] = ['quantity', 'functionality', 'quality', 'aesthetic', 'bundle'];
    return keys.some((key) => {
      const value = improvements[key];
      if (Array.isArray(value)) {
        return value.some((item) => item?.recommendation?.trim());
      }
      if (typeof value === 'string') {
        return value.trim().length > 0;
      }
      return false;
    });
  })();

  // 2. SSPs Finalized: If status is 'working' and has SSPs, consider them finalized
  // (This is a heuristic since we don't have a specific finalized flag)
  if (localStatus === 'working' && hasSSPs) {
    return 'SSPs Finalized';
  }

  // 3. Building SSPs: Any SSP exists but not finalized
  if (hasSSPs) {
    return 'Building SSPs';
  }

  // 4. Reviews Analyzed: Review insights exist but no SSPs
  if (hasReviewInsights) {
    return 'Reviews Analyzed';
  }

  // 5. Not Started: No review insights and no SSPs
  return 'Not Started';
}

function getOfferingStatusBadgeClasses(status: OfferingStatus): string {
  switch (status) {
    case 'Completed':
      return 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-500 border-emerald-200 dark:border-emerald-500/20';
    case 'SSPs Finalized':
      return 'bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-500 border-purple-200 dark:border-purple-500/20';
    case 'Building SSPs':
      return 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-500 border-amber-200 dark:border-amber-500/20';
    case 'Reviews Analyzed':
      return 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-500 border-blue-200 dark:border-blue-500/20';
    case 'Not Started':
    default:
      return 'bg-gray-50 dark:bg-slate-500/10 text-gray-600 dark:text-slate-300 border-gray-200 dark:border-slate-500/20';
  }
}

function getVettingStatusBadgeClasses(status: string | null): string {
  if (status === 'PASS') {
    return 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-500 border-emerald-200 dark:border-emerald-500/20';
  }
  if (status === 'RISKY') {
    return 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-500 border-amber-200 dark:border-amber-500/20';
  }
  if (status === 'FAIL') {
    return 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-500 border-red-200 dark:border-red-500/20';
  }
  return 'bg-gray-50 dark:bg-slate-500/10 text-gray-600 dark:text-slate-300 border-gray-200 dark:border-slate-500/20';
}

function formatCurrency(amount: number | null): string {
  if (amount === null || amount === undefined || isNaN(amount)) return '—';
  return `$${amount.toFixed(2)}`;
}

function formatPercentage(score: number | null): string {
  if (score === null || score === undefined || isNaN(score)) return '—';
  return `${score.toFixed(1)}%`;
}

/**
 * Get color coding for Vetting Score based on numeric value (0-100)
 * Uses the same color system as other scored metrics (PASS/RISKY/FAIL)
 */
function getVettingScoreTier(score: number | null, status: string | null): {
  textColor: string;
  bgColor: string;
  borderColor: string;
} {
  if (score === null || score === undefined || isNaN(score)) {
    return {
      textColor: 'text-slate-400',
      bgColor: 'bg-slate-500/10',
      borderColor: 'border-slate-500/20',
    };
  }

  // Use status if available for more accurate coloring (matches getVettingStatusBadgeClasses)
  if (status === 'PASS') {
    return {
      textColor: 'text-emerald-700 dark:text-emerald-500',
      bgColor: 'bg-emerald-50 dark:bg-emerald-500/10',
      borderColor: 'border-emerald-200 dark:border-emerald-500/20',
    };
  }
  if (status === 'RISKY') {
    return {
      textColor: 'text-amber-700 dark:text-amber-500',
      bgColor: 'bg-amber-50 dark:bg-amber-500/10',
      borderColor: 'border-amber-200 dark:border-amber-500/20',
    };
  }
  if (status === 'FAIL') {
    return {
      textColor: 'text-red-700 dark:text-red-500',
      bgColor: 'bg-red-50 dark:bg-red-500/10',
      borderColor: 'border-red-200 dark:border-red-500/20',
    };
  }

  // Fallback to score-based coloring if status not available
  if (score >= 70) {
    // PASS range
    return {
      textColor: 'text-emerald-700 dark:text-emerald-500',
      bgColor: 'bg-emerald-50 dark:bg-emerald-500/10',
      borderColor: 'border-emerald-200 dark:border-emerald-500/20',
    };
  } else if (score >= 40) {
    // RISKY range
    return {
      textColor: 'text-amber-700 dark:text-amber-500',
      bgColor: 'bg-amber-50 dark:bg-amber-500/10',
      borderColor: 'border-amber-200 dark:border-amber-500/20',
    };
  } else {
    // FAIL range
    return {
      textColor: 'text-red-700 dark:text-red-500',
      bgColor: 'bg-red-50 dark:bg-red-500/10',
      borderColor: 'border-red-200 dark:border-red-500/20',
    };
  }
}

/**
 * Resolve sales price with fallback logic:
 * 1. Offer-level sales price (if Offering stores an override - currently not implemented)
 * 2. Vetting record sales price (from research_products.price)
 * 3. Research/ASIN import sales price (from research_products.price - same as above)
 * 4. If none exist, return null
 */
function resolveSalesPrice(
  productData: any,
  offerData: any
): number | null {
  // 1. Offer-level override (if we add this in the future)
  // For now, offerData doesn't store sales price, so skip this step
  
  // 2 & 3. Vetting/Research record price (from research_products table)
  const researchPrice = productData?.price;
  if (researchPrice !== null && researchPrice !== undefined && !isNaN(researchPrice)) {
    return parseFloat(String(researchPrice));
  }
  
  // 4. No price available
  return null;
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
  const [selectedAsins, setSelectedAsins] = useState<Set<string>>(new Set());
  const [showClearModal, setShowClearModal] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [sortField, setSortField] = useState<keyof OfferListItem | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  
  // Right tab state (Build Offer)
  const [eligibleProducts, setEligibleProducts] = useState<any[]>([]);
  const [loadingEligibleProducts, setLoadingEligibleProducts] = useState(false);
  const [selectedProductAsin, setSelectedProductAsin] = useState<string | null>(null);

  const fetchOfferList = async () => {
    if (!user) return;
    try {
      setLoading(true);
      setError(null);

      const { data: { session } } = await supabase.auth.getSession();

      // Fetch both research products and submissions in parallel
      const [researchRes, submissionsRes] = await Promise.all([
        fetch('/api/research', {
          headers: { ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }) },
          credentials: 'include',
        }),
        fetch(`/api/analyze?userId=${user.id}`, {
          headers: { ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }) },
          credentials: 'include',
        }),
      ]);

      const combined: OfferListItem[] = [];
      
      // Build a map of research_product_id -> submission for quick lookup
      const submissionMap = new Map<string, any>();
      if (submissionsRes.ok) {
        const submissionsData = await submissionsRes.json();
        if (submissionsData?.success && Array.isArray(submissionsData.submissions)) {
          submissionsData.submissions.forEach((sub: any) => {
            if (sub.research_product_id) {
              submissionMap.set(sub.research_product_id, sub);
            }
          });
        }
      }

      if (researchRes.ok) {
        const data = await researchRes.json();
        if (data?.success && Array.isArray(data.data)) {
          const products = data.data.filter((p: any) => p?.is_vetted === true);
          
          // Fetch offer data for all products in parallel
          const offerDataPromises = products.map(async (p: any) => {
            const asin = p?.asin || 'N/A';
            if (!asin || asin === 'N/A') return null;

            const productId = p?.id || p?.researchProductId;
            
            // Fetch from Supabase
            let offerDataFromDb: any = null;
            if (productId) {
              try {
                const { data: offerProduct } = await supabase
                  .from('offer_products')
                  .select('*')
                  .eq('product_id', productId)
                  .single();
                offerDataFromDb = offerProduct;
              } catch (e) {
                // Not found or error, continue
              }
            }

            // Also check localStorage
            let localOfferData: any = null;
            try {
              const stored = localStorage.getItem(`offer_${asin}`);
              if (stored) {
                localOfferData = JSON.parse(stored);
              }
            } catch {
              // ignore
            }

            // Determine status from both sources
            const localStatus = localOfferData?.status || offerDataFromDb?.status || 'none';
            const combinedOfferData = offerDataFromDb || localOfferData || null;

            const offeringStatus = getOfferingStatus(combinedOfferData, localStatus);
            
            // Get vetting status and score from submission (preferred) or fallback to research product extra_data
            const submission = productId ? submissionMap.get(productId) : null;
            const vettingStatus = submission?.status || 
                                 submission?.marketScore?.status || 
                                 p?.extra_data?.status || 
                                 p?.status || 
                                 null;
            const vettingScore = submission?.marketScore?.score !== undefined 
              ? submission.marketScore.score 
              : (submission?.score !== undefined 
                  ? submission.score 
                  : (p?.extra_data?.score !== undefined 
                      ? p.extra_data.score 
                      : (p?.score !== undefined ? p.score : null)));
            
            // Get sales price with fallback logic
            const salesPrice = resolveSalesPrice(p, combinedOfferData);
            
            // Get offer updated timestamp
            const offerUpdatedAt = offerDataFromDb?.updated_at || localOfferData?.updatedAt || null;

            return {
              asin,
              title: p.display_title || p.title || 'Untitled Product',
              category: p.category ?? null,
              offeringStatus,
              vettingStatus,
              vettingScore: vettingScore !== null && vettingScore !== undefined ? parseFloat(String(vettingScore)) : null,
              salesPrice: salesPrice ? parseFloat(String(salesPrice)) : null,
              offerUpdatedAt,
              updatedAt: p.updated_at || p.created_at || null,
            } as OfferListItem;
          });

          const resolvedItems = await Promise.all(offerDataPromises);
          const validItems = resolvedItems.filter((item): item is OfferListItem => item !== null);
          
          combined.push(...validItems);

          dispatch(
            hydrateDisplayTitles(
              (data.data || [])
                .map((p: any) => ({ asin: p?.asin, title: p?.display_title || null }))
                .filter((x: any) => x.asin && x.title)
            )
          );
        }
      }

      // De-dupe by ASIN
      const unique = combined.reduce((acc: OfferListItem[], item) => {
        const existingIdx = acc.findIndex((x) => x.asin === item.asin);
        if (existingIdx === -1) {
          acc.push(item);
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

  // Fetch eligible products when items change
  useEffect(() => {
    if (user) {
      fetchEligibleProducts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, items.length]);

  // Fetch eligible products (vetted but not yet offered)
  const fetchEligibleProducts = async () => {
    if (!user) return;
    try {
      setLoadingEligibleProducts(true);
      const { data: { session } } = await supabase.auth.getSession();

      // Fetch all vetted products
      const researchRes = await fetch('/api/research', {
        headers: { ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }) },
        credentials: 'include',
      });

      if (!researchRes.ok) {
        setEligibleProducts([]);
        return;
      }

      const data = await researchRes.json();
      if (!data?.success || !Array.isArray(data.data)) {
        setEligibleProducts([]);
        return;
      }

      // Get all vetted products
      const vettedProducts = data.data.filter((p: any) => p?.is_vetted === true && p?.is_offered === false);
      // Filter: eligible = vetted - offered
      const eligible = vettedProducts
        .filter((p: any) => {
          const asin = p?.asin || 'N/A';
          return asin !== 'N/A';
        })
        .map((p: any) => ({
          asin: p.asin,
          id: p.id,
          title: p.display_title || p.title || 'Untitled Product',
        }));

      setEligibleProducts(eligible);
    } catch (e) {
      console.error('[Offer] Failed to fetch eligible products:', e);
      setEligibleProducts([]);
    } finally {
      setLoadingEligibleProducts(false);
    }
  };

  const filtered = useMemo(() => {
    let result = items;
    
    // Apply search filter
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      result = result.filter((i) => {
        const resolvedTitle = titleByAsin?.[i.asin] || i.title || '';
        return (
          i.asin.toLowerCase().includes(q) ||
          resolvedTitle.toLowerCase().includes(q) ||
          (i.category || '').toLowerCase().includes(q)
        );
      });
    }
    
    // Apply sorting
    if (sortField) {
      result = [...result].sort((a, b) => {
        let aVal: any = a[sortField];
        let bVal: any = b[sortField];
        
        // Handle dates
        if (sortField === 'offerUpdatedAt' || sortField === 'updatedAt') {
          const aDate = aVal ? new Date(aVal).getTime() : 0;
          const bDate = bVal ? new Date(bVal).getTime() : 0;
          return sortDirection === 'asc' ? aDate - bDate : bDate - aDate;
        }
        
        // Handle numbers
        if (sortField === 'vettingScore' || sortField === 'salesPrice') {
          const aNum = typeof aVal === 'number' && !isNaN(aVal) ? aVal : -Infinity;
          const bNum = typeof bVal === 'number' && !isNaN(bVal) ? bVal : -Infinity;
          return sortDirection === 'asc' ? aNum - bNum : bNum - aNum;
        }
        
        // Handle strings
        if (sortField === 'asin' || sortField === 'title' || sortField === 'category' || sortField === 'offeringStatus' || sortField === 'vettingStatus') {
          if (sortField === 'title') {
            aVal = titleByAsin?.[a.asin] || a.title || '';
            bVal = titleByAsin?.[b.asin] || b.title || '';
          }
          
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

  // Get paginated items
  const getPaginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filtered.slice(startIndex, endIndex);
  }, [filtered, currentPage, itemsPerPage]);

  // Update total pages when filtered items or itemsPerPage changes
  useEffect(() => {
    if (filtered.length > 0) {
      setTotalPages(Math.max(1, Math.ceil(filtered.length / itemsPerPage)));
      
      // If current page is beyond total pages, reset to page 1
      if (currentPage > Math.ceil(filtered.length / itemsPerPage) && filtered.length > 0) {
        setCurrentPage(1);
      }
    }
  }, [filtered.length, itemsPerPage, currentPage]);

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
    const currentPageItems = getPaginatedItems;
    const allSelected = currentPageItems.every(row => selectedAsins.has(row.asin));
    if (allSelected) {
      // Deselect all on current page
      setSelectedAsins(prev => {
        const next = new Set(prev);
        currentPageItems.forEach(row => next.delete(row.asin));
        return next;
      });
    } else {
      // Select all on current page
      setSelectedAsins(prev => {
        const next = new Set(prev);
        currentPageItems.forEach(row => next.add(row.asin));
        return next;
      });
    }
  };

  // Handle column sorting
  const handleSort = (field: keyof OfferListItem) => {
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
  const getSortIcon = (field: keyof OfferListItem) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 opacity-50" />;
    }
    return sortDirection === 'asc' 
      ? <ArrowUp className="w-3 h-3 text-blue-400" />
      : <ArrowDown className="w-3 h-3 text-blue-400" />;
  };

  // Handle clear data
  const handleClearData = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    
    for (const asin of selectedAsins) {
      try {
        // Find product ID
        const item = items.find(i => i.asin === asin);
        if (!item) continue;

        // Get product ID from research products
        const { data: researchData } = await supabase
          .from('research_products')
          .select('id')
          .eq('asin', asin)
          .single();

        const productId = researchData?.id;

        // Update Supabase - Clear only insights, reviews, and improvements (SSPs), keep the record
        if (productId) {
          await supabase
            .from('offer_products')
            .update({
              reviews: [],
              insights: null,
              improvements: null,
              updated_at: new Date().toISOString()
            })
            .eq('product_id', productId);
        }

        // Clear localStorage
        localStorage.removeItem(`offer_${asin}`);

        // Reset to default (which clears review insights and SSPs)
        const defaultData = getDefaultOfferData(asin);
        localStorage.setItem(`offer_${asin}`, JSON.stringify({
          ...defaultData,
          status: 'none',
          updatedAt: new Date().toISOString(),
        }));
      } catch (e) {
        console.error(`[Offer] Failed to clear data for ${asin}:`, e);
      }
    }
    
    // Refresh the list
    await fetchOfferList();
    
    // Clear selection
    setSelectedAsins(new Set());
    setShowClearModal(false);
    setShowSuccessToast(true);
    setTimeout(() => setShowSuccessToast(false), 3000);
  };

  const selectedCount = selectedAsins.size;
  const allVisibleSelected = getPaginatedItems.length > 0 && getPaginatedItems.every(row => selectedAsins.has(row.asin));

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
        <>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-600 dark:text-slate-400">
              Showing {filtered.length} {filtered.length === 1 ? 'product' : 'products'}
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
                <tr className="border-b border-gray-200 dark:border-slate-700/50">
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
                    onClick={() => handleSort('offeringStatus')}
                  >
                    <div className="flex items-center gap-1.5">
                      Offering Status
                      {getSortIcon('offeringStatus')}
                    </div>
                  </th>
                  <th 
                    className="text-left p-4 text-xs font-medium text-gray-600 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors"
                    onClick={() => handleSort('vettingStatus')}
                  >
                    <div className="flex items-center gap-1.5">
                      Vetting Status
                      {getSortIcon('vettingStatus')}
                    </div>
                  </th>
                  <th 
                    className="text-left p-4 text-xs font-medium text-gray-600 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors"
                    onClick={() => handleSort('vettingScore')}
                  >
                    <div className="flex items-center gap-1.5">
                      Vetting Score
                      {getSortIcon('vettingScore')}
                    </div>
                  </th>
                  <th 
                    className="text-left p-4 text-xs font-medium text-gray-600 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors"
                    onClick={() => handleSort('category')}
                  >
                    <div className="flex items-center gap-1.5">
                      Product Category
                      {getSortIcon('category')}
                    </div>
                  </th>
                  <th 
                    className="text-left p-4 text-xs font-medium text-gray-600 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors"
                    onClick={() => handleSort('salesPrice')}
                  >
                    <div className="flex items-center gap-1.5">
                      Sales Price
                      {getSortIcon('salesPrice')}
                    </div>
                  </th>
                  <th 
                    className="text-left p-4 text-xs font-medium text-gray-600 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors"
                    onClick={() => handleSort('offerUpdatedAt')}
                  >
                    <div className="flex items-center gap-1.5">
                      Last Updated
                      {getSortIcon('offerUpdatedAt')}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700/30">
                {getPaginatedItems.map((row) => {
                  const isSelected = selectedAsins.has(row.asin);
                  
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
                        router.push(`/offer/${encodeURIComponent(row.asin)}`);
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
                      <td className="p-4 w-[140px]">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getOfferingStatusBadgeClasses(row.offeringStatus)}`}>
                          {row.offeringStatus}
                        </span>
                      </td>
                      <td className="p-4">
                        {row.vettingStatus ? (
                          <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getVettingStatusBadgeClasses(row.vettingStatus)}`}>
                            {row.vettingStatus}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-500 dark:text-slate-400">—</span>
                        )}
                      </td>
                      <td className="p-4">
                        {(() => {
                          if (row.vettingScore === null || row.vettingScore === undefined || isNaN(row.vettingScore)) {
                            return <span className="text-sm text-gray-500 dark:text-slate-400">—</span>;
                          }
                          const scoreTier = getVettingScoreTier(row.vettingScore, row.vettingStatus);
                          return (
                            <span className={`px-3 py-1 rounded-full text-xs font-medium border ${scoreTier.bgColor} ${scoreTier.borderColor} ${scoreTier.textColor}`}>
                              {formatPercentage(row.vettingScore)}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="p-4 text-sm text-gray-700 dark:text-slate-300">{row.category || '—'}</td>
                      <td className="p-4 text-sm text-gray-700 dark:text-slate-300">
                        {formatCurrency(row.salesPrice)}
                      </td>
                      <td className="p-4 text-sm text-gray-700 dark:text-slate-300">
                        {row.offerUpdatedAt ? formatDate(row.offerUpdatedAt) : (row.updatedAt ? formatDate(row.updatedAt) : '—')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          
          {/* Pagination */}
          {filtered.length > 0 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              itemsPerPage={itemsPerPage}
              totalItems={filtered.length}
              onPageChange={(page) => setCurrentPage(page)}
              onItemsPerPageChange={(items) => {
                setItemsPerPage(items);
                setCurrentPage(1);
              }}
            />
          )}
        </>
      )}
    </>
  );

  const handleBuildOffer = () => {
    if (selectedProductAsin) {
      router.push(`/offer/${encodeURIComponent(selectedProductAsin)}`);
    }
  };

  const rightTabContent = (
    <div className="bg-white/80 dark:bg-slate-800/30 backdrop-blur-xl rounded-2xl border border-gray-200 dark:border-slate-700/50 p-12 shadow-md">
      {/* Welcome Screen */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-blue-500/20 to-emerald-500/20 mb-6">
          <Rocket className="w-8 h-8 text-blue-400" />
        </div>
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
          Build a Killer Offer — Your Next Upgrade Starts Here 🚀
        </h2>
        <p className="text-lg text-gray-600 dark:text-slate-400 mb-6 max-w-2xl mx-auto">
          Turn review insights into Super Selling Points (SSPs) and craft an offer that outshines the competition.
        </p>
        
        {/* Feature Chips */}
        <div className="flex flex-wrap items-center justify-center gap-3 mb-8">
          <span className="px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-full text-sm font-medium text-blue-400">
            AI Review Insights
          </span>
          <span className="px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-sm font-medium text-emerald-400">
            SSP Builder
          </span>
          <span className="px-3 py-1.5 bg-purple-500/10 border border-purple-500/20 rounded-full text-sm font-medium text-purple-400">
            Offer Edge
          </span>
        </div>
      </div>

      {/* Product Dropdown */}
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
            Select a vetted product to build an offer
          </label>
          {loadingEligibleProducts ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
            </div>
          ) : eligibleProducts.length === 0 ? (
            <div className="text-center py-8 px-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
              <AlertCircle className="w-8 h-8 text-slate-400 mx-auto mb-3" />
              <p className="text-sm text-gray-600 dark:text-slate-400">
                No vetted products available yet. Head to Vetting to import results first.
              </p>
            </div>
          ) : (
            <select
              value={selectedProductAsin || ''}
              onChange={(e) => setSelectedProductAsin(e.target.value || null)}
              className="w-full px-4 py-3 bg-slate-900/50 dark:bg-slate-900/50 border border-slate-700/50 rounded-lg text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-colors"
            >
              <option value="">Select a vetted product…</option>
              {eligibleProducts.map((product) => {
                const displayTitle = titleByAsin?.[product.asin] || product.title || 'Untitled';
                const truncatedTitle = displayTitle.length > 60 
                  ? displayTitle.substring(0, 60) + '...' 
                  : displayTitle;
                return (
                  <option key={product.asin} value={product.asin}>
                    {product.asin} — {truncatedTitle}
                  </option>
                );
              })}
            </select>
          )}
        </div>

        {/* CTA Prompt (shown when product is selected) */}
        {selectedProductAsin && (
          <div className="text-center space-y-4 pt-4 border-t border-slate-700/50">
            <p className="text-gray-700 dark:text-slate-300 font-medium">
              Are you ready to build a killer offer for this product?
            </p>
            <button
              onClick={handleBuildOffer}
              className="px-8 py-3 bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 text-white font-medium rounded-lg transition-all transform hover:scale-105 shadow-md hover:shadow-lg flex items-center gap-2 mx-auto"
            >
              <Sparkles className="w-5 h-5" />
              Build Offer
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <StageWorkContainer
        titleLeftTab="Product Offers"
        titleRightTab="+ Build Offer"
        leftTabContent={leftTabContent}
        rightTabContent={rightTabContent}
        defaultTab="left"
        showHeaderOn="left"
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search offers..."
      />

      {/* Modals rendered outside main container to avoid overflow issues */}
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
                  Clear offering data for selected product{selectedCount > 1 ? 's' : ''}?
                </h3>
                <p className="text-slate-400 text-sm">This action cannot be undone.</p>
              </div>
            </div>
            
            <p className="text-slate-300 mb-6">
              This will remove AI Review Insights and SSPs for the selected product offer{selectedCount > 1 ? 's' : ''}.
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
              <p className="font-medium">Cleared offering data for {selectedCount} product{selectedCount > 1 ? 's' : ''}.</p>
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
}
