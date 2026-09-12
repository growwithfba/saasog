import { Loader2, AlertCircle, Search, Trash2, ChevronLeft, ChevronRight, Package, TrendingUp, BarChart3, DollarSign, ShoppingCart, Eye, Share2, ArrowRight, FileText, Plus, Columns, X } from "lucide-react";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "@/store";
import { hydrateDisplayTitles } from "@/store/productTitlesSlice";
import { getProductDisplayName } from "@/utils/product";
import { ListingThumbnail } from "@/components/Product/ListingThumbnail";
import { useListingImages } from "@/hooks/useListingImages";
import { TitleTooltip } from "@/components/Product/TitleTooltip";
import { ExtensionCTA } from "@/components/extension/ExtensionCTA";
import { useColumnPreferences } from "@/hooks/useColumnPreferences";
import { useEffect, useMemo, useState, useRef } from "react";
import { supabase } from "@/utils/supabaseClient";
import { useRouter, useSearchParams } from "next/navigation";
import ResearchIcon from "./Icons/ResearchIcon";
import VettedIcon from "./Icons/VettedIcon";
import OffersIcon from "./Icons/OfferIcon";
import SourcedIcon from "./Icons/SourcedIcon";
import { CsvUploadResearch } from "./Upload/CsvUploadResearch";
import { AddAsinCard } from "./Research/AddAsinCard";
import { Checkbox } from "./ui/Checkbox";
import { TagChip } from "./Tags/TagChip";
import { TagPicker } from "./Tags/TagPicker";
import { TagManagerModal } from "./Tags/TagManagerModal";
import { BulkTagPicker } from "./Tags/BulkTagPicker";
import { FilterBar, applyFilters, emptyFilters, type FilterState } from "./Tags/FilterBar";
import { ConfirmModal } from "./ui/ConfirmModal";
import { useUserTags } from "@/hooks/useUserTags";
import { Tag as TagIcon, ChevronDown as SortDown, ChevronUp as SortUp, ChevronsUpDown as SortBoth } from "lucide-react";
import {
  ColumnPicker,
  TABLE_SCROLL,
  HEAD_CELL,
  HEAD_CELL_PINNED,
  CELL,
  CELL_PINNED_EDGE,
  pinnedCell,
  rowTint,
} from "@/components/DataTable";

/** Always-visible sort affordance, matching the shared HeaderCell. */
const SortChevron = ({ active, dir }: { active: boolean; dir: string }) => (
  <span aria-hidden="true" className={`shrink-0 ${active ? 'text-blue-600 dark:text-blue-300' : ''}`}>
    {active ? (
      dir === 'desc' ? <SortDown className="w-3.5 h-3.5" /> : <SortUp className="w-3.5 h-3.5" />
    ) : (
      <SortBoth className="w-3 h-3 opacity-40 group-hover:opacity-80" />
    )}
  </span>
);

/** Columns the user can switch on. Image, Title, Category, Brand and Progress always show. */
const FUNNEL_PICKER_COLUMNS = [
  { id: 'createdAt', label: 'Created Date' },
  { id: 'price', label: 'Price' },
  { id: 'monthlyRevenue', label: 'Monthly Revenue' },
  { id: 'monthlyUnitsSold', label: 'Monthly Units Sold' },
  { id: 'bsr', label: 'BSR' },
  { id: 'rating', label: 'Rating' },
  { id: 'review', label: 'Review' },
  { id: 'weight', label: 'Weight' },
  // Net Price dropped from the picker (2026-05-13) — requires Amazon SP-API
  // to compute post-fee net, which we don't have.
  { id: 'sizeTier', label: 'Size Tier' },
  { id: 'priceTrend', label: 'Price Trend' },
  { id: 'salesTrend', label: 'Sales Trend' },
  { id: 'fulfilledBy', label: 'Fulfilled By' },
  { id: 'activeSellers', label: 'Active Sellers' },
  { id: 'lastYearSales', label: 'Last Year Sales' },
  { id: 'variationCount', label: 'Variation Count' },
  { id: 'numberOfImages', label: 'Number of Images' },
  { id: 'salesToReviews', label: 'Sales to Reviews' },
  { id: 'bestSalesPeriod', label: 'Best Sales Period' },
  { id: 'parentLevelSales', label: 'Parent Level Sales' },
  { id: 'parentLevelRevenue', label: 'Parent Level Revenue' },
  // Sales YoY dropped from the picker (2026-05-13) — requires multi-year
  // time-series we don't pull (stats=180 is 6mo).
];
const FUNNEL_PICKER_DEFAULTS = ['price', 'monthlyRevenue'];

const Table = ({ setUpdateProducts, onTabChange }: { setUpdateProducts: (update: boolean) => void; onTabChange?: (tab: string) => void }) => {
  const { user } = useSelector((state: RootState) => state.auth);
  const titleByAsin = useSelector((state: RootState) => state.productTitles.byAsin);
  const dispatch = useDispatch();

  const router = useRouter();
  const searchParams = useSearchParams();
  // ?tab=new opens the "Add an ASIN" tab (used by /dashboard's empty-funnel
  // CTA and quick actions). Any other/missing value keeps the existing
  // default so a bare /dashboard visit is unaffected.
  const [activeTab, setActiveTab] = useState(() => (searchParams?.get('tab') === 'new' ? 'new' : 'submissions'));

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    onTabChange?.(tab);
  };

  // Also react to the URL after mount: the CTA/quick-action buttons push
  // ?tab=new while already on /dashboard, which updates searchParams
  // without remounting this component.
  useEffect(() => {
    if (searchParams?.get('tab') === 'new') setActiveTab('new');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<any>(null);
  const submissionAsins = useMemo(
    () => (Array.isArray(submissions) ? submissions.map((s: any) => s?.asin).filter(Boolean) : []),
    [submissions]
  );
  const { imageUrlByAsin } = useListingImages(submissionAsins);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Title column resize state
  const [titleColumnWidth, setTitleColumnWidth] = useState(390);
  const [isResizingTitleColumn, setIsResizingTitleColumn] = useState(false);
  const titleResizeStartX = useRef(0);
  const titleResizeStartWidth = useRef(590);

  // Tag + filter state
  const { tags: userTags, refresh: refreshUserTags } = useUserTags();
  const [filters, setFilters] = useState<FilterState>(emptyFilters());
  const [pickerOpenFor, setPickerOpenFor] = useState<string | null>(null);
  const addTagButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [tagRemoveConfirm, setTagRemoveConfirm] = useState<{
    submissionId: string;
    tag: any;
  } | null>(null);

  // Optimistic mutation helpers — update local state immediately so the
  // UI doesn't visibly reload on every tag change. Server state is
  // reconciled in the background via refreshUserTags.
  const applyLocalTagAttach = (submissionId: string, tag: any) => {
    setSubmissions((prev: any) => {
      if (!Array.isArray(prev)) return prev;
      return prev.map((row: any) => {
        if (row.id !== submissionId) return row;
        const existing = Array.isArray(row.tags) ? row.tags : [];
        if (existing.some((t: any) => t.id === tag.id)) return row;
        return { ...row, tags: [...existing, tag] };
      });
    });
    // Keep the user's master tag list fresh in the background so the
    // filter bar + picker include any newly-created tag.
    void refreshUserTags();
  };

  const applyLocalTagDetach = (submissionId: string, tagId: string) => {
    setSubmissions((prev: any) => {
      if (!Array.isArray(prev)) return prev;
      return prev.map((row: any) => {
        if (row.id !== submissionId) return row;
        const existing = Array.isArray(row.tags) ? row.tags : [];
        return { ...row, tags: existing.filter((t: any) => t.id !== tagId) };
      });
    });
  };

  const handleChipRemove = (submissionId: string, tag: any) => {
    // Opens the in-app confirmation modal; actual API call fires on confirm.
    setTagRemoveConfirm({ submissionId, tag });
  };

  const confirmTagRemove = async () => {
    if (!tagRemoveConfirm) return;
    const { submissionId, tag } = tagRemoveConfirm;
    setTagRemoveConfirm(null);
    applyLocalTagDetach(submissionId, tag.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `/api/research/${submissionId}/tags?tagId=${encodeURIComponent(tag.id)}`,
        {
          method: 'DELETE',
          headers: {
            ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }),
          },
        }
      );
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Remove failed');
    } catch (err) {
      console.error('Failed to detach tag:', err);
      applyLocalTagAttach(submissionId, tag);
    }
  };

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [totalPages, setTotalPages] = useState(1);
  
  // Sorting state
  const [sortField, setSortField] = useState('progress');
  const [sortDirection, setSortDirection] = useState('desc');
  // Set briefly after a single-ASIN add so the new row scrolls into view
  // and pulses. Cleared after ~1.5s by a timer in the effect below.
  const [recentlyAddedAsin, setRecentlyAddedAsin] = useState<string | null>(null);
  
  // Selection state
  const [selectedSubmissions, setSelectedSubmissions] = useState<string[]>([]);
  const [deleteConfirmSubmission, setDeleteConfirmSubmission] = useState<{id: string, name: string} | null>(null);
  
  // Column visibility state — persisted to profiles.preferences via the
  // research_columns key (see hooks/useColumnPreferences). Local default
  // applies until the server hydration resolves.
  const { visibleColumns, setVisibleColumns } = useColumnPreferences('research_columns', {
    asin: false,
    title: true,
    category: true,
    brand: true,
    progress: true,
    price: true,
    monthlyRevenue: true,
    monthlyUnitsSold: false,
    bsr: false,
    rating: false,
    review: false,
    weight: false,
    netPrice: false,
    sizeTier: false,
    priceTrend: false,
    salesTrend: false,
    fulfilledBy: false,
    activeSellers: false,
    lastYearSales: false,
    variationCount: false,
    numberOfImages: false,
    salesToReviews: false,
    bestSalesPeriod: false,
    parentLevelSales: false,
    parentLevelRevenue: false,
    salesYearOverYear: false,
    createdAt: false,
  });

  const [isVetSelectedProductsModalOpen, setIsVetSelectedProductsModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  // Tag-manager modal + bulk-tag picker state.
  const [isTagManagerOpen, setIsTagManagerOpen] = useState(false);
  const [bulkPickerMode, setBulkPickerMode] = useState<'add' | 'remove' | null>(null);
  const bulkAddTagAnchorRef = useRef<HTMLButtonElement | null>(null);
  const bulkRemoveTagAnchorRef = useRef<HTMLButtonElement | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Offer confirmation modal state
  const [isOfferConfirmOpen, setIsOfferConfirmOpen] = useState(false);
  const [offerConfirmProduct, setOfferConfirmProduct] = useState<{ asin: string; title: string } | null>(null);
  
  // Sourcing confirmation modal state
  const [isSourcingConfirmOpen, setIsSourcingConfirmOpen] = useState(false);
  const [sourcingConfirmProduct, setSourcingConfirmProduct] = useState<{ asin: string; title: string } | null>(null);

  // Handle title column resize
  useEffect(() => {
    if (!isResizingTitleColumn) return;

    const handleMouseMove = (event: MouseEvent) => {
      event.preventDefault();
      const deltaX = event.clientX - titleResizeStartX.current;
      const nextWidth = Math.min(900, Math.max(300, titleResizeStartWidth.current + deltaX));
      setTitleColumnWidth(nextWidth);
    };

    const handleMouseUp = () => {
      setIsResizingTitleColumn(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    // Prevent text selection during resize
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizingTitleColumn]);

  // Update total pages when submissions change
  useEffect(() => {
    if (submissions && submissions.length > 0) {
      const filteredSubmissions = getFilteredSubmissions();
      setTotalPages(Math.max(1, Math.ceil(filteredSubmissions.length / itemsPerPage)));
      
      // If current page is beyond total pages, reset to page 1
      if (currentPage > Math.ceil(filteredSubmissions.length / itemsPerPage) && filteredSubmissions.length > 0) {
        setCurrentPage(1);
      }
    }
  }, [submissions, itemsPerPage, searchTerm]);

  const fetchSubmissions = async () => {
    if (!user) return;
    setUpdateProducts(true);
    try {
      setLoading(true);
      setError(null);
      
      // Get session for authorization
      const { data: { session } } = await supabase.auth.getSession();
      
      // Fetch from API with authorization header
      const response = await fetch(`/api/research`, {
        headers: {
          ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` })
        },
        credentials: 'include'
      });
      
      if (response.ok) {
        const apiData = await response.json();

        if (apiData.success && apiData.data) {
          setSubmissions(apiData.data);

          // Hydrate the alias store from research_products.display_name only.
          const aliasEntries = (apiData.data as any[])
            .filter((p) => p?.asin && p?.display_name)
            .map((p) => ({ asin: p.asin, title: p.display_name }));
          if (aliasEntries.length) {
            dispatch(hydrateDisplayTitles(aliasEntries));
          }
        }
      }
    } catch (error) {
      console.error('Error fetching submissions:', error);
      setError(error instanceof Error ? error.message : 'Failed to load submissions');
    } finally {
      setLoading(false);
    }
  };

  // Select all submissions on current page
  const selectAllCurrentPage = () => {
    const currentPageIds = getPaginatedSubmissions().map(sub => sub.id);
    setSelectedSubmissions(prevSelected => {
      // If all current page items are already selected, deselect them
      if (currentPageIds.every(id => prevSelected.includes(id))) {
        return prevSelected.filter(id => !currentPageIds.includes(id));
      } 
      // Otherwise, add all current page items that aren't already selected
      else {
        const newSelected = [...prevSelected];
        currentPageIds.forEach(id => {
          if (!newSelected.includes(id)) {
            newSelected.push(id);
          }
        });
        return newSelected;
      }
    });
  };

  // After a single-ASIN add, scroll the new row into view and clear the
  // pulse class after 1.5s. Runs whenever recentlyAddedAsin flips on.
  useEffect(() => {
    if (!recentlyAddedAsin) return;
    const id = `research-row-${recentlyAddedAsin}`;
    // RAF lets the re-sorted/paginated table commit before we measure.
    const raf = requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    const t = window.setTimeout(() => setRecentlyAddedAsin(null), 1500);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [recentlyAddedAsin]);

  // Handle sort change
  const handleSortChange = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
    setCurrentPage(1);
  };

  // Filter submissions based on search term and the active filter bar state
  const getFilteredSubmissions = () => {
    let rows: any[] = submissions || [];
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      // Search across the original title, the alias (display_name), the
      // optimistic alias in redux, and the ASIN — so a user can find a
      // product by either the Amazon title or the name they gave it.
      rows = rows.filter((submission: any) =>
        submission.title?.toLowerCase().includes(searchLower) ||
        submission.display_name?.toLowerCase().includes(searchLower) ||
        titleByAsin?.[submission.asin]?.toLowerCase().includes(searchLower) ||
        submission.asin?.toLowerCase().includes(searchLower)
      );
    }
    // applyFilters handles tag membership + batch-stage (research has no status).
    rows = applyFilters(rows, filters);
    return rows;
  };

  // Function to get paginated submissions
  const getPaginatedSubmissions = () => {
    // First filter
    const filteredSubmissions = getFilteredSubmissions();
    
    // Then sort the submissions
    const sortedSubmissions = [...filteredSubmissions].sort((a, b) => {
      // Map sort field to column key for custom columns
      const columnKeyMap: Record<string, string> = {
        'price': 'price',
        'monthly_revenue': 'monthlyRevenue',
        'monthly_units_sold': 'monthlyUnitsSold',
        'bsr': 'bsr',
        'rating': 'rating',
        'review': 'review',
        'weight': 'weight',
        'created_at': 'createdAt',
        'netPrice': 'netPrice',
        'sizeTier': 'sizeTier',
        'priceTrend': 'priceTrend',
        'salesTrend': 'salesTrend',
        'fulfilledBy': 'fulfilledBy',
        'activeSellers': 'activeSellers',
        'lastYearSales': 'lastYearSales',
        'variationCount': 'variationCount',
        'numberOfImages': 'numberOfImages',
        'salesToReviews': 'salesToReviews',
        'bestSalesPeriod': 'bestSalesPeriod',
        'parentLevelSales': 'parentLevelSales',
        'parentLevelRevenue': 'parentLevelRevenue',
        'salesYearOverYear': 'salesYearOverYear',
      };
      
      let aValue: any;
      let bValue: any;
      
      // Handle progress field specially
      if (sortField === 'progress') {
        aValue = getProgressScore(a);
        bValue = getProgressScore(b);
      } else {
        const columnKey = columnKeyMap[sortField] || sortField;
        aValue = a[sortField];
        bValue = b[sortField];
        
        // If it's a custom column, use getColumnValue
        if (columnKeyMap[sortField]) {
          aValue = getColumnValue(a, columnKey);
          bValue = getColumnValue(b, columnKey);
        }
      }
      
      // Handle null/undefined values
      if (aValue === null || aValue === undefined) aValue = '';
      if (bValue === null || bValue === undefined) bValue = '';
      
      // Convert to dates if sorting by created_at
      if (sortField === 'created_at') {
        const aRaw = a.created_at ?? a.createdAt;
        const bRaw = b.created_at ?? b.createdAt;
        const aDate = aRaw ? new Date(aRaw).getTime() : 0;
        const bDate = bRaw ? new Date(bRaw).getTime() : 0;
        const aSafe = Number.isFinite(aDate) ? aDate : 0;
        const bSafe = Number.isFinite(bDate) ? bDate : 0;
        return sortDirection === 'desc' ? bSafe - aSafe : aSafe - bSafe;
      }
      
      // Convert to numbers if possible for proper sorting
      const aNum = typeof aValue === 'string' && !isNaN(Number(aValue)) ? Number(aValue) : aValue;
      const bNum = typeof bValue === 'string' && !isNaN(Number(bValue)) ? Number(bValue) : bValue;
      
      if (sortDirection === 'desc') {
        if (aNum < bNum) {
          return 1;
        } else if (aNum > bNum) {
          return -1;
        } else {
          return 0;
        }
      } else {
        if (aNum < bNum) {
          return -1;
        } else if (aNum > bNum) {
          return 1;
        } else {
          return 0;
        }
      }
    });
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return sortedSubmissions.slice(startIndex, endIndex);
  };      
  // Toggle selection of a submission
  const toggleSubmissionSelection = (submissionId: string) => {
    setSelectedSubmissions(prevSelected => {
      if (prevSelected.includes(submissionId)) {
        return prevSelected.filter(id => id !== submissionId);
      } else {
        return [...prevSelected, submissionId];
      }
    });
  };

  // Toggle column visibility
  // Calculate progress score (0-4 based on stages completed)
  const getProgressScore = (submission: any): number => {
    let score = 1; // Research is always 1 (product exists)
    if (submission.is_vetted) score += 1;
    if (submission.is_offered) score += 1;
    if (submission.is_sourced) score += 1;
    return score;
  };

  // Get column value from submission
  const getColumnValue = (submission: any, columnKey: string): string | number | null => {
    const extraData = submission.extra_data || {};
    
    switch (columnKey) {
      case 'price':
        return submission.price || null;
      case 'monthlyRevenue':
        return submission.monthly_revenue || null;
      case 'monthlyUnitsSold':
        return submission.monthly_units_sold || null;
      case 'bsr':
        return extraData.bsr || extraData.BSR || extraData['Best Seller Rank'] || null;
      case 'rating':
        return extraData.rating || extraData.Rating || null;
      case 'review':
        // Keepa-everywhere sweep — mapSnapshotToResearch writes `review`
        // (singular). Keep the legacy keys for older rows that may have
        // been imported with different casing.
        return (
          extraData.review ??
          extraData.reviews ??
          extraData.Reviews ??
          extraData.review_count ??
          null
        );
      case 'weight':
        return extraData.weight || extraData.Weight || extraData['Product Weight'] || null;
      case 'netPrice':
        return extraData.net_price || extraData['Net Price'] || null;
      case 'sizeTier':
        return extraData.size_tier || extraData['Size Tier'] || null;
      case 'priceTrend':
        return extraData.price_trend || extraData['Price Trend'] || null;
      case 'salesTrend':
        return extraData.sales_trend || extraData['Sales Trend'] || null;
      case 'fulfilledBy':
        return extraData.fulfilled_by || extraData['Fulfilled By'] || null;
      case 'activeSellers':
        return extraData.active_sellers || extraData['Active Sellers'] || null;
      case 'lastYearSales':
        return extraData.last_year_sales || extraData['Last Year Sales'] || null;
      case 'variationCount':
        return extraData.variation_count || extraData['Variation Count'] || null;
      case 'numberOfImages':
        return extraData.number_of_images || extraData['Number of Images'] || null;
      case 'salesToReviews':
        return extraData.sales_to_reviews || extraData['Sales to Reviews'] || null;
      case 'bestSalesPeriod':
        return extraData.best_sales_period || extraData['Best Sales Period'] || null;
      case 'parentLevelSales':
        return extraData.parent_level_sales || extraData['Parent Level Sales'] || null;
      case 'parentLevelRevenue':
        return extraData.parent_level_revenue || extraData['Parent Level Revenue'] || null;
      case 'salesYearOverYear':
        return extraData.sales_year_over_year || extraData['Sales Year Over Year'] || null;
      case 'createdAt':
        return submission.created_at || null;
      default:
        return null;
    }
  };

  // Format column value for display
  const formatColumnValue = (value: string | number | null, columnKey: string): string => {
    if (value === null || value === undefined) return 'N/A';
    
    if (columnKey === 'price' || columnKey === 'monthlyRevenue' || columnKey === 'netPrice' || columnKey === 'parentLevelRevenue') {
      return typeof value === 'number' ? `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : value.toString();
    }
    
    if (columnKey === 'monthlyUnitsSold' || columnKey === 'lastYearSales' || columnKey === 'activeSellers' || columnKey === 'variationCount' || columnKey === 'numberOfImages' || columnKey === 'parentLevelSales') {
      return typeof value === 'number' ? value.toLocaleString() : value.toString();
    }
    
    if (columnKey === 'rating') {
      return typeof value === 'number' ? value.toFixed(1) : value.toString();
    }
    
    if (columnKey === 'createdAt') {
      try {
        const date = new Date(value);
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
      } catch (e) {
        return value.toString();
      }
    }
    
    return value.toString();
  };

  const vetSelectedProducts = async () => {
    if (selectedSubmissions.length === 0) return;
    
    try {
      // Get the selected submission to extract the title and ID
      const selectedSubmission = submissions.find((s: any) => s.id === selectedSubmissions[0]);
      const productTitle = selectedSubmission?.title || selectedSubmission?.productName || '';
      const researchProductId = selectedSubmission?.id || '';
      
      // Close modal
      setIsVetSelectedProductsModalOpen(false);
      
      // Clear selection
      setSelectedSubmissions([]);
      
      // Redirect to dashboard with Product Analysis Engine tab, product name, and research product ID
      const encodedTitle = encodeURIComponent(productTitle);
      const encodedProductId = encodeURIComponent(researchProductId);
      const encodedAsin = encodeURIComponent(selectedSubmission?.asin);
      router.push(`/vetting?tab=new&productName=${encodedTitle}&researchProductId=${encodedProductId}&asin=${encodedAsin}`);
    } catch (error) {
      console.error('Error vetting products:', error);
      setError(error instanceof Error ? error.message : 'Failed to process vet action');
    }
  };

  const handleVetSelectedProducts = async (submissionId: string) => {
    setSelectedSubmissions([submissionId]);
    setIsVetSelectedProductsModalOpen(true);
  };

  const handleOfferClick = (submission: any) => {
    if (!submission.is_vetted) {
      // Product is not vetted, cannot proceed to offer
      return;
    }
    if (submission.is_offered) {
      router.push(`/offer/${submission.asin}`);
      return;
    }
    // Show confirmation modal
    setOfferConfirmProduct({
      asin: submission.asin,
      title: titleByAsin?.[submission.asin] || getProductDisplayName(submission) || submission.asin,
    });
    setIsOfferConfirmOpen(true);
  };

  const confirmOfferNavigation = () => {
    if (offerConfirmProduct) {
      router.push(`/offer/${offerConfirmProduct.asin}`);
    }
    setIsOfferConfirmOpen(false);
    setOfferConfirmProduct(null);
  };

  const handleSourcingClick = (submission: any) => {
    if (!submission.is_offered) {
      // Product is not offered, cannot proceed to sourcing
      return;
    }
    if (submission.is_sourced) {
      // Already sourced, navigate directly
      router.push(`/sourcing/${submission.asin}`);
      return;
    }
    // Show confirmation modal
    setSourcingConfirmProduct({
      asin: submission.asin,
      title: titleByAsin?.[submission.asin] || getProductDisplayName(submission) || submission.asin,
    });
    setIsSourcingConfirmOpen(true);
  };

  const confirmSourcingNavigation = () => {
    if (sourcingConfirmProduct) {
      router.push(`/sourcing/${sourcingConfirmProduct.asin}`);
    }
    setIsSourcingConfirmOpen(false);
    setSourcingConfirmProduct(null);
  };

  const deleteSelectedProducts = async () => {
    if (selectedSubmissions.length === 0) return;
    
    setIsDeleting(true);
    
    try {
      // Get session for authorization
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch('/api/research', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` })
        },
        credentials: 'include',
        body: JSON.stringify({
          productIds: selectedSubmissions
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          // Refresh submissions to reflect deletions
          await fetchSubmissions();
          // Clear selection
          setSelectedSubmissions([]);
          // Close modal
          setIsDeleteConfirmOpen(false);
        } else {
          setError(result.error || 'Failed to delete products');
        }
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to delete products');
      }
    } catch (error) {
      console.error('Error deleting products:', error);
      setError(error instanceof Error ? error.message : 'Failed to delete products');
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchSubmissions();
    }
  }, [user]);

  const loadingMarkup = loading && (
    <div className="flex flex-col items-center justify-center py-16">
      <Loader2 className="h-12 w-12 text-blue-500 animate-spin mb-4" />
      <p className="text-gray-600 dark:text-slate-400">Loading your products...</p>
    </div>
  );

  const errorMarkup = error && (
    <div className="flex flex-col items-center justify-center py-16">
      <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
      <p className="text-gray-900 dark:text-slate-300 mb-2">Failed to load submissions</p>
      <p className="text-gray-600 dark:text-slate-400 mb-4">{error}</p>
      <button
        onClick={fetchSubmissions}
        className="px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg text-white transition-colors shadow-md"
      >
        Try Again
      </button>
    </div>
  )

  const markupTable = !loading && !error && submissions.length > 0 && (
    <div className="space-y-4">
      {/* Search and Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-slate-400" />
          <input
            type="text"
            placeholder="Search products..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-900/50 border border-gray-300 dark:border-slate-700/50 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <ColumnPicker
            columns={FUNNEL_PICKER_COLUMNS}
            visible={FUNNEL_PICKER_COLUMNS.filter((c) => visibleColumns[c.id]).map((c) => c.id)}
            onChange={(ids) => {
              const on = new Set(ids);
              setVisibleColumns((prev) => {
                const next = { ...prev };
                FUNNEL_PICKER_COLUMNS.forEach((c) => { next[c.id] = on.has(c.id); });
                return next;
              });
            }}
            defaults={FUNNEL_PICKER_DEFAULTS}
            footnote="Image, Title, Category, Brand and Progress always show. Your choice is remembered on this device."
          />

          {selectedSubmissions.length > 0 && (() => {
            // Get the selected product to determine which action button to show
            const selectedProduct = submissions?.find((s: any) => s.id === selectedSubmissions[0]);
            const isSingleSelection = selectedSubmissions.length === 1;
            
            // Determine the next action based on product status
            const getNextAction = () => {
              if (!selectedProduct) return null;
              if (!selectedProduct.is_vetted) return 'vet';
              if (selectedProduct.is_vetted && !selectedProduct.is_offered) return 'offer';
              if (selectedProduct.is_offered && !selectedProduct.is_sourced) return 'source';
              return null; // Product has completed all stages
            };
            
            const nextAction = getNextAction();
            
            return (
              <>
                {nextAction && (
                  <div className="relative inline-block">
                    <div 
                      className="relative group"
                      onMouseEnter={(e) => {
                        if (!isSingleSelection) {
                          const tooltip = e.currentTarget.querySelector('.action-disabled-tooltip') as HTMLElement;
                          if (tooltip) {
                            tooltip.classList.remove('opacity-0', 'invisible');
                            tooltip.classList.add('opacity-100', 'visible');
                          }
                        }
                      }}
                      onMouseLeave={(e) => {
                        const tooltip = e.currentTarget.querySelector('.action-disabled-tooltip') as HTMLElement;
                        if (tooltip) {
                          tooltip.classList.remove('opacity-100', 'visible');
                          tooltip.classList.add('opacity-0', 'invisible');
                        }
                      }}
                    >
                      {nextAction === 'vet' && (
                        <button
                          onClick={() => {
                            if (isSingleSelection) {
                              setIsVetSelectedProductsModalOpen(true);
                            }
                          }}
                          disabled={!isSingleSelection}
                          className={`px-3 py-1 border rounded-lg transition-colors flex items-center gap-2 ${
                            !isSingleSelection
                              ? 'bg-gray-200 dark:bg-slate-700/30 border-gray-300 dark:border-slate-600/30 text-gray-400 dark:text-slate-500 cursor-not-allowed'
                              : 'bg-cyan-100 dark:bg-cyan-500/20 hover:bg-cyan-200 dark:hover:bg-cyan-500/30 border-cyan-400 dark:border-cyan-500/50 text-cyan-700 dark:text-cyan-300'
                          }`}
                        >
                          <VettedIcon shape="rounded" />
                          Vet
                        </button>
                      )}
                      {nextAction === 'offer' && (
                        <button
                          onClick={() => {
                            if (isSingleSelection && selectedProduct) {
                              handleOfferClick(selectedProduct);
                            }
                          }}
                          disabled={!isSingleSelection}
                          className={`px-3 py-1 border rounded-lg transition-colors flex items-center gap-2 ${
                            !isSingleSelection
                              ? 'bg-gray-200 dark:bg-slate-700/30 border-gray-300 dark:border-slate-600/30 text-gray-400 dark:text-slate-500 cursor-not-allowed'
                              : 'bg-emerald-100 dark:bg-emerald-500/20 hover:bg-emerald-200 dark:hover:bg-emerald-500/30 border-emerald-400 dark:border-emerald-500/50 text-emerald-700 dark:text-emerald-300'
                          }`}
                        >
                          <OffersIcon shape="rounded" />
                          Offer
                        </button>
                      )}
                      {nextAction === 'source' && (
                        <button
                          onClick={() => {
                            if (isSingleSelection && selectedProduct) {
                              router.push(`/sourcing/${selectedProduct.asin}`);
                            }
                          }}
                          disabled={!isSingleSelection}
                          className={`px-3 py-1 border rounded-lg transition-colors flex items-center gap-2 ${
                            !isSingleSelection
                              ? 'bg-gray-200 dark:bg-slate-700/30 border-gray-300 dark:border-slate-600/30 text-gray-400 dark:text-slate-500 cursor-not-allowed'
                              : 'bg-teal-100 dark:bg-teal-500/20 hover:bg-teal-200 dark:hover:bg-teal-500/30 border-teal-400 dark:border-teal-500/50 text-teal-700 dark:text-teal-300'
                          }`}
                        >
                          <SourcedIcon shape="rounded" />
                          Source
                        </button>
                      )}
                      {!isSingleSelection && (
                        <div className="action-disabled-tooltip absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1 px-4 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg shadow-2xl text-gray-900 dark:text-white text-xs leading-relaxed w-[350px] opacity-0 invisible transition-all duration-200 pointer-events-none z-[10000] whitespace-normal">
                          <div className="font-medium mb-1 text-gray-900 dark:text-white">Cannot process multiple products</div>
                          <div className="text-gray-700 dark:text-slate-300">You can only process one product at a time. Select a single product to continue.</div>
                          <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-px border-4 border-transparent border-t-slate-900"></div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <button
                  ref={bulkAddTagAnchorRef}
                  onClick={() => setBulkPickerMode((cur) => (cur === 'add' ? null : 'add'))}
                  className="px-3 py-1 border border-blue-400/50 bg-blue-100 dark:bg-blue-500/20 hover:bg-blue-200 dark:hover:bg-blue-500/30 text-blue-700 dark:text-blue-300 rounded-lg transition-colors inline-flex items-center gap-1 text-sm"
                  title={`Add a tag to ${selectedSubmissions.length} selected`}
                >
                  <TagIcon className="w-3.5 h-3.5" />
                  Tag…
                </button>
                <button
                  ref={bulkRemoveTagAnchorRef}
                  onClick={() => setBulkPickerMode((cur) => (cur === 'remove' ? null : 'remove'))}
                  className="px-3 py-1 border border-slate-400/50 bg-gray-100 dark:bg-slate-700/40 hover:bg-gray-200 dark:hover:bg-slate-700/60 text-gray-700 dark:text-slate-200 rounded-lg transition-colors inline-flex items-center gap-1 text-sm"
                  title={`Remove a tag from ${selectedSubmissions.length} selected`}
                >
                  <TagIcon className="w-3.5 h-3.5" />
                  Untag…
                </button>
                <button
                  onClick={() => setIsDeleteConfirmOpen(true)}
                  className="p-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 hover:border-red-500/70 rounded-lg text-red-400 hover:text-red-300 transition-colors"
                  title={`Remove selected (${selectedSubmissions.length})`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            );
          })()}
        </div>
      </div>
      
      {/* Modern Table */}
      {/* Shared table chrome (see components/DataTable): the header sticks to
          the top of this scroll box, checkbox + image stick to its left and
          Progress to its right; everything else scrolls underneath. */}
      <div className={TABLE_SCROLL}>
        <table className="w-full text-[15px]">
          <thead>
            <tr className="border-b border-gray-200 dark:border-slate-700">
              {/* Fixed width so a wide window's surplus goes to the data
                  columns, never to the checkbox gutter. */}
              {/* Checkbox and Image are pinned to the left edge (the checkbox
                  rides along because it sits before the image — otherwise the
                  pinned image would slide over it). Title and every column
                  after it scroll underneath; Progress is pinned on the right.
                  `left-12` matches the checkbox column's w-12. */}
              <th className={`${HEAD_CELL_PINNED} px-3 w-12`}>
                <Checkbox
                  checked={getPaginatedSubmissions().every(sub => selectedSubmissions.includes(sub.id)) && getPaginatedSubmissions().length > 0}
                  onChange={selectAllCurrentPage}
                />
              </th>
              {visibleColumns.createdAt && (
                <th 
                  className={`group ${HEAD_CELL} px-3 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors`}
                  onClick={() => handleSortChange('created_at')}
                >
                  <div className="flex items-center gap-1">
                    Created Date
                    <SortChevron active={sortField === 'created_at'} dir={sortDirection} />
                  </div>
                </th>
              )}
              {/* IMAGE column — always visible. Doubles as the Amazon
                  listing link via the external-link badge on the
                  thumbnail (replaces the standalone ASIN-link column). */}
              <th className={`${HEAD_CELL} left-12 z-30 px-3 ${CELL_PINNED_EDGE} w-[80px]`}>
                Image
              </th>
              {visibleColumns.asin && (
                <th
                  className={`group ${HEAD_CELL} px-3 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors`}
                  onClick={() => handleSortChange('asin')}
                >
                  <div className="flex items-center gap-1">
                    ASIN
                    <SortChevron active={sortField === 'asin'} dir={sortDirection} />
                  </div>
                </th>
              )}
              <th
                className={`group relative ${HEAD_CELL} px-3`}
                style={{ width: titleColumnWidth }}
                onClick={() => handleSortChange('title')}
              >
                <div 
                  className="flex items-center gap-1 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors"
                >
                  Title
                  <SortChevron active={sortField === 'title'} dir={sortDirection} />
                </div>
                <div
                  onMouseDown={(event) => {
                    event.stopPropagation();
                    event.preventDefault();
                    titleResizeStartX.current = event.clientX;
                    titleResizeStartWidth.current = titleColumnWidth;
                    setIsResizingTitleColumn(true);
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    event.preventDefault();
                  }}
                  className={`absolute right-0 top-0 h-full w-[2px] cursor-col-resize bg-slate-600/50 hover:bg-blue-500/70 ${
                    isResizingTitleColumn ? 'bg-blue-500/80' : ''
                  }`}
                  style={{ 
                    touchAction: 'none',
                    userSelect: 'none'
                  }}
                  title="Drag to resize column"
                />
              </th>
              <th 
                    className={`group ${HEAD_CELL} px-3 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors`}
                onClick={() => handleSortChange('category')}
              >
                <div className="flex items-center gap-1">
                  Category
                  <SortChevron active={sortField === 'category'} dir={sortDirection} />
                </div>
              </th>
              <th 
                    className={`group ${HEAD_CELL} px-3 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors`}
                onClick={() => handleSortChange('brand')}
              >
                <div className="flex items-center gap-1">
                  Brand
                  <SortChevron active={sortField === 'brand'} dir={sortDirection} />
                </div>
              </th>
              {visibleColumns.price && (
                <th 
                    className={`group ${HEAD_CELL} px-3 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors`}
                  onClick={() => handleSortChange('price')}
                >
                  <div className="flex items-center gap-1">
                    Price
                    <SortChevron active={sortField === 'price'} dir={sortDirection} />
                  </div>
                </th>
              )}
              {visibleColumns.monthlyRevenue && (
                <th 
                  className={`group ${HEAD_CELL} px-3 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors`}
                  onClick={() => handleSortChange('monthly_revenue')}
                >
                  <div className="flex items-center gap-1">
                    Monthly Revenue
                    <SortChevron active={sortField === 'monthly_revenue'} dir={sortDirection} />
                  </div>
                </th>
              )}
              {visibleColumns.monthlyUnitsSold && (
                <th 
                  className={`group ${HEAD_CELL} px-3 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors`}
                  onClick={() => handleSortChange('monthly_units_sold')}
                >
                  <div className="flex items-center gap-1">
                    Monthly Units Sold
                    <SortChevron active={sortField === 'monthly_units_sold'} dir={sortDirection} />
                  </div>
                </th>
              )}
              {visibleColumns.bsr && (
                <th 
                  className={`group ${HEAD_CELL} px-3 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors`}
                  onClick={() => handleSortChange('bsr')}
                >
                  <div className="flex items-center gap-1">
                    BSR
                    <SortChevron active={sortField === 'bsr'} dir={sortDirection} />
                  </div>
                </th>
              )}
              {visibleColumns.rating && (
                <th 
                  className={`group ${HEAD_CELL} px-3 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors`}
                  onClick={() => handleSortChange('rating')}
                >
                  <div className="flex items-center gap-1">
                    Rating
                    <SortChevron active={sortField === 'rating'} dir={sortDirection} />
                  </div>
                </th>
              )}
              {visibleColumns.review && (
                <th 
                  className={`group ${HEAD_CELL} px-3 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors`}
                  onClick={() => handleSortChange('review')}
                >
                  <div className="flex items-center gap-1">
                    Review
                    <SortChevron active={sortField === 'review'} dir={sortDirection} />
                  </div>
                </th>
              )}
              {visibleColumns.weight && (
                <th 
                  className={`group ${HEAD_CELL} px-3 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors`}
                  onClick={() => handleSortChange('weight')}
                >
                  <div className="flex items-center gap-1">
                    Weight
                    <SortChevron active={sortField === 'weight'} dir={sortDirection} />
                  </div>
                </th>
              )}
              {/* Net Price column removed 2026-05-13 — requires Amazon SP-API
                  for post-fee net which we don't have. */}
              {visibleColumns.sizeTier && (
                <th 
                  className={`group ${HEAD_CELL} px-3 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors`}
                  onClick={() => handleSortChange('sizeTier')}
                >
                  <div className="flex items-center gap-1">
                    Size Tier
                    <SortChevron active={sortField === 'sizeTier'} dir={sortDirection} />
                  </div>
                </th>
              )}
              {visibleColumns.priceTrend && (
                <th 
                  className={`group ${HEAD_CELL} px-3 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors`}
                  onClick={() => handleSortChange('priceTrend')}
                >
                  <div className="flex items-center gap-1">
                    Price Trend
                    <SortChevron active={sortField === 'priceTrend'} dir={sortDirection} />
                  </div>
                </th>
              )}
              {visibleColumns.salesTrend && (
                <th 
                  className={`group ${HEAD_CELL} px-3 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors`}
                  onClick={() => handleSortChange('salesTrend')}
                >
                  <div className="flex items-center gap-1">
                    Sales Trend
                    <SortChevron active={sortField === 'salesTrend'} dir={sortDirection} />
                  </div>
                </th>
              )}
              {visibleColumns.fulfilledBy && (
                <th 
                  className={`group ${HEAD_CELL} px-3 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors`}
                  onClick={() => handleSortChange('fulfilledBy')}
                >
                  <div className="flex items-center gap-1">
                    Fulfilled By
                    <SortChevron active={sortField === 'fulfilledBy'} dir={sortDirection} />
                  </div>
                </th>
              )}
              {visibleColumns.activeSellers && (
                <th 
                  className={`group ${HEAD_CELL} px-3 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors`}
                  onClick={() => handleSortChange('activeSellers')}
                >
                  <div className="flex items-center gap-1">
                    Active Sellers
                    <SortChevron active={sortField === 'activeSellers'} dir={sortDirection} />
                  </div>
                </th>
              )}
              {visibleColumns.lastYearSales && (
                <th 
                  className={`group ${HEAD_CELL} px-3 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors`}
                  onClick={() => handleSortChange('lastYearSales')}
                >
                  <div className="flex items-center gap-1">
                    Last Year Sales
                    <SortChevron active={sortField === 'lastYearSales'} dir={sortDirection} />
                  </div>
                </th>
              )}
              {visibleColumns.variationCount && (
                <th 
                  className={`group ${HEAD_CELL} px-3 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors`}
                  onClick={() => handleSortChange('variationCount')}
                >
                  <div className="flex items-center gap-1">
                    Variation Count
                    <SortChevron active={sortField === 'variationCount'} dir={sortDirection} />
                  </div>
                </th>
              )}
              {visibleColumns.numberOfImages && (
                <th 
                  className={`group ${HEAD_CELL} px-3 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors`}
                  onClick={() => handleSortChange('numberOfImages')}
                >
                  <div className="flex items-center gap-1">
                    Number of Images
                    <SortChevron active={sortField === 'numberOfImages'} dir={sortDirection} />
                  </div>
                </th>
              )}
              {visibleColumns.salesToReviews && (
                <th 
                  className={`group ${HEAD_CELL} px-3 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors`}
                  onClick={() => handleSortChange('salesToReviews')}
                >
                  <div className="flex items-center gap-1">
                    Sales to Reviews
                    <SortChevron active={sortField === 'salesToReviews'} dir={sortDirection} />
                  </div>
                </th>
              )}
              {visibleColumns.bestSalesPeriod && (
                <th 
                  className={`group ${HEAD_CELL} px-3 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors`}
                  onClick={() => handleSortChange('bestSalesPeriod')}
                >
                  <div className="flex items-center gap-1">
                    Best Sales Period
                    <SortChevron active={sortField === 'bestSalesPeriod'} dir={sortDirection} />
                  </div>
                </th>
              )}
              {visibleColumns.parentLevelSales && (
                <th 
                  className={`group ${HEAD_CELL} px-3 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors`}
                  onClick={() => handleSortChange('parentLevelSales')}
                >
                  <div className="flex items-center gap-1">
                    Parent Level Sales
                    <SortChevron active={sortField === 'parentLevelSales'} dir={sortDirection} />
                  </div>
                </th>
              )}
              {visibleColumns.parentLevelRevenue && (
                <th 
                  className={`group ${HEAD_CELL} px-3 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors`}
                  onClick={() => handleSortChange('parentLevelRevenue')}
                >
                  <div className="flex items-center gap-1">
                    Parent Level Revenue
                    <SortChevron active={sortField === 'parentLevelRevenue'} dir={sortDirection} />
                  </div>
                </th>
              )}
              {/* Sales Year Over Year column removed 2026-05-13 — requires
                  multi-year history which our 180d stats don't provide. */}
              {/* Progress is pinned to the right edge. Once enough columns are
                  switched on (or the window is narrow enough) for the table to
                  scroll sideways, the funnel actions stay in view and the
                  extra columns slide underneath it — the same way Image and
                  Title lead on the left. Sticky cells need an opaque
                  background or the scrolled columns show through; the
                  dark value approximates the card-over-page-gradient tone. */}
              <th
                className={`group ${HEAD_CELL} right-0 z-30 px-3 border-l border-gray-200 dark:border-slate-700 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap`}
                style={{ minWidth: 220 }}
                onClick={() => handleSortChange('progress')}
              >
                <div className="flex items-center gap-1">
                  Progress
                  <SortChevron active={sortField === 'progress'} dir={sortDirection} />
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-slate-700/30">
            {getPaginatedSubmissions().map((submission: any) => {
              const isJustAdded = recentlyAddedAsin && submission.asin === recentlyAddedAsin;
              return (
              <tr
                key={submission.id}
                id={submission.asin ? `research-row-${submission.asin}` : undefined}
                className={`group group/row h-[88px] transition-colors cursor-pointer ${
                  isJustAdded
                    ? 'bg-emerald-500/15 ring-1 ring-emerald-400/40 animate-pulse'
                    : rowTint(false)
                }`}
                onClick={() => submission.asin && router.push(`/research/${submission.asin}`)}
              >
                <td className={`${pinnedCell(false)} left-0 px-3 py-3 w-12`} onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selectedSubmissions.includes(submission.id)}
                    onChange={() => toggleSubmissionSelection(submission.id)}
                  />
                </td>
                {visibleColumns.createdAt && (
                  <td className={`${CELL}`}>
                    {formatColumnValue(getColumnValue(submission, 'createdAt'), 'createdAt')}
                  </td>
                )}
                {/* IMAGE cell — Amazon listing link with external-link
                    overlay. */}
                <td className={`${pinnedCell(false)} left-12 ${CELL_PINNED_EDGE} px-3 py-3 w-[80px]`}>
                  <ListingThumbnail
                    src={imageUrlByAsin.get((submission.asin || '').toUpperCase()) ?? null}
                    size="xl"
                    linkHref={submission?.asin ? `https://www.amazon.com/dp/${submission.asin}` : undefined}
                    linkLabel={submission?.asin ? `Open ${submission.asin} on Amazon` : undefined}
                  />
                </td>
                {visibleColumns.asin && (
                  <td className={`${CELL}`}>
                    {submission?.asin ? (
                      <a
                        href={`https://www.amazon.com/dp/${submission.asin}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 hover:underline transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {submission.asin}
                      </a>
                    ) : (
                      <span className="text-gray-500 dark:text-slate-300">N/A</span>
                    )}
                  </td>
                )}
                <td
                  className={`${CELL}`}
                  style={{
                    width: titleColumnWidth,
                    minWidth: titleColumnWidth,
                    maxWidth: titleColumnWidth
                  }}
                >
                  <div className="min-w-0 flex flex-col gap-1.5">
                    {/* Title clamps to 2 lines so every row has the same
                        height; full title surfaces in TitleTooltip on
                        hover. */}
                    <TitleTooltip text={titleByAsin?.[submission.asin] || getProductDisplayName(submission)}>
                      <p className="text-sm font-medium text-gray-900 dark:text-white line-clamp-2 leading-snug cursor-default">
                        {titleByAsin?.[submission.asin] || getProductDisplayName(submission)}
                      </p>
                    </TitleTooltip>
                    <div
                      className="mt-1.5 flex flex-wrap items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {(submission.tags || []).map((tag: any) => (
                        <TagChip
                          key={tag.id}
                          tag={tag}
                          onRemove={() => handleChipRemove(submission.id, tag)}
                        />
                      ))}
                      <button
                        type="button"
                        ref={(el) => {
                          addTagButtonRefs.current[submission.id] = el;
                        }}
                        onClick={() =>
                          setPickerOpenFor((cur) => (cur === submission.id ? null : submission.id))
                        }
                        className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-500/60 bg-transparent hover:bg-slate-700/40 px-2 py-0.5 text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
                        title="Add tag"
                      >
                        <TagIcon className="h-2.5 w-2.5" />
                        {(submission.tags || []).length === 0 ? 'Add tag' : '+'}
                      </button>
                      {pickerOpenFor === submission.id && (
                        <TagPicker
                          anchorRef={{ current: addTagButtonRefs.current[submission.id] || null }}
                          researchProductId={submission.id}
                          currentTags={submission.tags || []}
                          allTags={userTags}
                          open
                          onClose={() => setPickerOpenFor(null)}
                          onAttached={(tag) => applyLocalTagAttach(submission.id, tag)}
                          onDetached={(tagId) => applyLocalTagDetach(submission.id, tagId)}
                          onOpenManager={() => setIsTagManagerOpen(true)}
                        />
                      )}
                    </div>
                  </div>
                </td>
                <td className={`${CELL}`}>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {submission.category || 'N/A'}
                      </p>
                  </div>
                </td>
                <td className={`${CELL}`}>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {submission.brand || 'N/A'}
                  </p>
                </td>
                    {visibleColumns.price && (
                      <td className={`${CELL}`}>
                        {formatColumnValue(getColumnValue(submission, 'price'), 'price')}
                      </td>
                    )}
                    {visibleColumns.monthlyRevenue && (
                      <td className={`${CELL}`}>
                        {formatColumnValue(getColumnValue(submission, 'monthlyRevenue'), 'monthlyRevenue')}
                      </td>
                    )}
                    {visibleColumns.monthlyUnitsSold && (
                      <td className={`${CELL}`}>
                        {formatColumnValue(getColumnValue(submission, 'monthlyUnitsSold'), 'monthlyUnitsSold')}
                      </td>
                    )}
                    {visibleColumns.bsr && (
                      <td className={`${CELL}`}>
                        {formatColumnValue(getColumnValue(submission, 'bsr'), 'bsr')}
                      </td>
                    )}
                    {visibleColumns.rating && (
                      <td className={`${CELL}`}>
                        {formatColumnValue(getColumnValue(submission, 'rating'), 'rating')}
                      </td>
                    )}
                    {visibleColumns.review && (
                      <td className={`${CELL}`}>
                        {formatColumnValue(getColumnValue(submission, 'review'), 'review')}
                      </td>
                    )}
                    {visibleColumns.weight && (
                      <td className={`${CELL}`}>
                        {formatColumnValue(getColumnValue(submission, 'weight'), 'weight')}
                      </td>
                    )}
                    {/* Net Price cell removed — see header note above. */}
                    {visibleColumns.sizeTier && (
                      <td className={`${CELL}`}>
                        {formatColumnValue(getColumnValue(submission, 'sizeTier'), 'sizeTier')}
                      </td>
                    )}
                    {visibleColumns.priceTrend && (
                      <td className={`${CELL}`}>
                        {formatColumnValue(getColumnValue(submission, 'priceTrend'), 'priceTrend')}
                      </td>
                    )}
                    {visibleColumns.salesTrend && (
                      <td className={`${CELL}`}>
                        {formatColumnValue(getColumnValue(submission, 'salesTrend'), 'salesTrend')}
                      </td>
                    )}
                    {visibleColumns.fulfilledBy && (
                      <td className={`${CELL}`}>
                        {formatColumnValue(getColumnValue(submission, 'fulfilledBy'), 'fulfilledBy')}
                      </td>
                    )}
                    {visibleColumns.activeSellers && (
                      <td className={`${CELL}`}>
                        {formatColumnValue(getColumnValue(submission, 'activeSellers'), 'activeSellers')}
                      </td>
                    )}
                    {visibleColumns.lastYearSales && (
                      <td className={`${CELL}`}>
                        {formatColumnValue(getColumnValue(submission, 'lastYearSales'), 'lastYearSales')}
                      </td>
                    )}
                    {visibleColumns.variationCount && (
                      <td className={`${CELL}`}>
                        {formatColumnValue(getColumnValue(submission, 'variationCount'), 'variationCount')}
                      </td>
                    )}
                    {visibleColumns.numberOfImages && (
                      <td className={`${CELL}`}>
                        {formatColumnValue(getColumnValue(submission, 'numberOfImages'), 'numberOfImages')}
                      </td>
                    )}
                    {visibleColumns.salesToReviews && (
                      <td className={`${CELL}`}>
                        {formatColumnValue(getColumnValue(submission, 'salesToReviews'), 'salesToReviews')}
                      </td>
                    )}
                    {visibleColumns.bestSalesPeriod && (
                      <td className={`${CELL}`}>
                        {formatColumnValue(getColumnValue(submission, 'bestSalesPeriod'), 'bestSalesPeriod')}
                      </td>
                    )}
                    {visibleColumns.parentLevelSales && (
                      <td className={`${CELL}`}>
                        {formatColumnValue(getColumnValue(submission, 'parentLevelSales'), 'parentLevelSales')}
                      </td>
                    )}
                    {visibleColumns.parentLevelRevenue && (
                      <td className={`${CELL}`}>
                        {formatColumnValue(getColumnValue(submission, 'parentLevelRevenue'), 'parentLevelRevenue')}
                      </td>
                    )}
                    {/* Sales Year Over Year cell removed — see header note above. */}
                <td
                  className={`${pinnedCell(false)} right-0 border-l border-gray-200 dark:border-slate-700 px-3 py-3 whitespace-nowrap`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center gap-2 shrink-0">
                    <ResearchIcon shape="rounded" />
                    {!submission.is_vetted ? (
                      <button onClick={() => handleVetSelectedProducts(submission.id)}><VettedIcon isDisabled shape="rounded"/></button>
                    ) : (
                      <button onClick={() => router.push(`/vetting/${submission.asin}`)}><VettedIcon shape="rounded"/></button>
                    )}
                    <button 
                      onClick={() => handleOfferClick(submission)}
                      disabled={!submission.is_vetted}
                      className={`${!submission.is_vetted ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:opacity-80'} transition-opacity`}
                      title={!submission.is_vetted ? 'Product must be vetted first' : 'Go to Offer Builder'}
                    >
                      <OffersIcon isDisabled={!submission.is_offered} shape="rounded"/>
                    </button>
                    <button 
                      onClick={() => handleSourcingClick(submission)}
                      disabled={!submission.is_offered}
                      className={`${!submission.is_offered ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:opacity-80'} transition-opacity`}
                      title={!submission.is_offered ? 'Product must be offered first' : 'Go to Sourcing'}
                    >
                      <SourcedIcon isDisabled={!submission.is_sourced} shape="rounded" />
                    </button>
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      
      {/* Pagination */}
      {getFilteredSubmissions().length > 0 && (
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pt-4">
            <div className="flex items-center gap-4">
              <p className="text-sm text-gray-600 dark:text-slate-400">
                Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, getFilteredSubmissions().length)} of {getFilteredSubmissions().length} results
              </p>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600 dark:text-slate-400">Show:</span>
                <select
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value));
                    setCurrentPage(1); // Reset to first page when changing items per page
                  }}
                  className="px-3 py-1.5 bg-white dark:bg-slate-700/50 border border-gray-300 dark:border-slate-600/50 rounded-lg text-sm text-gray-700 dark:text-slate-300 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer shadow-sm"
                >
                  <option value={10}>10</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="p-2 rounded-lg bg-gray-100 dark:bg-slate-700/50 hover:bg-gray-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                >
                  <ChevronLeft className="w-4 h-4 text-gray-600 dark:text-slate-400" />
                </button>
                <span className="px-3 py-1 text-sm text-gray-700 dark:text-slate-300">
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-lg bg-gray-100 dark:bg-slate-700/50 hover:bg-gray-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                >
                  <ChevronRight className="w-4 h-4 text-gray-600 dark:text-slate-400" />
                </button>
              </div>
            )}
          </div>
      )}
    </div>
  )

  const markupEmptyTable = !loading && !error && submissions.length === 0 && (
    <div className="text-center py-16">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-slate-700/50 mb-4">
        <Package className="w-8 h-8 text-gray-400 dark:text-slate-500" />
      </div>
      <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Every Great Brand Starts With One Product 🌱</h3>
      <p className="text-gray-600 dark:text-slate-400 mb-6">
      Upload your researched products to plant the first seeds of your brand and begin growing your freedom.</p>
      <button
        onClick={() => setActiveTab('new')}
        className="px-6 py-3 bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 rounded-lg text-white font-medium transition-all transform hover:scale-105 shadow-md hover:shadow-lg"
      >
        <span className="flex items-center gap-2">
          Fill My Funnel
          <ArrowRight className="w-5 h-5" />
        </span>
      </button>
      <div className="mt-10 max-w-2xl mx-auto text-left">
        <ExtensionCTA
          variant="card"
          surface="research-empty"
          headline="Or research products directly on Amazon"
          body="Install the BloomEngine Chrome Extension to score listings, save to your funnel, and run market analysis from inside Amazon search results — no CSV upload needed."
        />
      </div>
    </div>
  )

  const activeTabMarkup = activeTab === 'submissions' && (
    <>
      {loadingMarkup}
      {errorMarkup}
      {!loading && submissions && submissions.length > 0 && (
        <FilterBar
          tags={userTags}
          filters={filters}
          onChange={setFilters}
          hideStatusFilter
        />
      )}
      {markupTable}
      {markupEmptyTable}
    </>
  );

  const newTabMarkup = activeTab === 'new' && (
    <div className="space-y-8">
      {/* Header Section */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-2xl mb-6">
          <TrendingUp className="w-8 h-8 text-white" />
        </div>
        <h3 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">Every Great Brand Starts With One Product 🌱</h3>
        <p className="text-xl text-gray-600 dark:text-slate-300 mb-8 max-w-2xl mx-auto">
          Upload your researched products to plant the first seeds of your brand and begin growing your freedom.
        </p>
      </div>

      {/* Upload Component */}
      <div className="mx-auto">
        <CsvUploadResearch userId={user.id} setActiveTab={setActiveTab} onSubmit={fetchSubmissions} />
      </div>

      {/* OR divider + single-ASIN add (Keepa-backed) */}
      <div className="flex items-center gap-4 max-w-2xl mx-auto">
        <div className="flex-1 border-t border-slate-700/60" />
        <span className="text-xs uppercase tracking-widest text-slate-500">or</span>
        <div className="flex-1 border-t border-slate-700/60" />
      </div>
      <div className="max-w-2xl mx-auto w-full">
        <AddAsinCard
          onAdded={async (addedAsin) => {
            // Force the new row to be visible and sorted to the top.
            setSortField('created_at');
            setSortDirection('desc');
            setCurrentPage(1);
            await fetchSubmissions();
            setUpdateProducts(true);
            setActiveTab('submissions');
            // Triggers scrollIntoView + 1.5s pulse via the effect below.
            setRecentlyAddedAsin(addedAsin);
          }}
        />
      </div>

    </div>
  );

  
  const modalVetSelectedProducts = isVetSelectedProductsModalOpen && (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl p-6 max-w-md w-full border border-gray-200 dark:border-slate-700/50 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-cyan-500/20 rounded-xl flex items-center justify-center">
            <Search className="w-6 h-6 text-cyan-400" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Go to Vetting</h3>
            <p className="text-gray-500 dark:text-slate-400 text-sm">Analyze this product</p>
          </div>
        </div>
        <p className="text-gray-600 dark:text-slate-300 mb-6">
          You are about to start vetting this product. This will redirect you to the Product Analysis Engine.
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={() => setIsVetSelectedProductsModalOpen(false)}
            className="px-4 py-2 bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 rounded-lg text-gray-900 dark:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={vetSelectedProducts}
            className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 rounded-lg text-white transition-colors flex items-center gap-2"
          >
            <ArrowRight className="w-4 h-4" />
            Open Vetting
          </button>
        </div>
      </div>
    </div>
  )

  const modalDeleteConfirm = isDeleteConfirmOpen && (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl p-6 max-w-md w-full border border-gray-200 dark:border-slate-700/50 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-red-400" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Delete research {selectedSubmissions.length === 1 ? 'product' : 'products'}?</h3>
            <p className="text-gray-500 dark:text-slate-400 text-sm">This action cannot be undone</p>
          </div>
        </div>
        <p className="text-gray-600 dark:text-slate-300 mb-4">
          This will permanently delete {selectedSubmissions.length} research {selectedSubmissions.length === 1 ? 'product' : 'products'} and everything attached to {selectedSubmissions.length === 1 ? 'it' : 'them'}:
        </p>
        <ul className="text-gray-600 dark:text-slate-300 text-sm list-disc list-inside mb-6 space-y-1">
          <li>Vetting Score and Competitor Data</li>
          <li>Review Insights and All SSPs</li>
          <li>Supplier Quotes and Sourcing Data</li>
        </ul>
        <div className="flex justify-end gap-3">
          <button
            onClick={() => setIsDeleteConfirmOpen(false)}
            disabled={isDeleting}
            className="px-4 py-2 bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 rounded-lg text-gray-900 dark:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={deleteSelectedProducts}
            disabled={isDeleting}
            className="p-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 hover:border-red-500/70 rounded-lg text-red-400 hover:text-red-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Delete selected"
          >
            {isDeleting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  )

  const modalOfferConfirm = isOfferConfirmOpen && offerConfirmProduct && (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl p-6 max-w-md w-full border border-gray-200 dark:border-slate-700/50 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center">
            <Package className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Go to Offer Builder</h3>
            <p className="text-gray-500 dark:text-slate-400 text-sm">Build your product offer</p>
          </div>
        </div>
        <p className="text-gray-600 dark:text-slate-300 mb-6">
          You are about to open the Offer Builder for <span className="font-semibold text-gray-900 dark:text-white">{offerConfirmProduct.title}</span>. This will allow you to analyze reviews and create your SSP.
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={() => {
              setIsOfferConfirmOpen(false);
              setOfferConfirmProduct(null);
            }}
            className="px-4 py-2 bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 rounded-lg text-gray-900 dark:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={confirmOfferNavigation}
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 rounded-lg text-white transition-colors flex items-center gap-2"
          >
            <ArrowRight className="w-4 h-4" />
            Open Offer Builder
          </button>
        </div>
      </div>
    </div>
  )

  const modalSourcingConfirm = isSourcingConfirmOpen && sourcingConfirmProduct && (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl p-6 max-w-md w-full border border-gray-200 dark:border-slate-700/50 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-teal-500/20 rounded-xl flex items-center justify-center">
            <ShoppingCart className="w-6 h-6 text-teal-400" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Go to Sourcing</h3>
            <p className="text-gray-500 dark:text-slate-400 text-sm">Find suppliers for your product</p>
          </div>
        </div>
        <p className="text-gray-600 dark:text-slate-300 mb-6">
          You are about to open the Sourcing page for <span className="font-semibold text-gray-900 dark:text-white">{sourcingConfirmProduct.title}</span>. This will allow you to find and manage suppliers.
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={() => {
              setIsSourcingConfirmOpen(false);
              setSourcingConfirmProduct(null);
            }}
            className="px-4 py-2 bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 rounded-lg text-gray-900 dark:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={confirmSourcingNavigation}
            className="px-4 py-2 bg-teal-500 hover:bg-teal-600 rounded-lg text-white transition-colors flex items-center gap-2"
          >
            <ArrowRight className="w-4 h-4" />
            Open Sourcing
          </button>
        </div>
      </div>
    </div>
  )
  
  return (
    <>
      <div className="bg-white/90 dark:bg-slate-800/30 backdrop-blur-xl rounded-2xl border border-gray-200 dark:border-slate-700/50 overflow-hidden shadow-lg">
        {/* Modern Tab Navigation */}
        <div className="flex border-b border-gray-200 dark:border-slate-700/50 bg-gray-50 dark:bg-slate-800/50">
          <button
            onClick={() => handleTabChange('submissions')}
            className={`px-6 py-4 font-medium transition-all relative ${
              activeTab === 'submissions'
                ? 'text-gray-900 dark:text-white'
                : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <span className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              My Research Funnel
            </span>
            {activeTab === 'submissions' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 to-emerald-500"></div>
            )}
          </button>
          <button
            onClick={() => {
              handleTabChange('new');
              // Smooth scroll to the "Keep Building..." section after a short delay
              setTimeout(() => {
                const element = document.getElementById('keep-building-section');
                if (element) {
                  element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
              }, 100);
            }}
            className={`px-6 py-4 font-medium transition-all relative ${
              activeTab === 'new'
                ? 'text-gray-900 dark:text-white'
                : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <span className="flex items-center gap-2" id="keep-building-section" >
              <Plus className="w-4 h-4" />
              Fill My Funnel
            </span>
            {activeTab === 'new' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 to-emerald-500"></div>
            )}
          </button>
        </div>
        <div className="p-6">
          {activeTabMarkup}
          {newTabMarkup}
        </div>
      </div>
      {/* Modals rendered outside main container to avoid overflow issues */}
      {modalVetSelectedProducts}
      {modalDeleteConfirm}
      {modalOfferConfirm}
      {modalSourcingConfirm}
      <ConfirmModal
        isOpen={tagRemoveConfirm !== null}
        title="Remove tag"
        message={
          tagRemoveConfirm
            ? `Remove the "${tagRemoveConfirm.tag?.name}" tag from this product? You can always add it back later.`
            : ''
        }
        confirmLabel="Remove tag"
        tone="destructive"
        onConfirm={confirmTagRemove}
        onClose={() => setTagRemoveConfirm(null)}
      />
      <TagManagerModal
        open={isTagManagerOpen}
        onClose={() => setIsTagManagerOpen(false)}
        tags={userTags}
        onRefresh={async () => {
          await refreshUserTags();
          await fetchSubmissions();
        }}
      />
      <BulkTagPicker
        anchorRef={
          bulkPickerMode === 'add'
            ? (bulkAddTagAnchorRef as React.RefObject<HTMLElement>)
            : (bulkRemoveTagAnchorRef as React.RefObject<HTMLElement>)
        }
        researchProductIds={selectedSubmissions}
        allTags={userTags}
        // Only the tags actually attached to the selection are valid
        // targets for bulk-remove. Compute the union so the picker
        // shows the right shortlist (and "no tags" state when empty).
        restrictTo={(() => {
          if (bulkPickerMode !== 'remove') return undefined;
          const seen = new Map<string, any>();
          for (const id of selectedSubmissions) {
            const row = Array.isArray(submissions)
              ? submissions.find((s: any) => s.id === id)
              : null;
            for (const t of row?.tags ?? []) {
              if (t?.id && !seen.has(t.id)) seen.set(t.id, t);
            }
          }
          return Array.from(seen.values());
        })()}
        mode={bulkPickerMode === 'remove' ? 'remove' : 'add'}
        open={bulkPickerMode !== null}
        onClose={() => setBulkPickerMode(null)}
        onAfter={async ({ tag, action }) => {
          // Optimistic local update — no refetch, no scroll reset.
          setSubmissions((prev: any) => {
            if (!Array.isArray(prev)) return prev;
            const ids = new Set(selectedSubmissions);
            return prev.map((row: any) => {
              if (!ids.has(row.id)) return row;
              const existing = Array.isArray(row.tags) ? row.tags : [];
              if (action === 'add') {
                if (existing.some((t: any) => t.id === tag.id)) return row;
                return { ...row, tags: [...existing, tag] };
              }
              return { ...row, tags: existing.filter((t: any) => t.id !== tag.id) };
            });
          });
          // Keep the user's master tag list fresh in case 'add' created
          // a brand-new tag. Background only — no UI reset.
          void refreshUserTags();
          setSelectedSubmissions([]);
        }}
      />
    </>
  );
};

export default Table;