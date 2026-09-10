'use client';

import { Check, Copy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Tooltip } from '@/components/ui/Tooltip';

/** How long the copied-state flash lasts, matching the Lens drawer. */
const COPIED_FLASH_MS = 1500;

interface AsinCellProps {
  asin: string;
  /**
   * Only present when this ASIN was cached at full depth by the extension.
   * Discovery hydrates lean, so it is null for most rows.
   */
  fulfillment: 'AMZ' | 'FBA' | 'FBM' | null;
}

/**
 * The ASIN under a product title: click to copy.
 *
 * Sized and coloured to match the Lens drawer's ASIN cell — 14px mono, blue-400
 * — rather than the muted 12px it used to be. The image beside it is already
 * the "open on Amazon" affordance, so the text is free to be the copy button
 * instead of a second link to the same place.
 */
export function AsinCell({ asin, fulfillment }: AsinCellProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = () => {
    // Flash optimistically rather than waiting on the clipboard promise: it
    // can reject silently on a permissions quirk, and a copy that shows no
    // feedback reads as a dead control.
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_FLASH_MS);
    void navigator.clipboard?.writeText(asin).catch(() => {});
  };

  return (
    <span className="inline-flex items-center gap-1.5">
      <Tooltip text={copied ? 'Copied' : 'Copy ASIN'}>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? 'ASIN copied' : `Copy ASIN ${asin}`}
          className={`inline-flex items-center gap-1.5 font-mono text-sm font-medium tracking-wide transition-colors ${
            copied
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 hover:underline'
          }`}
        >
          {asin}
          {copied ? (
            <Check className="w-3.5 h-3.5" />
          ) : (
            <Copy className="w-3 h-3 opacity-50" />
          )}
        </button>
      </Tooltip>
      {fulfillment && (
        <span className="text-xs text-gray-500 dark:text-slate-400">· {fulfillment}</span>
      )}
    </span>
  );
}
