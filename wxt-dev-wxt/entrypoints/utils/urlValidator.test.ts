import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateGameUrl } from './urlValidator';
import { logger } from './logger';

// Mock logger to avoid console spam during tests
vi.mock('./logger', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

describe('validateGameUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Epic Games', () => {
    it('allows valid store origin', () => {
      expect(validateGameUrl('https://store.epicgames.com/en-US/free-games', 'Epic Games')).toBe(true);
    });

    it('allows valid www origin', () => {
      expect(validateGameUrl('https://www.epicgames.com/store/en-US/free-games', 'Epic Games')).toBe(true);
    });

    it('blocks invalid subdomain', () => {
      expect(validateGameUrl('https://evil.epicgames.com/store', 'Epic Games')).toBe(false);
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('Steam', () => {
    it('allows valid store origin', () => {
      expect(validateGameUrl('https://store.steampowered.com/app/12345', 'Steam')).toBe(true);
    });

    it('blocks community origin if not allowed', () => {
      expect(validateGameUrl('https://steamcommunity.com/app/12345', 'Steam')).toBe(false);
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('Amazon Gaming', () => {
    it('allows gaming origin', () => {
      expect(validateGameUrl('https://gaming.amazon.com/loot', 'Amazon Gaming')).toBe(true);
    });

    it('allows luna origin', () => {
      expect(validateGameUrl('https://luna.amazon.com/game', 'Amazon Gaming')).toBe(true);
    });

    it('allows www origin', () => {
      expect(validateGameUrl('https://www.amazon.com/game', 'Amazon Gaming')).toBe(true);
    });
  });

  describe('GOG', () => {
    it('allows www origin', () => {
      expect(validateGameUrl('https://www.gog.com/game/something', 'GOG')).toBe(true);
    });

    it('allows auth origin', () => {
      expect(validateGameUrl('https://auth.gog.com/login', 'GOG')).toBe(true);
    });
  });

  describe('General Validation & Edge Cases', () => {
    it('blocks unknown platforms', () => {
      expect(validateGameUrl('https://store.epicgames.com/en-US/', 'Unknown Platform')).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith('Blocked invalid game URL', expect.any(Object));
    });

    it('blocks completely unrelated URLs', () => {
      expect(validateGameUrl('https://evil-phishing-site.com/free-games', 'Epic Games')).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith('Blocked invalid game URL', expect.any(Object));
    });

    it('handles malformed URLs without throwing', () => {
      expect(validateGameUrl('not-a-valid-url', 'Epic Games')).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith('Malformed URL blocked', expect.any(Object));
    });

    it('blocks URLs with the allowed domain in the path but wrong origin', () => {
      expect(validateGameUrl('https://attacker.com/https://store.epicgames.com', 'Epic Games')).toBe(false);
    });

    it('blocks javascript: URIs', () => {
      expect(validateGameUrl('javascript:alert(1)', 'Epic Games')).toBe(false);
    });

    it('handles query parameters correctly', () => {
      expect(validateGameUrl('https://store.epicgames.com/p/game?query=123', 'Epic Games')).toBe(true);
    });
  });
});
