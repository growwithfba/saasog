'use client';

import type { ReactNode } from 'react';
import AppHeader from './AppHeader';
import { PageTitleBlock } from './PageTitleBlock';

interface PageShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function PageShell({ title, subtitle, children }: PageShellProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <AppHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <PageTitleBlock title={title} subtitle={subtitle} />
        {children}
      </main>
    </div>
  );
}


