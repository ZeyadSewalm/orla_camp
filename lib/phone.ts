/**
 * Phone-number normalisation for outbound messaging.
 *
 * This lives in lib/ rather than beside the cron route because a Next.js route
 * file may only export the HTTP verbs and a few config constants — exporting a
 * helper from one fails the build with "does not match the required types of a
 * Next.js Route". It is also the only way to unit-test it.
 */

/**
 * Normalises an Egyptian mobile number to E.164 without the leading plus.
 *
 * FIX 1 — the original normalised to the UAE (+971). The students are in Egypt.
 * A number sent to the wrong country code either fails to deliver or, worse,
 * reaches a stranger who now has a message addressed to your student by name.
 *
 * Egyptian mobiles are 10 digits after the country code and always start with
 * 1 (010/011/012/015 once the trunk 0 is included):
 *
 *   01012345678   → 201012345678   national, with trunk 0
 *   1012345678    → 201012345678   national, trunk 0 dropped
 *   +20 10 1234 5678 → 201012345678
 *   00201012345678   → 201012345678   international prefix
 *
 * Anything that does not resolve to a plausible Egyptian mobile returns null
 * and is skipped rather than guessed at — a message to a malformed number is
 * billed the same as one that lands.
 */
export function normaliseEgyptianMobile(value: string | null | undefined): string | null {
  if (!value) return null;
  let digits = value.replace(/\D/g, '');
  if (!digits) return null;

  // 00 is the international access prefix in Egypt; strip it before anything else.
  if (digits.startsWith('00')) digits = digits.slice(2);

  // Already country-coded.
  if (digits.startsWith('20')) digits = digits.slice(2);

  // National trunk prefix.
  if (digits.startsWith('0')) digits = digits.slice(1);

  // What remains must be a 10-digit mobile beginning with 1.
  if (!/^1[0125]\d{8}$/.test(digits)) return null;

  return `20${digits}`;
}
