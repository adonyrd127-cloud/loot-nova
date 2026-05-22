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
      console.log('[LootNova/Steam] Fetching free games list...');
      const response = await fetch(this.SEARCH_URL);
      if (!response.ok) {
        logger.error("Failed to fetch Steam data", { platform: 'steam' }, new Error(response.statusText));
        return [];
      }
      
      const html = await response.text();
      console.log(`[LootNova/Steam] Fetched HTML (${html.length} chars)`);
      const root = parse(html);
      const resolveUrl = (u: string) =>
      const resolveUrl = (u: string) =>
        u ? new URL(u, 'https://store.steampowered.com').toString() : '';

      const container = root.querySelector('div#search_result_container');
      const freeGameNodes = container ? container.querySelectorAll('a.search_result_row') : [];
      console.log(`[LootNova/Steam] Found ${freeGameNodes.length} search result nodes`);

      const parsedGames: FreeGame[] = [];
      
      for (const node of freeGameNodes) {
        const href = node.getAttribute('href') ?? '';
        const rawTitle = node.querySelector('span.title')?.text?.trim() ?? '';
        const title = sanitizeGameTitle(rawTitle);
        const imgEl = node.querySelector('img');
        const imgRaw =
          imgEl?.getAttribute('src')?.trim() ||
          imgEl?.getAttribute('data-src')?.trim() ||
          imgEl?.getAttribute('data-lazy')?.trim() || '';

        const priceEl = node.querySelector('.discount_original_price');
        let retailPrice: number | undefined;
        if (priceEl) {
          const priceText = priceEl.text.trim().replace(/[^\d.,]/g, '').replace(',', '.');
          retailPrice = parseFloat(priceText) || undefined;
        }

        if (href && title) {
          parsedGames.push({
            title,
            link: sanitizeUrl(resolveUrl(href)),
            img: imgRaw ? sanitizeUrl(resolveUrl(imgRaw)) : '',
            platform: Platforms.Steam,
            retailPrice,
          });
        }
      }

      console.log(`[LootNova/Steam] Parsed ${parsedGames.length} games:`, parsedGames.map(g => g.title));
      return parsedGames;
    } catch (e) {
      logger.error("Error fetching Steam games", { platform: 'steam' }, e as Error);
      return [];
    }
  }

  async checkLoginStatus(): Promise<boolean | null> {
    try {
      const response = await fetch("https://store.steampowered.com/account/", { 
        method: 'HEAD', 
        redirect: 'manual',
        credentials: 'include'
      });
      return response.status === 200;
    } catch {
      return null;
    }
  }

  getLoginUrl(): string {
    return "https://store.steampowered.com/login/";
  }
  async claimGame(_game: FreeGame): Promise<boolean> {
    // Silent claiming via fetch POST does NOT work reliably for Steam.
    // Steam's -100% discount games require a full browser session (cookies,
    // JS execution, cart flow) that can't be replicated from a service worker.
    // The fetch returns HTTP 200 but doesn't actually add the game.
    // Always fall back to the tab-based approach where the content script
    // clicks the real "Add to account" button on the page.
    return false;
  }
}
