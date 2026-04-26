'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Plus, Tag as TagIcon } from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';
import type { TagShape } from './TagChip';

// Bulk-mode tag picker — surfaces from the selection toolbar in
// research / vetting list views. Supports two actions:
//
//   'add'    — add the chosen tag to every selected research product.
//              Includes a "Create new" affordance like the per-row
//              picker.
//   'remove' — remove the chosen tag from every selected research
//              product.
//
// Backed by /api/research/tags/bulk (single transactional endpoint).
// Calls onAfter() once on success so the caller can refetch + clear
// the selection.

interface BulkTagPickerProps {
  anchorRef: React.RefObject<HTMLElement>;
  /** research_product_id list — caller resolves submission.id → research_product_id. */
  researchProductIds: string[];
  allTags: TagShape[];
  mode: 'add' | 'remove';
  open: boolean;
  onClose: () => void;
  /** Fired after a successful bulk action so the caller can refetch
   *  data and clear the selection. */
  onAfter: () => void | Promise<void>;
}

const POPOVER_WIDTH = 280;
const POPOVER_GAP = 6;
const POPOVER_MAX_HEIGHT = 280;
const VIEWPORT_MARGIN = 8;

export function BulkTagPicker({
  anchorRef,
  researchProductIds,
  allTags,
  mode,
  open,
  onClose,
  onAfter,
}: BulkTagPickerProps) {
  const [query, setQuery] = useState('');
  const [busyTagId, setBusyTagId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Position against the anchor (same logic as TagPicker, simpler since
  // we don't bother flipping above/below).
  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const place = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const top = rect.bottom + POPOVER_GAP;
      const rawLeft = rect.left;
      const maxLeft = window.innerWidth - POPOVER_WIDTH - VIEWPORT_MARGIN;
      const left = Math.min(Math.max(VIEWPORT_MARGIN, rawLeft), Math.max(VIEWPORT_MARGIN, maxLeft));
      setPosition({ top, left });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popoverRef.current?.contains(t)) return;
      if (anchorRef.current?.contains(t)) return;
      onClose();
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
  }, [open, onClose, anchorRef]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  if (!open || typeof window === 'undefined' || !position) return null;

  const trimmed = query.trim();
  const lowered = trimmed.toLowerCase();
  const matches = allTags.filter((t) => t.name.toLowerCase().includes(lowered));
  const exactMatch = allTags.find((t) => t.name.toLowerCase() === lowered);

  const performBulk = async (opts: { tagId?: string; tagName?: string }) => {
    const id = opts.tagId ?? null;
    if (id) setBusyTagId(id);
    else setCreating(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/research/tags/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }),
        },
        body: JSON.stringify({
          researchProductIds,
          action: mode,
          ...(id ? { tagId: id } : {}),
          ...(opts.tagName ? { tagName: opts.tagName } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Bulk ${mode} failed (HTTP ${res.status})`);
      }
      await onAfter();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Bulk ${mode} failed.`);
    } finally {
      setBusyTagId(null);
      setCreating(false);
    }
  };

  const popover = (
    <div
      ref={popoverRef}
      style={{ top: position.top, left: position.left, width: POPOVER_WIDTH }}
      className="fixed z-[1000] rounded-xl border border-slate-700/60 bg-slate-900/95 backdrop-blur-sm shadow-2xl p-3"
    >
      <div className="flex items-center gap-2 mb-1">
        <TagIcon className="h-3.5 w-3.5 text-slate-400" />
        <p className="text-xs uppercase tracking-wider text-slate-400">
          {mode === 'add'
            ? `Tag ${researchProductIds.length} ${researchProductIds.length === 1 ? 'product' : 'products'}`
            : `Untag ${researchProductIds.length} ${researchProductIds.length === 1 ? 'product' : 'products'}`}
        </p>
      </div>

      <div className="flex items-center gap-2 mb-2 border-b border-slate-700/50 pb-2">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (mode === 'add' && trimmed && !exactMatch) {
                performBulk({ tagName: trimmed });
              } else if (trimmed && exactMatch) {
                performBulk({ tagId: exactMatch.id });
              }
            }
          }}
          placeholder={mode === 'add' ? 'Find or create a tag…' : 'Find a tag to remove…'}
          maxLength={40}
          className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
        />
      </div>

      <div className="overflow-y-auto -mx-1 px-1" style={{ maxHeight: POPOVER_MAX_HEIGHT }}>
        {matches.length > 0 ? (
          matches.map((tag) => {
            const busy = busyTagId === tag.id;
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => performBulk({ tagId: tag.id })}
                disabled={busy}
                className="w-full flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm text-slate-200 hover:bg-slate-800/60 transition-colors"
              >
                <span className="truncate">{tag.name}</span>
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
              </button>
            );
          })
        ) : !trimmed ? (
          <p className="text-xs text-slate-500 px-2 py-3">
            {mode === 'add' ? 'Type to search or create a tag.' : 'Type to search a tag.'}
          </p>
        ) : null}

        {mode === 'add' && trimmed && !exactMatch && (
          <button
            type="button"
            onClick={() => performBulk({ tagName: trimmed })}
            disabled={creating}
            className="w-full flex items-center justify-between gap-2 rounded-md px-2 py-1.5 mt-1 text-left text-sm text-blue-300 hover:bg-blue-500/10 transition-colors border-t border-slate-700/50 pt-2"
          >
            <span className="truncate">
              {creating ? 'Creating…' : 'Create + tag'}{' '}
              <span className="text-white font-medium">"{trimmed}"</span>
            </span>
            {creating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
          </button>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
    </div>
  );

  return createPortal(popover, document.body);
}
