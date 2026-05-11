export interface FAQItem {
  question: string;
  answer: string;
}

export const FAQ_ITEMS: FAQItem[] = [
  {
    question: 'What happens during the 7-day free trial?',
    answer:
      "You get full access to every feature in your chosen tier for 7 days. We won't charge your card until day 8. You can cancel anytime before then in your account settings — no charge, no questions asked.",
  },
  {
    question: 'Can I cancel anytime?',
    answer:
      "Yes. Cancel in one click from your account settings. No phone calls, no retention agents, no penalty fees. If you cancel during the trial, you won't be charged at all.",
  },
  {
    question: 'Can I switch between Core and Pro?',
    answer:
      'Yes — move up or down whenever you like. Your billing prorates automatically, so you only pay for the difference for the rest of the current cycle.',
  },
  {
    question: "What's a \"product vetting\"?",
    answer:
      'A complete BloomEngine analysis of a single ASIN: Market Climate breakdown (BSR stability, price stability, competitor depth, market structure), category-calibrated AI scoring, profit modeling, and supplier-quote tracking. One vetting per unique ASIN per month.',
  },
  {
    question: 'Is the Chrome extension included with every plan?',
    answer:
      'Yes. BloomLens (our Chrome extension) ships with both Core and Pro at unlimited usage — no scan caps on either tier. Scan every product on every Amazon search results page without burning your monthly vetting allowance.',
  },
  {
    question: 'What payment methods do you accept?',
    answer:
      "All major credit and debit cards via Stripe. Stripe handles all payment processing and PCI compliance — your card data never touches BloomEngine's servers.",
  },
];
