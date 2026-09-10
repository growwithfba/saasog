'use client';

interface BloomLoaderProps {
  label?: string;
}

/**
 * Loading state for a Discovery search.
 *
 * Built from the brand's own shapes rather than a generic spinner: four petals
 * opening around a centre, in the logo's cyan-to-emerald gradient. Each petal
 * is offset so the bloom opens in sequence — the motion reads as growth, which
 * is the metaphor the product is named for.
 *
 * Respects prefers-reduced-motion: the petals settle open and only the caption
 * animates.
 */
export function BloomLoader({ label = 'Finding products…' }: BloomLoaderProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <svg width="64" height="64" viewBox="0 0 64 64" role="img" aria-label={label}>
        <defs>
          <linearGradient id="bloom-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
        </defs>

        {[0, 90, 180, 270].map((angle, i) => (
          <ellipse
            key={angle}
            cx="32"
            cy="18"
            rx="7"
            ry="13"
            fill="url(#bloom-grad)"
            transform={`rotate(${angle} 32 32)`}
            className="bloom-petal"
            style={{ animationDelay: `${i * 160}ms`, transformOrigin: '32px 32px' }}
          />
        ))}

        <circle cx="32" cy="32" r="5" fill="#a7f3d0" className="bloom-core" />
      </svg>

      <p className="mt-5 text-[15px] text-gray-600 dark:text-slate-400">{label}</p>

      <style jsx>{`
        .bloom-petal {
          transform-box: fill-box;
          animation: bloom-open 1600ms ease-in-out infinite;
          opacity: 0.25;
        }
        .bloom-core {
          animation: bloom-pulse 1600ms ease-in-out infinite;
        }
        @keyframes bloom-open {
          0%,
          100% {
            opacity: 0.2;
          }
          45% {
            opacity: 1;
          }
        }
        @keyframes bloom-pulse {
          0%,
          100% {
            r: 4;
            opacity: 0.7;
          }
          50% {
            r: 6;
            opacity: 1;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .bloom-petal {
            animation: none;
            opacity: 0.85;
          }
          .bloom-core {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
