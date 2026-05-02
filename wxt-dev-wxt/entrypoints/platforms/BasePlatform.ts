import { FreeGame } from '@/entrypoints/types/freeGame.ts';
import { browser } from 'wxt/browser';

export type PlatformId = 'epic' | 'amazon' | 'steam' | 'gog';

export abstract class BasePlatform {
  abstract readonly name: string;
  abstract readonly id: PlatformId;

  abstract fetchFreeGames(): Promise<FreeGame[]>;
  abstract checkLoginStatus(): Promise<boolean | null>;
  abstract getLoginUrl(): string;

  async claimGame(game: FreeGame): Promise<boolean> {
    try {
      const tab = await browser.tabs.create({ url: game.link, active: false });
      if (!tab?.id) return false;

      // Wait for tab load + content script response via Orchestrator or direct messaging
      // This default implementation relies on the caller waiting for the 'claimComplete' message
      return true;
    } catch (e) {
      console.error(`Error claiming game on ${this.name}:`, e);
      return false;
    }
  }
}
