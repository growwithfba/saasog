import { describe, expect, it } from 'vitest';
import { buildFreshRow, rowFromCachePayload, withDiscoveryExtras } from './hydrateRow';

/** Minimal Keepa product blob — just enough for buildEnrichedRow to run. */
function mockProduct(overrides: Record<string, unknown> = {}) {
  return {
    asin: 'B0TESTASIN',
    title: 'Test Product',
    stats: { current: [] },
    offers: [],
    ...overrides,
  };
}

describe('hydrateRow — LQS null vs. 0 (same bug class as C2)', () => {
  it('renders a null LQS as null, not 0', () => {
    const { row } = buildFreshRow(mockProduct(), null);
    expect(row.lqs).toBeNull();
  });

  it('renders a genuine 0 LQS as 0, not null', () => {
    const { row } = buildFreshRow(mockProduct(), 0);
    expect(row.lqs).toBe(0);
  });
});

describe('hydrateRow — title/fulfillment/lqs round-trip through a cache hit', () => {
  it('preserves title, fulfillment, and lqs across a fresh-fetch -> cache-hit cycle', () => {
    const product = mockProduct({
      title: 'Stainless Steel Water Bottle',
      offers: [{ isFBA: true }],
    });
    const { row, enriched } = buildFreshRow(product, 7.5);
    expect(row.title).toBe('Stainless Steel Water Bottle');
    expect(row.fulfillment).toBe('FBA');
    expect(row.lqs).toBe(7.5);

    // What actually gets persisted to keepa_lens_metrics.payload.
    const payload = withDiscoveryExtras(enriched, row);

    // What a later cache hit reconstructs from that payload alone — no raw
    // `product` is available at that point.
    const rehydrated = rowFromCachePayload(row.asin, payload);
    expect(rehydrated.title).toBe(row.title);
    expect(rehydrated.fulfillment).toBe(row.fulfillment);
    expect(rehydrated.lqs).toBe(row.lqs);
    expect(rehydrated.brand).toBe(row.brand);
    expect(rehydrated.monthlyRevenue).toBe(row.monthlyRevenue);
  });

  it('round-trips a genuine 0 LQS (not just non-null scores) through a cache hit', () => {
    const { row, enriched } = buildFreshRow(mockProduct(), 0);
    const payload = withDiscoveryExtras(enriched, row);
    const rehydrated = rowFromCachePayload(row.asin, payload);
    expect(rehydrated.lqs).toBe(0);
  });

  it('round-trips a null title/fulfillment (limited data) without turning them into 0/false', () => {
    const { row, enriched } = buildFreshRow(mockProduct({ title: undefined, offers: [] }), null);
    expect(row.title).toBeNull();
    expect(row.fulfillment).toBeNull();
    const payload = withDiscoveryExtras(enriched, row);
    const rehydrated = rowFromCachePayload(row.asin, payload);
    expect(rehydrated.title).toBeNull();
    expect(rehydrated.fulfillment).toBeNull();
  });

  it('rowFromCachePayload falls back to null for a payload written before this fix', () => {
    // Simulates a pre-existing cache row that only has discoveryLqs (the
    // shape before this fix added discoveryTitle/discoveryIsFba).
    const { enriched } = buildFreshRow(mockProduct(), 4.2);
    const legacyPayload = { ...enriched, discoveryLqs: 4.2 };
    const rehydrated = rowFromCachePayload('B0TESTASIN', legacyPayload);
    expect(rehydrated.lqs).toBe(4.2);
    expect(rehydrated.title).toBeNull();
    expect(rehydrated.fulfillment).toBeNull();
  });
});
