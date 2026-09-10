'use client';

import { Checkbox } from '@/components/ui/Checkbox';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Loader2, Search, X } from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';

interface CategoryNode {
  id: string;
  name: string;
  hasChildren: boolean;
  avoid?: string | null;
}

interface CategoryPickerProps {
  selected: string[];
  onChange: (ids: string[]) => void;
}

const CACHE_KEY = 'discovery.categoryTree.v2';

function readCache(): Record<string, CategoryNode[]> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
  } catch {
    // Privacy mode / quota / corrupt value — the tree just fetches fresh.
    return {};
  }
}

function writeCache(cache: Record<string, CategoryNode[]>) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* quota or privacy mode — the tree just refetches next time */
  }
}

export function CategoryPicker({ selected, onChange }: CategoryPickerProps) {
  const [open, setOpen] = useState(false);
  const [childrenByParent, setChildrenByParent] = useState<Record<string, CategoryNode[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [nameById, setNameById] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);

  const load = async (parent: string | null) => {
    const key = parent ?? 'root';
    const cache = readCache();
    if (cache[key]) {
      setChildrenByParent((p) => ({ ...p, [key]: cache[key] }));
      setNameById((p) => ({ ...p, ...Object.fromEntries(cache[key].map((c) => [c.id, c.name])) }));
      return;
    }
    setLoading(key);
    setError(null);
    try {
      // Every level below the root spends provider tokens, so the API route
      // requires a logged-in user (see /api/discovery/categories).
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/discovery/categories${parent ? `?parent=${parent}` : ''}`, {
        headers: {
          ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }),
        },
      });
      const data = await res.json();
      if (data?.success) {
        setChildrenByParent((p) => ({ ...p, [key]: data.categories }));
        setNameById((p) => ({
          ...p,
          ...Object.fromEntries(data.categories.map((c: CategoryNode) => [c.id, c.name])),
        }));
        writeCache({ ...cache, [key]: data.categories });
      } else {
        setError(data?.error || 'Could not load categories.');
      }
    } catch {
      setError('Could not load categories. Check your connection and try again.');
    } finally {
      setLoading(null);
    }
  };

  useEffect(() => {
    void load(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close on outside click and on Escape, so the panel behaves like every other
  // dropdown in the app rather than trapping the page.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        if (!childrenByParent[id]) void load(id);
      }
      return next;
    });
  };

  const toggleSelect = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  };

  // React keys must stay unique across the whole tree (not just within one
  // level), because a node's own id repeats once per ancestor path in
  // childrenByParent. Prefixing with the parent key guarantees that.
  const renderLevel = (parentKey: string, depth: number) => {
    const nodes = childrenByParent[parentKey] ?? [];
    const term = filter.trim().toLowerCase();
    // Filtering only narrows what is already loaded — deeper names the user has
    // never expanded aren't in the browser yet, so the empty state says so.
    const visible = term && depth === 0
      ? nodes.filter((n) => n.name.toLowerCase().includes(term))
      : nodes;

    return (
      <ul className={depth === 0 ? 'space-y-0.5' : 'ml-4 border-l border-slate-200 dark:border-slate-700/70 pl-3 space-y-0.5'}>
        {visible.map((node) => {
          const isSelected = selected.includes(node.id);
          return (
            <li key={`${parentKey}-${node.id}`}>
              <div
                className={`flex items-center gap-2 rounded-lg px-2 py-2 transition-colors ${
                  isSelected
                    ? 'bg-blue-500/10 dark:bg-blue-500/15'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-800/70'
                }`}
              >
                {node.hasChildren ? (
                  <button
                    type="button"
                    onClick={() => toggleExpand(node.id)}
                    aria-label={`${expanded.has(node.id) ? 'Collapse' : 'Expand'} ${node.name}`}
                    aria-expanded={expanded.has(node.id)}
                    className="shrink-0 rounded p-0.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50"
                  >
                    {expanded.has(node.id) ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </button>
                ) : (
                  <span className="w-5 shrink-0" />
                )}
                <label className="flex flex-1 items-center gap-2.5 cursor-pointer min-w-0">
                  <Checkbox
                    checked={isSelected}
                    onChange={() => toggleSelect(node.id)}
                    className="shrink-0"
                  />
                  <span className="truncate text-[15px] text-slate-800 dark:text-slate-200">
                    {node.name}
                  </span>
                </label>
                {node.avoid && (
                  <span title={node.avoid} className="shrink-0">
                    <AlertTriangle className="w-4 h-4 text-amber-500 dark:text-amber-400" />
                  </span>
                )}
              </div>
              {expanded.has(node.id) &&
                (loading === node.id ? (
                  <p className="ml-9 py-1 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
                  </p>
                ) : (childrenByParent[node.id]?.length ?? 0) === 0 ? (
                  <p className="ml-9 py-1 text-sm text-slate-500 dark:text-slate-500">
                    No subcategories
                  </p>
                ) : (
                  renderLevel(node.id, depth + 1)
                ))}
            </li>
          );
        })}
        {depth === 0 && term && visible.length === 0 && (
          <li className="px-2 py-3 text-sm text-slate-500 dark:text-slate-400">
            No top-level category matches “{filter}”. Clear the filter and open a category to browse deeper.
          </li>
        )}
      </ul>
    );
  };

  const summary =
    selected.length === 0
      ? 'All categories'
      : `${selected.length} ${selected.length === 1 ? 'category' : 'categories'} selected`;

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-700/50 bg-white dark:bg-slate-900/50 text-left text-[15px] text-slate-900 dark:text-white hover:border-slate-400 dark:hover:border-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-colors"
      >
        <span className={selected.length === 0 ? 'text-slate-500 dark:text-slate-400' : ''}>
          {summary}
        </span>
        <ChevronDown
          className={`w-5 h-5 shrink-0 text-slate-500 dark:text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {selected.map((id) => (
            <span
              key={id}
              className="flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-full bg-blue-500/10 dark:bg-blue-500/15 border border-blue-500/30 dark:border-blue-400/30 text-blue-700 dark:text-blue-200 text-sm"
            >
              {nameById[id] ?? id}
              <button
                type="button"
                onClick={() => toggleSelect(id)}
                aria-label={`Remove ${nameById[id] ?? id}`}
                className="rounded-full p-0.5 hover:bg-blue-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => onChange([])}
            className="px-2 py-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white underline underline-offset-2"
          >
            Clear all
          </button>
        </div>
      )}

      {open && (
        <div className="absolute z-30 mt-2 w-full rounded-xl border border-slate-300 dark:border-slate-700/70 bg-white dark:bg-slate-900 shadow-2xl">
          <div className="p-3 border-b border-slate-200 dark:border-slate-700/70">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter top-level categories"
                aria-label="Filter top-level categories"
                className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700/50 bg-white dark:bg-slate-900/50 text-[15px] text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50"
              />
            </div>
          </div>

          {error && (
            <p className="px-4 py-2 text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          <div className="max-h-[26rem] overflow-y-auto p-2">
            {loading === 'root' ? (
              <p className="flex items-center gap-2 px-2 py-3 text-sm text-slate-500 dark:text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading categories…
              </p>
            ) : (
              renderLevel('root', 0)
            )}
          </div>

          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-200 dark:border-slate-700/70">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Open a category to choose subcategories. You can select at any level.
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
