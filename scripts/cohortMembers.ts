/**
 * Single source of truth for the paid cohort roster.
 *
 * This list used to be copy-pasted into cohort-audit.ts, cohort-comp.ts and
 * cohort-revoke.ts. Two addresses in those copies were wrong, and because
 * the scripts skip unknown emails with a friendly "no account — must
 * self-register first", the mistakes looked like normal output instead of
 * errors:
 *
 *   'intellinvestmentsolutions@gmail.com'  → Pete's account is
 *                                            intellmerchsolutions@gmail.com
 *   'kosstasposypaiko@gmail.com'  (2 s's)  → Costas pays on
 *                                            kossstasposypaiko@gmail.com (3)
 *
 * Net effect: Pete and Costas never received the six months they paid for,
 * while a duplicate/typo account got comped instead. Keep the roster here,
 * import it everywhere, and fix it once.
 *
 * NOT on this list, deliberately: Kathy Kopp, Ashleigh, and Jelani. They
 * were grandfathered into the cohort from the yearly mentorship, which
 * bought them a year of BloomEngine — not the cohort's extra six months.
 * An earlier version of the roster included them and the comp script
 * pushed their access six months past their mentorship year.
 */

export type CohortEnrollment =
  /** Already had a paid BloomEngine subscription — extend it by 6 months. */
  | 'existing'
  /** Signed up fresh for the cohort — redeems a single-use 6-month code. */
  | 'new';

export interface CohortMember {
  name: string;
  email: string;
  enrollment: CohortEnrollment;
  /** Short slug used to build that member's personal promo code. */
  slug: string;
}

export const COHORT_MEMBERS: readonly CohortMember[] = [
  { name: 'Pete',    email: 'intellmerchsolutions@gmail.com',       enrollment: 'existing', slug: 'PETE' },
  { name: 'Costas',  email: 'kossstasposypaiko@gmail.com',          enrollment: 'existing', slug: 'COSTAS' },
  { name: 'Rizia',   email: 'rizzia.rivera@gmail.com',              enrollment: 'new',      slug: 'RIZIA' },
  { name: 'William', email: 'bill.yakamovich@iot-consultants.com',  enrollment: 'new',      slug: 'WILLIAM' },
  { name: 'Janice',  email: 'janice@laquestaholdings.com',          enrollment: 'new',      slug: 'JANICE' },
];

/** Every cohort email, for scripts that just need the address list. */
export const COHORT_EMAILS: readonly string[] = COHORT_MEMBERS.map((m) => m.email);

/** Members who redeem a promo code at checkout (vs. an in-place extension). */
export const COHORT_NEW_MEMBERS: readonly CohortMember[] = COHORT_MEMBERS.filter(
  (m) => m.enrollment === 'new',
);

/** Per-member promo code, e.g. COHORT6-WILLIAM. */
export function cohortCodeFor(member: CohortMember): string {
  return `COHORT6-${member.slug}`;
}
