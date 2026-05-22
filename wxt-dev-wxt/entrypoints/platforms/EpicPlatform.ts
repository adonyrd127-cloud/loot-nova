import { BasePlatform } from './BasePlatform';
import { FreeGame } from '@/entrypoints/types/freeGame.ts';
import { Platforms } from '@/entrypoints/enums/platforms.ts';
import { EpicSearchResponseSchema } from '@/entrypoints/types/validators.ts';
import { EpicElement } from '@/entrypoints/types/epicGame.ts';
import { logger } from '@/entrypoints/utils/logger.ts';
import { sanitizeGameTitle, sanitizeUrl } from '@/entrypoints/utils/sanitize.ts';
import { getStorageItem } from '@/entrypoints/hooks/useStorage.ts';

export class EpicPlatform extends BasePlatform {
  readonly name = 'Epic Games';
  readonly id = 'epic';
  private readonly API_URL = "https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions?locale=en-US";
  private readonly STORE_URL = "https://store.epicgames.com/";

  async fetchGamesAndFuture(): Promise<{ freeGames: FreeGame[], futureGames: FreeGame[] }> {
    try {
      const response = await fetch(this.API_URL);
      if (!response.ok) {
        logger.error("Failed to fetch Epic Games data", { platform: 'epic' }, new Error(response.statusText));
        return { freeGames: [], futureGames: [] };
      }
      
      const rawData = await response.json();
      const parsed = EpicSearchResponseSchema.safeParse(rawData);
      
      if (!parsed.success) {
        logger.warn('Invalid Epic game data received', { platform: 'epic', errors: parsed.error.errors });
        return { freeGames: [], futureGames: [] };
      }

      const data = parsed.data;
      const games: EpicElement[] = (data?.data?.Catalog?.searchStore?.elements as unknown as EpicElement[]) ?? [];

      const freeGamesRaw = games.filter((game) =>
          game.price?.totalPrice?.discountPrice === 0 &&
          (game.promotions?.promotionalOffers?.length ?? 0) > 0
      );

      const futureFreeGamesRaw = games.filter((game) =>
          game.promotions?.upcomingPromotionalOffers?.[0]?.promotionalOffers?.[0]?.discountSetting?.discountPercentage === 0
      );

      const freeGames = freeGamesRaw.map(g => this.formatEpicFreeGame(g, false));
      const futureGames = futureFreeGamesRaw.map(g => this.formatEpicFreeGame(g, true));

      return { freeGames, futureGames };
    } catch (e) {
      logger.error("Error fetching Epic games", { platform: 'epic' }, e as Error);
      return { freeGames: [], futureGames: [] };
    }
  }

  async fetchFreeGames(): Promise<FreeGame[]> {
    const { freeGames } = await this.fetchGamesAndFuture();
    return freeGames;
  }

  formatEpicFreeGame(game: EpicElement, future: boolean): FreeGame {
    const epicSlug =
        game.productSlug ||
        game.catalogNs?.mappings?.[0]?.pageSlug ||
        game.offerMappings?.[0]?.pageSlug ||
        "";
    const isEpicBundle = Array.isArray(game.categories) && game.categories.some((c) => c?.path === "bundles");
    const path  = isEpicBundle ? "bundle" : "p";
    const promo = (future
        ? game.promotions?.upcomingPromotionalOffers?.[0]?.promotionalOffers?.[0]
        : game.promotions?.promotionalOffers?.[0]?.promotionalOffers?.[0]) ?? {};
    const originalPrice = game.price?.totalPrice?.originalPrice;
    const retailPrice = (originalPrice != null && originalPrice > 0) ? originalPrice / 100 : undefined;

    return {
      title: sanitizeGameTitle(game.title ?? ""),
      platform: Platforms.Epic,
      link: sanitizeUrl(`https://www.epicgames.com/store/en-US/${path}/${epicSlug}`),
      img:
          game.keyImages?.find((img) => img.type === "Thumbnail")?.url ||
          game.keyImages?.[0]?.url ||
          "/icon/128.png",
      description: game.description ?? "",
      startDate: new Date(promo.startDate ?? 0).toISOString(),
      endDate:   new Date(promo.endDate ?? 0).toISOString(),
      future,
      retailPrice,
    };
  }

  async checkLoginStatus(): Promise<boolean | null> {
    try {
      // ÚNICA fuente confiable: el content script que corre en store.epicgames.com
      const storedLogin = await getStorageItem('epicLoggedIn');
      const checkedAt = await getStorageItem('epicLoginCheckedAt') as string | null;
      
      // Si nunca se ha seteado, es desconocido
      if (storedLogin === undefined || storedLogin === null) {
        return null;
      }
      
      // Si la data es muy vieja (> 7 días), es desconocido
      if (checkedAt) {
        const age = Date.now() - new Date(checkedAt).getTime();
        if (age > 7 * 24 * 60 * 60 * 1000) {
          return null;
        }
      }
      
      return storedLogin === true;
    } catch {
      return null;
    }
  }

  getLoginUrl(): string {
    return "https://www.epicgames.com/id/login";
  }
}
