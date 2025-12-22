import { Loader2, AlertCircle, Search, Trash2, ChevronLeft, ChevronRight, Package, TrendingUp, BarChart3, DollarSign, ShoppingCart, Eye, Share2, ArrowRight, FileText, Plus, Columns, X } from "lucide-react";
import Link from "next/link";
import { formatDate } from "@/utils/formatDate";
import { getScoreColor, getStatusColor } from "@/utils/submissions";
import { useSelector } from "react-redux";
import { RootState } from "@/store";
import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabaseClient";
import { useRouter } from "next/navigation";
import ResearchIcon from "./Icons/ResearchIcon";
import VettedIcon from "./Icons/VettedIcon";
import OffersIcon from "./Icons/OfferIcon";
import SourcedIcon from "./Icons/SourcedIcon";
import { CsvUploadResearch } from "./Upload/CsvUploadResearch";

const Table = ({ setUpdateProducts }: { setUpdateProducts: (update: boolean) => void }) => {
  const { user } = useSelector((state: RootState) => state.auth);

  const router = useRouter();
  const [activeTab, setActiveTab] = useState('submissions');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  
  // Sorting state
  const [sortField, setSortField] = useState('asin');
  const [sortDirection, setSortDirection] = useState('desc');
  
  // Selection state
  const [selectedSubmissions, setSelectedSubmissions] = useState<string[]>([]);
  const [deleteConfirmSubmission, setDeleteConfirmSubmission] = useState<{id: string, name: string} | null>(null);
  
  // Column visibility state
  const [isColumnMenuOpen, setIsColumnMenuOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    asin: true,
    title: true,
    category: true,
    brand: true,
    progress: true,
    price: false,
    monthlyRevenue: false,
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
  });

  const [isVetSelectedProductsModalOpen, setIsVetSelectedProductsModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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

  // Filter submissions based on search term
  const getFilteredSubmissions = () => {
    if (!searchTerm) return submissions;
    
    return submissions.filter(submission => {
      const searchLower = searchTerm.toLowerCase();
      return (
        submission.title?.toLowerCase().includes(searchLower) ||
        submission.asin?.toLowerCase().includes(searchLower)
      );
    });
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
      
      // Convert to numbers if possible for proper sorting
      const aNum = typeof aValue === 'string' && !isNaN(Number(aValue)) ? Number(aValue) : aValue;
      const bNum = typeof bValue === 'string' && !isNaN(Number(bValue)) ? Number(bValue) : bValue;
      
      if (sortDirection === 'desc') {
        if (aNum < bNum) {
          return -1;
        } else if (aNum > bNum) {
          return 1;
        } else {
          return 0;
        }
      } else {
        if (aNum < bNum) {
          return 1;
        } else if (aNum > bNum) {
          return -1;
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
  const toggleColumnVisibility = (columnKey: string) => {
    setVisibleColumns(prev => ({
      ...prev,
      [columnKey]: !prev[columnKey]
    }));
  };

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
        return extraData.reviews || extraData.Reviews || extraData.review_count || null;
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
      router.push(`/dashboard?tab=new&productName=${encodedTitle}&researchProductId=${encodedProductId}`);
    } catch (error) {
      console.error('Error vetting products:', error);
      setError(error instanceof Error ? error.message : 'Failed to process vet action');
    }
  };

  const handleVetSelectedProducts = async (submissionId: string) => {
    toggleSubmissionSelection(submissionId);
    setIsVetSelectedProductsModalOpen(true);
  }

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
      <p className="text-slate-400">Loading your products...</p>
    </div>
  );

  const errorMarkup = error && (
    <div className="flex flex-col items-center justify-center py-16">
      <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
      <p className="text-slate-300 mb-2">Failed to load submissions</p>
      <p className="text-slate-400 mb-4">{error}</p>
      <button
        onClick={fetchSubmissions}
        className="px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg text-white transition-colors"
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
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Search products..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50"
          />
        </div>
        <div className="flex items-center gap-2">
          {/* Column Visibility Toggle */}
          <div className="relative">
            <button
              onClick={() => setIsColumnMenuOpen(!isColumnMenuOpen)}
              className="px-4 py-2 bg-slate-700/50 hover:bg-slate-700 border border-slate-600/50 rounded-lg text-slate-300 transition-colors flex items-center gap-2"
            >
              <Columns className="w-4 h-4" />
              Columns
            </button>
            
            {isColumnMenuOpen && (
              <>
                <div 
                  className="fixed inset-0 z-10" 
                  onClick={() => setIsColumnMenuOpen(false)}
                />
                <div className="absolute right-0 top-full mt-2 bg-slate-800 border border-slate-700 rounded-lg shadow-xl p-4 z-20 min-w-[280px] max-h-[500px] overflow-y-auto">
                  <div className="flex items-center justify-between mb-3">
                    <div className="font-medium text-white text-sm">Toggle Columns</div>
                    <button
                      onClick={() => setIsColumnMenuOpen(false)}
                      className="text-slate-400 hover:text-white transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="space-y-2">
                    {[
                      { key: 'price', label: 'Price' },
                      { key: 'monthlyRevenue', label: 'Monthly Revenue' },
                      { key: 'monthlyUnitsSold', label: 'Monthly Units Sold' },
                      { key: 'bsr', label: 'BSR' },
                      { key: 'rating', label: 'Rating' },
                      { key: 'review', label: 'Review' },
                      { key: 'weight', label: 'Weight' },
                      { key: 'netPrice', label: 'Net Price' },
                      { key: 'sizeTier', label: 'Size Tier' },
                      { key: 'priceTrend', label: 'Price Trend' },
                      { key: 'salesTrend', label: 'Sales Trend' },
                      { key: 'fulfilledBy', label: 'Fulfilled By' },
                      { key: 'activeSellers', label: 'Active Sellers' },
                      { key: 'lastYearSales', label: 'Last Year Sales' },
                      { key: 'variationCount', label: 'Variation Count' },
                      { key: 'numberOfImages', label: 'Number of Images' },
                      { key: 'salesToReviews', label: 'Sales to Reviews' },
                      { key: 'bestSalesPeriod', label: 'Best Sales Period' },
                      { key: 'parentLevelSales', label: 'Parent Level Sales' },
                      { key: 'parentLevelRevenue', label: 'Parent Level Revenue' },
                      { key: 'salesYearOverYear', label: 'Sales Year Over Year' },
                    ].map(column => (
                      <label
                        key={column.key}
                        className="flex items-center gap-2 cursor-pointer hover:bg-slate-700/30 p-2 rounded transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={visibleColumns[column.key] || false}
                          onChange={() => toggleColumnVisibility(column.key)}
                          className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="text-sm text-slate-300">{column.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
          
          {selectedSubmissions.length > 0 && (
            <>
              <div className="relative inline-block">
                <div 
                  className="relative group"
                  onMouseEnter={(e) => {
                    if (selectedSubmissions.length > 1) {
                      const tooltip = e.currentTarget.querySelector('.vet-disabled-tooltip') as HTMLElement;
                      if (tooltip) {
                        tooltip.classList.remove('opacity-0', 'invisible');
                        tooltip.classList.add('opacity-100', 'visible');
                      }
                    }
                  }}
                  onMouseLeave={(e) => {
                    const tooltip = e.currentTarget.querySelector('.vet-disabled-tooltip') as HTMLElement;
                    if (tooltip) {
                      tooltip.classList.remove('opacity-100', 'visible');
                      tooltip.classList.add('opacity-0', 'invisible');
                    }
                  }}
                >
                  <button
                    onClick={() => {
                      if (selectedSubmissions.length === 1) {
                        setIsVetSelectedProductsModalOpen(true);
                      }
                    }}
                    disabled={selectedSubmissions.length > 1}
                    className={`px-4 py-2 border rounded-lg transition-colors flex items-center gap-2 ${
                      selectedSubmissions.length > 1
                        ? 'bg-slate-700/30 border-slate-600/30 text-slate-500 cursor-not-allowed'
                        : 'bg-slate-700/50 hover:bg-slate-700 border-slate-600/50 text-slate-300'
                    }`}
                  >
                    <VettedIcon />
                    Vet
                  </button>
                  {selectedSubmissions.length > 1 && (
                    <div className="vet-disabled-tooltip absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1 px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl text-white text-xs leading-relaxed w-[350px] opacity-0 invisible transition-all duration-200 pointer-events-none z-[10000] whitespace-normal">
                      <div className="font-medium mb-1 text-white">Cannot vet multiple products</div>
                      <div className="text-slate-300">You can only vet one product at a time. Select a single product to continue.</div>
                      <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-px border-4 border-transparent border-t-slate-900"></div>
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={() => setIsDeleteConfirmOpen(true)}
                className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 hover:border-red-500/70 rounded-lg text-red-400 hover:text-red-300 transition-colors flex items-center gap-2"
                title="Remove selected products"
              >
                <X className="w-4 h-4" />
                Remove ({selectedSubmissions.length})
              </button>
            </>
          )}
        </div>
      </div>
      
      {/* Modern Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-700/50">
              <th className="text-left p-4">
                <input 
                  type="checkbox" 
                  className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-2 focus:ring-blue-500"
                  checked={getPaginatedSubmissions().every(sub => selectedSubmissions.includes(sub.id)) && getPaginatedSubmissions().length > 0}
                  onChange={selectAllCurrentPage}
                />
              </th>
              <th 
                className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                onClick={() => handleSortChange('asin')}
              >
                <div className="flex items-center gap-1">
                  ASIN
                  {sortField === 'asin' && (
                    <span className="text-blue-400">{sortDirection === 'desc' ? '↓' : '↑'}</span>
                  )}
                </div>
              </th>
              <th className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">
                Title
              </th>
              <th 
                className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                onClick={() => handleSortChange('category')}
              >
                <div className="flex items-center gap-1">
                  Category
                  {sortField === 'category' && (
                    <span className="text-blue-400">{sortDirection === 'desc' ? '↓' : '↑'}</span>
                  )}
                </div>
              </th>
              <th 
                className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                onClick={() => handleSortChange('brand')}
              >
                <div className="flex items-center gap-1">
                  Brand
                  {sortField === 'brand' && (
                    <span className="text-blue-400">{sortDirection === 'desc' ? '↓' : '↑'}</span>
                  )}
                </div>
              </th>
              {visibleColumns.price && (
                <th 
                  className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                  onClick={() => handleSortChange('price')}
                >
                  <div className="flex items-center gap-1">
                    Price
                    {sortField === 'price' && (
                      <span className="text-blue-400">{sortDirection === 'desc' ? '↓' : '↑'}</span>
                    )}
                  </div>
                </th>
              )}
              {visibleColumns.monthlyRevenue && (
                <th 
                  className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                  onClick={() => handleSortChange('monthly_revenue')}
                >
                  <div className="flex items-center gap-1">
                    Monthly Revenue
                    {sortField === 'monthly_revenue' && (
                      <span className="text-blue-400">{sortDirection === 'desc' ? '↓' : '↑'}</span>
                    )}
                  </div>
                </th>
              )}
              {visibleColumns.monthlyUnitsSold && (
                <th 
                  className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                  onClick={() => handleSortChange('monthly_units_sold')}
                >
                  <div className="flex items-center gap-1">
                    Monthly Units Sold
                    {sortField === 'monthly_units_sold' && (
                      <span className="text-blue-400">{sortDirection === 'desc' ? '↓' : '↑'}</span>
                    )}
                  </div>
                </th>
              )}
              {visibleColumns.bsr && (
                <th 
                  className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                  onClick={() => handleSortChange('bsr')}
                >
                  <div className="flex items-center gap-1">
                    BSR
                    {sortField === 'bsr' && (
                      <span className="text-blue-400">{sortDirection === 'desc' ? '↓' : '↑'}</span>
                    )}
                  </div>
                </th>
              )}
              {visibleColumns.rating && (
                <th 
                  className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                  onClick={() => handleSortChange('rating')}
                >
                  <div className="flex items-center gap-1">
                    Rating
                    {sortField === 'rating' && (
                      <span className="text-blue-400">{sortDirection === 'desc' ? '↓' : '↑'}</span>
                    )}
                  </div>
                </th>
              )}
              {visibleColumns.review && (
                <th 
                  className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                  onClick={() => handleSortChange('review')}
                >
                  <div className="flex items-center gap-1">
                    Review
                    {sortField === 'review' && (
                      <span className="text-blue-400">{sortDirection === 'desc' ? '↓' : '↑'}</span>
                    )}
                  </div>
                </th>
              )}
              {visibleColumns.weight && (
                <th 
                  className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                  onClick={() => handleSortChange('weight')}
                >
                  <div className="flex items-center gap-1">
                    Weight
                    {sortField === 'weight' && (
                      <span className="text-blue-400">{sortDirection === 'desc' ? '↓' : '↑'}</span>
                    )}
                  </div>
                </th>
              )}
              {visibleColumns.netPrice && (
                <th className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Net Price
                </th>
              )}
              {visibleColumns.sizeTier && (
                <th className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Size Tier
                </th>
              )}
              {visibleColumns.priceTrend && (
                <th className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Price Trend
                </th>
              )}
              {visibleColumns.salesTrend && (
                <th className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Sales Trend
                </th>
              )}
              {visibleColumns.fulfilledBy && (
                <th className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Fulfilled By
                </th>
              )}
              {visibleColumns.activeSellers && (
                <th className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Active Sellers
                </th>
              )}
              {visibleColumns.lastYearSales && (
                <th className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Last Year Sales
                </th>
              )}
              {visibleColumns.variationCount && (
                <th className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Variation Count
                </th>
              )}
              {visibleColumns.numberOfImages && (
                <th className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Number of Images
                </th>
              )}
              {visibleColumns.salesToReviews && (
                <th className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Sales to Reviews
                </th>
              )}
              {visibleColumns.bestSalesPeriod && (
                <th className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Best Sales Period
                </th>
              )}
              {visibleColumns.parentLevelSales && (
                <th className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Parent Level Sales
                </th>
              )}
              {visibleColumns.parentLevelRevenue && (
                <th className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Parent Level Revenue
                </th>
              )}
              {visibleColumns.salesYearOverYear && (
                <th className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Sales Year Over Year
                </th>
              )}
              <th 
                className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                onClick={() => handleSortChange('progress')}
              >
                <div className="flex items-center gap-1">
                  Progress
                  {sortField === 'progress' && (
                    <span className="text-blue-400">{sortDirection === 'desc' ? '↓' : '↑'}</span>
                  )}
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/30">
            {getPaginatedSubmissions().map((submission: any) => (
              <tr 
                key={submission.id} 
                className="hover:bg-slate-700/20 transition-colors"
              >
                <td className="p-4">
                  <input 
                    type="checkbox" 
                    className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-2 focus:ring-blue-500"
                    checked={selectedSubmissions.includes(submission.id)}
                    onChange={() => toggleSubmissionSelection(submission.id)}
                  />
                </td>
                <td className="p-4 text-sm">
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
                    <span className="text-slate-300">N/A</span>
                  )}
                </td>
                <td className="p-4">
                  <div>
                    <p className="text-sm font-medium text-white">
                      {submission.productName || submission.title || 'Untitled'}
                    </p>
                  </div>
                </td>
                <td className="p-4">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-white">
                        {submission.category || 'N/A'}
                      </p>
                  </div>
                </td>
                <td className="p-4">
                  <p className="text-sm font-medium text-white">
                    {submission.brand || 'N/A'}
                  </p>
                </td>
                {visibleColumns.price && (
                  <td className="p-4 text-sm text-slate-300">
                    {formatColumnValue(getColumnValue(submission, 'price'), 'price')}
                  </td>
                )}
                {visibleColumns.monthlyRevenue && (
                  <td className="p-4 text-sm text-slate-300">
                    {formatColumnValue(getColumnValue(submission, 'monthlyRevenue'), 'monthlyRevenue')}
                  </td>
                )}
                {visibleColumns.monthlyUnitsSold && (
                  <td className="p-4 text-sm text-slate-300">
                    {formatColumnValue(getColumnValue(submission, 'monthlyUnitsSold'), 'monthlyUnitsSold')}
                  </td>
                )}
                {visibleColumns.bsr && (
                  <td className="p-4 text-sm text-slate-300">
                    {formatColumnValue(getColumnValue(submission, 'bsr'), 'bsr')}
                  </td>
                )}
                {visibleColumns.rating && (
                  <td className="p-4 text-sm text-slate-300">
                    {formatColumnValue(getColumnValue(submission, 'rating'), 'rating')}
                  </td>
                )}
                {visibleColumns.review && (
                  <td className="p-4 text-sm text-slate-300">
                    {formatColumnValue(getColumnValue(submission, 'review'), 'review')}
                  </td>
                )}
                {visibleColumns.weight && (
                  <td className="p-4 text-sm text-slate-300">
                    {formatColumnValue(getColumnValue(submission, 'weight'), 'weight')}
                  </td>
                )}
                {visibleColumns.netPrice && (
                  <td className="p-4 text-sm text-slate-300">
                    {formatColumnValue(getColumnValue(submission, 'netPrice'), 'netPrice')}
                  </td>
                )}
                {visibleColumns.sizeTier && (
                  <td className="p-4 text-sm text-slate-300">
                    {formatColumnValue(getColumnValue(submission, 'sizeTier'), 'sizeTier')}
                  </td>
                )}
                {visibleColumns.priceTrend && (
                  <td className="p-4 text-sm text-slate-300">
                    {formatColumnValue(getColumnValue(submission, 'priceTrend'), 'priceTrend')}
                  </td>
                )}
                {visibleColumns.salesTrend && (
                  <td className="p-4 text-sm text-slate-300">
                    {formatColumnValue(getColumnValue(submission, 'salesTrend'), 'salesTrend')}
                  </td>
                )}
                {visibleColumns.fulfilledBy && (
                  <td className="p-4 text-sm text-slate-300">
                    {formatColumnValue(getColumnValue(submission, 'fulfilledBy'), 'fulfilledBy')}
                  </td>
                )}
                {visibleColumns.activeSellers && (
                  <td className="p-4 text-sm text-slate-300">
                    {formatColumnValue(getColumnValue(submission, 'activeSellers'), 'activeSellers')}
                  </td>
                )}
                {visibleColumns.lastYearSales && (
                  <td className="p-4 text-sm text-slate-300">
                    {formatColumnValue(getColumnValue(submission, 'lastYearSales'), 'lastYearSales')}
                  </td>
                )}
                {visibleColumns.variationCount && (
                  <td className="p-4 text-sm text-slate-300">
                    {formatColumnValue(getColumnValue(submission, 'variationCount'), 'variationCount')}
                  </td>
                )}
                {visibleColumns.numberOfImages && (
                  <td className="p-4 text-sm text-slate-300">
                    {formatColumnValue(getColumnValue(submission, 'numberOfImages'), 'numberOfImages')}
                  </td>
                )}
                {visibleColumns.salesToReviews && (
                  <td className="p-4 text-sm text-slate-300">
                    {formatColumnValue(getColumnValue(submission, 'salesToReviews'), 'salesToReviews')}
                  </td>
                )}
                {visibleColumns.bestSalesPeriod && (
                  <td className="p-4 text-sm text-slate-300">
                    {formatColumnValue(getColumnValue(submission, 'bestSalesPeriod'), 'bestSalesPeriod')}
                  </td>
                )}
                {visibleColumns.parentLevelSales && (
                  <td className="p-4 text-sm text-slate-300">
                    {formatColumnValue(getColumnValue(submission, 'parentLevelSales'), 'parentLevelSales')}
                  </td>
                )}
                {visibleColumns.parentLevelRevenue && (
                  <td className="p-4 text-sm text-slate-300">
                    {formatColumnValue(getColumnValue(submission, 'parentLevelRevenue'), 'parentLevelRevenue')}
                  </td>
                )}
                {visibleColumns.salesYearOverYear && (
                  <td className="p-4 text-sm text-slate-300">
                    {formatColumnValue(getColumnValue(submission, 'salesYearOverYear'), 'salesYearOverYear')}
                  </td>
                )}
                <td className="p-4">
                  <div className="flex items-center gap-2">
                    <ResearchIcon />
                    {!submission.is_vetted ? (
                      <button onClick={() => handleVetSelectedProducts(submission.id)}><VettedIcon isDisabled /></button>
                    ) : (
                      <VettedIcon />
                    )}
                    <OffersIcon isDisabled={!submission.is_offered} />
                    <SourcedIcon isDisabled={!submission.is_sourced} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* Pagination */}
      {getFilteredSubmissions().length > 0 && (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pt-4">
          <div className="flex items-center gap-4">
            <p className="text-sm text-slate-400">
              Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, getFilteredSubmissions().length)} of {getFilteredSubmissions().length} results
            </p>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-400">Show:</span>
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1); // Reset to first page when changing items per page
                }}
                className="px-3 py-1.5 bg-slate-700/50 border border-slate-600/50 rounded-lg text-sm text-slate-300 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 cursor-pointer"
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
                className="p-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4 text-slate-400" />
              </button>
              <span className="px-3 py-1 text-sm text-slate-300">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="p-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )

  const markupEmptyTable = !loading && !error && submissions.length === 0 && (
    <div className="text-center py-16">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-700/50 mb-4">
        <Package className="w-8 h-8 text-slate-500" />
      </div>
      <h3 className="text-xl font-semibold text-white mb-2">Every Great Brand Starts With One Product 🌱</h3>
      <p className="text-slate-400 mb-6">
      Upload your researched products to plant the first seeds of your brand and begin growing your freedom.</p>
      <button
        onClick={() => setActiveTab('new')}
        className="px-6 py-3 bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 rounded-lg text-white font-medium transition-all transform hover:scale-105"
      >
        <span className="flex items-center gap-2">
          Fill My Funnel
          <ArrowRight className="w-5 h-5" />
        </span>
      </button>
    </div>
  )

  const activeTabMarkup = activeTab === 'submissions' && (
    <>
      {loadingMarkup}
      {errorMarkup}
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
        <h3 className="text-3xl font-bold text-white mb-4">Every Great Brand Starts With One Product 🌱</h3>
        <p className="text-xl text-slate-300 mb-8 max-w-2xl mx-auto">
          Upload your researched products to plant the first seeds of your brand and begin growing your freedom.
        </p>
      </div>

      {/* Upload Component */}
      <div className="mx-auto">
        <CsvUploadResearch userId={user.id} setActiveTab={setActiveTab} onSubmit={fetchSubmissions} />
      </div>

    </div>
  );

  
  const modalVetSelectedProducts = isVetSelectedProductsModalOpen && (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl p-6 max-w-md w-full border border-slate-700/50">
        <h3 className="text-xl font-semibold text-white mb-2">Confirm Vetting</h3>
        <p className="text-slate-300 mb-6">
          Are you sure you want to vet selected product? This action cannot be undone.
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={() => setIsVetSelectedProductsModalOpen(false)}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={vetSelectedProducts}
            className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded-lg text-white transition-colors"
          >
            Vet
          </button>
        </div>
      </div>
    </div>
  )

  const modalDeleteConfirm = isDeleteConfirmOpen && (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl p-6 max-w-md w-full border border-slate-700/50">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-red-400" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-white">Delete Products</h3>
            <p className="text-slate-400 text-sm">This action cannot be undone</p>
          </div>
        </div>
        <p className="text-slate-300 mb-6">
          Are you sure you want to delete {selectedSubmissions.length} selected {selectedSubmissions.length === 1 ? 'product' : 'products'}? All data including competitor analysis and insights will be permanently removed.
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={() => setIsDeleteConfirmOpen(false)}
            disabled={isDeleting}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={deleteSelectedProducts}
            disabled={isDeleting}
            className="px-4 py-2 bg-red-500 hover:bg-red-600 rounded-lg text-white transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                Delete
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
  
  return (
    <div className="bg-slate-800/30 backdrop-blur-xl rounded-2xl border border-slate-700/50 overflow-hidden">
      {/* Modern Tab Navigation */}
      <div className="flex border-b border-slate-700/50 bg-slate-800/50">
        <button
          onClick={() => setActiveTab('submissions')}
          className={`px-6 py-4 font-medium transition-all relative ${
            activeTab === 'submissions'
              ? 'text-white'
              : 'text-slate-400 hover:text-white'
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
            setActiveTab('new');
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
              ? 'text-white'
              : 'text-slate-400 hover:text-white'
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
      {modalVetSelectedProducts}
      {modalDeleteConfirm}
    </div>
  );
};

export default Table;