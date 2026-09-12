'use client';

import { Info } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';

/**
 * A filter's label with an optional ⓘ explaining it.
 *
 * The explanation lives on the icon rather than under the label so the grid
 * stays scannable — twenty filters each carrying a sentence of help text would
 * be a wall rather than a form.
 */
export function FilterLabel({
  label,
  note,
  className,
}: {
  label: string;
  note?: string;
  className: string;
}) {
  return (
    <span className={`${className} inline-flex items-center gap-1.5`}>
      {label}
      {note && (
        <Tooltip text={note} size="lg">
          <Info
            className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 transition-colors cursor-help"
            aria-label={`What is ${label}?`}
          />
        </Tooltip>
      )}
    </span>
  );
}
