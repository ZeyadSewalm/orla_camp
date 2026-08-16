/**
 * Next.js throws to control the render, not only to report failure.
 *
 * Three of its signals travel as ordinary exceptions:
 *
 *   DYNAMIC_SERVER_USAGE — "this route touched cookies()/headers(), so it
 *                           cannot be statically generated". Next throws this
 *                           during the build, catches it itself, and marks the
 *                           route dynamic.
 *   NEXT_REDIRECT        — redirect() was called.
 *   NEXT_NOT_FOUND       — notFound() was called.
 *
 * A `catch` that swallows those breaks the framework. The dynamic one is the
 * dangerous case here: swallow it and Next concludes the page IS static, then
 * prerenders it at build time — freezing a signed-out header, or one user's
 * data, into HTML served to everybody.
 *
 * So every defensive catch in this codebase re-throws when this returns true,
 * and only handles what is actually a failure.
 */
const CONTROL_FLOW_DIGESTS = ['DYNAMIC_SERVER_USAGE', 'NEXT_REDIRECT', 'NEXT_NOT_FOUND'];

export function isNextControlFlow(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const digest = (error as { digest?: unknown }).digest;
  if (typeof digest !== 'string') return false;
  // NEXT_REDIRECT arrives as "NEXT_REDIRECT;replace;/path;307;" — prefix match.
  return CONTROL_FLOW_DIGESTS.some((d) => digest === d || digest.startsWith(`${d};`));
}

/** Re-throws Next's control-flow signals; returns for anything else. */
export function rethrowIfControlFlow(error: unknown): void {
  if (isNextControlFlow(error)) throw error;
}
