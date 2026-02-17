export type FunnelStage = 'research' | 'vetting' | 'offering' | 'sourcing';

export type ProgressState = {
  stage: FunnelStage;
  hasResearch: boolean;
  hasVetting: boolean;
  hasOffering: boolean;
  hasSourcing: boolean;
};

type ProgressFlags = {
  hasVetting?: boolean;
  hasOffering?: boolean;
  hasSourcing?: boolean;
};

const resolveStage = ({ hasSourcing, hasOffering, hasVetting }: ProgressState): FunnelStage => {
  if (hasSourcing) return 'sourcing';
  if (hasOffering) return 'offering';
  if (hasVetting) return 'vetting';
  return 'research';
};

export const buildProgressState = (flags: ProgressFlags = {}): ProgressState => {
  const hasVetting = Boolean(flags.hasVetting);
  const hasOffering = Boolean(flags.hasOffering);
  const hasSourcing = Boolean(flags.hasSourcing);

  const baseState: ProgressState = {
    stage: 'research',
    hasResearch: true,
    hasVetting,
    hasOffering,
    hasSourcing,
  };

  return { ...baseState, stage: resolveStage(baseState) };
};

export const getProgressStateFromRow = (row: any): ProgressState => {
  if (row?.progressState) {
    return buildProgressState({
      hasVetting: row.progressState.hasVetting,
      hasOffering: row.progressState.hasOffering,
      hasSourcing: row.progressState.hasSourcing,
    });
  }

  return buildProgressState({
    hasVetting: row?.is_vetted,
    hasOffering: row?.is_offered,
    hasSourcing: row?.is_sourced,
  });
};

export const getProgressScoreFromState = (progress: ProgressState): number => {
  let score = 1;
  if (progress.hasVetting) score += 1;
  if (progress.hasOffering) score += 1;
  if (progress.hasSourcing) score += 1;
  return score;
};
