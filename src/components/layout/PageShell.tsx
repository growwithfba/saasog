'use client';

import type { ReactNode } from 'react';
import AppHeader from './AppHeader';
import { PageTitleBlock } from './PageTitleBlock';
import { Footer } from './Footer';
import type { PhaseType } from '@/utils/phaseStyles';
import { RootState } from '@/store';
import { useSelector } from 'react-redux';
import { UsageWarningToast } from '@/components/subscription/UsageWarningToast';
import { PageAmbience } from '@/components/layout/PageAmbience';
import { PAGE_BG } from '@/components/ui/surfaces';

interface PageShellProps {
  title?: string;
  subtitle?: string;
  page?: PhaseType;
  children: ReactNode;
  learnButton?: ReactNode;
}

export function PageShell({ title, subtitle, children, page, learnButton }: PageShellProps) {
  return (
    <div className={`relative isolate min-h-screen ${PAGE_BG} flex flex-col`}>
      <PageAmbience />
      <AppHeader />
      <main className="flex-1 max-w-none mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        <PageTitleBlock title={title} subtitle={subtitle} page={page} learnButton={learnButton} />
        {children}
      </main>
      <Footer wide />
      <UsageWarningToast />
    </div>
  );
}


