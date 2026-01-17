import React from 'react';
import { Check } from 'lucide-react';

interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  /**
   * Optional custom size. Default is h-4 w-4 (16px).
   * Use 'sm' for smaller (h-3 w-3) or 'md' for default.
   */
  size?: 'sm' | 'md';
}

/**
 * Muted, modern checkbox component for dark theme.
 * 
 * Design specs:
 * - Default: ~16px (h-4 w-4), transparent/dark background, subtle border
 * - Hover: Slightly stronger border, optional subtle bg tint
 * - Focus: Accessible ring (cyan-400/25), no bright glow
 * - Checked: Accent color (cyan-500/70) with matching border
 * - Disabled: Lower opacity, no interactions
 */
export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className = '', size = 'md', disabled, ...props }, ref) => {
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
              currentChecked
                ? 'bg-cyan-500/70 border-cyan-400/50'
                : 'bg-transparent border-white/15 dark:border-slate-500/30'
            }
            ${
              !disabled && !currentChecked
                ? 'hover:border-white/25 hover:bg-white/5'
                : ''
            }
            ${
              isFocused && !disabled
                ? 'ring-2 ring-cyan-400/25 ring-offset-0'
                : ''
            }
            ${className}
          `}
          onClick={handleVisualClick}
        >
          {currentChecked && (
            <Check
              className={`
                ${size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3'}
                text-white
                stroke-[2.5]
              `}
            />
          )}
        </div>
      </div>
    );
  }
);

Checkbox.displayName = 'Checkbox';
