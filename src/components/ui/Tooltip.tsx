'use client';

import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Portal } from './Portal';

interface TooltipProps {
  text: string;
  children: ReactNode;
  /** 'lg' widens the tip and lets it wrap — for full product titles. */
  size?: 'md' | 'lg';
  /** Matches the trigger's layout; a table cell needs block, an icon inline. */
  display?: 'inline-flex' | 'block';
}

/** Widths the tip can take, by size. Positioning has to know these. */
const MAX_WIDTH = { md: 260, lg: 420 } as const;

/** Kept clear of the viewport edge so a tip never sits flush against it. */
const VIEWPORT_PADDING = 8;

/**
 * Hover tooltip, ported from the Lens drawer so both surfaces feel the same:
 * no open delay, a 120ms fade, and the tip sitting just under the trigger.
 *
 * Portalled to <body> deliberately. The results table scrolls inside an
 * `overflow-x-auto` container, which clips any absolutely-positioned child, and
 * several app containers use `backdrop-blur`, which turns `position: fixed`
 * into "fixed relative to that ancestor". Both bugs vanish outside the tree.
 *
 * Rendered only while hovered rather than toggled with a class, so a table of
 * 300 rows carries no hidden tip nodes.
 */
export function Tooltip({ text, children, size = 'md', display = 'inline-flex' }: TooltipProps) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<
    null | { top: number; left: number; flip: 'left' | 'center' | 'right' }
  >(null);

  const show = useCallback(() => {
    const el = triggerRef.current;
    if (!el || !text) return;
    const rect = el.getBoundingClientRect();
    const width = MAX_WIDTH[size];
    const viewport = window.innerWidth;
    // Flip only when a centred tip would actually overhang. The old fixed
    // 130px margin was derived from the narrow tip, so a wide one near the
    // left edge stayed centred and ran off the screen.
    const half = width / 2;
    const centre = rect.left + rect.width / 2;
    if (centre - half < VIEWPORT_PADDING) {
      // Anchored left, but never past the edge, and never so far right that it
      // loses its trigger.
      const left = Math.min(
        Math.max(rect.left, VIEWPORT_PADDING),
        Math.max(VIEWPORT_PADDING, viewport - width - VIEWPORT_PADDING),
      );
      setPos({ top: rect.bottom + 6, left, flip: 'left' });
    } else if (centre + half > viewport - VIEWPORT_PADDING) {
      const right = Math.max(
        Math.min(rect.right, viewport - VIEWPORT_PADDING),
        Math.min(viewport - VIEWPORT_PADDING, width + VIEWPORT_PADDING),
      );
      setPos({ top: rect.bottom + 6, left: right, flip: 'right' });
    } else {
      setPos({ top: rect.bottom + 6, left: centre, flip: 'center' });
    }
  }, [text, size]);

  const hide = useCallback(() => setPos(null), []);

  return (
    <>
      <span
        ref={triggerRef}
        className={display === 'block' ? 'block min-w-0' : 'inline-flex items-center'}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </span>
      {pos && (
        <Portal>
          <span
            role="tooltip"
            style={{
              top: pos.top,
              left: pos.left,
              maxWidth: MAX_WIDTH[size],
              fontSize: size === 'lg' ? 13 : 12,
              padding: size === 'lg' ? '10px 13px' : '8px 11px',
              lineHeight: size === 'lg' ? 1.45 : 1.4,
              transform:
                pos.flip === 'center'
                  ? 'translateX(-50%)'
                  : pos.flip === 'right'
                    ? 'translateX(-100%)'
                    : undefined,
              background: 'rgba(2, 6, 23, 0.97)',
              boxShadow: '0 12px 32px rgba(2, 6, 23, 0.7), 0 2px 6px rgba(0, 0, 0, 0.35)',
            }}
            className="fixed z-[9999] w-max rounded-lg border border-slate-700 font-medium text-slate-100 text-left whitespace-normal normal-case tracking-normal pointer-events-none animate-[bloom-tip-in_120ms_ease_both]"
          >
            {text}
          </span>
        </Portal>
      )}
    </>
  );
}
