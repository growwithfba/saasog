'use client';

import { Loader2 } from 'lucide-react';
import type { HydratedRow } from '@/lib/discovery/types';

interface ResultsTableProps {
  rows: HydratedRow[];
  loading: boolean;
  sortId: string | null;
  sortDir: 'asc' | 'desc';
  onSort: (filterId: string) => void;
}

/** Columns Keepa can sort server-side, keyed by filter id. */
const SORTABLE: Record<string, string> = {
  bsr: 'Category BSR',
  price: 'Price',
  monthlyUnits: 'ASIN Sales',
  reviewCount: 'Reviews',
  rating: 'Rating',
};

const money = (n: number | null) =>
  n === null ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const num = (n: number | null) => (n === null ? '—' : n.toLocaleString('en-US'));

export function ResultsTable({ rows, loading, sortId, sortDir, onSort }: ResultsTableProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-500 dark:text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading products…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="py-16 text-center text-gray-500 dark:text-slate-400">
        No products matched those filters. Try widening your price or BSR range.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-600 dark:text-slate-400 border-b border-gray-200 dark:border-slate-700">
            <th className="py-3 pr-4 font-medium">Product</th>
            {(['bsr', 'price'] as const).map((id) => (
              <th key={id} className="py-3 px-4 font-medium">
                <button onClick={() => onSort(id)} className="hover:text-blue-500 dark:hover:text-blue-400">
                  {SORTABLE[id]}{sortId === id ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                </button>
              </th>
            ))}
            <th className="py-3 px-4 font-medium">
              Parent Sales
              <span className="ml-1 text-xs text-gray-400 dark:text-slate-500" title="Calculated from the sales-rank curve, so it sorts within the loaded page only.">ⓘ</span>
            </th>
            <th className="py-3 px-4 font-medium">
              <button onClick={() => onSort('monthlyUnits')} className="hover:text-blue-500 dark:hover:text-blue-400">
                ASIN Sales{sortId === 'monthlyUnits' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
              </button>
            </th>
            <th className="py-3 px-4 font-medium">
              Parent Revenue
              <span className="ml-1 text-xs text-gray-400 dark:text-slate-500" title="Calculated, so it sorts within the loaded page only.">ⓘ</span>
            </th>
            <th className="py-3 px-4 font-medium">
              ASIN Revenue
              <span className="ml-1 text-xs text-gray-400 dark:text-slate-500" title="Revenue is calculated, so it sorts within the loaded page only.">ⓘ</span>
            </th>
            {(['reviewCount', 'rating'] as const).map((id) => (
              <th key={id} className="py-3 px-4 font-medium">
                <button onClick={() => onSort(id)} className="hover:text-blue-500 dark:hover:text-blue-400">
                  {SORTABLE[id]}{sortId === id ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.asin} className="border-b border-gray-100 dark:border-slate-800">
              <td className="py-3 pr-4">
                <div className="flex items-center gap-3">
                  {row.imageUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={row.imageUrl} alt="" className="w-10 h-10 object-contain rounded" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate max-w-xs text-gray-900 dark:text-white">{row.title ?? row.asin}</p>
                    <p className="text-xs text-gray-500 dark:text-slate-400">
                      {row.asin}
                      {row.isFba === true ? ' · FBA' : row.isFba === false ? ' · FBM' : ''}
                    </p>
                  </div>
                </div>
              </td>
              <td className="py-3 px-4 text-gray-700 dark:text-slate-300">{num(row.bsr)}</td>
              <td className="py-3 px-4 text-gray-700 dark:text-slate-300">{money(row.price)}</td>
              <td className="py-3 px-4 text-gray-700 dark:text-slate-300">{num(row.parentUnits)}</td>
              <td className="py-3 px-4 text-gray-700 dark:text-slate-300">{num(row.monthlyUnits)}</td>
              <td className="py-3 px-4 text-gray-700 dark:text-slate-300">{money(row.parentRevenue)}</td>
              <td className="py-3 px-4 text-gray-700 dark:text-slate-300">{money(row.monthlyRevenue)}</td>
              <td className="py-3 px-4 text-gray-700 dark:text-slate-300">{num(row.reviews)}</td>
              <td className="py-3 px-4 text-gray-700 dark:text-slate-300">{row.rating === null ? '—' : row.rating.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
