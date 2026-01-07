'use client';

import type { ReactNode } from 'react';
import AppHeader from './AppHeader';
import { PageTitleBlock } from './PageTitleBlock';

interface PageShellProps {
  title: string;
  subtitle?: string;
  page?: 'offer' | 'sourcing';
  children: ReactNode;
}

export function PageShell({ title, subtitle, children, page }: PageShellProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:bg-slate-900">
      <AppHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <PageTitleBlock title={title} subtitle={subtitle} page={page} />
        {children}
      </main>
    </div>
  );
}


