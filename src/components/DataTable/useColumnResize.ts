'use client';

import { useCallback } from 'react';
import { MIN_COLUMN_WIDTH } from './styles';

/**
 * Drag-to-resize for a fixed-layout table. Listens on the window rather than
 * the handle so the pointer can leave the 6px strip mid-drag without the
 * resize stopping. Returns the `onResizeStart` a HeaderCell expects.
 */
export function useColumnResize(
  widths: Record<string, number>,
  onChange: (widths: Record<string, number>) => void,
  minWidth = MIN_COLUMN_WIDTH,
) {
  return useCallback(
    (id: string, startWidth: number, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      let latest = widths;
      const onMove = (ev: MouseEvent) => {
        latest = { ...widths, [id]: Math.max(minWidth, startWidth + (ev.clientX - startX)) };
        onChange(latest);
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [widths, onChange, minWidth],
  );
}
