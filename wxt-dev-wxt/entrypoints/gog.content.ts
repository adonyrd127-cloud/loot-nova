/**
 * gog.content.ts — LootNova GOG Redemption Content Script
 *
 * Matches: https://www.gog.com/redeem/*
 *
 * Real GOG URL format (confirmed from screenshots):
 *   https://www.gog.com/redeem/QQPUAE5BADC73947AC
 *
 * When that URL is opened, GOG PRE-FILLS the code in the input automatically.
 * This script just has to:
 *   1. Wait for the input to be populated
 *   2. Click the green "Continue" button
 *   3. Show a visual overlay so the user knows what's happening
 *
 * reCAPTCHA note: GOG uses reCAPTCHA. If it blocks the click, the tab stays
 * open so the user can click Continue manually with the code already filled.
 */
import { defineContentScript } from 'wxt/utils/define-content-script';

const CONTENT_WAIT_MS = 20_000;
const POLL_MS         = 600;

export default defineContentScript({
    matches: [
        'https://www.gog.com/redeem/*',
        'https://www.gog.com/en/redeem/*',
    ],

    async main() {
        // Prevent double-run on SPA navigation
        if ((window as any).__lootNovaGogRan) return;
        (window as any).__lootNovaGogRan = true;

        // Extract code from URL path: /redeem/QQPUAE5BADC73947AC
        const pathParts = location.pathname.split('/redeem/');
        const codeFromUrl = decodeURIComponent(pathParts[1] ?? '').split('?')[0].trim();

        if (!codeFromUrl) {
            // Page was opened without a code in the path — nothing to do
            console.log('[LootNova/GOG] No code in URL path, standing by.');
            return;
        }

        console.log('[LootNova/GOG] Auto-redeem for code:', codeFromUrl);

        // Show overlay
        const overlay = createOverlay(codeFromUrl);

        try {
            // ── Step 1: Wait for input to be populated ──────────────────────
            // GOG fills the input from the URL automatically.
            // We wait for it to appear and have a value.
            const input = await waitForFilledInput(codeFromUrl, CONTENT_WAIT_MS, POLL_MS);

            if (!input) {
                console.warn('[LootNova/GOG] Input not populated after', CONTENT_WAIT_MS, 'ms');
                updateOverlay(overlay,
                    `⚠️ No se encontró el campo. Clave: ${codeFromUrl}`, true);
                // Keep the tab open so the user can act
                return;
            }

            await wait(600);

            // ── Step 2: Click Continue ──────────────────────────────────────
            const btn = await waitForContinueButton(5_000, POLL_MS);
            if (!btn) {
                console.warn('[LootNova/GOG] Continue button not found.');
                updateOverlay(overlay,
                    `⚠️ Botón no encontrado. Haz click en Continue. Clave: ${codeFromUrl}`, true);
                return;
            }

            updateOverlay(overlay, '🖱️ Haciendo click en Continue…');
            await wait(400);
            btn.click();

            // ── Step 3: Wait for result ─────────────────────────────────────
            updateOverlay(overlay, '⏳ Esperando confirmación de GOG…');
            const success = await waitForSuccess(12_000);

            if (success) {
                updateOverlay(overlay, '✅ ¡Juego añadido a tu biblioteca de GOG!', false, true);
                console.log('[LootNova/GOG] Redemption confirmed!');
                // Close the tab after 4s
                setTimeout(() => window.close(), 4_000);
            } else {
                // Could be reCAPTCHA or an already-used code — keep tab open
                updateOverlay(overlay,
                    `ℹ️ Verifica el resultado. Si hay CAPTCHA, complétalo tú. Clave: ${codeFromUrl}`, true);
                console.log('[LootNova/GOG] Could not confirm success automatically.');
            }

        } catch (err) {
            console.error('[LootNova/GOG] Unexpected error:', err);
            updateOverlay(overlay, `⚠️ Error inesperado. Clave: ${codeFromUrl}`, true);
        }
    },
});

// ── DOM helpers ───────────────────────────────────────────────────────────────

/**
 * Waits for the code input to appear on the page AND be populated with the
 * expected code value (GOG fills it from the URL path automatically).
 */
async function waitForFilledInput(
    expectedCode: string,
    timeoutMs: number,
    intervalMs: number
): Promise<HTMLInputElement | null> {
    const selectors = [
        'input[name="code"]',
        'input#codeInput',
        'input[class*="redeem" i]',
        'input[placeholder*="code" i]',
        'input[placeholder*="key" i]',
        'input[type="text"][maxlength]',
        'input[type="text"]',
    ];

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        for (const sel of selectors) {
            const el = document.querySelector<HTMLInputElement>(sel);
            if (el && el.offsetParent !== null) {
                // Accept if it already has the expected value OR any non-empty value
                if (el.value && el.value.toUpperCase().includes(expectedCode.toUpperCase().slice(0, 6))) {
                    return el;
                }
                // Also accept if GOG filled it differently (some normalisation)
                if (el.value.trim().length > 5) return el;
            }
        }
        await wait(intervalMs);
    }
    return null;
}

/**
 * Waits for the "Continue" / "Redeem" submit button.
 */
async function waitForContinueButton(timeoutMs: number, intervalMs: number): Promise<HTMLButtonElement | null> {
    const selectors = [
        'button[type="submit"]:not([disabled])',
        'button[class*="submit" i]:not([disabled])',
        'button[class*="redeem" i]:not([disabled])',
        'button[class*="continue" i]:not([disabled])',
        'button[class*="btn" i]:not([disabled])',
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
 * Waits for a success message or page change indicating the code was redeemed.
 */
async function waitForSuccess(timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    const originalPath = location.pathname;

    while (Date.now() < deadline) {
        const body = document.body?.textContent ?? '';
        // Success indicators (EN + ES + GOG-specific)
        if (/added to|library|biblioteca|redeemed|canjeado|thank|gracias|success/i.test(body)) return true;
        // URL change can indicate success (GOG may navigate after redeem)
        if (location.pathname !== originalPath) return true;
        // Success element
        if (document.querySelector('[class*="success" i], [class*="confirmed" i], [class*="thank" i]')) return true;
        await wait(500);
    }
    return false;
}

function wait(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
}

// ── Shadow DOM overlay ────────────────────────────────────────────────────────

function createOverlay(code: string): HTMLElement {
    const host = document.createElement('div');
    host.id = 'loot-nova-gog-overlay';
    host.style.cssText = [
        'position:fixed;bottom:24px;right:24px;',
        'z-index:2147483647;pointer-events:none;',
        'font-family:system-ui,sans-serif;',
    ].join('');
    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: 'open' }); // open so we can update it

    const style = document.createElement('style');
    style.textContent = [
        '@keyframes ln-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}',
        '@keyframes ln-pulse{0%,100%{opacity:1}50%{opacity:.55}}',
    ].join('');
    shadow.appendChild(style);

    const badge = document.createElement('div');
    badge.id = 'badge';
    badge.style.cssText = [
        'display:flex;align-items:flex-start;gap:10px;',
        'background:linear-gradient(135deg,#4b206b,#7c3aed);',
        'color:#fff;font-size:13px;font-weight:500;',
        'padding:12px 16px;border-radius:12px;max-width:320px;',
        'box-shadow:0 4px 24px rgba(124,58,237,.55);',
        'animation:ln-in .3s ease;',
    ].join('');

    const icon = document.createElement('span');
    icon.textContent = '🎮';
    icon.style.cssText = 'font-size:18px;margin-top:1px;flex-shrink:0;animation:ln-pulse 1.5s ease-in-out infinite;';

    const textWrap = document.createElement('div');
    textWrap.style.cssText = 'display:flex;flex-direction:column;gap:4px;min-width:0;';

    const title = document.createElement('span');
    title.style.cssText = 'font-weight:700;font-size:13px;';
    title.textContent = 'LootNova — Canjeando en GOG';

    const codeEl = document.createElement('span');
    codeEl.style.cssText = 'font-family:monospace;font-size:11px;opacity:.8;letter-spacing:.06em;word-break:break-all;';
    codeEl.textContent = `🔑 ${code}`;

    const statusEl = document.createElement('span');
    statusEl.id = 'status';
    statusEl.style.cssText = 'font-size:12px;opacity:.9;margin-top:2px;';
    statusEl.textContent = '⏳ Esperando campo de entrada…';

    textWrap.appendChild(title);
    textWrap.appendChild(codeEl);
    textWrap.appendChild(statusEl);
    badge.appendChild(icon);
    badge.appendChild(textWrap);
    shadow.appendChild(badge);

    return host;
}

function updateOverlay(host: HTMLElement, message: string, isError = false, isSuccess = false): void {
    try {
        const shadow = host.shadowRoot;
        if (!shadow) return;
        const statusEl = shadow.getElementById('status');
        const badge    = shadow.getElementById('badge');
        if (statusEl) statusEl.textContent = message;
        if (badge) {
            if (isError)   badge.style.background = 'linear-gradient(135deg,#7f1d1d,#ef4444)';
            if (isSuccess) badge.style.background = 'linear-gradient(135deg,#064e3b,#10b981)';
        }
    } catch { /* silent */ }
}
