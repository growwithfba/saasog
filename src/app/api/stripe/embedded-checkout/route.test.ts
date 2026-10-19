import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), price: vi.fn() }));
vi.mock('stripe', () => {
  class StripeError extends Error {}
  class Stripe {
    static errors = { StripeError };
    promotionCodes = { list: mocks.list };
    checkout = { sessions: { create: mocks.create } };
  }
  return { default: Stripe };
});
vi.mock('@/lib/subscription/stripeMapping', () => ({ tierToPriceId: mocks.price }));
import { POST } from './route';

function request(promotionCode?: unknown) {
  return new NextRequest('https://example.com/api/stripe/embedded-checkout', {
    method: 'POST',
    body: JSON.stringify({ tier: 'pro', billingInterval: 'yearly', promotionCode }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('STRIPE_SECRET_KEY', 'test-only');
  mocks.price.mockResolvedValue('price_pro_yearly');
  mocks.create.mockResolvedValue({ id: 'cs_test', client_secret: 'test_secret' });
  mocks.list.mockResolvedValue({ data: [{ id: 'promo_current', customer: null }] });
});

describe('embedded checkout promotion codes', () => {
  it('attaches the active promotion code and preserves the seven-day trial', async () => {
    const response = await POST(request(' TEAMANNUAL '));
    expect(response.status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith({ code: 'TEAMANNUAL', active: true, limit: 100 });
    const params = mocks.create.mock.calls[0][0];
    expect(params.discounts).toEqual([{ promotion_code: 'promo_current' }]);
    expect(params.allow_promotion_codes).toBeUndefined();
    expect(params.subscription_data.trial_period_days).toBe(7);
  });

  it('does not create a full-price checkout when the code is unavailable', async () => {
    mocks.list.mockResolvedValue({ data: [] });
    expect((await POST(request('EXPIRED'))).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('does not use a code restricted to another customer', async () => {
    mocks.list.mockResolvedValue({ data: [{ id: 'promo_private', customer: 'cus_other' }] });
    expect((await POST(request('PRIVATE'))).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('preserves ordinary checkout when no code is supplied', async () => {
    expect((await POST(request())).status).toBe(200);
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.create.mock.calls[0][0].allow_promotion_codes).toBe(true);
    expect(mocks.create.mock.calls[0][0].discounts).toBeUndefined();
  });

  it('rejects malformed codes before calling Stripe', async () => {
    expect((await POST(request({ id: 'promo_fake' }))).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it('does not retry without the discount if Stripe rejects redemption', async () => {
    mocks.create.mockRejectedValueOnce(new Error('Promotion cannot be redeemed'));
    expect((await POST(request('TEAMANNUAL'))).status).toBe(500);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.create.mock.calls[0][0].discounts).toEqual([{ promotion_code: 'promo_current' }]);
  });
});
