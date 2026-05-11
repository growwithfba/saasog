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
    question: "What's an \"AI Market Analysis\"?",
    answer:
      "A complete BloomEngine breakdown of any Amazon product you're considering: how strong the demand is, how competitive the market is, how stable the pricing has been, and a clear score telling you whether it's worth pursuing. Core includes 25 per month; Pro is unlimited.",
  },
  {
    question: 'What are "AI Unique Selling Points"?',
    answer:
      "Auto-generated USPs — the bullet points, hooks, and product angles you need to write a winning listing. BloomEngine analyzes competitor listings and surfaces the angles your product can win on. Core includes 15 per month; Pro is unlimited.",
  },
  {
    question: 'Is the Chrome extension included with every plan?',
    answer:
      'Yes. BloomLens (our Chrome extension) ships with both Core and Pro at unlimited usage — no scan caps on either tier. Score every product you see on Amazon without burning your monthly analysis allowance.',
  },
  {
    question: 'What payment methods do you accept?',
    answer:
      "All major credit and debit cards via Stripe. Stripe handles all payment processing and PCI compliance — your card data never touches BloomEngine's servers.",
  },
];
