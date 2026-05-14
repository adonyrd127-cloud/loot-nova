import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClaimFrequency } from '@/entrypoints/enums/claimFrequency.ts';

// Add global mocks needed for background.ts
global.defineBackground = (obj: any) => obj;

vi.mock('wxt/browser', () => ({
  browser: {
    runtime: {
      onStartup: { addListener: vi.fn() },
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
      onInstalled: { addListener: vi.fn() },
      getURL: vi.fn().mockReturnValue('mock-url'),
    },
    alarms: {
      onAlarm: { addListener: vi.fn() },
      clear: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
    },
    action: {
      setBadgeBackgroundColor: vi.fn(),
      setBadgeText: vi.fn(),
    },
    i18n: {
      getMessage: vi.fn().mockReturnValue('mock-message'),
    },
    notifications: {
      create: vi.fn(),
    },
    tabs: {
      create: vi.fn(),
      sendMessage: vi.fn(),
      remove: vi.fn(),
      get: vi.fn(),
    },
    scripting: {
      executeScript: vi.fn(),
    }
  }
}));

vi.mock('@/entrypoints/hooks/useStorage.ts', () => ({
    getStorageItem: vi.fn(),
    getStorageItems: vi.fn(),
    setStorageItem: vi.fn(),
}));

import background from './background.ts';
import { getStorageItem } from '@/entrypoints/hooks/useStorage.ts';

describe('background - checkAndClaimIfDue', () => {
    let checkAndClaimIfDue: (frequency: ClaimFrequency) => Promise<void>;
    let getFreeGamesAndSetOpenedFlagSpy: any;
    let areDatesDifferentSpy: any;
    let didEnoughTimePassSpy: any;
    let getStorageItemMock: any;
    let bg: any;

    beforeEach(() => {
        vi.clearAllMocks();

        bg = background;
        checkAndClaimIfDue = bg.checkAndClaimIfDue.bind(bg);

        getFreeGamesAndSetOpenedFlagSpy = vi.spyOn(bg, 'getFreeGamesAndSetOpenedFlag').mockResolvedValue(undefined);
        areDatesDifferentSpy = vi.spyOn(bg, 'areDatesDifferent');
        didEnoughTimePassSpy = vi.spyOn(bg, 'didEnoughTimePass');

        getStorageItemMock = getStorageItem as any;

        // Ensure state is clear by calling it in a way it resets isChecking
        // We do this by mocking no getFreeGames action
        getStorageItemMock.mockResolvedValue('2023-01-01T00:00:00.000Z');
        areDatesDifferentSpy.mockReturnValue(false);
    });

    afterEach(async () => {
        // Reset `isChecking` flag properly
        getStorageItemMock.mockResolvedValue('2023-01-01T00:00:00.000Z');
        areDatesDifferentSpy.mockReturnValue(false);
        try {
           await checkAndClaimIfDue(ClaimFrequency.DAILY);
        } catch(e) {}
    });

    it('should call getFreeGamesAndSetOpenedFlag if there is no lastOpened', async () => {
        getStorageItemMock.mockResolvedValue(null);
        await checkAndClaimIfDue(ClaimFrequency.DAILY);
        expect(getFreeGamesAndSetOpenedFlagSpy).toHaveBeenCalledTimes(1);
    });

    it('should call getFreeGamesAndSetOpenedFlag on BROWSER_START frequency regardless of time', async () => {
        getStorageItemMock.mockResolvedValue('2023-01-01T00:00:00.000Z');
        await checkAndClaimIfDue(ClaimFrequency.BROWSER_START);
        expect(getFreeGamesAndSetOpenedFlagSpy).toHaveBeenCalledTimes(1);
    });

    it('should call getFreeGamesAndSetOpenedFlag on DAILY frequency if dates are different', async () => {
        getStorageItemMock.mockResolvedValue('2023-01-01T00:00:00.000Z');
        areDatesDifferentSpy.mockReturnValue(true);
        await checkAndClaimIfDue(ClaimFrequency.DAILY);
        expect(areDatesDifferentSpy).toHaveBeenCalledTimes(1);
        expect(getFreeGamesAndSetOpenedFlagSpy).toHaveBeenCalledTimes(1);
    });

    it('should not call getFreeGamesAndSetOpenedFlag on DAILY frequency if dates are the same', async () => {
        getStorageItemMock.mockResolvedValue('2023-01-01T00:00:00.000Z');
        areDatesDifferentSpy.mockReturnValue(false);
        await checkAndClaimIfDue(ClaimFrequency.DAILY);
        expect(areDatesDifferentSpy).toHaveBeenCalledTimes(1);
        expect(getFreeGamesAndSetOpenedFlagSpy).not.toHaveBeenCalled();
    });

    it('should call getFreeGamesAndSetOpenedFlag for HOURLY frequency if enough time has passed', async () => {
        getStorageItemMock.mockResolvedValue('2023-01-01T00:00:00.000Z');
        didEnoughTimePassSpy.mockReturnValue(true);
        await checkAndClaimIfDue(ClaimFrequency.HOURLY);
        // 60 minutes
        expect(didEnoughTimePassSpy).toHaveBeenCalledWith('2023-01-01T00:00:00.000Z', 60);
        expect(getFreeGamesAndSetOpenedFlagSpy).toHaveBeenCalledTimes(1);
    });

    it('should not call getFreeGamesAndSetOpenedFlag for HOURLY frequency if enough time has not passed', async () => {
        getStorageItemMock.mockResolvedValue('2023-01-01T00:00:00.000Z');
        didEnoughTimePassSpy.mockReturnValue(false);
        await checkAndClaimIfDue(ClaimFrequency.HOURLY);
        expect(didEnoughTimePassSpy).toHaveBeenCalledWith('2023-01-01T00:00:00.000Z', 60);
        expect(getFreeGamesAndSetOpenedFlagSpy).not.toHaveBeenCalled();
    });

    it('should prevent concurrent checks via isChecking flag', async () => {
        getStorageItemMock.mockResolvedValue('2023-01-01T00:00:00.000Z');
        areDatesDifferentSpy.mockReturnValue(true);

        let resolveGetFreeGames: (value: unknown) => void;
        const blockerPromise = new Promise((resolve) => {
            resolveGetFreeGames = resolve;
        });
        getFreeGamesAndSetOpenedFlagSpy.mockReturnValue(blockerPromise);

        // Start first check - it should block in getFreeGamesAndSetOpenedFlag
        const p1 = checkAndClaimIfDue(ClaimFrequency.DAILY);

        // Wait a tick to allow the first promise to execute past `isChecking = true`
        await new Promise(resolve => setTimeout(resolve, 0));

        // Try starting second check - it should return immediately due to isChecking
        await checkAndClaimIfDue(ClaimFrequency.DAILY);

        expect(getFreeGamesAndSetOpenedFlagSpy).toHaveBeenCalledTimes(1);

        // Resolve the first one to clean up
        resolveGetFreeGames!(undefined);
        await p1;

        // After cleanup, a new check should run
        getStorageItemMock.mockResolvedValue(null);
        getFreeGamesAndSetOpenedFlagSpy.mockResolvedValue(undefined);
        await checkAndClaimIfDue(ClaimFrequency.DAILY);
        expect(getFreeGamesAndSetOpenedFlagSpy).toHaveBeenCalledTimes(2);
    });

    it('should reset isChecking to false if an error is thrown', async () => {
        getStorageItemMock.mockResolvedValue('2023-01-01T00:00:00.000Z');
        areDatesDifferentSpy.mockReturnValue(true);
        getFreeGamesAndSetOpenedFlagSpy.mockRejectedValue(new Error('Test error'));

        await expect(checkAndClaimIfDue(ClaimFrequency.DAILY)).rejects.toThrow('Test error');

        // After error, isChecking should be false, so next call should proceed
        getStorageItemMock.mockResolvedValue(null);
        getFreeGamesAndSetOpenedFlagSpy.mockResolvedValue(undefined);
        await checkAndClaimIfDue(ClaimFrequency.DAILY);
        expect(getFreeGamesAndSetOpenedFlagSpy).toHaveBeenCalledTimes(2); // 1 error, 1 success
    });
});
