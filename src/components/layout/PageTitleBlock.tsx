'use client';

import React from 'react';
import { type PhaseType } from '@/utils/phaseStyles';
import { LightsaberUnderline } from '@/components/LightsaberUnderline';
import { ExtensionCTA } from '@/components/extension/ExtensionCTA';

interface PageTitleBlockProps {
  title?: string;
  subtitle?: string;
  page?: PhaseType;
  learnButton?: React.ReactNode;
  /** Set to true to suppress the "Get Extension" pill on a specific page. */
  hideExtensionPill?: boolean;
}

export function PageTitleBlock({
  title,
  subtitle,
  page,
  learnButton,
  hideExtensionPill,
}: PageTitleBlockProps) {
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
        {(learnButton || !hideExtensionPill) && (
          <div className="flex items-center gap-3">
            {!hideExtensionPill && (
              <ExtensionCTA variant="pill" surface="page-header" />
            )}
            {learnButton}
          </div>
        )}
      </div>
      )}
      {subtitle ? <p className="text-gray-700 dark:text-slate-400">{subtitle}</p> : null}
    </div>
  );
}


