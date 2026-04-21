/**
 * Offer Data Model
 * 
 * This interface defines the structure for Offer data that will eventually
 * be stored in Supabase. For now, it's stored in localStorage.
 */
export type ReviewInsightsSspCategory =
  | 'Quantity'
  | 'Functionality'
  | 'Quality'
  | 'Aesthetic'
  | 'Bundle';

export interface MajorComplaint {
  complaint: string;
  opportunity: string;
  sspCategory: ReviewInsightsSspCategory;
  severity: 1 | 2 | 3 | 4 | 5;
  mentionPercent: number;
  exampleQuotes: string[];
}

export interface GapFinderFinding {
  finding: string;
}

export interface MarketSnapshot {
  verdict: string;
  reviewCount: number;
  competitorCount?: number;
  negativeThemePercent?: number;
}

export interface TopTheme {
  label: string;
  mentionPercent: number;
  sentiment: 'positive' | 'negative';
}

export interface ReviewInsights {
  // New structured fields (Phase 2.2b) — optional for backward compat
  marketSnapshot?: MarketSnapshot;
  topThemes?: TopTheme[];
  majorComplaints?: MajorComplaint[];
  whatIsWorking?: string[];
  gapFinder?: {
    hardwareGaps: GapFinderFinding[];
    installFriction: GapFinderFinding[];
    unservedUseCases: GapFinderFinding[];
  };

  // Legacy string fields — still emitted for SSP Builder compat
  topLikes: string;
  topDislikes: string;
  importantInsights: string;
  importantQuestions: string;
  strengthsTakeaway?: string;
  painPointsTakeaway?: string;
  insightsTakeaway?: string;
  questionsTakeaway?: string;
  totalReviewCount?: number;
  positiveReviewCount?: number;
  neutralReviewCount?: number;
  negativeReviewCount?: number;
}

export interface OfferData {
  productId: string;
  reviewInsights: ReviewInsights;
  ssp: SspCategories;
  supplierInfo: {
    supplierName: string;
    contact: string;
    fobPrice: string;
    landedCost: string;
    moq: string;
    leadTime: string;
    notes: string;
  };
  status: 'none' | 'working' | 'completed';
  createdAt: string;
  updatedAt: string;
}

export type FixType = "QA_PROCESS" | "MATERIAL_UPGRADE" | "MINOR_FUNCTIONAL" | "MAJOR_REDESIGN" | "PACKAGING_INSTRUCTIONS";
export type Effort = "LOW" | "MEDIUM" | "HIGH";
export type Impact = "LOW" | "MEDIUM" | "HIGH";
export type Confidence = "HIGH" | "MEDIUM" | "LOW";

export interface SspAiNote {
  id: string;
  mode: 'sideQuestion' | 'refine';
  answer: string;
  question?: string;
  createdAt?: string;
  promoted?: boolean;
  promotedSspId?: string;
}

export type SspDetails = {
  supplierSpecs?: string[];
  risks?: string[];
  fbaNotes?: string[];
  qaChecklist?: string[];
  costImpact?: 'low' | 'medium' | 'high' | string;
};

export interface SSPItem {
  id?: string;
  status?: 'draft' | 'locked';
  draft?: {
    title: string;
    body: string;
    details?: SspDetails;
  };
  recommendation: string;
  why_it_matters: string;
  grounded_in?: {
    insight_bucket: string;
    insight_signal: string;
  };
  fix_type: FixType;
  impact: Impact;
  effort: Effort;
  fba_safe?: boolean;
  fba_notes?: string;
  confidence: Confidence;
  source?: 'ai' | 'manual' | 'promoted_note';
  details?: SspDetails | string;
  aiNotes?: SspAiNote[] | string;
}

export type SspCategories = {
  quantity: SSPItem[];
  functionality: SSPItem[];
  quality: SSPItem[];
  aesthetic: SSPItem[];
  bundle: SSPItem[];
};

export type SspCategory = keyof SspCategories;

