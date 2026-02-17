import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  buildKeepaSignalsProduct,
  buildMarketSignals,
  KeepaSignalsProduct
} from '@/lib/keepa/keepaSignals';

const KEEPA_BASE_URL = 'https://api.keepa.com';
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_CACHE_SIZE = 200;

export const dynamic = 'force-dynamic';

type CacheEntry = {
  expiresAt: number;
  payload: KeepaSignalsProduct;
};

const memoryCache = new Map<string, CacheEntry>();

const sanitizeAsin = (asin: string) => asin.replace(/[^A-Z0-9]/gi, '').toUpperCase();

const getCacheKey = (domain: number, asin: string, rangeMonths: number) =>
  `${domain}:${asin}:${rangeMonths}`;

const readFromMemoryCache = (domain: number, asin: string, rangeMonths: number) => {
  const key = getCacheKey(domain, asin, rangeMonths);
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  memoryCache.delete(key);
  memoryCache.set(key, entry);
  return entry.payload;
};

const writeToMemoryCache = (domain: number, asin: string, payload: KeepaSignalsProduct) => {
  const key = getCacheKey(domain, asin, payload.signals?.meta?.rangeMonths ?? 24);
  memoryCache.set(key, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    payload
  });
  if (memoryCache.size > MAX_CACHE_SIZE) {
    const oldestKey = memoryCache.keys().next().value;
    if (oldestKey) memoryCache.delete(oldestKey);
  }
};

const getSupabaseAdmin = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
};

const readFromDbCache = async (domain: number, asin: string, rangeMonths: number) => {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) return null;
    const { data, error } = await supabaseAdmin
      .from('keepa_cache')
      .select('payload, expires_at')
      .eq('asin', asin)
      .eq('domain', domain)
      .limit(1)
      .single();
    if (error || !data) return null;
    if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
      return null;
    }
    const payload = data.payload as KeepaSignalsProduct;
    const cachedRange = payload?.signals?.meta?.rangeMonths;
    if (cachedRange && cachedRange !== rangeMonths) {
      return null;
    }
    return payload;
  } catch (error) {
    console.warn('Keepa cache read skipped:', error);
    return null;
  }
};

const writeToDbCache = async (domain: number, asin: string, payload: KeepaSignalsProduct) => {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) return;
    const expiresAt = new Date(Date.now() + CACHE_TTL_MS).toISOString();
    await supabaseAdmin.from('keepa_cache').upsert({
      asin,
      domain,
      payload,
      expires_at: expiresAt,
      updated_at: new Date().toISOString()
    });
  } catch (error) {
    console.warn('Keepa cache write skipped:', error);
  }
};

const fetchKeepaProducts = async (apiKey: string, domain: number, asins: string[]) => {
  const url = `${KEEPA_BASE_URL}/product?key=${apiKey}&domain=${domain}&asin=${asins.join(',')}&stats=180&history=1`;
  const response = await fetch(url);
  if (process.env.NODE_ENV === 'development') {
    console.log('Keepa API response status', {
      status: response.status,
      asins
    });
  }
  if (!response.ok) {
    const errorText = await response.text();
    return {
      ok: false as const,
      status: response.status,
      errorText
    };
  }
  const data = await response.json();
  return {
    ok: true as const,
    status: response.status,
    data
  };
};

const formatKeepaStatusMessage = (status: number) => {
  if (status === 402) return 'Keepa API quota exceeded (402).';
  if (status === 429) return 'Keepa API rate limited (429).';
  if (status === 403) return 'Keepa API forbidden (403).';
  if (status === 401) return 'Keepa API unauthorized (401).';
  return `Keepa API error (${status}).`;
};

const hasHistoryArrays = (product: any) => {
  if (!product?.csv || !Array.isArray(product.csv)) return false;
  return product.csv.some((entry: any) => Array.isArray(entry) && entry.length > 0);
};

export async function POST(request: Request) {
  const apiKey = process.env.KEEPA_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Keepa API key missing' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    const body = await request.json();
    const domain = Number(body?.domain ?? 1);
    const rangeMonths = Number(body?.rangeMonths ?? 24);
    const asins = Array.isArray(body?.asins) ? body.asins : [];
    const normalizedAsins = asins
      .map((asin: string) => sanitizeAsin(asin))
      .filter((asin: string) => asin.length === 10);

    if (!normalizedAsins.length) {
      return NextResponse.json(
        { products: [], market: buildMarketSignals([]) },
        { status: 200, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('Keepa route request', {
        domain,
        rangeMonths,
        normalizedAsins,
        asinCount: normalizedAsins.length,
        asinSample: normalizedAsins.slice(0, 5)
      });
    }

    const cachedResults: KeepaSignalsProduct[] = [];
    const missingAsins: string[] = [];

    for (const asin of normalizedAsins) {
      const memoryHit = readFromMemoryCache(domain, asin, rangeMonths);
      if (memoryHit) {
        cachedResults.push(memoryHit);
        continue;
      }
      const dbHit = await readFromDbCache(domain, asin, rangeMonths);
      if (dbHit) {
        writeToMemoryCache(domain, asin, dbHit);
        cachedResults.push(dbHit);
        continue;
      }
      missingAsins.push(asin);
    }

    const fetchedResults: KeepaSignalsProduct[] = [];
    if (missingAsins.length) {
      const chunks = [];
      for (let i = 0; i < missingAsins.length; i += 10) {
        chunks.push(missingAsins.slice(i, i + 10));
      }
      for (const chunk of chunks) {
        const response = await fetchKeepaProducts(apiKey, domain, chunk);
        if (!response.ok) {
          const friendlyMessage = formatKeepaStatusMessage(response.status);
          if (process.env.NODE_ENV === 'development') {
            console.log('Keepa API error payload', {
              status: response.status,
              errorText: response.errorText,
              message: friendlyMessage
            });
          }
          return NextResponse.json(
            {
              error: friendlyMessage,
              keepaStatus: response.status,
              keepaError: response.errorText
            },
            { status: 502, headers: { 'Cache-Control': 'no-store' } }
          );
        }
        const data = response.data;
        if (data?.error) {
          const friendlyMessage = formatKeepaStatusMessage(response.status);
          return NextResponse.json(
            {
              error: friendlyMessage,
              keepaStatus: response.status,
              keepaError: data.error
            },
            { status: 502, headers: { 'Cache-Control': 'no-store' } }
          );
        }
        const products = data?.products || [];
        if (process.env.NODE_ENV === 'development') {
          console.log('Keepa route chunk response', {
            chunkSize: chunk.length,
            productCount: products.length,
            hasCsvHistory: products.some(hasHistoryArrays)
          });
          const productSummaries = products.map((product: any) => ({
            asin: product?.asin,
            hasHistory: hasHistoryArrays(product),
            csvLengths: Array.isArray(product?.csv)
              ? product.csv.map((entry: any) => (Array.isArray(entry) ? entry.length : 0))
              : []
          }));
          console.log('Keepa route products', productSummaries);
        }
        products.forEach((product: any) => {
          const normalized = buildKeepaSignalsProduct(product, rangeMonths);
          fetchedResults.push(normalized);
          writeToMemoryCache(domain, normalized.asin, normalized);
          void writeToDbCache(domain, normalized.asin, normalized);
        });
      }
    }

    const resultMap = new Map<string, KeepaSignalsProduct>();
    [...cachedResults, ...fetchedResults].forEach(item => {
      resultMap.set(item.asin, item);
    });

    const ordered = normalizedAsins
      .map(asin => resultMap.get(asin))
      .filter((item): item is KeepaSignalsProduct => Boolean(item));

    const hasAnyHistory =
      ordered.length > 0 &&
      ordered.some(product => {
        const series = product?.series || {};
        const hasSeries = Object.values(series).some(value => Array.isArray(value) && value.length > 0);
        const hasFallback = Boolean(
          product?.productData?.bsr?.length || product?.productData?.prices?.length
        );
        return hasSeries || hasFallback;
      });
    if (!hasAnyHistory) {
      return NextResponse.json(
        {
          error: 'Keepa returned products without any history series.',
          keepaStatus: 502,
          keepaError: 'No history arrays returned from Keepa.'
        },
        { status: 502, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (process.env.NODE_ENV === 'development') {
      const returnedSummaries = ordered.map(product => ({
        asin: product.asin,
        hasHistory:
          Object.values(product.series || {}).some(value => Array.isArray(value) && value.length > 0) ||
          Boolean(product.productData?.bsr?.length || product.productData?.prices?.length),
        seriesLengths: Object.fromEntries(
          Object.entries(product.series || {}).map(([key, value]) => [
            key,
            Array.isArray(value) ? value.length : 0
          ])
        )
      }));
      console.log('Keepa route response products', returnedSummaries);
    }

    return NextResponse.json(
      {
        products: ordered,
        market: buildMarketSignals(ordered)
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Keepa route error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Keepa data' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
