'use client';

import { ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Hover tooltip that reveals the full product title when the rendered
// label is line-clamped in a list row. Same portal+ positioning pattern
// as ListingThumbnail so the popover can escape table-cell overflow.
//
// Always shown on hover regardless of whether the inner element is
// actually truncated — the cost of a redundant popover for a short
// title is small and avoids measuring overflow on every render.

const POPUP_MAX_W = 360;
const POPUP_MARGIN = 12;

type Props = {
  text: string;
  children: ReactNode;
  className?: string;
};

export function TitleTooltip({ text, children, className }: Props) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!hovered || !text) {
      setPosition(null);
      return;
    }
    if (!triggerRef.current || typeof window === 'undefined') return;
    const rect = triggerRef.current.getBoundingClientRect();
    // Anchor below the trigger by default, flip above if it would clip.
    let top = rect.bottom + 8;
    let left = rect.left;
    if (left + POPUP_MAX_W > window.innerWidth - POPUP_MARGIN) {
      left = window.innerWidth - POPUP_MAX_W - POPUP_MARGIN;
    }
    if (left < POPUP_MARGIN) left = POPUP_MARGIN;
    // Approximate popup height — tooltip wraps so we can't know exactly,
    // but capping at viewport height covers the worst case.
    if (top > window.innerHeight - 80) {
      top = rect.top - 8 - 80;
    }
    setPosition({ top, left });
  }, [hovered, text]);

  return (
    <div
      ref={triggerRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={className}
    >
      {children}
      {hovered && position && typeof document !== 'undefined' && text &&
        createPortal(
          <div
            style={{ top: position.top, left: position.left, maxWidth: POPUP_MAX_W }}
            className="fixed z-[9999] rounded-lg border border-slate-700/70 bg-slate-900/95 backdrop-blur-md shadow-2xl px-3 py-2 text-xs text-slate-100 leading-snug pointer-events-none"
          >
            {text}
          </div>,
          document.body
        )}
    </div>
  );
}
