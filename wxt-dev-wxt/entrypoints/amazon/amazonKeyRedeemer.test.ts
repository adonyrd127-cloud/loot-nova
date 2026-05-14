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

    // Priority 1: Generic text links
    it('extracts GOG from generic redeem text', async () => {
        document.body.innerHTML = `<a href="https://www.gog.com/redeem/ABCDEF">Canjear aquí</a>`;
        const { extractRedeemCode } = await import('@/entrypoints/amazon/amazonKeyRedeemer.ts');
        const result = extractRedeemCode();
        expect(result).not.toBeNull();
        expect(result!.platform).toBe('GOG');
        expect(result!.code).toBe('ABCDEF');
    });

    it('extracts Xbox from generic redeem text', async () => {
        document.body.innerHTML = `<a href="https://www.xbox.com/redeemtoken?token=XYZ">redeem code</a>`;
        const { extractRedeemCode } = await import('@/entrypoints/amazon/amazonKeyRedeemer.ts');
        const result = extractRedeemCode();
        expect(result).not.toBeNull();
        expect(result!.platform).toBe('Xbox');
    });

    it('extracts Steam from generic redeem text', async () => {
        document.body.innerHTML = `<a href="https://store.steampowered.com/account/registerkey?key=XYZ">código</a>`;
        const { extractRedeemCode } = await import('@/entrypoints/amazon/amazonKeyRedeemer.ts');
        const result = extractRedeemCode();
        expect(result).not.toBeNull();
        expect(result!.platform).toBe('Steam');
    });

    // Priority 2: "Tu código: XXX" text element
    it('extracts GOG from tu código text element', async () => {
        document.body.innerHTML = `
            <div>gog.com</div>
            <div>Tu código: ABCDEFGHIJ1234567890</div>
        `;
        const { extractRedeemCode } = await import('@/entrypoints/amazon/amazonKeyRedeemer.ts');
        const result = extractRedeemCode();
        expect(result).not.toBeNull();
        expect(result!.platform).toBe('GOG');
        expect(result!.code).toBe('ABCDEFGHIJ1234567890');
    });

    it('extracts Xbox from tu código text element', async () => {
        document.body.innerHTML = `
            <div>xbox.com</div>
            <div>Your code: ABCDEFGHIJ-KLMNO-PQRST-UVWXY</div>
        `;
        const { extractRedeemCode } = await import('@/entrypoints/amazon/amazonKeyRedeemer.ts');
        const result = extractRedeemCode();
        expect(result).not.toBeNull();
        expect(result!.platform).toBe('Xbox');
        expect(result!.code).toBe('ABCDEFGHIJ-KLMNO-PQRST-UVWXY');
    });

    it('extracts Steam from tu código text element', async () => {
        document.body.innerHTML = `
            <div>steampowered.com</div>
            <div>código: ABCDEFGHIJ-KLMNO</div>
        `;
        const { extractRedeemCode } = await import('@/entrypoints/amazon/amazonKeyRedeemer.ts');
        const result = extractRedeemCode();
        expect(result).not.toBeNull();
        expect(result!.platform).toBe('Steam');
        expect(result!.code).toBe('ABCDEFGHIJ-KLMNO');
    });

    // Priority 3: Fallbacks
    it('extracts code using CSS selector fallback (GOG)', async () => {
        document.body.innerHTML = `
            <div>gog.com</div>
            <div data-a-target="key-code">XYZ123ABC</div>
        `;
        const { extractRedeemCode } = await import('@/entrypoints/amazon/amazonKeyRedeemer.ts');
        const result = extractRedeemCode();
        expect(result).not.toBeNull();
        expect(result!.platform).toBe('GOG');
        expect(result!.code).toBe('XYZ123ABC');
    });

    it('extracts code using regex fallback (Xbox)', async () => {
        document.body.innerHTML = `
            <div>xbox.com</div>
            <div>Here is your key ABCDE-FGHIJ-KLMNO-PQRST-UVWXY enjoy</div>
        `;
        const { extractRedeemCode } = await import('@/entrypoints/amazon/amazonKeyRedeemer.ts');
        const result = extractRedeemCode();
        expect(result).not.toBeNull();
        expect(result!.platform).toBe('Xbox');
        expect(result!.code).toBe('ABCDE-FGHIJ-KLMNO-PQRST-UVWXY');
    });

    it('extracts code using regex fallback (Steam)', async () => {
        document.body.innerHTML = `
            <div>steampowered.com</div>
            <div>Here is your key ABCDE-FGHIJ-KLMNO-PQRST enjoy</div>
        `;
        const { extractRedeemCode } = await import('@/entrypoints/amazon/amazonKeyRedeemer.ts');
        const result = extractRedeemCode();
        expect(result).not.toBeNull();
        expect(result!.platform).toBe('Steam');
        expect(result!.code).toBe('ABCDE-FGHIJ-KLMNO-PQRST');
    });

    it('returns null if priority 3 platform not matched', async () => {
        document.body.innerHTML = `
            <div>unknown.com</div>
            <div data-a-target="key-code">XYZ123ABC</div>
        `;
        const { extractRedeemCode } = await import('@/entrypoints/amazon/amazonKeyRedeemer.ts');
        const result = extractRedeemCode();
        expect(result).toBeNull();
    });

    it('returns empty code for Xbox from generic redeem text', async () => {
        document.body.innerHTML = `<a href="https://www.xbox.com/redeemtoken?token=XYZ">código</a>`;
        const { extractRedeemCode } = await import('@/entrypoints/amazon/amazonKeyRedeemer.ts');
        const result = extractRedeemCode();
        expect(result).not.toBeNull();
        expect(result!.platform).toBe('Xbox');
        expect(result!.code).toBe('');
    });

    it('returns empty code for Steam from generic redeem text', async () => {
        document.body.innerHTML = `<a href="https://store.steampowered.com/redeem">canjer</a>`;
        const { extractRedeemCode } = await import('@/entrypoints/amazon/amazonKeyRedeemer.ts');
        const result = extractRedeemCode();
        expect(result).not.toBeNull();
        expect(result!.platform).toBe('Steam');
        expect(result!.code).toBe('');
    });

    it('extracts Steam code from priority 3 15-25 chars regex fallback', async () => {
        document.body.innerHTML = `
            <div>steampowered.com</div>
            <div>Here is your key A1234567890123456 enjoy</div>
        `;
        const { extractRedeemCode } = await import('@/entrypoints/amazon/amazonKeyRedeemer.ts');
        const result = extractRedeemCode();
        expect(result).not.toBeNull();
        expect(result!.platform).toBe('Steam');
        expect(result!.code).toBe('A1234567890123456');
    });

    it('returns null if extractFromGogHref fails in priority 1', async () => {
        document.body.innerHTML = `<a href="https://www.gog.com/redeem/">código</a>`;
        const { extractRedeemCode } = await import('@/entrypoints/amazon/amazonKeyRedeemer.ts');
        const result = extractRedeemCode();
        expect(result).toBeNull();
    });

    it('returns empty code if priority 3 regex matches but platform doesnt match GOG/Xbox/Steam', async () => {
        document.body.innerHTML = `
            <div>
                <a href="https://other.com/redeem">Redeem here</a>
                <p>Tu código: ABCDEFGHIJ-KLMNO-PQRST-UVWXY</p>
            </div>
        `;
        const { extractRedeemCode } = await import('@/entrypoints/amazon/amazonKeyRedeemer.ts');
        const result = extractRedeemCode();
        expect(result).toBeNull();
    });

    it('returns null if regex matches but platform doesnt match GOG/Xbox/Steam in priority 2', async () => {
        document.body.innerHTML = `
            <div>
                <p>Tu código: ABCDEFGHIJ-KLMNO-PQRST-UVWXY</p>
            </div>
        `;
        const { extractRedeemCode } = await import('@/entrypoints/amazon/amazonKeyRedeemer.ts');
        const result = extractRedeemCode();
        expect(result).toBeNull();
    });

    it('returns null if body text regex fallback has no match in priority 3', async () => {
        document.body.innerHTML = `
            <div>steampowered.com</div>
            <div>Some random text without key format</div>
        `;
        const { extractRedeemCode } = await import('@/entrypoints/amazon/amazonKeyRedeemer.ts');
        const result = extractRedeemCode();
        expect(result).toBeNull();
    });

    it('returns empty string if GOG url splits in extractFromGogHref produces no code', async () => {
        document.body.innerHTML = `<a href="https://www.gog.com/redeem/">código</a>`;
        const { extractRedeemCode } = await import('@/entrypoints/amazon/amazonKeyRedeemer.ts');
        const result = extractRedeemCode();
        expect(result).toBeNull(); // extractFromGogHref returns null if no code
    });

    it('extracts GOG code with params in extractFromGogHref', async () => {
        document.body.innerHTML = `<a href="https://www.gog.com/redeem/QQPUAE5B?param=1#hash">código</a>`;
        const { extractRedeemCode } = await import('@/entrypoints/amazon/amazonKeyRedeemer.ts');
        const result = extractRedeemCode();
        expect(result).not.toBeNull();
        expect(result!.platform).toBe('GOG');
        expect(result!.code).toBe('QQPUAE5B');
    });

    it('extracts code using generic code selector fallback (Steam)', async () => {
        document.body.innerHTML = `
            <div>steampowered.com</div>
            <code class="redemptionCode">ABCDEF-GHIJKL-MNOPQR</code>
        `;
        const { extractRedeemCode } = await import('@/entrypoints/amazon/amazonKeyRedeemer.ts');
        const result = extractRedeemCode();
        expect(result).not.toBeNull();
        expect(result!.platform).toBe('Steam');
        expect(result!.code).toBe('ABCDEF-GHIJKL-MNOPQR');
    });

    it('ignores code selector if text fails length check', async () => {
        document.body.innerHTML = `
            <div>steampowered.com</div>
            <code class="redemptionCode">ABC</code>
        `;
        const { extractRedeemCode } = await import('@/entrypoints/amazon/amazonKeyRedeemer.ts');
        const result = extractRedeemCode();
        expect(result).toBeNull();
    });

});





describe('pollForRedeemCode', () => {
    let mockDateNow: any;
    let waitMock: any;

    beforeEach(async () => {
        document.body.innerHTML = '';

        // Redefine wait to yield and let us control time
        const helpers = await import('@/entrypoints/utils/helpers.ts');

        let currentTime = 0;
        mockDateNow = vi.spyOn(Date, 'now').mockImplementation(() => currentTime);

        // Create a custom wait that just advances time!
        waitMock = vi.mocked(helpers.wait).mockImplementation((ms) => {
            currentTime += ms;
            return Promise.resolve();
        });
    });

    afterEach(() => {
        mockDateNow.mockRestore();
        waitMock.mockRestore();
    });

    it('returns result immediately if found on first try', async () => {
        document.body.innerHTML = `<a href="https://www.gog.com/redeem/QQPUAE5BADC73947AC">Código de canje</a>`;
        const { pollForRedeemCode } = await import('@/entrypoints/amazon/amazonKeyRedeemer.ts');
        const result = await pollForRedeemCode(1000);
        expect(result).not.toBeNull();
        expect(result!.platform).toBe('GOG');
    });

    it('returns null if timeout reached without finding code', async () => {
        const { pollForRedeemCode } = await import('@/entrypoints/amazon/amazonKeyRedeemer.ts');
        const result = await pollForRedeemCode(2000);
        expect(result).toBeNull();
    });

    it('waits and retries if not found immediately', async () => {
        const { pollForRedeemCode } = await import('@/entrypoints/amazon/amazonKeyRedeemer.ts');

        // Mock Date.now to control loop
        let currentTime = 0;
        mockDateNow.mockImplementation(() => currentTime);

        const helpers = await import('@/entrypoints/utils/helpers.ts');
        waitMock = vi.mocked(helpers.wait).mockImplementation((ms) => {
            currentTime += ms;
            if (currentTime >= 800) {
                // Add element after 800ms
                document.body.innerHTML = `<a href="https://store.steampowered.com/account/registerkey?key=ABCDE-FGHIJ-KLMNO">Redeem on Steam</a>`;
            }
            return Promise.resolve();
        });

        const result = await pollForRedeemCode(2000);
        expect(result).not.toBeNull();
        expect(result!.platform).toBe('Steam');
    });
});
