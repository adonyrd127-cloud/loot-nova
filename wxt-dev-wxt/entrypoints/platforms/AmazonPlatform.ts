import { BasePlatform } from './BasePlatform';
import { FreeGame } from '@/entrypoints/types/freeGame.ts';

export class AmazonPlatform extends BasePlatform {
  readonly name = 'Amazon Prime Gaming';
  readonly id = 'amazon';

  async fetchFreeGames(): Promise<FreeGame[]> {
    // Amazon is scraped via content script directly because it requires DOM/SPA rendering
    // This is handled by orchestrator opening the tab and waiting for message.
    return [];
  }

  async checkLoginStatus(): Promise<boolean | null> {
    try {
      const response = await fetch("https://www.amazon.com/ap/signin", { method: 'HEAD', redirect: 'manual' });
      // If we don't get redirected to signin when hitting an auth page, we are likely logged in
      return response.status !== 200;
    } catch {
      return null;
    }
  }

  getLoginUrl(): string {
    return "https://gaming.amazon.com/home";
  }
}
