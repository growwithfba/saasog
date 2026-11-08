import { describe, expect, it } from 'vitest';
import { normalizePhone } from './phone';

describe('normalizePhone', () => {
  it('keeps a leading plus and strips formatting', () => {
    expect(normalizePhone('+1 (555) 123-4567')).toBe('+15551234567');
    expect(normalizePhone('+44 7700 900123')).toBe('+447700900123');
    expect(normalizePhone('+64 21.123.4567')).toBe('+64211234567');
  });

  it('accepts a number typed without a country code', () => {
    expect(normalizePhone('555-123-4567')).toBe('5551234567');
  });

  it('rejects empty, too short, too long and non-numeric input', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('   ')).toBeNull();
    expect(normalizePhone('12345')).toBeNull();
    expect(normalizePhone('+1234567890123456')).toBeNull();
    expect(normalizePhone('call me maybe')).toBeNull();
    expect(normalizePhone('555-CALL-NOW')).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
  });
});
