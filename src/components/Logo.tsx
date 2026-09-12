'use client';

import Link from 'next/link';

export type LogoVariant = 'wordmark' | 'horizontal' | 'stacked' | 'icon';

interface LogoProps {
  variant?: LogoVariant;
  /** Tailwind height class (h-10, h-12, h-16) sets the icon height; the
   *  wordmark scales with it. Other classes pass through to the wrapper. */
  className?: string;
  alt?: string;
  href?: string;
  priority?: boolean;
  /** 'dark' pins the dark-mode colours regardless of theme — for headers
   *  that are always dark (AppHeader), where the silver "Bloom" would
   *  otherwise flip to slate and vanish in light mode. */
  tone?: 'auto' | 'dark';
}

/** The plant-on-circuit mark, transparent — the same mark the cohort lockup uses. */
const ICON_SRC = '/BloomEngine%20Icon%20-%20Square%20-%20Transparent.png';

/** Tailwind h-N → px. Falls back to the nav size. */
function iconPx(className: string) {
  const m = className.match(/\bh-(\d+)\b/);
  return m ? Number(m[1]) * 4 : 40;
}

/**
 * The BloomEngine lockup, drawn live instead of loaded as a PNG so it can
 * match the cohort artwork: the plant mark, then "Bloom" in silver and
 * "Engine" in the sky → cyan → green → lime sweep, set in Montserrat
 * ExtraBold. Light mode deepens the silver to slate and the sweep a step,
 * so it holds on white without losing the read.
 */
export function Logo({
  variant = 'wordmark',
  className = '',
  alt = 'BloomEngine',
  href,
  tone = 'auto',
}: LogoProps) {
  const px = iconPx(className);
  const passthrough = className.replace(/\bh-\d+\b/, '').trim();

  const icon = (
    <img
      src={ICON_SRC}
      alt={variant === 'icon' ? alt : ''}
      aria-hidden={variant !== 'icon'}
      width={px}
      height={px}
      style={{ width: px, height: px }}
      className="shrink-0 object-contain drop-shadow-[0_0_10px_rgba(34,211,238,0.35)]"
    />
  );

  const wordmark =
    variant === 'icon' ? null : (
      <span
        className="font-brand font-extrabold leading-none tracking-[-0.02em] whitespace-nowrap select-none"
        style={{ fontSize: Math.round(px * 0.62) }}
        aria-label={alt}
      >
        <span
          className={`bg-clip-text text-transparent bg-gradient-to-b ${
            tone === 'dark'
              ? 'from-white to-slate-300'
              : 'from-slate-800 to-slate-600 dark:from-white dark:to-slate-300'
          }`}
        >
          Bloom
        </span>
        <span
          className={`bg-clip-text text-transparent bg-gradient-to-r ${
            tone === 'dark'
              ? 'from-sky-400 via-emerald-400 to-lime-400'
              : 'from-sky-600 via-emerald-500 to-lime-500 dark:from-sky-400 dark:via-emerald-400 dark:to-lime-400'
          }`}
        >
          Engine
        </span>
      </span>
    );

  const lockup = (
    <span
      className={`inline-flex items-center gap-2.5 ${
        variant === 'stacked' ? 'flex-col gap-3' : ''
      } ${passthrough}`}
    >
      {icon}
      {wordmark}
    </span>
  );

  if (href) {
    return (
      <Link href={href} className="inline-flex items-center hover:opacity-90 transition-opacity">
        {lockup}
      </Link>
    );
  }
  return lockup;
}
