'use client';

import type { ReactNode } from 'react';
import AppHeader from './AppHeader';
import { PageTitleBlock } from './PageTitleBlock';
import { Footer } from './Footer';
import type { PhaseType } from '@/utils/phaseStyles';
import { RootState } from '@/store';
import { useSelector } from 'react-redux';

interface PageShellProps {
  title?: string;
  subtitle?: string;
  page?: PhaseType;
  children: ReactNode;
  learnButton?: ReactNode;
}

export function PageShell({ title, subtitle, children, page, learnButton }: PageShellProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-900 dark:to-slate-900 flex flex-col">
      <AppHeader />
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        <PageTitleBlock title={title} subtitle={subtitle} page={page} learnButton={learnButton} />
        {children}
      </main>
      <Footer />
    </div>
  );
}


