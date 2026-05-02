/**
 * sanitize.ts — Sanitization helpers for untrusted data extracted from DOM/APIs.
 */

/**
 * Strips HTML/script-dangerous characters and limits length.
 * Use on all game titles extracted from page DOM or external APIs.
 */
export function sanitizeGameTitle(title: string): string {
  return title
    .replace(/[<>"'&]/g, '')  // Remove HTML/script chars
    .replace(/[\x00-\x1F]/g, '') // Remove control characters
    .trim()
    .slice(0, 200);           // Limit length
}

/**
 * Sanitizes a URL string extracted from DOM attributes.
 * Returns empty string if the URL is invalid or uses a dangerous protocol.
 */
export function sanitizeUrl(url: string): string {
  if (!url) return '';
  const trimmed = url.trim();
  // Block javascript:, data:, and other non-http protocols
  if (!/^https?:\/\//i.test(trimmed)) return '';
  try {
    return new URL(trimmed).toString();
  } catch {
    return '';
  }
}
