'use client';

import React from 'react';
import { type PhaseType } from '@/utils/phaseStyles';
import { LightsaberUnderline } from '@/components/LightsaberUnderline';

interface PageTitleBlockProps {
  title?: string;
  subtitle?: string;
  page?: PhaseType;
  learnButton?: React.ReactNode;
}

export function PageTitleBlock({ title, subtitle, page, learnButton }: PageTitleBlockProps) {
  return (
    <div className="mb-8">
      {title && (
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white leading-tight relative mb-2 pb-2">
          {title}
          {/* Part F: Lightsaber underline with thin glow effect */}
          <div className="absolute bottom-0 left-0">
            <LightsaberUnderline phase={page} width="320px" />
          </div>
        </h1>
        {learnButton && <div>{learnButton}</div>}
      </div>
      )}
      {subtitle ? <p className="text-gray-700 dark:text-slate-400">{subtitle}</p> : null}
    </div>
  );
}


