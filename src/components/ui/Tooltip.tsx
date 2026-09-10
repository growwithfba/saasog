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

/** Beyond this from a viewport edge, the tip centres on its trigger. */
const EDGE_MARGIN = 130;

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
    const centre = rect.left + rect.width / 2;
    if (centre < EDGE_MARGIN) setPos({ top: rect.bottom + 6, left: rect.left, flip: 'left' });
    else if (centre > window.innerWidth - EDGE_MARGIN)
      setPos({ top: rect.bottom + 6, left: rect.right, flip: 'right' });
    else setPos({ top: rect.bottom + 6, left: centre, flip: 'center' });
  }, [text]);

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
              maxWidth: size === 'lg' ? 420 : 260,
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
