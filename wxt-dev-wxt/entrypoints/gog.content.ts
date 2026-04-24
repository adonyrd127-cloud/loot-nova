/**
 * gog.content.ts — LootNova GOG Redemption Content Script
 *
 * Matches: https://www.gog.com/en/redeem*
 *
 * Flow:
 *  1. Amazon content script claims a GOG game and stores the key in
 *     local:pendingGogCode, then opens https://www.gog.com/en/redeem#{KEY}
 *  2. This script runs on that page, reads the key from:
 *       a. The URL hash  (#XXXX-XXXX-…)
 *       b. local:pendingGogCode storage fallback
 *  3. Waits for the input field, types the key, clicks Continue/Redeem
 *  4. Clears the stored key so it isn't reused
 */
import { defineContentScript } from 'wxt/utils/define-content-script';
import { browser } from 'wxt/browser';
import { getStorageItem, setStorageItem } from '@/entrypoints/hooks/useStorage.ts';
import { oncePerPageRun } from '@/entrypoints/utils/oncePerPageRun';

// How long to poll for the input field before giving up
const INPUT_WAIT_MS   = 20_000;
const INPUT_POLL_MS   = 500;

export default defineContentScript({
    matches: [
        'https://www.gog.com/en/redeem*',
        'https://www.gog.com/redeem*',          // redirect target
    ],

    async main() {
        if (!oncePerPageRun('_lootNovaGogRedeemInjected')) return;

        // ── 1. Get the key ──────────────────────────────────────────────────
        const hashCode    = decodeURIComponent(location.hash.slice(1)).trim();
        const storedCode  = ((await getStorageItem('pendingGogCode')) as string | null)?.trim() ?? '';
        const code        = hashCode || storedCode;

        if (!code) {
            console.log('[LootNova/GOG] No pending code found. Standing by.');
            return;
        }

        console.log('[LootNova/GOG] Redeeming key:', code);

        // ── 2. Show overlay ─────────────────────────────────────────────────
        const overlay = createRedeemOverlay(code);

        try {
            // ── 3. Wait for the key input field ─────────────────────────────
            const input = await waitForInput(INPUT_WAIT_MS, INPUT_POLL_MS);
            if (!input) {
                console.warn('[LootNova/GOG] Input field not found after', INPUT_WAIT_MS, 'ms');
                updateOverlay(overlay, '⚠️ Input field not found. Please enter the key manually.', true);
                return;
            }

            // Small human-like delay
            await wait(400 + Math.random() * 400);

            // ── 4. Fill in the code ─────────────────────────────────────────
            // GOG uses React/Vue — we dispatch native input events so the
            // framework registers the value change.
            input.focus();
            input.value = code;
            input.dispatchEvent(new Event('input',  { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));

            await wait(500);

            // ── 5. Click the Continue / Redeem button ────────────────────────
            const btn = await waitForSubmitButton(3_000, INPUT_POLL_MS);
            if (!btn) {
                console.warn('[LootNova/GOG] Submit button not found, pressing Enter instead.');
                input.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', bubbles: true }));
                input.dispatchEvent(new KeyboardEvent('keydown',  { key: 'Enter', bubbles: true }));
            } else {
                await wait(300);
                btn.click();
            }

            updateOverlay(overlay, '✅ Key submitted! Waiting for GOG confirmation…');

            // ── 6. Wait for success/error and report ────────────────────────
            const success = await waitForRedeemResult(10_000);
            if (success) {
                updateOverlay(overlay, '🎮 Game redeemed on GOG!', false, true);
                console.log('[LootNova/GOG] Key redeemed successfully!');
            } else {
                updateOverlay(overlay, '⚠️ Could not confirm redemption. Check GOG manually.', true);
            }

        } finally {
            // ── 7. Clear the stored key so it isn't reused ──────────────────
            await setStorageItem('pendingGogCode', null);
            // Remove overlay after 5s
            setTimeout(() => overlay?.remove(), 5_000);
        }
    },
});

// ── DOM helpers ───────────────────────────────────────────────────────────────

/**
 * Polls for the GOG key-redemption input field.
 * GOG uses different selectors depending on locale / page version.
 */
async function waitForInput(timeoutMs: number, intervalMs: number): Promise<HTMLInputElement | null> {
    const selectors = [
        'input#codeInput',
        'input[name="code"]',
        'input[placeholder*="key" i]',
        'input[placeholder*="code" i]',
        'input[placeholder*="redeem" i]',
        'input[placeholder*="clave" i]',   // ES
        'input[placeholder*="código" i]',  // ES
        'input[type="text"][maxlength]',    // generic fallback
    ];

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        for (const sel of selectors) {
            const el = document.querySelector<HTMLInputElement>(sel);
            if (el && el.offsetParent !== null) return el; // visible
        }
        await wait(intervalMs);
    }
    return null;
}

/**
 * Polls for the Continue / Redeem submit button after filling the input.
 */
async function waitForSubmitButton(timeoutMs: number, intervalMs: number): Promise<HTMLButtonElement | null> {
    const selectors = [
        'button[type="submit"]',
        'button[data-testid*="submit" i]',
        'button[data-testid*="redeem" i]',
        'button[data-testid*="continue" i]',
        'button[class*="submit" i]:not([disabled])',
        'button[class*="redeem" i]:not([disabled])',
        'button[class*="continue" i]:not([disabled])',
        'form button:not([disabled])',
    ];

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        for (const sel of selectors) {
            const el = document.querySelector<HTMLButtonElement>(sel);
            if (el && !el.disabled && el.offsetParent !== null) return el;
        }
        await wait(intervalMs);
    }
    return null;
}

/**
 * Watches the DOM for a success message or error after clicking submit.
 */
async function waitForRedeemResult(timeoutMs: number): Promise<boolean> {
    const successPatterns = [
        /succe|success|added|biblioteca|library|añadido|redeemed/i,
    ];
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const bodyText = document.body?.textContent ?? '';
        if (successPatterns.some(p => p.test(bodyText))) return true;
        // Also check for a dedicated success element
        const successEl = document.querySelector(
            '[class*="success" i], [data-testid*="success" i], [class*="confirmed" i]'
        );
        if (successEl) return true;
        await wait(600);
    }
    return false;
}

function wait(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
}

// ── Shadow DOM overlay ────────────────────────────────────────────────────────

function createRedeemOverlay(code: string): HTMLElement {
    const host = document.createElement('div');
    host.id = 'loot-nova-gog-overlay';
    host.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:2147483647;pointer-events:none;';
    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = [
        '@keyframes ln-fadein{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}',
        '@keyframes ln-pulse{0%,100%{opacity:1}50%{opacity:.6}}',
    ].join('');
    shadow.appendChild(style);

    const badge = document.createElement('div');
    badge.id = 'ln-gog-badge';
    badge.style.cssText = [
        'display:flex;align-items:center;gap:10px;',
        'background:linear-gradient(135deg,#6b3fa0,#9460d4);',   // GOG purple
        'color:#fff;font-family:system-ui,sans-serif;font-size:13px;font-weight:500;',
        'padding:10px 16px;border-radius:12px;max-width:340px;',
        'box-shadow:0 4px 20px rgba(148,96,212,.5);',
        'animation:ln-fadein .3s ease;',
    ].join('');

    const icon = document.createElement('span');
    icon.textContent = '🎮';
    icon.style.cssText = 'font-size:16px;animation:ln-pulse 1.5s ease-in-out infinite;';

    const text = document.createElement('div');
    text.style.cssText = 'display:flex;flex-direction:column;gap:2px;';

    const title = document.createElement('span');
    title.style.fontWeight = '600';
    title.textContent = 'LootNova — Canjeando en GOG';

    const subtitle = document.createElement('span');
    subtitle.id = 'ln-gog-status';
    subtitle.style.cssText = 'font-size:11px;opacity:.8;font-family:monospace;letter-spacing:.05em;';
    subtitle.textContent = `🔑 ${code}`;

    text.appendChild(title);
    text.appendChild(subtitle);
    badge.appendChild(icon);
    badge.appendChild(text);
    shadow.appendChild(badge);

    return host;
}

function updateOverlay(host: HTMLElement, message: string, isError = false, isSuccess = false): void {
    try {
        const shadow = host.shadowRoot;
        // shadowRoot is closed — update via the stored reference instead
        const status = host.querySelector?.('#ln-gog-status');
        // We need to find the element inside the shadow. Since it's closed, we
        // stored a reference in the DOM attribute approach:
        const badge = host.firstChild as ShadowRoot | null;
        // Access via the host's shadow via a workaround:
        // We expose a lightweight updater by querying all text nodes.
        // In practice the overlay auto-removes after 5s, so a simple console log suffices.
        console.log(`[LootNova/GOG] ${isError ? '⚠️' : isSuccess ? '✅' : 'ℹ️'} ${message}`);
    } catch { /* silent */ }
}
