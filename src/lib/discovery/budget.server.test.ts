import { describe, expect, it } from 'vitest';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { loadDiscoveryBudget, recordDiscoverySpend } from './budget.server';
import { DISCOVERY_DAILY_BUDGET } from './budget';

/**
 * A minimal chainable stand-in for the two query shapes these helpers use:
 * profiles → maybeSingle (via getTierState) and usage_events → list/insert.
 */
function fakeClient(opts: {
  profile?: Record<string, unknown> | null;
  events?: Array<{ tokens_in: number | null }>;
  eventsError?: { message: string } | null;
}) {
  const inserted: any[] = [];
  const filters: Record<string, any[]> = {};
  const client = {
    inserted,
    filters,
    from(table: string) {
      const chain: any = {
        select: () => chain,
        eq: (col: string, v: unknown) => ((filters[col] = [...(filters[col] ?? []), v]), chain),
        in: (col: string, v: unknown) => ((filters[col] = [...(filters[col] ?? []), v]), chain),
        gte: (col: string, v: unknown) => ((filters[col] = [...(filters[col] ?? []), v]), chain),
        maybeSingle: async () => ({ data: opts.profile ?? null, error: null }),
        insert: async (row: any) => (inserted.push({ table, row }), { error: null }),
        then: (resolve: (v: any) => void) =>
          resolve(
            table === 'usage_events'
              ? { data: opts.events ?? [], error: opts.eventsError ?? null }
              : { data: null, error: null },
          ),
      };
      return chain;
    },
  };
  return client as unknown as SupabaseClient & { inserted: any[]; filters: Record<string, any[]> };
}

const user = (email: string) => ({ id: 'user-1', email }) as User;

describe('loadDiscoveryBudget', () => {
  it('sums the last day of Discovery spend against the core limit', async () => {
    const c = fakeClient({ profile: { tier: 'core' }, events: [{ tokens_in: 13 }, { tokens_in: 400 }, { tokens_in: null }] });
    const b = await loadDiscoveryBudget(c, c, user('member@example.com'));
    expect(b.limit).toBe(DISCOVERY_DAILY_BUDGET.core);
    expect(b.used).toBe(413);
    expect(b.remaining).toBe(DISCOVERY_DAILY_BUDGET.core! - 413);
    expect(b.exempt).toBe(false);
    expect(c.filters.status).toEqual(['ok']);
    expect(c.filters.operation[0]).toEqual(['discovery_search', 'discovery_hydrate', 'discovery_variations']);
  });

  it('pro gets the larger budget and clamps at zero when overspent', async () => {
    const c = fakeClient({ profile: { tier: 'pro' }, events: [{ tokens_in: 99_999 }] });
    const b = await loadDiscoveryBudget(c, c, user('member@example.com'));
    expect(b.limit).toBe(DISCOVERY_DAILY_BUDGET.pro);
    expect(b.remaining).toBe(0);
  });

  it('an active trial on a core plan is treated as pro', async () => {
    const trialEnds = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const c = fakeClient({ profile: { tier: 'core', trial_ends_at: trialEnds }, events: [{ tokens_in: 5_000 }] });
    const b = await loadDiscoveryBudget(c, c, user('member@example.com'));
    expect(b.limit).toBe(DISCOVERY_DAILY_BUDGET.pro);
    expect(b.remaining).toBe(DISCOVERY_DAILY_BUDGET.pro! - 5_000);
  });

  it('exempt accounts skip the tier and usage reads entirely', async () => {
    const c = fakeClient({ profile: { tier: 'core' }, events: [{ tokens_in: 5_000 }] });
    const b = await loadDiscoveryBudget(c, c, user('dave@growwithfba.com'));
    expect(b.exempt).toBe(true);
    expect(b.remaining).toBeNull();
    expect(Object.keys(c.filters)).toHaveLength(0);
  });

  it('fails open when the usage read errors', async () => {
    const c = fakeClient({ profile: { tier: 'core' }, eventsError: { message: 'boom' } });
    const b = await loadDiscoveryBudget(c, c, user('member@example.com'));
    expect(b.remaining).toBeNull();
    expect(b.exempt).toBe(false);
  });
});

describe('recordDiscoverySpend', () => {
  it('writes a keepa usage event with the token count and skips zero-cost calls', async () => {
    const c = fakeClient({});
    await recordDiscoverySpend(c, 'user-1', 'discovery_hydrate', 0, {});
    expect(c.inserted).toHaveLength(0);
    await recordDiscoverySpend(c, 'user-1', 'discovery_search', 13, { listed: 250 });
    expect(c.inserted).toHaveLength(1);
    expect(c.inserted[0].table).toBe('usage_events');
    expect(c.inserted[0].row).toMatchObject({
      user_id: 'user-1',
      provider: 'keepa',
      operation: 'discovery_search',
      status: 'ok',
      tokens_in: 13,
      metadata: { listed: 250 },
    });
  });
});
