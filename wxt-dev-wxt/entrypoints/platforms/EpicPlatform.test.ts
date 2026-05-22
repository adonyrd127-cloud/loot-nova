import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EpicPlatform } from './EpicPlatform';
import { Platforms } from '@/entrypoints/enums/platforms.ts';
import { logger } from '@/entrypoints/utils/logger.ts';
import { getStorageItem } from '@/entrypoints/hooks/useStorage.ts';

// Mock dependencies
vi.mock('@/entrypoints/utils/logger.ts', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
  }
}));

vi.mock('@/entrypoints/hooks/useStorage.ts', () => ({
  getStorageItem: vi.fn(),
}));

// Provide minimal mock for global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('EpicPlatform', () => {
  let platform: EpicPlatform;

  beforeEach(() => {
    platform = new EpicPlatform();
    vi.clearAllMocks();
  });

  describe('fetchFreeGames', () => {
    it('should successfully fetch and parse free games', async () => {
      // Setup mock response
      const mockApiResponse = {
        data: {
          Catalog: {
            searchStore: {
              elements: [
                {
                  title: 'Free Game Title!',
                  id: '123',
                  productSlug: 'free-game',
                  keyImages: [{ type: 'OfferImageWide', url: 'https://image.url' }],
                  price: {
                    totalPrice: {
                      discountPrice: 0,
                      originalPrice: 1999
                    }
                  },
                  promotions: {
                    promotionalOffers: [{
                      promotionalOffers: [{
                        startDate: '2023-01-01',
                        endDate: '2023-01-08'
                      }]
                    }]
                  }
                },
                {
                  title: 'Not Free Game',
                  id: '456',
                  productSlug: 'not-free',
                  price: {
                    totalPrice: {
                      discountPrice: 1999,
                      originalPrice: 1999
                    }
                  }
                }
              ]
            }
          }
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockApiResponse
      });

      const games = await platform.fetchFreeGames();

      expect(games).toHaveLength(1);
      expect(games[0]).toEqual({
        title: 'Free Game Title!',
        description: "",
        startDate: "2023-01-01T00:00:00.000Z",
        endDate: "2023-01-08T00:00:00.000Z",
        future: false,
        retailPrice: 19.99,
        link: 'https://www.epicgames.com/store/en-US/p/free-game',
        img: 'https://image.url', // sanitizeUrl adds trailing slash
        platform: Platforms.Epic
      });
      expect(mockFetch).toHaveBeenCalledWith("https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions?locale=en-US");
    });

    it('should handle API failure (non-ok response)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Internal Server Error'
      });

      const games = await platform.fetchFreeGames();

      expect(games).toHaveLength(0);
      expect(logger.error).toHaveBeenCalledWith(
        "Failed to fetch Epic Games data",
        { platform: 'epic' },
        expect.any(Error)
      );
    });

    it('should handle validation failure (schema error)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { invalid: 'format' } })
      });

      const games = await platform.fetchFreeGames();

      expect(games).toHaveLength(0);
      expect(logger.warn).toHaveBeenCalledWith(
        'Invalid Epic game data received',
        expect.objectContaining({ platform: 'epic' })
      );
    });

    it('should handle fetch throwing an error', async () => {
      const mockError = new Error('Network Error');
      mockFetch.mockRejectedValueOnce(mockError);

      const games = await platform.fetchFreeGames();

      expect(games).toHaveLength(0);
      expect(logger.error).toHaveBeenCalledWith(
        "Error fetching Epic games",
        { platform: 'epic' },
        mockError
      );
    });
  });

  describe('checkLoginStatus', () => {
    const mockGetStorageItem = getStorageItem as any;

    it('should return null when storage item is missing', async () => {
      mockGetStorageItem.mockResolvedValueOnce(undefined);

      const status = await platform.checkLoginStatus();
      expect(status).toBeNull();
    });

    it('should return null when data is older than 7 days', async () => {
      mockGetStorageItem.mockImplementation((key: string) => {
        if (key === 'epicLoggedIn') return true;
        if (key === 'epicLoginCheckedAt') {
          // 8 days ago
          const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
          return oldDate.toISOString();
        }
      });

      const status = await platform.checkLoginStatus();
      expect(status).toBeNull();
    });

    it('should return true when logged in and recently checked', async () => {
      mockGetStorageItem.mockImplementation((key: string) => {
        if (key === 'epicLoggedIn') return true;
        if (key === 'epicLoginCheckedAt') {
          // 1 day ago
          const recentDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
          return recentDate.toISOString();
        }
      });

      const status = await platform.checkLoginStatus();
      expect(status).toBe(true);
    });

    it('should return false when logged out and recently checked', async () => {
      mockGetStorageItem.mockImplementation((key: string) => {
        if (key === 'epicLoggedIn') return false;
        if (key === 'epicLoginCheckedAt') {
          return new Date().toISOString();
        }
      });

      const status = await platform.checkLoginStatus();
      expect(status).toBe(false);
    });

    it('should return null when storage access throws', async () => {
      mockGetStorageItem.mockRejectedValueOnce(new Error('Storage failure'));

      const status = await platform.checkLoginStatus();
      expect(status).toBeNull();
    });
  });

  describe('getLoginUrl', () => {
    it('should return the correct Epic Games login URL', () => {
      expect(platform.getLoginUrl()).toBe("https://www.epicgames.com/id/login");
    });
  });
});
