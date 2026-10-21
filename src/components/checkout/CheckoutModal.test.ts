import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CheckoutModal } from './CheckoutModal';

vi.mock('./StripeEmbeddedCheckout', () => ({
  StripeEmbeddedCheckout: () => React.createElement('div', { 'data-checkout': true }),
}));

let renderer: ReactTestRenderer;
const fetchMock = vi.fn();
const props = { isOpen: true, onClose: vi.fn(), tier: 'pro' as const, billingInterval: 'yearly' as const };
const response = (code: string | null = 'TEAMANNUAL') => ({
  ok: true,
  json: async () => ({ success: true, clientSecret: 'cs_test_secret', appliedPromotionCode: code }),
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('document', { body: { style: { overflow: '' } } });
  vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(response());
  act(() => { renderer = create(React.createElement(CheckoutModal, props)); });
});
afterEach(() => {
  act(() => renderer.unmount());
  vi.unstubAllGlobals();
});

function enterCode(code: string) {
  act(() => renderer.root.findByType('input').props.onChange({ target: { value: code } }));
}
async function submit() {
  await act(async () => { await renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }); });
}

describe('checkout promotion lifecycle', () => {
  it('preserves the code on close/reopen and revalidates in a fresh session', async () => {
    enterCode('TEAMANNUAL');
    await submit();
    expect(renderer.root.findAllByProps({ 'data-checkout': true })).toHaveLength(1);
    act(() => renderer.update(React.createElement(CheckoutModal, { ...props, isOpen: false })));
    act(() => renderer.update(React.createElement(CheckoutModal, props)));
    expect(renderer.root.findByType('input').props.value).toBe('TEAMANNUAL');
    expect(renderer.root.findAllByProps({ 'data-checkout': true })).toHaveLength(0);
    await submit();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).promotionCode).toBe('TEAMANNUAL');
  });

  it('retains the code when switching plans and validates it against the new plan', async () => {
    enterCode('COHORT2026');
    await submit();
    act(() => renderer.update(React.createElement(CheckoutModal, { ...props, billingInterval: 'monthly' })));
    expect(renderer.root.findByType('input').props.value).toBe('COHORT2026');
    await submit();
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      tier: 'pro', billingInterval: 'monthly', promotionCode: 'COHORT2026',
    });
  });

  it('does not show checkout when code validation fails', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'Code expired' }) });
    enterCode('EXPIRED');
    await submit();
    expect(renderer.root.findByProps({ role: 'alert' }).children).toContain('Code expired');
    expect(renderer.root.findAllByProps({ 'data-checkout': true })).toHaveLength(0);
    expect(renderer.root.findByType('input').props.value).toBe('EXPIRED');
  });

  it('ignores a stale response after the selected plan changes', async () => {
    let resolve: (value: ReturnType<typeof response>) => void;
    fetchMock.mockReturnValue(new Promise((done) => { resolve = done; }));
    enterCode('TEAMANNUAL');
    let pending: Promise<void>;
    act(() => { pending = renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }); });
    act(() => renderer.update(React.createElement(CheckoutModal, { ...props, billingInterval: 'monthly' })));
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => { resolve(response()); await pending; });
    expect(renderer.root.findAllByProps({ 'data-checkout': true })).toHaveLength(0);
    expect(renderer.root.findByType('input').props.value).toBe('TEAMANNUAL');
  });
});
