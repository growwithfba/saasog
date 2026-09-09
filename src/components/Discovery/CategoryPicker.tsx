'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, X } from 'lucide-react';

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

const CACHE_KEY = 'discovery.categoryTree.v1';

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
  const [childrenByParent, setChildrenByParent] = useState<Record<string, CategoryNode[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [nameById, setNameById] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<string | null>(null);

  const load = async (parent: string | null) => {
    const key = parent ?? 'root';
    const cache = readCache();
    if (cache[key]) {
      setChildrenByParent((p) => ({ ...p, [key]: cache[key] }));
      setNameById((p) => ({ ...p, ...Object.fromEntries(cache[key].map((c) => [c.id, c.name])) }));
      return;
    }
    setLoading(key);
    try {
      const res = await fetch(`/api/discovery/categories${parent ? `?parent=${parent}` : ''}`);
      const data = await res.json();
      if (data?.success) {
        setChildrenByParent((p) => ({ ...p, [key]: data.categories }));
        setNameById((p) => ({
          ...p,
          ...Object.fromEntries(data.categories.map((c: CategoryNode) => [c.id, c.name])),
        }));
        writeCache({ ...cache, [key]: data.categories });
      }
    } finally {
      setLoading(null);
    }
  };

  useEffect(() => {
    void load(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    return (
      <ul className={depth === 0 ? '' : 'ml-5 border-l border-gray-200 dark:border-slate-700 pl-2'}>
        {nodes.map((node) => (
          <li key={`${parentKey}-${node.id}`}>
            <div className="flex items-center gap-1 py-1">
              {node.hasChildren ? (
                <button
                  type="button"
                  onClick={() => toggleExpand(node.id)}
                  aria-label={`Expand ${node.name}`}
                  className="text-gray-500 dark:text-slate-400"
                >
                  {expanded.has(node.id) ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </button>
              ) : (
                <span className="w-4" />
              )}
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.includes(node.id)}
                  onChange={() => toggleSelect(node.id)}
                />
                <span className="text-gray-800 dark:text-slate-200">{node.name}</span>
              </label>
              {node.avoid && (
                <span title={node.avoid}>
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
                </span>
              )}
            </div>
            {expanded.has(node.id) &&
              (loading === node.id ? (
                <p className="ml-6 text-xs text-gray-500 dark:text-slate-400">Loading…</p>
              ) : (
                renderLevel(node.id, depth + 1)
              ))}
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {selected.map((id) => (
            <span
              key={id}
              className="flex items-center gap-1 px-2 py-1 rounded-full bg-slate-800 dark:bg-slate-700 text-white text-xs"
            >
              {nameById[id] ?? id}
              <button type="button" onClick={() => toggleSelect(id)} aria-label={`Remove ${nameById[id] ?? id}`}>
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="max-h-72 overflow-y-auto rounded-lg border border-gray-300 dark:border-slate-600 p-3">
        {loading === 'root' ? (
          <p className="text-xs text-gray-500 dark:text-slate-400">Loading categories…</p>
        ) : (
          renderLevel('root', 0)
        )}
      </div>
    </div>
  );
}
