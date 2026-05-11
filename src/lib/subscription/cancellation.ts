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

export type SaveOfferKind = 'downgrade' | 'no_offer';

export interface SaveOfferSpec {
  kind: SaveOfferKind;
  headline: string;
  body: string;
  primaryCta?: string;
  secondaryCta?: string;
}

/**
 * Pick the last-resort save offer shown right before final cancellation.
 *
 * Policy (locked 2026-05-11):
 *   - Pro users always see a downgrade-to-Core offer, regardless of reason.
 *     If they're churning, dropping them to Core preserves the relationship
 *     and most of the revenue; if they don't bite, we let them go.
 *   - Core users have no save offer — there's nowhere lower to land. We
 *     show them feedback-only confirmation and respect the cancel.
 *
 * The flow always lets the user proceed to final cancellation; the offer
 * is one screen, not a maze.
 */
export function pickSaveOffer(
  _reason: CancellationReason,
  tier: Tier,
): SaveOfferSpec {
  if (tier === 'pro') {
    return {
      kind: 'downgrade',
      headline: 'Try Core before you cancel?',
      body:
        "Core is $39/mo (or $32/mo billed yearly) and still includes 25 AI Market Analyses, 15 AI Unique Selling Points, and unlimited BloomLens scans every month. You can move back to Pro anytime.",
      primaryCta: 'Downgrade to Core instead',
      secondaryCta: 'Continue cancelling',
    };
  }

  return {
    kind: 'no_offer',
    headline: 'Sorry to see you go',
    body:
      "Thanks for trying BloomEngine. Your feedback below shapes what we build for the next seller in your spot.",
  };
}
