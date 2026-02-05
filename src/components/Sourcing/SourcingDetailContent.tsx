'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { useDispatch } from 'react-redux';
import { useRouter } from 'next/navigation';
import { AlertCircle, Calculator, Loader2, Users, X, ShoppingCart, CheckCircle } from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';
import { RootState } from '@/store';
import { ProductHeaderBar } from '@/components/ProductHeaderBar';
import { SupplierQuotesTab } from './tabs/SupplierQuotesTab';
import { ProfitCalculatorTab } from './tabs/ProfitCalculatorTab';
import { PlaceOrderTab } from './tabs/PlaceOrderTab';
import { SourcingHub } from './tabs/SourcingHub';
import type { SourcingData } from './types';
import { getDefaultSourcingData } from './sourcingStorage';
import { setDisplayTitle } from '@/store/productTitlesSlice';

type SourcingDetailTab = 'quotes' | 'profit' | 'placeOrder';

function hasMeaningfulSourcingData(data: SourcingData): boolean {
  if (data.supplierQuotes?.length) return true;
  const pc = data.profitCalculator;
  return !!(
    pc?.salesPrice ||
    pc?.orderQty ||
    pc?.exwUnitCost ||
    pc?.brandName?.trim() ||
    pc?.productName?.trim() ||
    pc?.htsCode?.trim()
  );
}

// Debounce hook for auto-saving
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export function SourcingDetailContent({ asin }: { asin: string }) {
  const { user } = useSelector((state: RootState) => state.auth);
  const titleByAsin = useSelector((state: RootState) => state.productTitles.byAsin);
  const router = useRouter();
  const dispatch = useDispatch();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [product, setProduct] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<SourcingDetailTab>('quotes');
  const [sourcingData, setSourcingData] = useState<SourcingData | null>(null);
  const [isPlaceOrderDirty, setIsPlaceOrderDirty] = useState(false);
  const [enableMissingInfoFilter, setEnableMissingInfoFilter] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const lastSavedRef = useRef<string>('');
  const [hasDbRecord, setHasDbRecord] = useState(false);
  const [offerSsps, setOfferSsps] = useState<Array<{ type: string; description: string }>>([]);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const allowAutoSaveRef = useRef<boolean>(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);

  // Debounce sourcing data changes for auto-save (2 seconds)
  // Only debounce if data is loaded to prevent initial empty state from triggering saves
  const debouncedSourcingData = useDebounce(sourcingData, 2000);

  const productName = useMemo(() => {
    return titleByAsin?.[asin] || product?.display_title || product?.title || 'Untitled Product';
  }, [product, titleByAsin, asin]);

  // Save sourcing data to database (supplierQuotes and fieldsConfirmed)
  const saveSourcingDataToDb = useCallback(async (data: SourcingData, researchProductId: string | null) => {
    if (!user || !researchProductId) return;
    
    const dataHash = JSON.stringify({
      supplierQuotes: data.supplierQuotes,
      fieldsConfirmed: data.fieldsConfirmed,
    });
    
    // Skip if data hasn't changed
    if (dataHash === lastSavedRef.current) {
      console.log('[SourcingDetail] Skipping save - data unchanged');
      return;
    }
    
    // Additional safety: don't save if we just loaded and haven't had time to process
    if (!allowAutoSaveRef.current) {
      console.log('[SourcingDetail] Skipping save - auto-save not yet enabled');
      return;
    }
    
    console.log('[SourcingDetail] Saving to DB:', {
      supplierCount: data.supplierQuotes?.length || 0,
      firstSupplierReferralFeePct: data.supplierQuotes?.[0]?.referralFeePct,
      fieldsConfirmedCount: Object.keys(data.fieldsConfirmed || {}).length,
      fieldsConfirmed: data.fieldsConfirmed,
      hasDbRecord,
      allowAutoSave: allowAutoSaveRef.current
    });
    
    try {
      setIsSaving(true);
      setSaveStatus('saving');
      
      const { data: { session } } = await supabase.auth.getSession();
      
      // Use POST for new records, PATCH for existing
      const method = hasDbRecord ? 'PATCH' : 'POST';
      
      const response = await fetch('/api/sourcing', {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }),
        },
        credentials: 'include',
        body: JSON.stringify({
          productId: researchProductId,
          asin: asin,
          supplierQuotes: data.supplierQuotes,
          fieldsConfirmed: data.fieldsConfirmed || {},
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save sourcing data');
      }
      
      // After successful save, mark that we have a DB record
      setHasDbRecord(true);
      lastSavedRef.current = dataHash;
      setSaveStatus('saved');
      
      // Reset save status after 3 seconds
      setTimeout(() => setSaveStatus('idle'), 3000);
      
    } catch (err) {
      console.error('[SourcingDetail] Failed to save to database:', err);
      setSaveStatus('error');
      
      setTimeout(() => setSaveStatus('idle'), 5000);
    } finally {
      setIsSaving(false);
    }
  }, [user, asin, hasDbRecord]);

  // Auto-save when debounced data changes
  useEffect(() => {
    console.log('[SourcingDetail] Auto-save useEffect triggered:', {
      isDataLoaded,
      allowAutoSave: allowAutoSaveRef.current,
      hasDebouncedData: !!debouncedSourcingData,
      hasProductId: !!product?.id,
      supplierCount: debouncedSourcingData?.supplierQuotes?.length || 0,
      firstSupplierReferralFeePct: debouncedSourcingData?.supplierQuotes?.[0]?.referralFeePct
    });
    
    // Only auto-save after initial data has been loaded AND allowAutoSaveRef is true
    if (!isDataLoaded || !allowAutoSaveRef.current || !debouncedSourcingData || !product?.id) {
      console.log('[SourcingDetail] Auto-save blocked - conditions not met');
      return;
    }
    
    // Check if data has actually changed from what we loaded
    const currentHash = JSON.stringify({
      supplierQuotes: debouncedSourcingData.supplierQuotes,
      fieldsConfirmed: debouncedSourcingData.fieldsConfirmed,
    });
    
    // Don't save if it's the same as what we just loaded
    if (currentHash === lastSavedRef.current) {
      console.log('[SourcingDetail] Auto-save skipped - data unchanged');
      return;
    }
    
    // Save if there's meaningful data OR if we have an existing DB record (to allow emptying suppliers)
    if (hasMeaningfulSourcingData(debouncedSourcingData) || hasDbRecord) {
      console.log('[SourcingDetail] Auto-save triggered');
      saveSourcingDataToDb(debouncedSourcingData, product.id);
    }
  }, [debouncedSourcingData, saveSourcingDataToDb, product?.id, hasDbRecord, isDataLoaded]);

  // Load sourcing data from database on mount
  const loadSourcingDataFromDb = useCallback(async (researchProductId: string) => {
    if (!user || !researchProductId) return null;
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(`/api/sourcing?productId=${encodeURIComponent(researchProductId)}`, {
        headers: {
          ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }),
        },
        credentials: 'include',
      });
      
      if (!response.ok) {
        console.warn('[SourcingDetail] Failed to load from database');
        return null;
      }
      
      const result = await response.json();
      
      console.log('[SourcingDetail] loadSourcingDataFromDb result:', {
        success: result.success,
        hasData: !!result.data,
        fieldsConfirmed: result.data?.fieldsConfirmed
      });
      
      if (result.success && result.data) {
        return {
          productId: asin,
          status: result.data.status || 'none',
          createdAt: result.data.created_at || new Date().toISOString(),
          updatedAt: result.data.updated_at || new Date().toISOString(),
          supplierQuotes: result.data.supplierQuotes || [],
          profitCalculator: result.data.profit_calculator || getDefaultSourcingData(asin).profitCalculator,
          sourcingHub: result.data.sourcing_hub || getDefaultSourcingData(asin).sourcingHub,
          fieldsConfirmed: result.data.fieldsConfirmed || {},
        } as SourcingData;
      }
      
      return null;
    } catch (err) {
      console.error('[SourcingDetail] Error loading from database:', err);
      return null;
    }
  }, [user, asin]);

  const fetchProduct = async () => {
    if (!user) return;
    try {
      setLoading(true);
      setError(null);
      setIsDataLoaded(false); // Reset data loaded flag
      allowAutoSaveRef.current = false; // Disable auto-save during load

      const { data: { session } } = await supabase.auth.getSession();
      const researchRes = await fetch('/api/research', {
        headers: { ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }) },
        credentials: 'include',
      });

      if (!researchRes.ok) {
        throw new Error(`Failed to fetch product (HTTP ${researchRes.status})`);
      }

      const data = await researchRes.json();
      const match = Array.isArray(data?.data) ? data.data.find((p: any) => p.asin === asin) : null;
      if (!match) {
        setProduct(null);
        setError('Product not found. Return to Sourcing and select a product.');
      } else {
        setProduct(match);
        if (match?.display_title) {
          dispatch(setDisplayTitle({ asin, title: match.display_title }));
        }
        
        // Load sourcing data from database (using product.id)
        if (match.id) {
          const dbData = await loadSourcingDataFromDb(match.id);
          if (dbData) {
            const dataHash = JSON.stringify({
              supplierQuotes: dbData.supplierQuotes,
              fieldsConfirmed: dbData.fieldsConfirmed,
            });
            console.log('[SourcingDetail] Data loaded from DB:', {
              supplierCount: dbData.supplierQuotes?.length || 0,
              fieldsConfirmedCount: Object.keys(dbData.fieldsConfirmed || {}).length,
              dataHash
            });
            lastSavedRef.current = dataHash;
            setSourcingData(dbData);
            setHasDbRecord(true);
            setIsDataLoaded(true);
            allowAutoSaveRef.current = true;
            console.log('[SourcingDetail] Data loaded from DB, auto-save enabled');
          } else {
            // No DB record, use default data
            const defaultData = getDefaultSourcingData(asin);
            const dataHash = JSON.stringify({
              supplierQuotes: defaultData.supplierQuotes,
              fieldsConfirmed: defaultData.fieldsConfirmed,
            });
            console.log('[SourcingDetail] No DB record, using default data');
            lastSavedRef.current = dataHash;
            setHasDbRecord(false);
            setSourcingData(defaultData);
            setIsDataLoaded(true);
            allowAutoSaveRef.current = true;
            console.log('[SourcingDetail] Using default data, auto-save enabled');
          }
        } else {
          // No product.id, use default data
          const defaultData = getDefaultSourcingData(asin);
          const dataHash = JSON.stringify({
            supplierQuotes: defaultData.supplierQuotes,
            fieldsConfirmed: defaultData.fieldsConfirmed,
          });
          console.log('[SourcingDetail] No product ID, using default data');
          lastSavedRef.current = dataHash;
          setHasDbRecord(false);
          setSourcingData(defaultData);
          setIsDataLoaded(true);
          allowAutoSaveRef.current = true;
          console.log('[SourcingDetail] No product ID, using default data, auto-save enabled');
        }
        
        // Load SSPs/Improvements from Offer
        try {
          const offerRes = await fetch(`/api/offer?asin=${encodeURIComponent(asin)}`, {
            headers: { ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }) },
            credentials: 'include',
          });
          
          if (offerRes.ok) {
            const offerData = await offerRes.json();
            if (offerData.success && offerData.data?.offerProduct?.improvements) {
              const improvements = offerData.data.offerProduct.improvements;
              // Parse SSPs from offer - each category may have multiple lines
              const categories = [
                { key: 'quantity', label: 'Quantity Change' },
                { key: 'functionality', label: 'Functional Change' },
                { key: 'quality', label: 'Quality Change' },
                { key: 'aesthetic', label: 'Aesthetic Change' },
                { key: 'bundle', label: 'Bundling Change' },
              ];
              
              const parsedSsps: Array<{ type: string; description: string }> = [];
              categories.forEach(cat => {
                const value = improvements[cat.key];
                if (value && typeof value === 'string') {
                  value.split('\n').filter((line: string) => line.trim()).forEach((line: string) => {
                    parsedSsps.push({
                      type: cat.label,
                      description: line.trim()
                    });
                  });
                }
              });
              
              setOfferSsps(parsedSsps);
            }
          }
        } catch (offerErr) {
          console.warn('[SourcingDetail] Failed to load offer SSPs:', offerErr);
        }
      }
      
    } catch (e) {
      console.error('[SourcingDetail] Failed to load:', e);
      setError(e instanceof Error ? e.message : 'Failed to load sourcing');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    console.log('[SourcingDetail] Component mounted or asin changed:', { asin, userId: user?.id });
    fetchProduct();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, asin]);

  const updateSourcingData = (updates: Partial<SourcingData>) => {
    if (!sourcingData) {
      // If sourcingData hasn't been initialized yet, don't update
      console.warn('[SourcingDetail] Attempted to update data before initialization');
      return;
    }
    
    console.log('[SourcingDetail] updateSourcingData called:', {
      updateKeys: Object.keys(updates),
      supplierQuotesCount: updates.supplierQuotes?.length,
      hasPlaceOrderFields: updates.supplierQuotes?.some(q => q.placeOrderFields && Object.keys(q.placeOrderFields).length > 0),
      referralFeePcts: updates.supplierQuotes?.map(q => ({ id: q.id, referralFeePct: q.referralFeePct })),
      fieldsConfirmed: updates.fieldsConfirmed
    });
    
    const merged: SourcingData = {
      ...sourcingData,
      ...updates,
      productId: asin,
      updatedAt: new Date().toISOString(),
    };

    if (!updates.status) {
      merged.status = hasMeaningfulSourcingData(merged) && sourcingData.status === 'none' ? 'working' : sourcingData.status;
    }

    console.log('[SourcingDetail] Setting merged data:', {
      supplierCount: merged.supplierQuotes?.length || 0,
      firstSupplierPlaceOrderFields: merged.supplierQuotes?.[0]?.placeOrderFields,
      firstSupplierReferralFeePct: merged.supplierQuotes?.[0]?.referralFeePct,
      fieldsConfirmedCount: Object.keys(merged.fieldsConfirmed || {}).length,
      fieldsConfirmed: merged.fieldsConfirmed
    });
    
    setSourcingData(merged);
    console.log('[SourcingDetail] sourcingData state updated');
  };

  if (loading || !sourcingData) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="h-12 w-12 text-blue-500 animate-spin mb-4" />
        <p className="text-slate-400">Loading sourcing...</p>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="bg-slate-800/30 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-12">
        <div className="flex items-start gap-3 text-slate-300">
          <AlertCircle className="w-5 h-5 text-red-400 mt-0.5" />
          <div className="min-w-0">
            <p className="font-medium">Could not load product</p>
            <p className="text-slate-400 mt-1">{error || 'Please return to Sourcing and select a product.'}</p>
            <button
              onClick={() => router.push('/sourcing')}
              className="mt-4 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white transition-colors"
            >
              Back to Sourcing
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div className="mb-6 bg-red-600 text-white px-6 py-4 rounded-xl shadow-lg flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5" />
            <p className="font-medium">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="hover:bg-red-700 rounded p-1 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="relative">
        <ProductHeaderBar
          productId={product?.id}
          asin={asin}
          currentDisplayTitle={productName}
          originalTitle={product?.title || productName}
          currentPhase="sourcing"
          leftButton={{ label: 'Offer Builder', href: `/offer/${encodeURIComponent(asin)}`, stage: 'offer' }}
          rightButton={{ label: 'Finalize Launch Plan', onClick: () => {}, disabled: true, stage: 'success' }}
        />
        
        {/* Save Status Toast Notification */}
        {saveStatus !== 'idle' && (
          <div 
            className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium shadow-lg transition-all duration-300 animate-in slide-in-from-bottom-4 ${
              saveStatus === 'saving' 
                ? 'bg-slate-800 text-blue-400 border border-blue-500/50' 
                : saveStatus === 'saved'
                ? 'bg-emerald-900/90 text-emerald-300 border border-emerald-500/50'
                : 'bg-red-900/90 text-red-300 border border-red-500/50'
            }`}
          >
            {saveStatus === 'saving' && (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Saving changes...</span>
              </>
            )}
            {saveStatus === 'saved' && (
              <>
                <CheckCircle className="w-4 h-4" />
                <span>Changes saved</span>
              </>
            )}
            {saveStatus === 'error' && (
              <>
                <AlertCircle className="w-4 h-4" />
                <span>Save failed</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Sourcing Hub */}
      <div className="mb-6">
        <SourcingHub
          productId={asin}
          productData={product}
          hubData={sourcingData?.sourcingHub}
          supplierQuotes={sourcingData?.supplierQuotes || []}
          fieldsConfirmed={sourcingData?.fieldsConfirmed || {}}
          activeTab={activeTab}
          selectedSupplierId={selectedSupplierId}
          onChange={(sourcingHub) => updateSourcingData({ sourcingHub })}
          onNavigateToTab={(tab, section, supplierId) => {
            setActiveTab(tab as SourcingDetailTab);
            // TODO: If section is provided, scroll to that section in the tab
            // TODO: If supplierId is provided, select that supplier
          }}
        />
      </div>

      <div className="bg-slate-800/30 backdrop-blur-xl rounded-2xl border border-slate-700/50 overflow-hidden">
        <div className="flex border-b border-slate-700/50 bg-slate-800/50 overflow-x-auto">
          {[
            { id: 'quotes', label: 'Supplier Quotes', icon: Users },
            { id: 'profit', label: 'Profit Overview', icon: Calculator },
            { id: 'placeOrder', label: 'Place Order', icon: ShoppingCart },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => {
                setActiveTab(id as SourcingDetailTab);
              }}
              className={`px-6 py-4 font-medium transition-all relative whitespace-nowrap flex items-center gap-2 ${
                activeTab === id ? 'text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
              {activeTab === id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 to-emerald-500" />
              )}
            </button>
          ))}
        </div>

        <div className="p-6">
          {activeTab === 'quotes' && sourcingData && (
            <SupplierQuotesTab
              productId={asin}
              data={sourcingData.supplierQuotes}
              onChange={(supplierQuotes) => updateSourcingData({ supplierQuotes })}
              productData={product}
              hubData={sourcingData.sourcingHub}
              offerSsps={offerSsps}
            />
          )}
          {activeTab === 'profit' && sourcingData && (
            <ProfitCalculatorTab
              productId={asin}
              productData={product}
              supplierQuotes={sourcingData.supplierQuotes}
              hubData={sourcingData.sourcingHub}
              onChange={(supplierQuotes) => updateSourcingData({ supplierQuotes })}
              enableMissingInfoFilter={enableMissingInfoFilter}
            />
          )}
          {activeTab === 'placeOrder' && sourcingData && (
            <PlaceOrderTab
              productId={asin}
              productData={product}
              supplierQuotes={sourcingData.supplierQuotes}
              hubData={sourcingData.sourcingHub}
              fieldsConfirmed={sourcingData.fieldsConfirmed || {}}
              onDirtyChange={setIsPlaceOrderDirty}
              onChange={(supplierQuotes) => updateSourcingData({ supplierQuotes })}
              onFieldsConfirmedChange={(fieldsConfirmed) => updateSourcingData({ fieldsConfirmed })}
              onSelectedSupplierChange={setSelectedSupplierId}
            />
          )}
        </div>
      </div>
    </div>
  );
}


