import React from 'react';
import { Check } from 'lucide-react';

interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  /**
   * Optional custom size. Default is h-4 w-4 (16px).
   * Use 'sm' for smaller (h-3 w-3) or 'md' for default.
   */
  size?: 'sm' | 'md';
  /**
   * Partial selection (a header "select all" with only some rows picked).
   * Renders a short horizontal bar instead of the check and sets the native
   * `indeterminate` flag on the hidden input so screen readers announce "mixed".
   */
  indeterminate?: boolean;
}

/**
 * The app's one checkbox — the Discovery / BloomLens look.
 *
 * Design specs:
 * - Default: ~16px (h-4 w-4). Light: white box, navy hairline. Dark: transparent box, subtle border.
 * - Hover: Slightly stronger border, subtle bg wash
 * - Focus: Accessible ring (cyan-500/30), no bright glow
 * - Checked: Solid cyan in light (cyan-600); cyan-500/70 in dark. White check.
 * - Indeterminate: same fill as checked, with a short bar instead of the check
 * - Disabled: Lower opacity, no interactions
 */
export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className = '', size = 'md', disabled, indeterminate = false, ...props }, ref) => {
    const sizeClasses = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4';
    const [isChecked, setIsChecked] = React.useState(props.checked ?? props.defaultChecked ?? false);
    const [isFocused, setIsFocused] = React.useState(false);
    const inputRef = React.useRef<HTMLInputElement>(null);

    // Combine refs
    React.useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

    // Sync with controlled/uncontrolled state
    React.useEffect(() => {
      if (props.checked !== undefined) {
        setIsChecked(props.checked);
      } else if (inputRef.current) {
        setIsChecked(inputRef.current.checked);
      }
    }, [props.checked]);

    // `indeterminate` is a DOM property, not an attribute — set it by hand.
    React.useEffect(() => {
      if (inputRef.current) {
        inputRef.current.indeterminate = indeterminate;
      }
    }, [indeterminate]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (props.checked === undefined) {
        setIsChecked(e.target.checked);
      }
      props.onChange?.(e);
    };

    const handleVisualClick = (e: React.MouseEvent<HTMLDivElement>) => {
      if (!disabled && inputRef.current) {
        e.preventDefault();
        e.stopPropagation();
        inputRef.current.click();
      }
    };

    const currentChecked = props.checked !== undefined ? props.checked : isChecked;
    const filled = currentChecked || indeterminate;

    return (
      <div className="relative inline-flex items-center">
        <input
          type="checkbox"
          ref={inputRef}
          {...props}
          checked={currentChecked}
          onChange={handleChange}
          onFocus={(e) => {
            setIsFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            props.onBlur?.(e);
          }}
          disabled={disabled}
          className="sr-only"
        />
        <div
          className={`
            ${sizeClasses}
            relative
            shrink-0
            rounded-[4px]
            border
            transition-all
            duration-150
            flex
            items-center
            justify-center
            ${
              disabled
                ? 'opacity-40 cursor-not-allowed'
                : 'cursor-pointer'
            }
            ${
              filled
                ? 'bg-cyan-600 border-cyan-600 dark:bg-cyan-500/70 dark:border-cyan-400/50'
                : 'bg-white border-[#1e3a8a]/30 dark:bg-transparent dark:border-white/15'
            }
            ${
              !disabled && !filled
                ? 'hover:border-[#1e3a8a]/50 hover:bg-[#f3f6fc] dark:hover:border-white/25 dark:hover:bg-white/5'
                : ''
            }
            ${
              isFocused && !disabled
                ? 'ring-2 ring-cyan-500/30 ring-offset-0'
                : ''
            }
            ${className}
          `}
          onClick={handleVisualClick}
        >
          {indeterminate ? (
            <span
              aria-hidden
              className={`${size === 'sm' ? 'w-1.5' : 'w-2'} h-0.5 rounded-full bg-white`}
            />
          ) : currentChecked ? (
            <Check
              className={`
                ${size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3'}
                text-white
                stroke-[2.5]
              `}
            />
          ) : null}
        </div>
      </div>
    );
  }
);

Checkbox.displayName = 'Checkbox';
