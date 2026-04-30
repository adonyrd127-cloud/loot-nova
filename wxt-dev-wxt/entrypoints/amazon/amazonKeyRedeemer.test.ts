/**
 * amazonKeyRedeemer.test.ts — Unit tests for key extraction logic.
 *
 * Uses JSDOM-like setup to test extractRedeemCode against
 * simulated Amazon page DOMs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock wxt/browser
vi.mock('wxt/browser', () => ({
    browser: {
        runtime: { sendMessage: vi.fn() },
    },
}));

// Mock helpers — extractRedeemCode only uses DOM APIs, not wait/helpers,
// but the module imports wait from helpers
vi.mock('@/entrypoints/utils/helpers.ts', () => ({
    wait: vi.fn(() => Promise.resolve()),
    getRndInteger: vi.fn((min: number) => min),
    waitForElement: vi.fn(),
    waitForPageLoad: vi.fn(),
    incrementCounter: vi.fn(),
}));

describe('extractRedeemCode', () => {
    beforeEach(() => {
        // Reset DOM
        document.body.innerHTML = '';
    });

    it('extracts GOG code from anchor href', async () => {
        document.body.innerHTML = `
            <div>
                <a href="https://www.gog.com/redeem/QQPUAE5BADC73947AC">Código de canje</a>
            </div>
        `;

        const { extractRedeemCode } = await import('@/entrypoints/amazon/amazonKeyRedeemer.ts');
        const result = extractRedeemCode();

        expect(result).not.toBeNull();
        expect(result!.platform).toBe('GOG');
        expect(result!.code).toBe('QQPUAE5BADC73947AC');
        expect(result!.redeemUrl).toBe('https://www.gog.com/redeem/QQPUAE5BADC73947AC');
    });

    it('extracts Steam key from anchor href', async () => {
        document.body.innerHTML = `
            <a href="https://store.steampowered.com/account/registerkey?key=ABCDE-FGHIJ-KLMNO">Redeem on Steam</a>
        `;

        const { extractRedeemCode } = await import('@/entrypoints/amazon/amazonKeyRedeemer.ts');
        const result = extractRedeemCode();

        expect(result).not.toBeNull();
        expect(result!.platform).toBe('Steam');
        expect(result!.code).toBe('ABCDE-FGHIJ-KLMNO');
    });

    it('detects Xbox redeem link', async () => {
        document.body.innerHTML = `
            <a href="https://www.xbox.com/redeemtoken?token=XXXXX">Redeem on Xbox</a>
        `;

        const { extractRedeemCode } = await import('@/entrypoints/amazon/amazonKeyRedeemer.ts');
        const result = extractRedeemCode();

        expect(result).not.toBeNull();
        expect(result!.platform).toBe('Xbox');
    });

    it('returns null when no redeem links exist', async () => {
        document.body.innerHTML = `
            <div>
                <a href="https://gaming.amazon.com/home">Home</a>
                <p>No keys here</p>
            </div>
        `;

        const { extractRedeemCode } = await import('@/entrypoints/amazon/amazonKeyRedeemer.ts');
        const result = extractRedeemCode();

        expect(result).toBeNull();
    });
});
