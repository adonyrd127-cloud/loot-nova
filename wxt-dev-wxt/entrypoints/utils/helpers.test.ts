/**
 * helpers.test.ts — Unit tests for shared helper utilities.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We test the pure/simple helpers. The DOM-dependent ones (waitForElement, etc.)
// would require jsdom and are out of scope for basic unit tests.

// Import the source directly — we'll mock what we need
// Note: some helpers depend on `browser` from wxt, so we mock that first

vi.mock('wxt/browser', () => ({
    browser: {
        action: { setBadgeText: vi.fn() },
        notifications: { create: vi.fn() },
        runtime: { sendMessage: vi.fn() },
        i18n: { getMessage: (key: string) => key },
    },
}));

// The helper module uses `defineBackground` side effects, so we import selectively
// We'll test the pure utility functions that don't need DOM

describe('wait utility', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it('resolves after specified time', async () => {
        // Import dynamically to avoid top-level side effects
        const { wait } = await import('@/entrypoints/utils/helpers.ts');

        let resolved = false;
        const p = wait(1000).then(() => { resolved = true; });

        expect(resolved).toBe(false);

        vi.advanceTimersByTime(999);
        await Promise.resolve(); // flush microtasks
        expect(resolved).toBe(false);

        vi.advanceTimersByTime(1);
        await Promise.resolve();
        await p;
        expect(resolved).toBe(true);
    });
});

describe('getRndInteger utility', () => {
    let mathRandomSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        mathRandomSpy = vi.spyOn(Math, 'random');
    });

    afterEach(() => {
        mathRandomSpy.mockRestore();
    });

    it('returns a number within range', async () => {
        const { getRndInteger } = await import('@/entrypoints/utils/helpers.ts');

        for (let i = 0; i < 100; i++) {
            const result = getRndInteger(10, 20);
            expect(result).toBeGreaterThanOrEqual(10);
            expect(result).toBeLessThanOrEqual(20);
        }
    });

    it('returns min when min === max', async () => {
        const { getRndInteger } = await import('@/entrypoints/utils/helpers.ts');
        expect(getRndInteger(5, 5)).toBe(5);
    });

    it('returns exactly min when Math.random() is 0', async () => {
        const { getRndInteger } = await import('@/entrypoints/utils/helpers.ts');
        mathRandomSpy.mockReturnValue(0);
        expect(getRndInteger(10, 20)).toBe(10);
    });

    it('returns exactly max when Math.random() is almost 1', async () => {
        const { getRndInteger } = await import('@/entrypoints/utils/helpers.ts');
        mathRandomSpy.mockReturnValue(0.9999999999999999);
        expect(getRndInteger(10, 20)).toBe(20);
    });

    it('handles negative ranges correctly', async () => {
        const { getRndInteger } = await import('@/entrypoints/utils/helpers.ts');

        for (let i = 0; i < 100; i++) {
            const result = getRndInteger(-30, -10);
            expect(result).toBeGreaterThanOrEqual(-30);
            expect(result).toBeLessThanOrEqual(-10);
        }
    });

    it('handles ranges crossing zero correctly', async () => {
        const { getRndInteger } = await import('@/entrypoints/utils/helpers.ts');

        for (let i = 0; i < 100; i++) {
            const result = getRndInteger(-10, 10);
            expect(result).toBeGreaterThanOrEqual(-10);
            expect(result).toBeLessThanOrEqual(10);
        }
    });
});
