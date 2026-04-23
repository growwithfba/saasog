import type { Session } from '@supabase/supabase-js';

// Shared helpers for Phase 2.7 competitor-removal adjustments. Both the
// legacy submission detail page and the vetting detail view use these so
// the recalc + PATCH logic stays in one place.

function calculateAgeFromDate(dateFirstAvailable: string | undefined): number {
  if (!dateFirstAvailable) return 0;
  const first = new Date(dateFirstAvailable);
  const now = new Date();
  const diff = Math.abs(now.getTime() - first.getTime());
  return Math.ceil(diff / (1000 * 60 * 60 * 24 * 30));
}

function calculateDistributions(competitors: any[]) {
  const total = competitors.length || 1;
  const ageRanges = { new: 0, growing: 0, established: 0, mature: 0, na: 0 };
  const fulfillmentRanges = { fba: 0, fbm: 0, amazon: 0, na: 0 };

  if (competitors?.length) {
    competitors.forEach((c) => {
      let age = c.age;
      if (!age && c.dateFirstAvailable) age = calculateAgeFromDate(c.dateFirstAvailable);
      if (age <= 6) ageRanges.new++;
      else if (age <= 12) ageRanges.growing++;
      else if (age <= 24) ageRanges.established++;
      else if (age > 24) ageRanges.mature++;
      else ageRanges.na++;
    });
    competitors.forEach((c) => {
      const method = (c.fulfillment || '').toLowerCase();
      if (method.includes('fba')) fulfillmentRanges.fba++;
      else if (method.includes('fbm')) fulfillmentRanges.fbm++;
      else if (method.includes('amazon')) fulfillmentRanges.amazon++;
      else fulfillmentRanges.na++;
    });
  }

  const pct = (ranges: Record<string, number>) =>
    Object.entries(ranges).reduce(
      (acc, [k, v]) => ({ ...acc, [k]: (Number(v) / total) * 100 }),
      {} as Record<string, number>
    );

  return { age: pct(ageRanges), fulfillment: pct(fulfillmentRanges) };
}

export type AdjustmentResult = {
  submission: any;
  newMarketScore: { score: number; status: string };
  newKeepaResults: any[];
  newDistributions: any;
  newMetrics: any;
};

export async function applyAdjustment({
  submissionId,
  session,
  updatedCompetitors,
  removedAsins,
}: {
  submissionId: string;
  session: Session | null;
  updatedCompetitors: any[];
  removedAsins: string[];
}): Promise<AdjustmentResult> {
  // Recompute market-level metrics from the filtered competitor set.
  const newMarketCap = updatedCompetitors.reduce(
    (sum, c) => sum + (c.monthlyRevenue || 0),
    0
  );
  const newRevenuePerCompetitor =
    updatedCompetitors.length > 0 ? newMarketCap / updatedCompetitors.length : 0;
  const competitorsWithShares = updatedCompetitors.map((c) => ({
    ...c,
    marketShare: newMarketCap > 0 ? (c.monthlyRevenue / newMarketCap) * 100 : 0,
  }));
  const newDistributions = calculateDistributions(competitorsWithShares);

  const topCompetitors = [...competitorsWithShares]
    .sort((a, b) => (b.monthlyRevenue || 0) - (a.monthlyRevenue || 0))
    .slice(0, 5);
  const asinsToAnalyze = topCompetitors
    .map((c) => c.asin)
    .filter((a) => a && a.length === 10 && /^[A-Z0-9]{10}$/.test(a));

  const { calculateMarketScore } = await import('@/utils/scoring');
  let newKeepaResults: any[] = [];
  let newMarketScore: { score: number; status: string } = { score: 0, status: 'FAIL' };

  if (asinsToAnalyze.length > 0) {
    try {
      const { keepaService } = await import('@/services/keepaService');
      const keepaResults = await keepaService.getCompetitorData(asinsToAnalyze);
      if (keepaResults && Array.isArray(keepaResults)) {
        newKeepaResults = keepaResults;
        newMarketScore = calculateMarketScore(competitorsWithShares, keepaResults);
      } else {
        newMarketScore = calculateMarketScore(competitorsWithShares, []);
      }
    } catch (err) {
      console.error('Keepa fetch failed during adjustment, falling back:', err);
      newMarketScore = calculateMarketScore(competitorsWithShares, []);
    }
  } else {
    newMarketScore = calculateMarketScore(competitorsWithShares, []);
  }

  const newMetrics = {
    totalMarketCap: newMarketCap,
    revenuePerCompetitor: newRevenuePerCompetitor,
    competitorCount: updatedCompetitors.length,
    calculatedAt: new Date().toISOString(),
  };

  const response = await fetch(`/api/submissions/${submissionId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }),
    },
    body: JSON.stringify({
      action: 'adjust',
      removedAsins,
      competitors: competitorsWithShares,
      distributions: newDistributions,
      keepaResults: newKeepaResults,
      marketScore: newMarketScore,
      metrics: newMetrics,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to update submission: ${response.status}`);
  }
  const result = await response.json();
  if (!result.success || !result.submission) {
    throw new Error(result.error || 'Update failed');
  }

  return {
    submission: result.submission,
    newMarketScore,
    newKeepaResults,
    newDistributions,
    newMetrics,
  };
}

export async function resetAdjustment({
  submissionId,
  session,
}: {
  submissionId: string;
  session: Session | null;
}): Promise<{ submission: any }> {
  const response = await fetch(`/api/submissions/${submissionId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }),
    },
    body: JSON.stringify({ action: 'reset' }),
  });

  if (!response.ok) {
    throw new Error(`Failed to reset submission: ${response.status}`);
  }
  const result = await response.json();
  if (!result.success || !result.submission) {
    throw new Error(result.error || 'Reset failed');
  }
  return { submission: result.submission };
}
