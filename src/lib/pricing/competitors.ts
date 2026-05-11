export interface CompetitorRow {
  name: string;
  entryPrice: string;
  topPrice: string;
  positioning: string;
  hasAiScoring: boolean;
  hasChromeLens: boolean;
  hasSupplierTracking: boolean;
  isUs?: boolean;
}

// Anchor-pricing comparison. Claims are deliberately conservative and factual —
// price ranges quoted as of pricing-page polish ship date; competitor offerings
// change frequently, so the displayed asterisk reminds buyers to verify.
export const COMPETITOR_ROWS: CompetitorRow[] = [
  {
    name: 'BloomEngine',
    entryPrice: '$39 / mo',
    topPrice: '$99 / mo',
    positioning: 'Purpose-built for Amazon product vetting + sourcing',
    hasAiScoring: true,
    hasChromeLens: true,
    hasSupplierTracking: true,
    isUs: true,
  },
  {
    name: 'Helium 10',
    entryPrice: '$39 / mo',
    topPrice: '$209+ / mo',
    positioning: 'Broad keyword/research suite; product vetting via Black Box',
    hasAiScoring: false,
    hasChromeLens: true,
    hasSupplierTracking: false,
  },
  {
    name: 'Jungle Scout',
    entryPrice: '$49 / mo',
    topPrice: '$189 / mo',
    positioning: 'Product database + Opportunity Finder; no native AI scoring',
    hasAiScoring: false,
    hasChromeLens: true,
    hasSupplierTracking: false,
  },
];

export const COMPETITOR_PRICING_AS_OF = 'May 2026';
