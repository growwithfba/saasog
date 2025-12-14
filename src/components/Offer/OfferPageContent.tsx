'use client';

import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { supabase } from '@/utils/supabaseClient';
import { Loader2, AlertCircle, Package, FileText, Sparkles, Search, X } from 'lucide-react';
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'product-info' | 'review-aggregator' | 'ssp-builder'>('product-info');
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isSearchMode, setIsSearchMode] = useState(false);

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
          loadedData[product.id] = loadOfferData(product.id);
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
    if (activeProductId) {
      const product = vettedProducts.find(p => p.id === activeProductId);
      if (product) {
        setActiveProductData(product);
        // Load offer data if not already loaded
        if (!offerData[activeProductId]) {
          setOfferData(prev => ({
            ...prev,
            [activeProductId]: loadOfferData(activeProductId)
          }));
        }
      }
    } else {
      setActiveProductData(null);
    }
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

  // Load offer data from localStorage (temporary - will be replaced with Supabase)
  const loadOfferData = (productId: string): OfferData => {
    try {
      const stored = localStorage.getItem(`offer_${productId}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        parsed.productId = productId;
        return parsed;
      }
    } catch (error) {
      console.error('Error loading offer data:', error);
    }
    return getDefaultOfferData(productId);
  };

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

    saveOfferData(activeProductId, merged);
  };

  // Save offer data to localStorage (temporary - will be replaced with Supabase)
  const saveOfferData = (productId: string, data: OfferData) => {
    try {
      localStorage.setItem(`offer_${productId}`, JSON.stringify(data));
    } catch (error) {
      console.error('Error saving offer data:', error);
    }
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
  const handleClearData = () => {
    if (!activeProductId) return;
    const defaultData = getDefaultOfferData(activeProductId);
    setOfferData(prev => ({
      ...prev,
      [activeProductId]: defaultData
    }));
    saveOfferData(activeProductId, defaultData);
  };

  // Handle save
  const handleSave = async () => {
    if (!activeProductId || !currentOfferData) return;
    console.log('Offer data saved for product:', activeProductId);
  };

  // Handle send to sourcing
  const handleSendToSourcing = async () => {
    if (!activeProductId || !user) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const activeProduct = vettedProducts.find(p => p.id === activeProductId);

      if (activeProduct?.source === 'submissions') {
        const asin = activeProduct.asin || 'N/A';
        const researchResponse = await fetch('/api/research', {
          headers: {
            ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` })
          },
          credentials: 'include'
        });

        if (researchResponse.ok) {
          const researchData = await researchResponse.json();
          if (researchData.success && researchData.data) {
            const existingProduct = researchData.data.find((p: any) => p.asin === asin);
            
            if (existingProduct) {
              const updateResponse = await fetch('/api/research/status', {
                method: 'PATCH',
                headers: {
                  'Content-Type': 'application/json',
                  ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` })
                },
                credentials: 'include',
                body: JSON.stringify({
                  productIds: existingProduct.id,
                  status: 'offered',
                  value: true
                })
              });

              if (updateResponse.ok) {
                const result = await updateResponse.json();
                if (result.success) {
                  updateOfferData({ status: 'completed' });
                  return;
                }
              }
            } else {
              const createResponse = await fetch('/api/research', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` })
                },
                credentials: 'include',
                body: JSON.stringify({
                  asin: asin,
                  title: activeProduct.title,
                  category: activeProduct.category,
                  brand: activeProduct.brand,
                  is_vetted: true,
                  is_offered: true,
                  is_sourced: false
                })
              });

              if (createResponse.ok) {
                const result = await createResponse.json();
                if (result.success) {
                  updateOfferData({ status: 'completed' });
                  return;
                }
              }
            }
          }
        }
      } else {
        const response = await fetch('/api/research/status', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` })
          },
          credentials: 'include',
          body: JSON.stringify({
            productIds: activeProductId,
            status: 'offered',
            value: true
          })
        });

        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            updateOfferData({ status: 'completed' });
            return;
          }
        }
      }

      updateOfferData({ status: 'completed' });
    } catch (error) {
      console.error('Error sending to sourcing:', error);
      setError('Failed to send product to sourcing');
      updateOfferData({ status: 'completed' });
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
          <div className="flex border-b border-slate-700/50 bg-slate-800/50">
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

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'product-info' && (
              <ProductInfoTab productData={activeProductData} />
            )}
            {activeTab === 'review-aggregator' && (
              <ReviewAggregatorTab
                productId={activeProductId}
                data={currentOfferData?.reviewInsights}
                onChange={(reviewInsights) => updateOfferData({ reviewInsights })}
              />
            )}
            {activeTab === 'ssp-builder' && (
              <SspBuilderHubTab
                productId={activeProductId}
                data={currentOfferData?.ssp}
                reviewInsights={currentOfferData?.reviewInsights}
                onChange={(ssp) => updateOfferData({ ssp })}
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
        />
      )}
    </div>
  );
}
