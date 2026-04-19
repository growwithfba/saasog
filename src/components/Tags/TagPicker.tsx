'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Plus, Tag as TagIcon } from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';
import type { TagShape } from './TagChip';

interface TagPickerProps {
  /** ID of the research_products row this picker is attaching to. */
  researchProductId: string;
  /** Tags currently attached to the product. */
  currentTags: TagShape[];
  /** Full list of the user's tags (used for suggestions). */
  allTags: TagShape[];
  /** Called after a successful attach/detach so the parent can refetch. */
  onChange: () => void | Promise<void>;
  /** Triggered by the caller; the picker renders as a popover anchored
   *  to whatever the caller chooses (usually a "+" button). */
  open: boolean;
  onClose: () => void;
}

/**
 * Small popover to attach/detach tags on a single research product.
 * Filters the user's existing tags by the search input; if the input
 * doesn't match any existing tag, a "Create '<name>'" row appears.
 */
export function TagPicker({
  researchProductId,
  currentTags,
  allTags,
  onChange,
  open,
  onClose,
}: TagPickerProps) {
  const [query, setQuery] = useState('');
  const [busyTagId, setBusyTagId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on outside click / escape.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!popoverRef.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  const trimmed = query.trim();
  const lowered = trimmed.toLowerCase();
  const currentIds = new Set(currentTags.map((t) => t.id));
  const matches = allTags.filter((t) => t.name.toLowerCase().includes(lowered));
  const exactMatch = allTags.find((t) => t.name.toLowerCase() === lowered);

  const attach = async (tagId?: string, tagName?: string) => {
    if (busyTagId || creating) return;
    if (tagId) setBusyTagId(tagId);
    else setCreating(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/research/${researchProductId}/tags`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }),
        },
        body: JSON.stringify(tagId ? { tagId } : { tagName }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to attach tag');
      }
      // Close the picker before firing the refetch so the newly-attached
      // chip is visible on the row instead of hidden behind the popover.
      onClose();
      await onChange();
      setQuery('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to attach tag');
    } finally {
      setBusyTagId(null);
      setCreating(false);
    }
  };

  const detach = async (tagId: string) => {
    if (busyTagId) return;
    setBusyTagId(tagId);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `/api/research/${researchProductId}/tags?tagId=${encodeURIComponent(tagId)}`,
        {
          method: 'DELETE',
          headers: {
            ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }),
          },
        }
      );
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to remove tag');
      }
      await onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove tag');
    } finally {
      setBusyTagId(null);
    }
  };

  return (
    <div
      ref={popoverRef}
      className="absolute z-50 mt-2 w-64 rounded-xl border border-slate-700/60 bg-slate-900/95 backdrop-blur-sm shadow-2xl p-3"
    >
      <div className="flex items-center gap-2 mb-2">
        <TagIcon className="h-3.5 w-3.5 text-slate-400" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              // Belt-and-suspenders: prevent any ancestor form submission.
              e.preventDefault();
              if (trimmed && !exactMatch) {
                attach(undefined, trimmed);
              } else if (trimmed && exactMatch && !currentIds.has(exactMatch.id)) {
                // Enter on an exact match that's not yet attached = attach it.
                attach(exactMatch.id);
              }
            }
          }}
          placeholder="Find or create a tag…"
          maxLength={40}
          className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
        />
      </div>

      <div className="max-h-60 overflow-y-auto -mx-1 px-1">
        {matches.map((tag) => {
          const isAttached = currentIds.has(tag.id);
          const busy = busyTagId === tag.id;
          return (
            <button
              key={tag.id}
              type="button"
              onClick={() => (isAttached ? detach(tag.id) : attach(tag.id))}
              disabled={busy}
              className="w-full flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm text-slate-200 hover:bg-slate-800/60 transition-colors"
            >
              <span className="truncate">{tag.name}</span>
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
              ) : isAttached ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              ) : null}
            </button>
          );
        })}

        {trimmed && !exactMatch && (
          <button
            type="button"
            onClick={() => attach(undefined, trimmed)}
            disabled={creating}
            className="w-full flex items-center justify-between gap-2 rounded-md px-2 py-1.5 mt-1 text-left text-sm text-blue-300 hover:bg-blue-500/10 transition-colors border-t border-slate-700/50 pt-2"
          >
            <span className="truncate">
              {creating ? 'Creating…' : 'Create'}{' '}
              <span className="text-white font-medium">"{trimmed}"</span>
            </span>
            {creating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
          </button>
        )}

        {matches.length === 0 && !trimmed && (
          <p className="text-xs text-slate-500 px-2 py-3">
            Type to search or create a tag.
          </p>
        )}
      </div>

      {error && (
        <p className="mt-2 text-xs text-red-300">{error}</p>
      )}
    </div>
  );
}
