'use client';

import { ReactNode, useRef, useState, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';

interface TooltipProps {
  content: string;
  children?: ReactNode;
  className?: string;
}

const TOOLTIP_GAP = 8;
const TOOLTIP_MAX_WIDTH = 288;
const VIEWPORT_MARGIN = 8;

export function Tooltip({ content, children, className = '' }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  // positioned=false while we render the tooltip off-screen for measurement;
  // once the real placement is calculated we flip positioned=true and the
  // opacity transition reveals it. This avoids the flash at viewport (0,0)
  // that reads as "clipped at the top of the container".
  const [positioned, setPositioned] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number; placement: 'top' | 'bottom' }>({
    top: -9999,
    left: -9999,
    placement: 'top',
  });
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!isVisible) {
      setPositioned(false);
      return;
    }
    if (!triggerRef.current || typeof window === 'undefined') return;
    const trigger = triggerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current?.getBoundingClientRect();
    const tooltipHeight = tooltipRect?.height ?? 40;
    const tooltipWidth = tooltipRect?.width ?? TOOLTIP_MAX_WIDTH;
    const spaceAbove = trigger.top;
    const spaceBelow = window.innerHeight - trigger.bottom;
    const needed = tooltipHeight + TOOLTIP_GAP + VIEWPORT_MARGIN;
    // Prefer 'bottom' — the table's column-header tooltips live near the top
    // of the viewport, where 'top' placement clips. Only use 'top' when
    // 'bottom' doesn't fit AND 'top' does.
    const placement: 'top' | 'bottom' =
      spaceBelow >= needed || spaceAbove < needed ? 'bottom' : 'top';
    const top =
      placement === 'top'
        ? trigger.top - tooltipHeight - TOOLTIP_GAP
        : trigger.bottom + TOOLTIP_GAP;
    const rawLeft = trigger.left + trigger.width / 2 - tooltipWidth / 2;
    const maxLeft = window.innerWidth - tooltipWidth - VIEWPORT_MARGIN;
    const left = Math.min(Math.max(VIEWPORT_MARGIN, rawLeft), Math.max(VIEWPORT_MARGIN, maxLeft));
    setPosition({ top, left, placement });
    setPositioned(true);
  }, [isVisible, content]);

  return (
    <div className={`relative inline-flex items-center ${className}`}>
      <div
        ref={triggerRef}
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        className="cursor-help"
      >
        {children || <Info className="w-3.5 h-3.5 text-slate-400" />}
      </div>
      {isVisible &&
        typeof window !== 'undefined' &&
        createPortal(
          <div
            ref={tooltipRef}
            style={{
              top: position.top,
              left: position.left,
              maxWidth: TOOLTIP_MAX_WIDTH,
              opacity: positioned ? 1 : 0,
            }}
            className="fixed px-3 py-2 bg-slate-900/95 backdrop-blur-sm border border-slate-700/50 rounded-lg text-xs text-slate-300 z-[9999] shadow-xl pointer-events-none transition-opacity duration-75"
          >
            {content}
          </div>,
          document.body
        )}
    </div>
  );
}

