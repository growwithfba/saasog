'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { useDispatch } from 'react-redux';
import { useRouter } from 'next/navigation';
import { AlertCircle, Box, Calculator, Loader2, Truck, Users, X } from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';
import { RootState } from '@/store';
import { ProductHeaderBar } from '@/components/ProductHeaderBar';
import { SupplierQuotesTab } from './tabs/SupplierQuotesTab';
import { ProfitCalculatorTab } from './tabs/ProfitCalculatorTab';
import { FreightComplianceTab } from './tabs/FreightComplianceTab';
import { PackagingTab } from './tabs/PackagingTab';
import type { SourcingData } from './types';
import { getDefaultSourcingData, loadSourcingData, saveSourcingData } from './sourcingStorage';
import { setDisplayTitle } from '@/store/productTitlesSlice';

type SourcingDetailTab = 'quotes' | 'profit' | 'freight' | 'packaging';

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

export function SourcingDetailContent({ asin }: { asin: string }) {
  const { user } = useSelector((state: RootState) => state.auth);
  const titleByAsin = useSelector((state: RootState) => state.productTitles.byAsin);
  const router = useRouter();
  const dispatch = useDispatch();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [product, setProduct] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<SourcingDetailTab>('quotes');
  const [sourcingData, setSourcingData] = useState<SourcingData>(() => getDefaultSourcingData(asin));

  const productName = useMemo(() => {
    return titleByAsin?.[asin] || product?.display_title || product?.title || 'Untitled Product';
  }, [product, titleByAsin, asin]);

  const fetchProduct = async () => {
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
      }

      setSourcingData(loadSourcingData(asin));
    } catch (e) {
      console.error('[SourcingDetail] Failed to load:', e);
      setError(e instanceof Error ? e.message : 'Failed to load sourcing');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProduct();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, asin]);

  const updateSourcingData = (updates: Partial<SourcingData>) => {
    const current = sourcingData || getDefaultSourcingData(asin);
    const merged: SourcingData = {
      ...current,
      ...updates,
      productId: asin,
      updatedAt: new Date().toISOString(),
    };

    if (!updates.status) {
      merged.status = hasMeaningfulSourcingData(merged) && current.status === 'none' ? 'working' : current.status;
    }

    setSourcingData(merged);
    saveSourcingData(asin, merged);
  };

  if (loading) {
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

      <ProductHeaderBar
        productId={product?.id}
        asin={asin}
        currentDisplayTitle={productName}
        originalTitle={product?.title || productName}
        leftButton={{ label: 'Offer Builder', href: `/offer/${encodeURIComponent(asin)}`, stage: 'offer' }}
        rightButton={{ label: 'Finalize Launch Plan', onClick: () => {}, disabled: true, stage: 'success' }}
      />

      <div className="bg-slate-800/30 backdrop-blur-xl rounded-2xl border border-slate-700/50 overflow-hidden">
        <div className="flex border-b border-slate-700/50 bg-slate-800/50 overflow-x-auto">
          {[
            { id: 'quotes', label: 'Supplier Quotes', icon: Users },
            { id: 'profit', label: 'Profit Calculator', icon: Calculator },
            { id: 'freight', label: 'Freight + Compliance', icon: Truck },
            { id: 'packaging', label: 'Packaging', icon: Box },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id as SourcingDetailTab)}
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
          {activeTab === 'quotes' && (
            <SupplierQuotesTab
              productId={asin}
              data={sourcingData.supplierQuotes}
              onChange={(supplierQuotes) => updateSourcingData({ supplierQuotes })}
            />
          )}
          {activeTab === 'profit' && (
            <ProfitCalculatorTab
              productId={asin}
              productData={product}
              data={sourcingData.profitCalculator}
              onChange={(profitCalculator) => updateSourcingData({ profitCalculator })}
            />
          )}
          {activeTab === 'freight' && (
            <FreightComplianceTab
              productId={asin}
              data={sourcingData.profitCalculator}
              onChange={(profitCalculator) => updateSourcingData({ profitCalculator })}
            />
          )}
          {activeTab === 'packaging' && (
            <PackagingTab
              productId={asin}
              data={sourcingData.profitCalculator}
              onChange={(profitCalculator) => updateSourcingData({ profitCalculator })}
            />
          )}
        </div>
      </div>
    </div>
  );
}


