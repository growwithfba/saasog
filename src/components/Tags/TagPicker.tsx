'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Loader2, Plus, Tag as TagIcon } from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';
import type { TagShape } from './TagChip';

interface TagPickerProps {
  /** The "+ tag" button element the popover should anchor to. Passed as
   *  a ref so the popover can read its bounding rect for positioning. */
  anchorRef: React.RefObject<HTMLElement>;
  researchProductId: string;
  currentTags: TagShape[];
  allTags: TagShape[];
  open: boolean;
  onClose: () => void;
  /** Called with the full tag object after a successful attach so the
   *  parent can optimistically update its row state. */
  onAttached: (tag: TagShape) => void;
  /** Called with the tag id after a successful detach from within the
   *  picker. */
  onDetached: (tagId: string) => void;
}

const POPOVER_WIDTH = 256; // px
const POPOVER_GAP = 6;     // px between anchor and popover
const POPOVER_MAX_HEIGHT = 280; // px, for list scroll area
const VIEWPORT_MARGIN = 8; // px padding against window edges

export function TagPicker({
  anchorRef,
  researchProductId,
  currentTags,
  allTags,
  open,
  onClose,
  onAttached,
  onDetached,
}: TagPickerProps) {
  const [query, setQuery] = useState('');
  const [busyTagId, setBusyTagId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number; placement: 'below' | 'above' } | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reposition against the anchor. Runs on open + on scroll/resize.
  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const place = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const estimatedHeight = POPOVER_MAX_HEIGHT + 80; // list + input + padding
      const placement: 'below' | 'above' =
        spaceBelow < estimatedHeight && rect.top > estimatedHeight ? 'above' : 'below';
      const top =
        placement === 'below'
          ? rect.bottom + POPOVER_GAP
          : rect.top - POPOVER_GAP - Math.min(estimatedHeight, rect.top - VIEWPORT_MARGIN);
      const rawLeft = rect.left;
      const maxLeft = window.innerWidth - POPOVER_WIDTH - VIEWPORT_MARGIN;
      const left = Math.min(Math.max(VIEWPORT_MARGIN, rawLeft), Math.max(VIEWPORT_MARGIN, maxLeft));
      setPosition({ top, left, placement });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, anchorRef]);

  // Close on outside click / escape.
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
      // Autofocus input on open.
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  if (!open || typeof window === 'undefined' || !position) return null;

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
      // Resolve the full tag object. For a brand-new tag we just got an
      // id; look it up by name if possible, else synthesize a placeholder
      // that the parent can reconcile with its next tag refresh.
      const resolved: TagShape =
        allTags.find((t) => t.id === data.tagId) ||
        (tagName
          ? { id: data.tagId, name: tagName, color: null }
          : { id: data.tagId, name: tagName || '', color: null });
      onAttached(resolved);
      setQuery('');
      onClose();
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
      onDetached(tagId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove tag');
    } finally {
      setBusyTagId(null);
    }
  };

  const popover = (
    <div
      ref={popoverRef}
      style={{
        top: position.top,
        left: position.left,
        width: POPOVER_WIDTH,
      }}
      className="fixed z-[1000] rounded-xl border border-slate-700/60 bg-slate-900/95 backdrop-blur-sm shadow-2xl p-3"
    >
      <div className="flex items-center gap-2 mb-2">
        <TagIcon className="h-3.5 w-3.5 text-slate-400" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (trimmed && !exactMatch) {
                attach(undefined, trimmed);
              } else if (trimmed && exactMatch && !currentIds.has(exactMatch.id)) {
                attach(exactMatch.id);
              }
            }
          }}
          placeholder="Find or create a tag…"
          maxLength={40}
          className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
        />
      </div>

      <div
        className="overflow-y-auto -mx-1 px-1"
        style={{ maxHeight: POPOVER_MAX_HEIGHT }}
      >
        {matches.length > 0 ? (
          matches.map((tag) => {
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
          })
        ) : !trimmed ? (
          <p className="text-xs text-slate-500 px-2 py-3">
            Type to search or create a tag.
          </p>
        ) : null}

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
      </div>

      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
    </div>
  );

  return createPortal(popover, document.body);
}
