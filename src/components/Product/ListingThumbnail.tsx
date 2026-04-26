'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink } from 'lucide-react';

// Lifted from ProductVettingResults.tsx (commit 32c28d5) so the same
// hover-zoom thumbnail can be reused on the dashboard / list rows /
// product header. See src/hooks/useListingImages.ts for the asin → URL
// source.
//
// `src` is the Amazon CDN URL returned by /api/keepa/listing-images.
// When null/undefined, renders a slate placeholder so the column stays
// visually aligned across rows that have no captured image.
//
// `dim` mirrors the matrix's strikethrough rows (60% opacity) — used
// when the thumbnail represents a removed/excluded competitor.
//
// `linkHref` (optional) wraps the image in an <a target="_blank"> with
// a small external-link icon overlay in the top-right corner. Used by
// list rows so the thumbnail doubles as the Amazon listing link
// (replaces the standalone ASIN-link column).

export type ListingThumbnailSize = 'sm' | 'md' | 'lg' | 'xl';

type Props = {
  src: string | null | undefined;
  size?: ListingThumbnailSize;
  dim?: boolean;
  alt?: string;
  linkHref?: string;
  linkLabel?: string;
};

const SIZE_PX: Record<ListingThumbnailSize, number> = {
  sm: 24,
  md: 32,
  lg: 48,
  xl: 64,
};

const PREVIEW_PX = 240;
const PREVIEW_MARGIN = 12;

export function ListingThumbnail({
  src,
  size = 'md',
  dim = false,
  alt = '',
  linkHref,
  linkLabel,
}: Props) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!hovered || !src) {
      setPosition(null);
      return;
    }
    if (!triggerRef.current || typeof window === 'undefined') return;
    const rect = triggerRef.current.getBoundingClientRect();
    let left = rect.right + PREVIEW_MARGIN;
    if (left + PREVIEW_PX > window.innerWidth - PREVIEW_MARGIN) {
      left = rect.left - PREVIEW_PX - PREVIEW_MARGIN;
    }
    let top = rect.top + rect.height / 2 - PREVIEW_PX / 2;
    if (top < PREVIEW_MARGIN) top = PREVIEW_MARGIN;
    if (top + PREVIEW_PX > window.innerHeight - PREVIEW_MARGIN) {
      top = window.innerHeight - PREVIEW_PX - PREVIEW_MARGIN;
    }
    setPosition({ top, left });
  }, [hovered, src]);

  const px = SIZE_PX[size];
  const boxStyle = { width: px, height: px } as const;

  if (!src) {
    return (
      <div
        className="shrink-0 rounded bg-slate-800/40 border border-slate-700/40"
        style={boxStyle}
      />
    );
  }

  const imageEl = (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className={`w-full h-full rounded object-contain bg-white/5 border border-slate-700/50 cursor-zoom-in ${dim ? 'opacity-60' : ''}`}
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.display = 'none';
      }}
    />
  );

  // External-link badge — only shown when the thumbnail is wrapped in an
  // anchor (i.e. it's acting as the Amazon listing link). Sized down on
  // smaller thumbnails so it doesn't overpower the image.
  const linkBadge = linkHref ? (
    <span
      aria-hidden="true"
      className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center rounded-md bg-slate-900/90 border border-slate-600/70 text-blue-300 shadow-sm"
      style={{
        width: size === 'sm' ? 12 : 16,
        height: size === 'sm' ? 12 : 16,
      }}
    >
      <ExternalLink className={size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5'} />
    </span>
  ) : null;

  const inner = (
    <div className="relative w-full h-full">
      {imageEl}
      {linkBadge}
    </div>
  );

  return (
    <div
      ref={triggerRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="relative shrink-0"
      style={boxStyle}
    >
      {linkHref ? (
        <a
          href={linkHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={linkLabel || 'Open on Amazon'}
          className="block w-full h-full"
          onClick={(e) => e.stopPropagation()}
        >
          {inner}
        </a>
      ) : (
        inner
      )}
      {hovered && position && typeof document !== 'undefined' &&
        createPortal(
          <div
            style={{ top: position.top, left: position.left, width: PREVIEW_PX, height: PREVIEW_PX }}
            className="fixed z-[9999] rounded-xl border border-slate-700/70 bg-slate-900/95 backdrop-blur-md shadow-2xl p-2 pointer-events-none"
          >
            <img
              src={src}
              alt=""
              className="w-full h-full object-contain rounded-md bg-white/5"
            />
          </div>,
          document.body
        )}
    </div>
  );
}
