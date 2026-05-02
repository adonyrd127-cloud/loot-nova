/**
 * urlValidator.ts — Validates URLs before navigating to prevent open redirect attacks.
 */
import { logger } from './logger';

const ALLOWED_ORIGINS: Record<string, string[]> = {
  'Epic Games':     ['https://store.epicgames.com', 'https://www.epicgames.com'],
  'Steam':          ['https://store.steampowered.com'],
  'Amazon Gaming':  ['https://gaming.amazon.com', 'https://luna.amazon.com', 'https://www.amazon.com'],
  'GOG':            ['https://www.gog.com', 'https://auth.gog.com'],
};

/**
 * Returns true only if the URL belongs to a known origin for the given platform.
 * Blocks unknown URLs from being opened in tabs.create().
 */
export function validateGameUrl(url: string, platform: string): boolean {
  try {
    const parsed = new URL(url);
    const allowed = ALLOWED_ORIGINS[platform] ?? [];
    const valid = allowed.some(o => parsed.origin === o);
    if (!valid) {
      logger.warn('Blocked invalid game URL', { platform, action: 'urlValidation', url });
    }
    return valid;
  } catch {
    logger.warn('Malformed URL blocked', { platform, action: 'urlValidation', url });
    return false;
  }
}
