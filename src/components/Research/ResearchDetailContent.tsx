'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { useDispatch } from 'react-redux';
import { useRouter } from 'next/navigation';
import { AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';
import { RootState } from '@/store';
import { ProductHeaderBar } from '@/components/ProductHeaderBar';
import { setDisplayTitle } from '@/store/productTitlesSlice';
import { formatDate } from '@/utils/formatDate';

export function ResearchDetailContent({ asin }: { asin: string }) {
  const { user } = useSelector((state: RootState) => state.auth);
  const titleByAsin = useSelector((state: RootState) => state.productTitles.byAsin);
  const router = useRouter();
  const dispatch = useDispatch();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [product, setProduct] = useState<any>(null);

  const displayTitle = useMemo(() => {
    return titleByAsin?.[asin] || product?.display_title || product?.title || 'Untitled Product';
  }, [product, titleByAsin, asin]);

  const fetchProduct = async () => {
    if (!user) return;
    try {
      setLoading(true);
      setError(null);

      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/research', {
        headers: { ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }) },
        credentials: 'include',
      });

      if (!res.ok) throw new Error(`Failed to fetch research products (HTTP ${res.status})`);
      const data = await res.json();
      const rows: any[] = Array.isArray(data?.data) ? data.data : [];
      const match = rows.find((p) => p?.asin === asin) || null;
      setProduct(match);
      if (match?.display_title) {
        dispatch(setDisplayTitle({ asin, title: match.display_title }));
      }
      if (!match) setError('Research product not found.');
    } catch (e) {
      console.error('[ResearchDetail] Failed to load:', e);
      setError(e instanceof Error ? e.message : 'Failed to load research detail');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProduct();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, asin]);

  const goToVetting = () => {
    const productNameParam = encodeURIComponent(displayTitle || '');
    const researchProductIdParam = product?.id ? encodeURIComponent(product.id) : '';
    const qs = `${productNameParam ? `?productName=${productNameParam}` : ''}${
      researchProductIdParam ? `${productNameParam ? '&' : '?'}researchProductId=${researchProductIdParam}` : ''
    }`;
    router.push(`/vetting/${encodeURIComponent(asin)}${qs}`);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="h-12 w-12 text-blue-500 animate-spin mb-4" />
        <p className="text-slate-400">Loading research detail...</p>
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
            <p className="text-slate-400 mt-1">{error || 'Please return to Research and select a product.'}</p>
            <button
              onClick={() => router.push('/research')}
              className="mt-4 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white transition-colors"
            >
              Back to Research
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <ProductHeaderBar
        productId={product?.id}
        asin={asin}
        currentDisplayTitle={displayTitle}
        originalTitle={product?.title || displayTitle}
        leftButton={{ label: 'Back to Funnel', href: '/research', stage: 'research' }}
        rightButton={{ label: 'Vet This Product', onClick: goToVetting, stage: 'vetting' }}
      />

      <div className="bg-slate-800/30 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider">Brand</p>
            <p className="text-slate-200 mt-1">{product.brand || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider">Category</p>
            <p className="text-slate-200 mt-1">{product.category || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider">ASIN</p>
            <p className="text-slate-200 mt-1">{product.asin}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider">Price</p>
            <p className="text-slate-200 mt-1">
              {typeof product.price === 'number' ? `$${product.price.toFixed(2)}` : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider">Monthly Revenue</p>
            <p className="text-slate-200 mt-1">
              {typeof product.monthly_revenue === 'number' ? `$${product.monthly_revenue.toLocaleString()}` : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider">Monthly Units</p>
            <p className="text-slate-200 mt-1">
              {typeof product.monthly_units_sold === 'number' ? product.monthly_units_sold.toLocaleString() : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider">Updated</p>
            <p className="text-slate-200 mt-1">
              {product.updated_at ? formatDate(product.updated_at) : product.created_at ? formatDate(product.created_at) : '—'}
            </p>
          </div>
          <div className="md:col-span-2">
            <p className="text-xs text-slate-500 uppercase tracking-wider">Funnel Status</p>
            <p className="text-slate-200 mt-1">
              {product.is_vetted ? 'Vetted' : 'Not Vetted'} • {product.is_offered ? 'Offer Built' : 'No Offer'} •{' '}
              {product.is_sourced ? 'Sourced' : 'Not Sourced'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}


