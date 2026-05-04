/**
 * Sentry beforeSend scrubber — strips PII before events leave the process.
 *
 * Three categories scrubbed:
 *  1. URL query strings (especially `?token=` on the calendar feed route);
 *     replaces with the path only. Mirrors `event.request.query_string`.
 *  2. Authorization-style headers (`authorization`, `cookie`, `x-csrf-*`,
 *     `x-clerk-*`, anything containing `token` or `secret`).
 *  3. `event.extra` entries whose key looks like a kid or parent name field
 *     (`name`, `firstName`, `lastName`, `email`, `chickName`, etc.).
 *
 * The scrubber is intentionally over-broad on header names — it's cheaper to
 * lose a debug hint than to leak a session cookie. If a future incident needs
 * a header that's currently scrubbed, allowlist it explicitly.
 *
 * Used by all three Sentry configs (server, client, edge) so the rules
 * are identical regardless of where the event originates.
 */

import type { ErrorEvent } from '@sentry/core';

// Header names (lowercase) we never want in Sentry events.
const REDACT_HEADER_EXACT = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'proxy-authorization',
  'x-csrf-token',
  'x-covey-confirm',
]);

// Substring matches on header name (lowercase) — anything containing these
// fragments is redacted regardless of vendor prefix.
const REDACT_HEADER_SUBSTRINGS = ['token', 'secret', 'auth', 'clerk', 'session'];

// Field names (lowercase) on `event.extra` / `event.contexts` we drop entirely.
// These cover the kid + parent + email surfaces in the Covey schema.
const PII_KEY_PATTERNS = [
  /^name$/,
  /^first_?name$/,
  /^last_?name$/,
  /^full_?name$/,
  /^email$/,
  /^phone$/,
  /^chick_?name$/,
  /^parent_?name$/,
  /^kid_?name$/,
  /^for_?whom$/,
];

const REDACTED = '[redacted]';

function looksLikePiiKey(key: string): boolean {
  const k = key.toLowerCase();
  return PII_KEY_PATTERNS.some(re => re.test(k));
}

function isRedactedHeaderName(name: string): boolean {
  const n = name.toLowerCase();
  if (REDACT_HEADER_EXACT.has(n)) return true;
  return REDACT_HEADER_SUBSTRINGS.some(sub => n.includes(sub));
}

/**
 * Strip the query string from a URL while preserving everything else.
 * Returns the original input if the URL is unparseable.
 */
export function stripQueryString(url: string): string {
  if (!url) return url;
  const qIdx = url.indexOf('?');
  if (qIdx === -1) return url;
  return url.slice(0, qIdx);
}

function scrubHeaders(headers: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!headers) return headers;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = isRedactedHeaderName(k) ? REDACTED : v;
  }
  return out;
}

function scrubExtra(extra: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!extra) return extra;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(extra)) {
    out[k] = looksLikePiiKey(k) ? REDACTED : v;
  }
  return out;
}

/**
 * Sentry `beforeSend` hook. Mutates a clone of the event in place so the
 * sanitized version is what gets transmitted; original event remains intact
 * for any downstream Sentry SDK consumers (there shouldn't be any, but the
 * defensive clone is cheap insurance).
 */
export function scrubEvent(event: ErrorEvent): ErrorEvent | null {
  // Shallow clone so we never mutate caller-owned data even if Sentry holds
  // a reference. Sub-objects are replaced wholesale rather than mutated.
  const cleaned: ErrorEvent = { ...event };

  if (cleaned.request) {
    cleaned.request = {
      ...cleaned.request,
      url: cleaned.request.url ? stripQueryString(cleaned.request.url) : cleaned.request.url,
      query_string: undefined, // never carry the raw query string
      headers: scrubHeaders(cleaned.request.headers),
      cookies: cleaned.request.cookies ? {} : cleaned.request.cookies,
    };
  }

  if (cleaned.extra) {
    cleaned.extra = scrubExtra(cleaned.extra as Record<string, unknown>);
  }

  return cleaned;
}
