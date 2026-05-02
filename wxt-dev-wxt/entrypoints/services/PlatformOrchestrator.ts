import { PlatformRegistry } from '../platforms/PlatformRegistry';
import { FreeGame } from '@/entrypoints/types/freeGame.ts';
import { setStorageItem } from '@/entrypoints/hooks/useStorage.ts';

export class PlatformOrchestrator {
  constructor(private registry: PlatformRegistry) {}

  /**
   * Example of how the Orchestrator uses the Strategy pattern 
   * to fetch free games from all API-based platforms in parallel.
   */
  async fetchAllApiGames(): Promise<void> {
    const apiPlatforms = this.registry.getAll().filter(p => p.id !== 'amazon' && p.id !== 'gog'); // Amazon/GOG rely on content scripts
    
    const results = await Promise.allSettled(
      apiPlatforms.map(p => p.fetchFreeGames())
    );

    for (let i = 0; i < apiPlatforms.length; i++) {
      const platform = apiPlatforms[i];
      const result = results[i];
      if (result.status === 'fulfilled') {
        const storageKey = `${platform.id}Games`;
        await setStorageItem(storageKey, result.value);
        console.log(`[Orchestrator] Saved ${result.value.length} games for ${platform.name}`);
      } else {
        console.error(`[Orchestrator] Failed to fetch games for ${platform.name}:`, result.reason);
      }
    }
  }

  /**
   * Example: Checking login status for all platforms
   */
  async checkAllLoginStatuses(): Promise<void> {
    const platforms = this.registry.getAll();
    
    const results = await Promise.allSettled(
      platforms.map(p => p.checkLoginStatus())
    );

    for (let i = 0; i < platforms.length; i++) {
      const platform = platforms[i];
      const result = results[i];
      if (result.status === 'fulfilled') {
        if (result.value !== null) {
          await setStorageItem(`${platform.id}LoggedIn`, result.value);
        }
      }
    }
  }
}
