import { BasePlatform } from './BasePlatform';
import { FreeGame } from '@/entrypoints/types/freeGame.ts';
import { Platforms } from '@/entrypoints/enums/platforms.ts';
import { logger } from '@/entrypoints/utils/logger.ts';
import { parse } from 'node-html-parser';
import { sanitizeGameTitle, sanitizeUrl } from '@/entrypoints/utils/sanitize.ts';

export class SteamPlatform extends BasePlatform {
  readonly name = 'Steam';
  readonly id = 'steam';
  private readonly SEARCH_URL = "https://store.steampowered.com/search/?sort_by=Price_ASC&maxprice=free&category1=998&specials=1&ndl=1";

  async fetchFreeGames(): Promise<FreeGame[]> {
    try {
      const response = await fetch(this.SEARCH_URL);
      if (!response.ok) {
        logger.error("Failed to fetch Steam data", { platform: 'steam' }, new Error(response.statusText));
        return [];
      }
      
      const html = await response.text();
      const root = parse(html);
      
      const gameRows = root.querySelectorAll('a.search_result_row:not(.ds_owned)');
      const parsedGames: FreeGame[] = [];
      
      for (const row of gameRows) {
        const titleEl = row.querySelector('span.title');
        const imgEl = row.querySelector('img');
        if (titleEl && imgEl) {
          parsedGames.push({
            title: sanitizeGameTitle(titleEl.text),
            link: sanitizeUrl(row.getAttribute('href') || ''),
            img: sanitizeUrl(imgEl.getAttribute('src') || ''),
            platform: Platforms.Steam
          });
        }
      }
      return parsedGames;
    } catch (e) {
      logger.error("Error fetching Steam games", { platform: 'steam' }, e as Error);
      return [];
    }
  }

  async checkLoginStatus(): Promise<boolean | null> {
    try {
      const response = await fetch("https://store.steampowered.com/account/", { method: 'HEAD', redirect: 'manual' });
      return response.status === 200;
    } catch {
      return null;
    }
  }

  getLoginUrl(): string {
    return "https://store.steampowered.com/login/";
  }
  async claimGame(game: FreeGame): Promise<boolean> {
    try {
      const htmlResp = await fetch(game.link);
      const htmlText = await htmlResp.text();
      const root = parse(htmlText);

      const sessionMatch = htmlText.match(/g_sessionID\s*=\s*"([^"]+)"/);
      const sessionId = sessionMatch ? sessionMatch[1] : null;

      if (!sessionId) {
        logger.warn("Could not find Steam session ID, falling back to tab", { platform: 'steam' });
        return super.claimGame(game);
      }

      const addLicenseMatch = htmlText.match(/AddFreeLicense\s*\(\s*(\d+)\s*(,\s*'.*?')?\s*\)/);
      let subId = addLicenseMatch ? addLicenseMatch[1] : null;

      if (!subId) {
        const subIdInput = root.querySelector('input[name="subid"]');
        if (subIdInput) subId = subIdInput.getAttribute('value') || null;
      }

      if (!subId) {
        logger.warn("Could not find subid/appid for silent claiming, falling back to tab", { platform: 'steam' });
        return super.claimGame(game);
      }

      const formData = new FormData();
      formData.append('action', 'add_to_cart');
      formData.append('sessionid', sessionId);
      formData.append('subid', subId);

      const claimResp = await fetch('https://store.steampowered.com/checkout/addfreelicense', {
        method: 'POST',
        body: formData,
      });

      if (claimResp.ok) {
        logger.info(`Silently claimed Steam game: ${game.title}`, { platform: 'steam' });
        return true;
      }
      return super.claimGame(game);
    } catch (e) {
      logger.error("Error during silent claim, falling back to tab", { platform: 'steam' }, e as Error);
      return super.claimGame(game);
    }
  }
}
