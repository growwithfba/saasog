import type { Tier } from './tiers';

export type CancellationReason =
  | 'too_expensive'
  | 'not_enough_value'
  | 'switching_tools'
  | 'no_time'
  | 'just_trying_it'
  | 'other';

export interface CancellationReasonOption {
  id: CancellationReason;
  label: string;
}

export const CANCELLATION_REASONS: CancellationReasonOption[] = [
  { id: 'too_expensive', label: "It's too expensive" },
  { id: 'not_enough_value', label: "I'm not getting enough value yet" },
  { id: 'switching_tools', label: "I'm switching to another tool" },
  { id: 'no_time', label: "I don't have time to use it right now" },
  { id: 'just_trying_it', label: 'I was just trying it out' },
  { id: 'other', label: 'Something else' },
];

export type SaveOfferKind = 'downgrade' | 'book_call' | 'no_offer';

export interface SaveOfferSpec {
  kind: SaveOfferKind;
  headline: string;
  body: string;
  primaryCta?: string;
  secondaryCta?: string;
}

/**
 * Decide which save offer (if any) to show the user given their stated
 * reason and current tier. The flow always lets them proceed to final
 * cancellation; the offer is a last chance to keep them.
 */
export function pickSaveOffer(
  reason: CancellationReason,
  tier: Tier,
): SaveOfferSpec {
  if (reason === 'too_expensive' && tier === 'pro') {
    return {
      kind: 'downgrade',
      headline: 'Try Core before you cancel?',
      body:
        "Core is $39/mo (or $32/mo billed yearly) and still includes 25 AI Market Analyses, 15 AI Unique Selling Points, and unlimited BloomLens scans every month. You can switch back to Pro anytime.",
      primaryCta: 'Downgrade to Core instead',
      secondaryCta: 'Continue cancelling',
    };
  }

  if (reason === 'not_enough_value') {
    return {
      kind: 'book_call',
      headline: "Let's get you set up properly",
      body:
        "Most new sellers see real value once they've run their first 3-5 AI Market Analyses with someone who can walk them through the scores. Book a free 15-minute call with Dave (BloomEngine's founder) and we'll get you unstuck.",
      primaryCta: 'Book a free 15-min call',
      secondaryCta: 'Continue cancelling',
    };
  }

  if (reason === 'switching_tools') {
    return {
      kind: 'book_call',
      headline: 'Before you switch — would you tell us why?',
      body:
        "If there's a feature or use case we're missing, we'd genuinely like to know. Book a quick call with Dave (BloomEngine's founder) — 15 minutes, no sales pitch.",
      primaryCta: 'Book a quick call',
      secondaryCta: 'Continue cancelling',
    };
  }

  if (reason === 'no_time') {
    return {
      kind: 'book_call',
      headline: 'A quick onboarding might be all you need',
      body:
        "Most users underestimate how fast a BloomEngine analysis actually is — about 2 minutes per product. Book a 15-min walkthrough with Dave and we'll show you the fastest workflow.",
      primaryCta: 'Book a 15-min walkthrough',
      secondaryCta: 'Continue cancelling',
    };
  }

  if (reason === 'too_expensive' && tier === 'core') {
    return {
      kind: 'no_offer',
      headline: 'Sorry to see you go',
      body:
        "We get it. If there's anything specific about pricing that would have changed your mind, your feedback below helps us build a better product for sellers in your spot.",
    };
  }

  // just_trying_it, other — no save offer, straight to confirm
  return {
    kind: 'no_offer',
    headline: 'Sorry to see you go',
    body:
      "Thanks for giving BloomEngine a try. Your feedback below helps us improve for the next seller.",
  };
}

// Calendly link used by `book_call` save offers. Swap when Dave provides
// his actual scheduling URL.
export const FOUNDER_CALL_URL = 'https://calendly.com/bloomengine/founder-call';
