import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { storage } from 'wxt/storage';
import { FreeGame } from '@/entrypoints/types/freeGame.ts';
import { ClaimedGame } from '@/entrypoints/types/claimedGame.ts';
import { PlatformStatus } from '@/entrypoints/types/ui.ts';
import { Platforms } from '@/entrypoints/enums/platforms.ts';
import { ClaimFrequency } from '@/entrypoints/enums/claimFrequency.ts';

export interface UserSettings {
  active: boolean;
  claimFrequency: ClaimFrequency;
  steamCheck: boolean;
  epicCheck: boolean;
  amazonCheck: boolean;
  gogCheck: boolean;
  notificationsEnabled: boolean;
  sessionCheckEnabled: boolean;
  animationsEnabled: boolean;
  language: string;
}

export const defaultSettings: UserSettings = {
  active: true,
  claimFrequency: ClaimFrequency.DAILY,
  steamCheck: true,
  epicCheck: true,
  amazonCheck: true,
  gogCheck: true,
  notificationsEnabled: true,
  sessionCheckEnabled: true,
  animationsEnabled: true,
  language: 'es'
};

export type PlatformId = 'epic' | 'amazon' | 'steam' | 'gog';

interface GameState {
  games: FreeGame[];
  history: ClaimedGame[];
  platforms: Record<PlatformId, PlatformStatus>;
  settings: UserSettings;
  isInitialized: boolean;
  
  // Actions
  setInitialized: (val: boolean) => void;
  addGames: (games: FreeGame[]) => void;
  markClaimed: (gameTitle: string, platform: string) => void;
  addToHistory: (game: ClaimedGame) => void;
  updatePlatformStatus: (id: PlatformId, status: Partial<PlatformStatus>) => void;
  updateSettings: (settings: Partial<UserSettings>) => void;
  clearGames: () => void;
}

// Wrapper to make WXT's chrome.storage.local compatible with Zustand's persist middleware
const chromeStorageWrapper = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      const value = await storage.getItem(`local:${name}`);
      return value ? JSON.stringify(value) : null;
    } catch {
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      await storage.setItem(`local:${name}`, JSON.parse(value));
    } catch { /* ignore */ }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      await storage.removeItem(`local:${name}`);
    } catch { /* ignore */ }
  },
};

export const useGameStore = create<GameState>()(
  persist(
    (set) => ({
      games: [],
      history: [],
      platforms: {} as Record<PlatformId, PlatformStatus>,
      settings: defaultSettings,
      isInitialized: false,
      
      setInitialized: (val) => set({ isInitialized: val }),
      
      addGames: (newGames) => set((state) => {
        const merged = [...state.games];
        for (const game of newGames) {
          const idx = merged.findIndex(g => g.title === game.title && g.platform === game.platform);
          if (idx >= 0) {
            merged[idx] = { ...merged[idx], ...game };
          } else {
            merged.push(game);
          }
        }
        return { games: merged };
      }),
      
      markClaimed: (gameTitle, platform) => set((state) => ({
        games: state.games.map(g => 
          (g.title === gameTitle && g.platform === platform)
            ? { ...g, claimed: true, claimedAt: new Date() } 
            : g
        )
      })),
      
      addToHistory: (entry) => set((state) => {
        const alreadySaved = state.history.some(h => h.title === entry.title && h.platform === entry.platform);
        if (alreadySaved) return state;
        return { history: [entry, ...state.history].slice(0, 100) };
      }),
      
      updatePlatformStatus: (id, status) => set((state) => ({
        platforms: { 
          ...state.platforms, 
          [id]: { ...state.platforms[id], ...status, id: id } 
        }
      })),
      
      updateSettings: (newSettings) => set((state) => ({
        settings: { ...state.settings, ...newSettings }
      })),

      clearGames: () => set({ games: [] })
    }),
    {
      name: 'lootnova-store',
      storage: createJSONStorage(() => chromeStorageWrapper),
      partialize: (state) => ({ 
        games: state.games, 
        history: state.history, 
        platforms: state.platforms,
        settings: state.settings 
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.setInitialized(true);
        }
      }
    }
  )
);
