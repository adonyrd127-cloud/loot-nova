import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useGameStore, defaultSettings } from './gameStore';
import { FreeGame } from '../types/freeGame';
import { ClaimedGame } from '../types/claimedGame';
import { ClaimFrequency } from '../enums/claimFrequency';

const { getWatchCallback, setWatchCallback } = vi.hoisted(() => {
  let cb: Function | null = null;
  return {
    getWatchCallback: () => cb,
    setWatchCallback: (newCb: Function) => { cb = newCb; },
  };
});

// We need to mock wxt/storage because it's imported in gameStore.ts
vi.mock('wxt/storage', () => ({
  storage: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    watch: vi.fn((key, cb) => {
      if (key === 'local:lootnova-store') {
        setWatchCallback(cb);
      }
    }),
  }
}));

describe('gameStore', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useGameStore.setState({
      games: [],
      history: [],
      platforms: {
        epic: undefined as any,
        amazon: undefined as any,
        steam: undefined as any,
        gog: undefined as any,
      },
      settings: defaultSettings,
      isInitialized: false,
    });
    vi.clearAllMocks();
  });

  it('should initialize with default state', () => {
    const state = useGameStore.getState();
    expect(state.games).toEqual([]);
    expect(state.history).toEqual([]);
    expect(state.settings).toEqual(defaultSettings);
    expect(state.isInitialized).toBe(false);
  });

  it('should setInitialized correctly', () => {
    useGameStore.getState().setInitialized(true);
    expect(useGameStore.getState().isInitialized).toBe(true);
  });

  describe('addGames', () => {
    it('should add new games to the store', () => {
      const mockGame: FreeGame = {
        title: 'Test Game',
        platform: 'epic',
        url: 'https://test.com',
        imageUrl: 'https://test.com/img.jpg',
      };

      useGameStore.getState().addGames([mockGame]);

      const { games } = useGameStore.getState();
      expect(games.length).toBe(1);
      expect(games[0]).toEqual(mockGame);
    });

    it('should update existing games instead of adding duplicates', () => {
      const mockGame1: FreeGame = {
        title: 'Test Game',
        platform: 'epic',
        url: 'https://test.com',
        imageUrl: 'https://test.com/img.jpg',
      };

      const mockGameUpdated: FreeGame = {
        title: 'Test Game',
        platform: 'epic',
        url: 'https://newurl.com',
        imageUrl: 'https://newurl.com/img.jpg',
        claimed: true,
      };

      useGameStore.getState().addGames([mockGame1]);
      useGameStore.getState().addGames([mockGameUpdated]);

      const { games } = useGameStore.getState();
      expect(games.length).toBe(1);
      expect(games[0]).toEqual(mockGameUpdated);
    });
  });

  describe('markClaimed', () => {
    it('should mark a game as claimed by title and platform', () => {
      const mockGame: FreeGame = {
        title: 'Test Game',
        platform: 'epic',
        url: 'https://test.com',
      };

      useGameStore.getState().addGames([mockGame]);
      useGameStore.getState().markClaimed('Test Game', 'epic');

      const { games } = useGameStore.getState();
      expect(games[0].claimed).toBe(true);
      expect(games[0].claimedAt).toBeInstanceOf(Date);
    });

    it('should not mark a game as claimed if title or platform do not match', () => {
      const mockGame: FreeGame = {
        title: 'Test Game',
        platform: 'epic',
        url: 'https://test.com',
      };

      useGameStore.getState().addGames([mockGame]);
      useGameStore.getState().markClaimed('Another Game', 'epic');
      useGameStore.getState().markClaimed('Test Game', 'steam');

      const { games } = useGameStore.getState();
      expect(games[0].claimed).toBeFalsy();
    });
  });

  describe('addToHistory', () => {
    it('should add a game to history', () => {
      const claimedGame: ClaimedGame = {
        title: 'Test Game',
        platform: 'epic',
        claimDate: new Date(),
      };

      useGameStore.getState().addToHistory(claimedGame);

      const { history } = useGameStore.getState();
      expect(history.length).toBe(1);
      expect(history[0]).toEqual(claimedGame);
    });

    it('should not add a duplicate game to history', () => {
      const claimedGame: ClaimedGame = {
        title: 'Test Game',
        platform: 'epic',
        claimDate: new Date(),
      };

      useGameStore.getState().addToHistory(claimedGame);
      useGameStore.getState().addToHistory(claimedGame);

      const { history } = useGameStore.getState();
      expect(history.length).toBe(1);
    });

    it('should slice history to keep a maximum of 100 items', () => {
      for (let i = 0; i < 105; i++) {
        useGameStore.getState().addToHistory({
          title: `Game ${i}`,
          platform: 'epic',
          claimDate: new Date(),
        });
      }

      const { history } = useGameStore.getState();
      expect(history.length).toBe(100);
      expect(history[0].title).toBe('Game 104');
    });
  });

  describe('updatePlatformStatus', () => {
    it('should update platform status', () => {
      useGameStore.getState().updatePlatformStatus('epic', { isClaiming: true });

      const { platforms } = useGameStore.getState();
      expect(platforms.epic).toEqual({ id: 'epic', isClaiming: true });
    });

    it('should merge platform status updates', () => {
      useGameStore.getState().updatePlatformStatus('steam', { isClaiming: true, lastCheck: 12345 });
      useGameStore.getState().updatePlatformStatus('steam', { isClaiming: false });

      const { platforms } = useGameStore.getState();
      expect(platforms.steam).toEqual({ id: 'steam', isClaiming: false, lastCheck: 12345 });
    });
  });

  describe('updateSettings', () => {
    it('should update settings', () => {
      useGameStore.getState().updateSettings({ active: false, claimFrequency: ClaimFrequency.WEEKLY });

      const { settings } = useGameStore.getState();
      expect(settings.active).toBe(false);
      expect(settings.claimFrequency).toBe(ClaimFrequency.WEEKLY);
      // Other settings should remain unchanged
      expect(settings.steamCheck).toBe(true);
    });
  });

  describe('clearGames', () => {
    it('should clear all games from the store', () => {
      useGameStore.getState().addGames([{ title: 'Game', platform: 'epic', url: '' }]);
      expect(useGameStore.getState().games.length).toBe(1);

      useGameStore.getState().clearGames();
      expect(useGameStore.getState().games.length).toBe(0);
    });
  });
});

  describe('chromeStorageWrapper', () => {
    it('should save to storage on state change', async () => {
      const { storage } = await import('wxt/storage');

      // Update state to trigger persist
      useGameStore.getState().updateSettings({ active: false });

      // Zustand persist might be slightly delayed or immediate, but typically calls setItem.
      // Wait for promise tick just in case
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(storage.setItem).toHaveBeenCalled();

      // Find the specific call for the persist
      const calls = (storage.setItem as any).mock.calls.filter((c: any) => c[0] === 'local:lootnova-store');
      expect(calls.length).toBeGreaterThan(0);
      const lastCall = calls[calls.length - 1];
      expect(lastCall[1].state.settings.active).toBe(false);
    });
  });

  describe('storage.watch sync', () => {
    it('should update state when storage changes across contexts', async () => {
      const cb = getWatchCallback();
      expect(cb).not.toBeNull();

      // Simulate an update from another context
      cb!({
        games: [{ title: 'Sync Game', platform: 'steam', url: '' }],
        history: [],
        platforms: {},
        settings: defaultSettings,
        isInitialized: true
      });

      const { games } = useGameStore.getState();
      expect(games.length).toBe(1);
      expect(games[0].title).toBe('Sync Game');
    });

    it('should do nothing if new value is falsy', async () => {
      const cb = getWatchCallback();
      expect(cb).not.toBeNull();

      const prevGames = useGameStore.getState().games;
      cb!(null);

      expect(useGameStore.getState().games).toEqual(prevGames);
    });
  });

  describe('chromeStorageWrapper.removeItem & getItem', () => {
    it('should handle clearStorage and rehydrate', async () => {
      const { storage } = await import('wxt/storage');

      // Zustand persist API
      await useGameStore.persist.clearStorage();
      expect(storage.removeItem).toHaveBeenCalled();

      await useGameStore.persist.rehydrate();
      expect(storage.getItem).toHaveBeenCalled();
    });
  });
