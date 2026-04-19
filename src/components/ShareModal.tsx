'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, Globe, Loader2, Lock, X } from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  submissionId: string;
  initialIsPublic: boolean;
  initialSharedAt: string | null;
  /** Called when the share state successfully changes on the server. */
  onShareChange?: (next: { isPublic: boolean; publicSharedAt: string | null }) => void;
}

export function ShareModal({
  isOpen,
  onClose,
  submissionId,
  initialIsPublic,
  initialSharedAt,
  onShareChange,
}: ShareModalProps) {
  const [isPublic, setIsPublic] = useState(initialIsPublic);
  const [sharedAt, setSharedAt] = useState(initialSharedAt);
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep local state in sync with the latest props when the modal reopens
  // for a different submission or after an external refetch.
  useEffect(() => {
    if (isOpen) {
      setIsPublic(initialIsPublic);
      setSharedAt(initialSharedAt);
      setCopied(false);
      setError(null);
    }
  }, [isOpen, initialIsPublic, initialSharedAt, submissionId]);

  const shareUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/submission/${submissionId}`
      : `/submission/${submissionId}`;

  const handleToggle = async (nextShared: boolean) => {
    if (isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/submissions/share', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }),
        },
        body: JSON.stringify({ submissionId, shared: nextShared }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to update sharing');
      }
      const nextSharedAt = data.submission?.public_shared_at ?? null;
      setIsPublic(nextShared);
      setSharedAt(nextSharedAt);
      onShareChange?.({ isPublic: nextShared, publicSharedAt: nextSharedAt });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Could not copy — select and copy manually.');
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-slate-700/60 bg-slate-900/95 shadow-2xl"
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-700/60">
          <div className="flex items-center gap-3">
            <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${
              isPublic ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-700/50 text-slate-400'
            }`}>
              {isPublic ? <Globe className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Share this analysis</h2>
              <p className="text-xs text-slate-400">
                {isPublic
                  ? 'Anyone with the link below can view this page.'
                  : 'Only you can see this analysis right now.'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Toggle row */}
          <div className="flex items-center justify-between rounded-xl border border-slate-700/60 bg-slate-800/40 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-white">Public share link</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {isPublic && sharedAt
                  ? `Shared on ${new Date(sharedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                  : 'Off — turn on to generate a shareable link.'}
              </p>
            </div>
            <button
              role="switch"
              aria-checked={isPublic}
              disabled={isSaving}
              onClick={() => handleToggle(!isPublic)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                isPublic ? 'bg-emerald-500' : 'bg-slate-600'
              } ${isSaving ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  isPublic ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
              {isSaving && (
                <Loader2 className="absolute left-1/2 -translate-x-1/2 h-3 w-3 animate-spin text-white" />
              )}
            </button>
          </div>

          {/* URL row — only meaningful when public */}
          {isPublic && (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-2 uppercase tracking-wide">
                Share URL
              </label>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={shareUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className="flex-1 rounded-lg border border-slate-700/60 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/60"
                />
                <button
                  onClick={handleCopy}
                  className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    copied
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-emerald-500 text-white hover:bg-emerald-600'
                  }`}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Anyone with this link — no sign-in needed — can view the full analysis.
              </p>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
