'use client';

import { useTheme } from '@/hooks/useTheme';
import Link from 'next/link';

export type LogoVariant = 'wordmark' | 'horizontal' | 'stacked' | 'icon';

interface LogoProps {
  variant?: LogoVariant;
  className?: string;
  alt?: string;
  href?: string;
  priority?: boolean;
}

const LOGO_PATHS: Record<LogoVariant, { light: string; dark: string }> = {
  wordmark: {
    light: '/BloomEngine-Workmark-Final-LightMode.png',
    dark: '/BloomEngine-Wordmark-FInal-DarkMode.png',
  },
  horizontal: {
    light: '/BloomEngine-HorizontalLogo-Final-LightMode.png',
    dark: '/BloomEngine-HorizontalLogo-Final-DarkMode.png',
  },
  stacked: {
    light: '/BloomEngine-Logo-Final-LightMode.png',
    dark: '/BloomEngine-Logo-Final-DarkMode.png',
  },
  icon: {
    light: '/BloomEngine-Icon-Final-LightMode.png',
    dark: '/BloomEngine-Icon-Final-DarkMode.png',
  },
};

export function Logo({ 
  variant = 'wordmark', 
  className = '', 
  alt = 'BloomEngine',
  href,
  priority = false 
}: LogoProps) {
  const { theme, mounted } = useTheme();
  
  // Use dark theme as default if not mounted yet (matches the default in useTheme)
  const currentTheme = mounted ? theme : 'dark';
  const logoPath = LOGO_PATHS[variant][currentTheme];

  const imgElement = (
    <img
      src={logoPath}
      alt={alt}
      className={`w-auto object-contain ${className}`}
      style={{ imageRendering: 'crisp-edges' }}
    />
  );

  if (href) {
    return (
      <Link href={href} className="flex items-center hover:opacity-80 transition-opacity">
        {imgElement}
      </Link>
    );
  }

  return imgElement;
}
