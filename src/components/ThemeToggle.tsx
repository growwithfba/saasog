'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';

export default function ThemeToggle() {
  const { theme, toggleTheme, mounted } = useTheme();

  // Avoid hydration mismatch by not rendering until mounted
  if (!mounted) {
    return (
      <div className="w-10 h-10 rounded-lg bg-gray-200 dark:bg-slate-800/50" />
    );
  }

  return (
    <button
      onClick={toggleTheme}
      className="flex items-center justify-center p-2 rounded-lg bg-gray-200 hover:bg-gray-300 dark:bg-slate-800/50 dark:hover:bg-slate-800/70 transition-all duration-200 transform hover:scale-105 border border-gray-300 dark:border-slate-700/30"
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      {theme === 'dark' ? (
        <Sun className="w-5 h-5 text-yellow-400" />
      ) : (
        <Moon className="w-5 h-5 text-slate-700" />
      )}
    </button>
  );
}

