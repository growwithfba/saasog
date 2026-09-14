'use client';

import React from 'react';
import { type PhaseType } from '@/utils/phaseStyles';
import { LightsaberUnderline } from '@/components/LightsaberUnderline';
import { ExtensionCTA } from '@/components/extension/ExtensionCTA';
import { LEARN_ENABLED } from '@/lib/featureFlags';

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
  // Learn is paused app-wide — see featureFlags.
  const learn = LEARN_ENABLED ? learnButton : null;
  return (
    <div className="mb-8">
      {title && (
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white leading-tight relative mb-2 pb-2">
          {title}
          {/* Part F: Lightsaber underline with thin glow effect */}
          <div className="absolute bottom-0 left-0">
            <LightsaberUnderline phase={page} width="480px" />
          </div>
        </h1>
        {(learn || !hideExtensionPill) && (
          <div className="flex items-center gap-3">
            {!hideExtensionPill && (
              <ExtensionCTA variant="pill" surface="page-header" />
            )}
            {learn}
          </div>
        )}
      </div>
      )}
      {subtitle ? <p className="text-gray-700 dark:text-slate-400">{subtitle}</p> : null}
    </div>
  );
}


