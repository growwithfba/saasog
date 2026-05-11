export interface Testimonial {
  quote: string;
  name: string;
  role: string;
  initials: string;
  accentClass: string;
}

// Placeholder testimonials — swap with real quotes + attribution once collected.
// Keep the shape; the SocialProof component reads from this array.
export const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      "I used to spend a full afternoon on every product idea before I felt confident enough to pull the trigger. With BloomEngine I get a calibrated score in under two minutes and I trust it more than the spreadsheet I used to maintain.",
    name: 'Marcus T.',
    role: 'Amazon FBA — Home & Kitchen',
    initials: 'MT',
    accentClass: 'bg-blue-500/20 text-blue-300',
  },
  {
    quote:
      "The Chrome extension is the killer feature. I'll be browsing a category, see something interesting, and BloomLens tells me right there whether the market structure is even worth pursuing. Saved me from two bad launches this quarter alone.",
    name: 'Priya R.',
    role: 'Private Label Brand Builder',
    initials: 'PR',
    accentClass: 'bg-emerald-500/20 text-emerald-300',
  },
  {
    quote:
      "What sold me was the depth — every other tool gives you BSR and a guess. BloomEngine actually models the price stability, the competitive structure, and the supplier side. It's the only tool I have open every day.",
    name: 'Daniel K.',
    role: 'Multi-Brand Aggregator',
    initials: 'DK',
    accentClass: 'bg-purple-500/20 text-purple-300',
  },
];

export const TRUST_STATS = {
  sellersServed: '500+',
  productsVetted: '12,000+',
  categoriesCalibrated: '18+',
} as const;
