import { afterEach, describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';

vi.mock('server-only', () => ({}));

import { buildSignupEvent, resolvePromotionCode, sendSignupEvent } from './notify';

const customer = { id: 'cus_1', email: 'kathy@example.com' } as Stripe.Customer;

const subscription = (overrides: Partial<Stripe.Subscription> = {}) => ({
  id: 'sub_1',
  status: 'trialing',
  trial_end: 1_800_000_000,
  metadata: { tier: 'pro', billing_interval: 'monthly' },
  items: { data: [{ price: { unit_amount: 9900, recurring: { interval: 'month' } } }] },
  ...overrides,
}) as unknown as Stripe.Subscription;

describe('buildSignupEvent', () => {
  it('describes the plan, price, trial and code', () => {
    const event = buildSignupEvent({
      userId: 'u1', fullName: 'Kathy Smith', phone: '+15551234567',
      customer, subscription: subscription(), sessionEmail: null,
      promotionCode: 'GAMENIGHTVIP', now: new Date('2026-11-07T12:00:00Z'),
    });
    expect(event).toMatchObject({
      signed_up_at: '2026-11-07T12:00:00.000Z',
      full_name: 'Kathy Smith',
      email: 'kathy@example.com',
      phone: '+15551234567',
      plan: 'Pro Monthly',
      price: '$99.00/month',
      subscription_status: 'trialing',
      trial_ends_at: new Date(1_800_000_000 * 1000).toISOString(),
      promotion_code: 'GAMENIGHTVIP',
      stripe_customer_id: 'cus_1',
      stripe_subscription_id: 'sub_1',
    });
  });

  it('falls back to the price interval when checkout metadata is missing', () => {
    const event = buildSignupEvent({
      userId: 'u1', fullName: 'A', phone: '1234567',
      customer: { id: 'cus_2', email: null } as Stripe.Customer,
      subscription: subscription({
        metadata: {},
        trial_end: null,
        items: { data: [{ price: { unit_amount: 98400, recurring: { interval: 'year' } } }] },
      } as unknown as Partial<Stripe.Subscription>),
      sessionEmail: 'session@example.com', promotionCode: null,
    });
    expect(event.billing_interval).toBe('yearly');
    expect(event.plan).toBe('Unknown Yearly');
    expect(event.email).toBe('session@example.com');
    expect(event.trial_ends_at).toBeNull();
  });
});

describe('resolvePromotionCode', () => {
  it('returns the code string for an applied promotion code ID', async () => {
    const stripe = { promotionCodes: { retrieve: vi.fn().mockResolvedValue({ code: 'COHORT2026' }) } };
    const session = { discounts: [{ promotion_code: 'promo_1' }] } as unknown as Stripe.Checkout.Session;
    expect(await resolvePromotionCode(stripe as unknown as Stripe, session)).toBe('COHORT2026');
  });

  it('returns null with no discount and never throws', async () => {
    const stripe = { promotionCodes: { retrieve: vi.fn().mockRejectedValue(new Error('boom')) } };
    expect(await resolvePromotionCode(stripe as unknown as Stripe, { discounts: [] } as unknown as Stripe.Checkout.Session)).toBeNull();
    expect(await resolvePromotionCode(stripe as unknown as Stripe, { discounts: [{ promotion_code: 'promo_x' }] } as unknown as Stripe.Checkout.Session)).toBeNull();
  });
});

describe('sendSignupEvent', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const event = buildSignupEvent({
    userId: 'u1', fullName: 'A', phone: '1234567', customer,
    subscription: subscription(), sessionEmail: null, promotionCode: null,
  });

  it('skips quietly when the webhook URL is not configured', async () => {
    vi.stubEnv('SIGNUP_WEBHOOK_URL', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await sendSignupEvent(event)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts the event as JSON', async () => {
    vi.stubEnv('SIGNUP_WEBHOOK_URL', 'https://hooks.example.com/abc');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    expect(await sendSignupEvent(event)).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://hooks.example.com/abc');
    expect(JSON.parse(init.body).email).toBe('kathy@example.com');
  });

  it('swallows network errors and bad statuses', async () => {
    vi.stubEnv('SIGNUP_WEBHOOK_URL', 'https://hooks.example.com/abc');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await sendSignupEvent(event)).toBe(false);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    expect(await sendSignupEvent(event)).toBe(false);
  });
});
