import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateGameUrl } from './urlValidator';
import { logger } from './logger';

vi.mock('./logger', () => ({
  logger: {
    warn: vi.fn(),
  },
}));

describe('validateGameUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows valid URLs for Epic Games', () => {
    expect(validateGameUrl('https://store.epicgames.com/p/game', 'Epic Games')).toBe(true);
    expect(validateGameUrl('https://www.epicgames.com/store/en-US/p/game', 'Epic Games')).toBe(true);
  });

  it('allows valid URLs for Steam', () => {
    expect(validateGameUrl('https://store.steampowered.com/app/123/game', 'Steam')).toBe(true);
  });

  it('allows valid URLs for Amazon Gaming', () => {
    expect(validateGameUrl('https://gaming.amazon.com/loot', 'Amazon Gaming')).toBe(true);
    expect(validateGameUrl('https://luna.amazon.com/game', 'Amazon Gaming')).toBe(true);
    expect(validateGameUrl('https://www.amazon.com/game', 'Amazon Gaming')).toBe(true);
  });

  it('allows valid URLs for GOG', () => {
    expect(validateGameUrl('https://www.gog.com/game', 'GOG')).toBe(true);
    expect(validateGameUrl('https://auth.gog.com/login', 'GOG')).toBe(true);
  });

  it('blocks unknown platforms', () => {
    expect(validateGameUrl('https://store.epicgames.com/p/game', 'Unknown Platform')).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith('Blocked invalid game URL', expect.objectContaining({
      platform: 'Unknown Platform',
      action: 'urlValidation',
      url: 'https://store.epicgames.com/p/game'
    }));
  });

  it('blocks URLs with valid origins but for the wrong platform', () => {
    expect(validateGameUrl('https://store.epicgames.com/p/game', 'Steam')).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith('Blocked invalid game URL', expect.any(Object));
  });

  it('blocks URLs from invalid domains', () => {
    expect(validateGameUrl('https://evil.com/game', 'Epic Games')).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith('Blocked invalid game URL', expect.any(Object));
  });

  it('blocks malformed URLs', () => {
    expect(validateGameUrl('not-a-url', 'Epic Games')).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith('Malformed URL blocked', expect.objectContaining({
      platform: 'Epic Games',
      action: 'urlValidation',
      url: 'not-a-url'
    }));
  });
});
