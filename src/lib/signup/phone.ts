/**
 * Signup phone number handling.
 *
 * Members span the US, UK, Canada and NZ, so we accept any international
 * format the person types and keep it readable: spaces, dashes, dots and
 * brackets are stripped, a leading "+" is kept. E.164 allows at most 15
 * digits; anything under 7 is not a dialable number.
 */

const MIN_DIGITS = 7;
const MAX_DIGITS = 15;

/** Returns the cleaned number, or null when it is not a plausible phone number. */
export function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const hasPlus = trimmed.startsWith('+');
  const body = hasPlus ? trimmed.slice(1) : trimmed;
  if (!/^[\d\s().-]+$/.test(body)) return null;

  const digits = body.replace(/\D/g, '');
  if (digits.length < MIN_DIGITS || digits.length > MAX_DIGITS) return null;

  return hasPlus ? `+${digits}` : digits;
}
