import { BasePlatform } from './BasePlatform';
import { FreeGame } from '@/entrypoints/types/freeGame.ts';
import { Platforms } from '@/entrypoints/enums/platforms.ts';
import { EpicSearchResponseSchema } from '@/entrypoints/types/validators.ts';
import { EpicElement } from '@/entrypoints/types/epicGame.ts';
import { logger } from '@/entrypoints/utils/logger.ts';
import { sanitizeGameTitle, sanitizeUrl } from '@/entrypoints/utils/sanitize.ts';

export class EpicPlatform extends BasePlatform {
  readonly name = 'Epic Games';
  readonly id = 'epic';
  private readonly API_URL = "https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions?locale=en-US";
  private readonly STORE_URL = "https://store.epicgames.com/";

  async fetchFreeGames(): Promise<FreeGame[]> {
    try {
      const response = await fetch(this.API_URL);
      if (!response.ok) {
        logger.error("Failed to fetch Epic Games data", { platform: 'epic' }, new Error(response.statusText));
        return [];
      }
      
      const rawData = await response.json();
      const parsed = EpicSearchResponseSchema.safeParse(rawData);
      
      if (!parsed.success) {
        logger.warn('Invalid Epic game data received', { platform: 'epic', errors: parsed.error.errors });
        return [];
      }

      const data = parsed.data;
      const games: EpicElement[] = (data?.data?.Catalog?.searchStore?.elements as unknown as EpicElement[]) ?? [];

      const freeGames = games.filter((game) =>
          game.price?.totalPrice?.discountPrice === 0 &&
          game.promotions?.promotionalOffers &&
          game.promotions.promotionalOffers.length > 0 &&
          game.promotions.promotionalOffers[0].promotionalOffers &&
          game.promotions.promotionalOffers[0].promotionalOffers.length > 0
      );

      const parsedGames: FreeGame[] = [];
      for (const game of freeGames) {
        const title = sanitizeGameTitle(game.title);
        const urlSlug = game.catalogNs?.mappings?.[0]?.pageSlug || game.productSlug || game.urlSlug || game.offerMappings?.[0]?.pageSlug;
        const link = sanitizeUrl(`${this.STORE_URL}p/${urlSlug}`);
        const heroImage = game.keyImages?.find(img => img.type === "OfferImageWide")?.url || game.keyImages?.[0]?.url;
        
        parsedGames.push({
          title,
          link,
          img: sanitizeUrl(heroImage || ""),
          platform: Platforms.Epic
        });
      }

      return parsedGames;
    } catch (e) {
      logger.error("Error fetching Epic games", { platform: 'epic' }, e as Error);
      return [];
    }
  }

  async checkLoginStatus(): Promise<boolean | null> {
    try {
      const response = await fetch("https://www.epicgames.com/account/v2/profile/ajaxGet", {
        credentials: 'include'
      });
      return response.ok;
    } catch {
      return null;
    }
  }

  getLoginUrl(): string {
    return "https://www.epicgames.com/id/login";
  }
}
