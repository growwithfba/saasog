'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Check, Loader2, Pencil, Trash2, X } from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';
import type { TagShape } from './TagChip';

// Centralised tag CRUD UI. Reached from the "Manage tags…" footer link
// in TagPicker. Lists every user tag with its usage count, supports
// rename + delete (with confirmation). Color-edit is left out for now —
// the tag schema supports it, but we have no UI to pick colors yet
// (free-form hex input felt like overkill for the first cut).

interface UserTag extends TagShape {
  usage_count: number;
}

interface TagManagerModalProps {
  open: boolean;
  onClose: () => void;
  /** Caller supplies the initial tag list + a refresh fn; we use the
   *  same shape as useUserTags so the parent's filter bar / picker stay
   *  in sync. */
  tags: UserTag[];
  onRefresh: () => Promise<void> | void;
}

export function TagManagerModal({ open, onClose, tags, onRefresh }: TagManagerModalProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Reset transient state when the modal opens/closes.
  useEffect(() => {
    if (!open) {
      setEditingId(null);
      setDraft('');
      setBusyId(null);
      setError(null);
      setConfirmDeleteId(null);
    }
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editingId || confirmDeleteId) {
          setEditingId(null);
          setConfirmDeleteId(null);
        } else {
          onClose();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, editingId, confirmDeleteId, onClose]);

  if (!open) return null;

  const beginRename = (tag: UserTag) => {
    setEditingId(tag.id);
    setDraft(tag.name);
    setError(null);
  };

  const commitRename = async (tag: UserTag) => {
    const next = draft.trim();
    if (!next) {
      setError('Tag name cannot be empty.');
      return;
    }
    if (next === tag.name) {
      setEditingId(null);
      return;
    }
    setBusyId(tag.id);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/tags/${tag.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }),
        },
        body: JSON.stringify({ name: next }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Rename failed (HTTP ${res.status})`);
      }
      await onRefresh();
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rename failed.');
    } finally {
      setBusyId(null);
    }
  };

  const performDelete = async (tag: UserTag) => {
    setBusyId(tag.id);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/tags/${tag.id}`, {
        method: 'DELETE',
        headers: {
          ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }),
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Delete failed (HTTP ${res.status})`);
      }
      await onRefresh();
      setConfirmDeleteId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[1100] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700/50 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-slate-700/50 px-5 py-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Manage tags</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
          {tags.length === 0 ? (
            <p className="text-sm text-gray-600 dark:text-slate-400 text-center py-8">
              You haven't created any tags yet. Use the tag picker on a row to add your first one.
            </p>
          ) : (
            <ul className="divide-y divide-gray-200 dark:divide-slate-700/50">
              {tags.map((tag) => {
                const isEditing = editingId === tag.id;
                const isConfirming = confirmDeleteId === tag.id;
                const busy = busyId === tag.id;
                return (
                  <li key={tag.id} className="py-2.5">
                    <div className="flex items-center gap-3">
                      {isEditing ? (
                        <input
                          autoFocus
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitRename(tag);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          maxLength={40}
                          disabled={busy}
                          className="flex-1 bg-white dark:bg-slate-800/50 border border-gray-300 dark:border-slate-600/50 rounded-md px-2 py-1 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 disabled:opacity-60"
                        />
                      ) : (
                        <span className="flex-1 text-sm font-medium text-gray-900 dark:text-white truncate">
                          {tag.name}
                        </span>
                      )}
                      <span className="text-xs text-gray-500 dark:text-slate-400 shrink-0">
                        {tag.usage_count} {tag.usage_count === 1 ? 'product' : 'products'}
                      </span>
                      {isEditing ? (
                        <>
                          <button
                            onClick={() => commitRename(tag)}
                            disabled={busy}
                            className="p-1.5 rounded-md text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10 disabled:opacity-50"
                            title="Save"
                          >
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            disabled={busy}
                            className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-700/40"
                            title="Cancel"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => beginRename(tag)}
                            className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-700/40"
                            title="Rename"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(tag.id)}
                            className="p-1.5 rounded-md text-red-500 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </div>
                    {isConfirming && (
                      <div className="mt-2 ml-1 rounded-md border border-red-300/50 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-200">
                        <p className="flex items-start gap-2">
                          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                          <span>
                            Delete <span className="font-semibold">"{tag.name}"</span>? It will be
                            removed from {tag.usage_count}{' '}
                            {tag.usage_count === 1 ? 'product' : 'products'}.
                          </span>
                        </p>
                        <div className="mt-3 flex justify-end gap-2">
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            disabled={busy}
                            className="px-3 py-1 text-xs font-medium rounded-md bg-white dark:bg-slate-800/50 border border-red-300/50 dark:border-red-500/30 text-red-700 dark:text-red-200 hover:bg-red-50 dark:hover:bg-red-500/20"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => performDelete(tag)}
                            disabled={busy}
                            className="px-3 py-1 text-xs font-medium rounded-md bg-red-600 hover:bg-red-700 text-white disabled:opacity-60 inline-flex items-center gap-1"
                          >
                            {busy && <Loader2 className="h-3 w-3 animate-spin" />}
                            Delete tag
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {error && (
            <p className="mt-3 text-xs text-red-600 dark:text-red-300 flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5" />
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
