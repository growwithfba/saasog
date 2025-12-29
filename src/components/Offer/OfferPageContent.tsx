'use client';

import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { supabase } from '@/utils/supabaseClient';
import { Loader2, AlertCircle, Package, FileText, Sparkles, Search, X, Download, CheckCircle, Info } from 'lucide-react';
import { ProductInfoTab } from './tabs/ProductInfoTab';
import { ReviewAggregatorTab } from './tabs/ReviewAggregatorTab';
import { SspBuilderHubTab } from './tabs/SspBuilderHubTab';
import { OfferGlobalActions } from './OfferGlobalActions';
import type { OfferData } from './types';

export function OfferPageContent() {
  const { user } = useSelector((state: RootState) => state.auth);
  const [vettedProducts, setVettedProducts] = useState<any[]>([]);
  const [activeProductId, setActiveProductId] = useState<string | null>(null);
  const [activeProductData, setActiveProductData] = useState<any>(null);
  const [offerData, setOfferData] = useState<Record<string, OfferData>>({});
  const [storedReviewsCount, setStoredReviewsCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'product-info' | 'review-aggregator' | 'ssp-builder'>('product-info');
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [isReviewsDirty, setIsReviewsDirty] = useState(false);
  const [isSspDirty, setIsSspDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPushingToSourcing, setIsPushingToSourcing] = useState(false);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [hasStoredInsights, setHasStoredInsights] = useState(false);
  const [hasStoredImprovements, setHasStoredImprovements] = useState(false);

  const isDirty = isReviewsDirty || isSspDirty;
  const canPushToSourcing = hasStoredInsights && hasStoredImprovements;

  // Warn user about unsaved changes before leaving
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // Fetch vetted products
  useEffect(() => {
    const fetchVettedProducts = async () => {
      if (!user) return;

      try {
        setLoading(true);
        setError(null);

        const { data: { session } } = await supabase.auth.getSession();

        // Fetch from submissions table (same source as Vetting dashboard)
        const submissionsResponse = await fetch(`/api/analyze?userId=${user.id}`, {
          headers: {
            ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` })
          },
          credentials: 'include'
        });

        // Also fetch from research_products table for products marked as vetted
        const researchResponse = await fetch('/api/research', {
          headers: {
            ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` })
          },
          credentials: 'include'
        });

        const allProducts: any[] = [];

        // Process submissions (analyzed products are considered vetted)
        if (submissionsResponse.ok) {
          const submissionsData = await submissionsResponse.json();
          if (submissionsData.success && submissionsData.submissions) {
            const vettedSubmissions = submissionsData.submissions.map((sub: any) => ({
              id: sub.id,
              asin: sub.productData?.competitors?.[0]?.asin || 'N/A',
              title: sub.productName || sub.title || 'Untitled Product',
              category: sub.productData?.competitors?.[0]?.category || null,
              brand: sub.productData?.competitors?.[0]?.brand || null,
              score: sub.score,
              status: sub.status,
              productData: sub.productData,
              keepaResults: sub.keepaResults || [],
              marketScore: sub.marketScore || { score: sub.score, status: sub.status },
              metrics: sub.metrics || {},
              is_vetted: true,
              is_offered: false,
              is_sourced: false,
              research_product_id: sub.research_product_id,
              source: 'submissions'
            }));
            allProducts.push(...vettedSubmissions);
          }
        }

        // Process research_products
        if (researchResponse.ok) {
          const researchData = await researchResponse.json();
          if (researchData.success && researchData.data) {
            const vettedResearch = researchData.data
              .filter((p: any) => p.is_vetted === true)
              .map((p: any) => ({
                ...p,
                source: 'research_products'
              }));
            allProducts.push(...vettedResearch);
          }
        }

        // Remove duplicates
        const uniqueProducts = allProducts.reduce((acc: any[], product: any) => {
          const existing = acc.find(p => p.id === product.id);
          if (!existing) {
            acc.push(product);
          } else if (product.source === 'submissions') {
            const index = acc.indexOf(existing);
            acc[index] = product;
          }
          return acc;
        }, []);

        setVettedProducts(uniqueProducts);
        
        // Load offer data for all products
        const loadedData: Record<string, OfferData> = {};
        for (const product of uniqueProducts) {
          loadedData[product.id] = getDefaultOfferData(product.id);
        }
        setOfferData(loadedData);
      } catch (error) {
        console.error('Error fetching vetted products:', error);
        setError(error instanceof Error ? error.message : 'Failed to load products');
      } finally {
        setLoading(false);
      }
    };

    fetchVettedProducts();
  }, [user]);

  // Load product data when selection changes
  useEffect(() => {
    const loadProductData = async () => {
      if (activeProductId) {
        const product = vettedProducts.find(p => p.id === activeProductId);
        if (product) {
          setActiveProductData(product);
          // Load offer data if not already loaded
          if (!offerData[activeProductId]) {
            setOfferData(prev => ({
              ...prev,
              [activeProductId]: getDefaultOfferData(activeProductId)
            }));
          }
          
          // Fetch offer product data from API to check if reviews exist
          try {
            const { data: { session } } = await supabase.auth.getSession();
            const researchProductId = product.research_product_id || product.id;
            
            const response = await fetch(`/api/offer?productId=${researchProductId}`, {
              headers: {
                ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` })
              },
              credentials: 'include'
            });
            
            if (!response.ok) {
              setStoredReviewsCount(0);
              setHasStoredInsights(false);
              setHasStoredImprovements(false);
              return;
            }

            const result = await response.json();
            if (!result.success) {
              setStoredReviewsCount(0);
              setHasStoredInsights(false);
              setHasStoredImprovements(false);
              return;
            }

            const offerProduct = result.data?.offerProduct;
            const reviews = offerProduct?.reviews;
            setStoredReviewsCount(Array.isArray(reviews) ? reviews.length : 0);

            // Check if insights and improvements have data
            const insights = offerProduct?.insights;
            const improvements = offerProduct?.improvements;
            
            const hasInsightsData = insights && (
              insights.topLikes?.trim() || 
              insights.topDislikes?.trim() || 
              insights.importantInsights?.trim() || 
              insights.importantQuestions?.trim()
            );
            
            const hasImprovementsData = improvements && (
              improvements.quantity?.trim() || 
              improvements.functionality?.trim() || 
              improvements.quality?.trim() || 
              improvements.aesthetic?.trim() || 
              improvements.bundle?.trim()
            );
            
            setHasStoredInsights(!!hasInsightsData);
            setHasStoredImprovements(!!hasImprovementsData);

            if (!offerProduct) {
              return;
            }

            const normalizedData = mapOfferProductToOfferData(
              offerProduct,
              researchProductId || activeProductId
            );

            setOfferData(prev => {
              const current = prev[activeProductId];
              const merged = current
                ? {
                    ...current,
                    ...normalizedData,
                    reviewInsights: {
                      ...current.reviewInsights,
                      ...normalizedData.reviewInsights
                    },
                    ssp: {
                      ...current.ssp,
                      ...normalizedData.ssp
                    },
                    supplierInfo: {
                      ...current.supplierInfo,
                      ...normalizedData.supplierInfo
                    }
                  }
                : normalizedData;

              return {
                ...prev,
                [activeProductId]: merged
              };
            });
          } catch (error) {
            console.error('Error fetching offer product:', error);
            setStoredReviewsCount(0);
          }
        }
      } else {
        setActiveProductData(null);
        setStoredReviewsCount(0);
        setHasStoredInsights(false);
        setHasStoredImprovements(false);
      }
    };
    
    loadProductData();
  }, [activeProductId, vettedProducts]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.autocomplete-container')) {
        setIsDropdownOpen(false);
        setHighlightedIndex(-1);
        if (!activeProductId && !searchQuery) {
          setIsSearchMode(false);
        }
      }
    };

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isDropdownOpen, activeProductId, searchQuery]);

  const currentOfferData = activeProductId ? offerData[activeProductId] : null;

  // Get default offer data structure
  const getDefaultOfferData = (productId?: string): OfferData => {
    return {
      productId: productId || activeProductId || '',
      reviewInsights: {
        topLikes: '',
        topDislikes: '',
        importantInsights: '',
        importantQuestions: ''
      },
      ssp: {
        quantity: '',
        functionality: '',
        quality: '',
        aesthetic: '',
        bundle: ''
      },
      supplierInfo: {
        supplierName: '',
        contact: '',
        fobPrice: '',
        landedCost: '',
        moq: '',
        leadTime: '',
        notes: ''
      },
      status: 'none',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  };

  const mapOfferProductToOfferData = (offerProduct: any, productId: string): OfferData => {
    const defaultData = getDefaultOfferData(productId);
    if (!offerProduct) return defaultData;

    const reviewInsights = offerProduct.reviewInsights || offerProduct.review_insights || offerProduct.insights || {};
    const ssp = offerProduct.improvements || offerProduct.ssp_data || {};

    return {
      ...defaultData,
      reviewInsights: {
        ...defaultData.reviewInsights,
        ...reviewInsights
      },
      ssp: {
        ...defaultData.ssp,
        ...ssp
      },
      status: offerProduct.status || defaultData.status,
      createdAt: offerProduct.createdAt || offerProduct.created_at || defaultData.createdAt,
      updatedAt: offerProduct.updatedAt || offerProduct.updated_at || defaultData.updatedAt
    };
  };

  // Check if offer data has any content
  const hasOfferData = (data: OfferData): boolean => {
    if (!data) return false;
    
    const ri = data.reviewInsights;
    if (ri.topLikes?.trim() || ri.topDislikes?.trim() || ri.importantInsights?.trim() || ri.importantQuestions?.trim()) {
      return true;
    }
    
    const ssp = data.ssp;
    if (ssp.quantity?.trim() || ssp.functionality?.trim() || ssp.quality?.trim() || ssp.aesthetic?.trim() || ssp.bundle?.trim()) {
      return true;
    }
    
    const si = data.supplierInfo;
    if (si.supplierName?.trim() || si.contact?.trim() || si.fobPrice?.trim() || si.landedCost?.trim() || si.moq?.trim() || si.leadTime?.trim() || si.notes?.trim()) {
      return true;
    }
    
    return false;
  };

  // Update offer data for active product
  const updateOfferData = (updates: Partial<OfferData>) => {
    if (!activeProductId) return;

    const current = offerData[activeProductId] || getDefaultOfferData(activeProductId);
    const merged: OfferData = {
      ...current,
      ...updates,
      productId: activeProductId,
      updatedAt: new Date().toISOString()
    };
    
    if (!updates.status) {
      merged.status = hasOfferData(merged) && current.status === 'none' ? 'working' : current.status;
    } else {
      merged.status = updates.status;
    }

    setOfferData(prev => ({
      ...prev,
      [activeProductId]: merged
    }));
  };

  // Filter products by name or ASIN
  const filteredProducts = vettedProducts.filter((product) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const title = (product.title || '').toLowerCase();
    const asin = (product.asin || '').toLowerCase();
    return title.includes(query) || asin.includes(query);
  });

  // Handle product selection
  const handleProductSelect = (productId: string) => {
    setActiveProductId(productId);
    setActiveTab('product-info'); // Reset to first tab when product changes
    setIsDropdownOpen(false);
    setSearchQuery('');
    setHighlightedIndex(-1);
    setIsSearchMode(false);
  };

  // Handle search input change
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    setIsSearchMode(true);
    setIsDropdownOpen(true);
    setHighlightedIndex(-1);
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isDropdownOpen && filteredProducts.length > 0) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsDropdownOpen(true);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) => 
          prev < filteredProducts.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && filteredProducts[highlightedIndex]) {
          handleProductSelect(filteredProducts[highlightedIndex].id);
        }
        break;
      case 'Escape':
        setIsDropdownOpen(false);
        setHighlightedIndex(-1);
        break;
    }
  };

  // Get display value for selected product
  const getDisplayValue = () => {
    if (!activeProductId) return '';
    const product = vettedProducts.find(p => p.id === activeProductId);
    if (!product) return '';
    return `${product.title || product.asin} (${product.asin})`;
  };

  // Clear search
  const handleClearSearch = () => {
    setSearchQuery('');
    setIsDropdownOpen(false);
    setHighlightedIndex(-1);
    setIsSearchMode(false);
  };

  // Handle clear data
  const handleClearData = async () => {
    if (!activeProductId) return;
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const productId = activeProductData?.research_product_id || activeProductId;

      // Delete from Supabase via API
      const response = await fetch(`/api/offer?productId=${productId}`, {
        method: 'DELETE',
        headers: {
          ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` })
        },
        credentials: 'include'
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Error deleting offer data:', errorData.error);
      } else {
        console.log('Offer data deleted for product:', productId);
      }
    } catch (err) {
      console.error('Error deleting offer data:', err);
    }

    // Reset local state
    const defaultData = getDefaultOfferData(activeProductId);
    setOfferData(prev => ({
      ...prev,
      [activeProductId]: defaultData
    }));
    setStoredReviewsCount(0);
    setIsReviewsDirty(false);
    setIsSspDirty(false);
    setHasStoredInsights(false);
    setHasStoredImprovements(false);
  };

  // Handle save
  const handleSave = async () => {
    if (!activeProductId || !currentOfferData || !isDirty) return;

    setIsSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      const productId = activeProductData?.research_product_id || activeProductId;

      const { error: upsertError } = await supabase
        .from('offer_products')
        .upsert(
          {
            product_id: productId,
            insights: currentOfferData.reviewInsights,
            improvements: currentOfferData.ssp,
            user_id: userId || null,
            updated_at: new Date().toISOString()
          },
          { onConflict: 'product_id' }
        );

      if (upsertError) {
        console.error('Error saving offer data:', upsertError);
      } else {
        console.log('Offer data saved for product:', productId);
        setIsReviewsDirty(false);
        setIsSspDirty(false);
        
        // Update stored data flags after successful save
        const ri = currentOfferData.reviewInsights;
        const ssp = currentOfferData.ssp;
        
        const hasInsightsData = ri && (
          ri.topLikes?.trim() || 
          ri.topDislikes?.trim() || 
          ri.importantInsights?.trim() || 
          ri.importantQuestions?.trim()
        );
        
        const hasImprovementsData = ssp && (
          ssp.quantity?.trim() || 
          ssp.functionality?.trim() || 
          ssp.quality?.trim() || 
          ssp.aesthetic?.trim() || 
          ssp.bundle?.trim()
        );
        
        setHasStoredInsights(!!hasInsightsData);
        setHasStoredImprovements(!!hasImprovementsData);
      }
    } catch (err) {
      console.error('Error saving offer data:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Download CSV template for reviews
  const downloadTemplate = () => {
    const csvContent = 'Title,Body,Rating\n';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'reviews_template.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Show modal and download template
  const handleDownloadTemplate = () => {
    setShowTemplateModal(true);
    downloadTemplate();
  };

  // Handle send to sourcing - Update is_offered to true in research_products
  const handleSendToSourcing = async () => {
    if (!activeProductId || !user) return;

    setIsPushingToSourcing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      // Get the research_product_id (from submissions) or use activeProductId directly
      const productId = activeProductData?.research_product_id || activeProductId;
      
      console.log('Updating is_offered to true for product:', productId);

      const response = await fetch('/api/research/status', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` })
        },
        credentials: 'include',
        body: JSON.stringify({
          productIds: productId,
          status: 'offered',
          value: true
        })
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          console.log('Product marked as offered successfully');
          updateOfferData({ status: 'completed' });
        } else {
          throw new Error(result.error || 'Failed to update product status');
        }
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update product status');
      }
    } catch (error) {
      console.error('Error sending to sourcing:', error);
      setError(error instanceof Error ? error.message : 'Failed to send product to sourcing');
    } finally {
      setIsPushingToSourcing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="h-12 w-12 text-blue-500 animate-spin mb-4" />
        <p className="text-slate-400">Loading your vetted products...</p>
      </div>
    );
  }

  if (error && !vettedProducts.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
        <p className="text-slate-300 mb-2">Failed to load products</p>
        <p className="text-slate-400 mb-4">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h2 className="text-3xl font-bold text-white mb-2 border-b-2 border-orange-500/50 pb-2">
          Offer Builder
        </h2>
        <p className="text-slate-400">
          Shape your winning offer with Super Selling Points. Listen to customers, craft your angle, and create a product that will truly dominate the space.
        </p>
      </div>

      {/* Product Selector - Enhanced with Autocomplete */}
      <div className="bg-gradient-to-br from-slate-800/40 via-slate-800/30 to-slate-800/40 backdrop-blur-xl rounded-2xl border-2 border-slate-600/50 shadow-lg p-6 relative">
        {/* Subtle background decoration */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/5 rounded-full blur-2xl overflow-hidden"></div>
        
        <div className="relative z-10 autocomplete-container">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-gradient-to-br from-orange-500/20 to-orange-600/20 rounded-lg flex items-center justify-center">
              <Package className="w-4 h-4 text-orange-400" strokeWidth={2} />
            </div>
            <label className="block text-base font-semibold text-white">
              Select a Vetted Product
            </label>
          </div>
          
          {/* Autocomplete Input */}
          <div className="relative">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                value={isSearchMode ? searchQuery : (activeProductId ? getDisplayValue() : '')}
                onChange={handleSearchChange}
                onKeyDown={handleKeyDown}
                onFocus={() => {
                  setIsDropdownOpen(true);
                  if (!isSearchMode) {
                    setIsSearchMode(true);
                    if (activeProductId) {
                      setSearchQuery('');
                    }
                  }
                }}
                placeholder="Search by product name or ASIN..."
                className="w-full pl-12 pr-10 py-3 bg-slate-900/70 border-2 border-slate-700/50 rounded-lg text-white font-medium focus:outline-none focus:border-orange-500/70 focus:ring-2 focus:ring-orange-500/30 transition-all duration-200 hover:border-slate-600/70"
              />
              {(isSearchMode || activeProductId) && (
                <button
                  onClick={() => {
                    if (activeProductId) {
                      setActiveProductId(null);
                      setActiveProductData(null);
                    }
                    handleClearSearch();
                  }}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                  type="button"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Dropdown Results */}
            {isDropdownOpen && filteredProducts.length > 0 && (
              <div className="absolute z-[100] w-full mt-2 bg-slate-900/95 backdrop-blur-xl border-2 border-slate-700/50 rounded-lg shadow-2xl max-h-80 overflow-y-auto">
                {filteredProducts.map((product, index) => (
                  <button
                    key={product.id}
                    onClick={() => handleProductSelect(product.id)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={`w-full text-left px-4 py-3 transition-colors ${
                      index === highlightedIndex
                        ? 'bg-orange-500/20 text-white'
                        : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                    } ${index === 0 ? 'rounded-t-lg' : ''} ${
                      index === filteredProducts.length - 1 ? 'rounded-b-lg' : 'border-b border-slate-700/30'
                    }`}
                  >
                    <div className="font-medium">{product.title || 'Untitled Product'}</div>
                    <div className="text-sm text-slate-400 mt-1">ASIN: {product.asin}</div>
                    {product.category && (
                      <div className="text-xs text-slate-500 mt-1">Category: {product.category}</div>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* No Results Message */}
            {isDropdownOpen && searchQuery && filteredProducts.length === 0 && (
              <div className="absolute z-[100] w-full mt-2 bg-slate-900/95 backdrop-blur-xl border-2 border-slate-700/50 rounded-lg shadow-2xl p-4">
                <p className="text-slate-400 text-center">No products found matching "{searchQuery}"</p>
              </div>
            )}
          </div>

          {!activeProductId && !isSearchMode && (
            <p className="text-slate-400 text-sm mt-3 flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-orange-500/50 rounded-full"></span>
              Search for a vetted product by name or ASIN to start building a killer offer.
            </p>
          )}
        </div>
      </div>

      {/* Tab Content - Only show when product is selected */}
      {activeProductId && activeProductData && (
        <div className="bg-slate-800/30 backdrop-blur-xl rounded-2xl border border-slate-700/50 overflow-hidden">
          {/* Tab Navigation */}
          <div className="flex items-center justify-between border-b border-slate-700/50 bg-slate-800/50">
            <div className="flex">
              <button
                onClick={() => setActiveTab('product-info')}
                className={`px-6 py-4 font-medium transition-all relative ${
                  activeTab === 'product-info'
                    ? 'text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  Product Info
                </span>
                {activeTab === 'product-info' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 to-emerald-500"></div>
                )}
              </button>
              <button
                onClick={() => setActiveTab('review-aggregator')}
                className={`px-6 py-4 font-medium transition-all relative ${
                  activeTab === 'review-aggregator'
                    ? 'text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Review Aggregator
                </span>
                {activeTab === 'review-aggregator' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 to-emerald-500"></div>
                )}
              </button>
              <button
                onClick={() => setActiveTab('ssp-builder')}
                className={`px-6 py-4 font-medium transition-all relative ${
                  activeTab === 'ssp-builder'
                    ? 'text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  SSP Builder Hub
                </span>
                {activeTab === 'ssp-builder' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 to-emerald-500"></div>
                )}
              </button>
            </div>
            
            {/* Download CSV Template Button */}
            <button
              onClick={handleDownloadTemplate}
              className="mr-4 px-4 py-2 flex items-center gap-2 text-sm font-medium text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-lg transition-all duration-200"
              title="Download CSV template for reviews"
            >
              <Download className="w-4 h-4" />
              Download Reviews Template
            </button>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'product-info' && (
              <ProductInfoTab productData={activeProductData} />
            )}
            {activeTab === 'review-aggregator' && (
              <ReviewAggregatorTab
                productId={activeProductData?.research_product_id}
                data={currentOfferData?.reviewInsights}
                onChange={(reviewInsights) => updateOfferData({ reviewInsights })}
                storedReviewsCount={storedReviewsCount}
                onDirtyChange={setIsReviewsDirty}
                onInsightsSaved={() => setHasStoredInsights(true)}
              />
            )}
            {activeTab === 'ssp-builder' && (
              <SspBuilderHubTab
                productId={activeProductData?.research_product_id}
                data={currentOfferData?.ssp}
                reviewInsights={currentOfferData?.reviewInsights}
                onChange={(ssp) => updateOfferData({ ssp })}
                onDirtyChange={setIsSspDirty}
                hasStoredInsights={hasStoredInsights}
                hasStoredImprovements={hasStoredImprovements}
                onImprovementsSaved={() => setHasStoredImprovements(true)}
              />
            )}
          </div>
        </div>
      )}

      {/* Global Actions - Only show when product is selected */}
      {activeProductId && (
        <OfferGlobalActions
          onSave={handleSave}
          onClear={handleClearData}
          onSendToSourcing={handleSendToSourcing}
          hasData={currentOfferData ? (currentOfferData.status !== 'none' || hasOfferData(currentOfferData)) : false}
          isDirty={isDirty}
          isSaving={isSaving}
          canPushToSourcing={canPushToSourcing}
          isPushingToSourcing={isPushingToSourcing}
        />
      )}

      {/* Unsaved Changes Modal */}
      {showUnsavedModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center px-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-xl font-bold text-white">Unsaved Changes</h3>
            <p className="text-slate-300 text-sm">
              You have unsaved changes. If you leave this page, your changes will be lost.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowUnsavedModal(false)}
                className="px-4 py-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700"
              >
                Stay
              </button>
              <button
                onClick={() => {
                  setIsReviewsDirty(false);
                  setIsSspDirty(false);
                  setShowUnsavedModal(false);
                }}
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-500"
              >
                Leave without saving
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Template Download Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center px-4">
          <div className="bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800 border-2 border-emerald-500/50 rounded-2xl shadow-2xl shadow-emerald-500/10 max-w-lg w-full p-6 space-y-5 relative overflow-hidden">
            {/* Background decoration */}
            <div className="absolute top-0 right-0 w-40 h-40 bg-emerald-500/10 rounded-full blur-3xl"></div>
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl"></div>
            
            <div className="relative z-10">
              {/* Header with success indicator */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-green-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/50">
                  <CheckCircle className="w-6 h-6 text-white" strokeWidth={2.5} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Template Downloaded!</h3>
                  <p className="text-sm text-emerald-400">Your CSV template is ready</p>
                </div>
              </div>

              {/* Info Section */}
              <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 space-y-4">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="text-white font-semibold mb-2">CSV Format Requirements</h4>
                    <p className="text-slate-400 text-sm">
                      Please follow these guidelines when filling out your reviews template:
                    </p>
                  </div>
                </div>

                {/* Requirements List */}
                <ul className="space-y-3 ml-8">
                  <li className="flex items-start gap-3">
                    <div className="w-6 h-6 bg-blue-500/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-blue-400 text-xs font-bold">1</span>
                    </div>
                    <div>
                      <span className="text-white font-medium">Required Columns</span>
                      <p className="text-slate-400 text-sm mt-0.5">
                        <code className="bg-slate-700/50 px-2 py-0.5 rounded text-emerald-400">Title</code>,{' '}
                        <code className="bg-slate-700/50 px-2 py-0.5 rounded text-emerald-400">Body</code>,{' '}
                        <code className="bg-slate-700/50 px-2 py-0.5 rounded text-emerald-400">Rating</code>
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="w-6 h-6 bg-amber-500/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-amber-400 text-xs font-bold">2</span>
                    </div>
                    <div>
                      <span className="text-white font-medium">Maximum Reviews</span>
                      <p className="text-slate-400 text-sm mt-0.5">
                        Up to <span className="text-amber-400 font-semibold">100 reviews</span> per product
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="w-6 h-6 bg-purple-500/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-purple-400 text-xs font-bold">3</span>
                    </div>
                    <div>
                      <span className="text-white font-medium">Rating Format</span>
                      <p className="text-slate-400 text-sm mt-0.5">
                        Use numbers from <span className="text-purple-400 font-semibold">1 to 5</span> stars
                      </p>
                    </div>
                  </li>
                </ul>
              </div>

              {/* Close Button */}
              <div className="flex justify-end mt-4">
                <button
                  onClick={() => setShowTemplateModal(false)}
                  className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 rounded-lg text-white font-semibold transition-all shadow-lg shadow-emerald-500/30 hover:shadow-xl hover:shadow-emerald-500/40"
                >
                  Got it!
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
