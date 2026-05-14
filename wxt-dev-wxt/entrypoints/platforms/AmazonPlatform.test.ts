import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AmazonPlatform } from './AmazonPlatform';

describe('AmazonPlatform', () => {
  let platform: AmazonPlatform;

  beforeEach(() => {
    platform = new AmazonPlatform();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have correct name and id', () => {
    expect(platform.name).toBe('Amazon Prime Gaming');
    expect(platform.id).toBe('amazon');
  });

  it('fetchFreeGames should return an empty array', async () => {
    const games = await platform.fetchFreeGames();
    expect(games).toEqual([]);
  });

  it('getLoginUrl should return the correct URL', () => {
    expect(platform.getLoginUrl()).toBe('https://gaming.amazon.com/home');
  });

  describe('checkLoginStatus', () => {
    it('should return false when fetch returns status 200', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({ status: 200 } as Response);

      const status = await platform.checkLoginStatus();

      expect(status).toBe(false);
      expect(global.fetch).toHaveBeenCalledWith('https://www.amazon.com/ap/signin', {
        method: 'HEAD',
        redirect: 'manual',
      });
    });

    it('should return true when fetch returns status other than 200', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({ status: 302 } as Response);

      const status = await platform.checkLoginStatus();

      expect(status).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith('https://www.amazon.com/ap/signin', {
        method: 'HEAD',
        redirect: 'manual',
      });
    });

    it('should return null when fetch throws an error', async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network error'));

      const status = await platform.checkLoginStatus();

      expect(status).toBeNull();
    });
  });
});
