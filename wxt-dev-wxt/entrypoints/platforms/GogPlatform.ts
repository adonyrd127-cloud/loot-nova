import { BasePlatform } from './BasePlatform';
import { FreeGame } from '@/entrypoints/types/freeGame.ts';
import { Platforms } from '@/entrypoints/enums/platforms.ts';
import { logger } from '@/entrypoints/utils/logger.ts';
import { sanitizeGameTitle, sanitizeUrl } from '@/entrypoints/utils/sanitize.ts';
import { parse } from 'node-html-parser';

export class GogPlatform extends BasePlatform {
  readonly name = 'GOG';
  readonly id = 'gog';

  async fetchFreeGames(): Promise<FreeGame[]> {
    try {
      // GOG often embeds giveaways on their main page.
      const resp = await fetch('https://www.gog.com/en/', {
        headers: { 'Accept': 'text/html' }
      });

      if (!resp.ok) return [];

      const html = await resp.text();
      const root = parse(html);

      // Search for giveaway banner
      const giveawayEl = root.querySelector('.giveaway-banner__container, [class*="giveaway"]');
      if (!giveawayEl) return [];

      const titleEl = giveawayEl.querySelector('.giveaway-banner__title, [class*="title"]');
      const title = titleEl ? titleEl.text.trim() : 'Free GOG Game';

      return [{
        title: sanitizeGameTitle(title),
        link: 'https://www.gog.com/en/', // Usually claims happen on the front page via AJAX
        img: 'https://www.gog.com/favicon.ico', // Fallback, GOG hides images in complicated CSS
        platform: Platforms.Gog
      }];
    } catch (e) {
      logger.error("Error fetching GOG games", { platform: 'gog' }, e as Error);
      return [];
    }
  }

  async checkLoginStatus(): Promise<boolean | null> {
    try {
      const resp = await fetch('https://www.gog.com/userData.json', { 
        method: 'GET',
        credentials: 'include'
      });
      if (resp.ok) {
        const json = await resp.json();
        return json.isLoggedIn === true;
      }
      return false;
    } catch {
      return null;
    }
  }

  getLoginUrl(): string {
    return "https://www.gog.com/";
  }

  async claimGame(game: FreeGame): Promise<boolean> {
    // Silent Claiming for GOG
    try {
      // GOG claiming involves sending a POST request to /giveaway/claim
      const claimResp = await fetch('https://www.gog.com/giveaway/claim', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });
      if (claimResp.ok) {
        logger.info(`Silently claimed GOG game: ${game.title}`, { platform: 'gog' });
        return true;
      }
      return false;
    } catch (e) {
      logger.error("Error silently claiming GOG game", { platform: 'gog' }, e as Error);
      return false;
    }
  }
}
