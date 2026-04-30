/**
 * gog.content.ts — LootNova GOG Redemption Content Script
 *
 * Matches: https://www.gog.com/redeem/*
 *
 * Real GOG URL format (confirmed from screenshots):
 *   https://www.gog.com/redeem/PHGD10938832B2FE07
 *
 * GOG redemption flow (2 steps):
 *   Step 1: Code is pre-filled from the URL → click "Continue"
 *   Step 2: GOG shows game info + checkbox → tick checkbox → click "Redeem"
 *
 * reCAPTCHA note: GOG uses reCAPTCHA. If it blocks the click, the tab stays
 * open so the user can complete it manually with the code already filled.
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

        // Extract code from URL path: /redeem/PHGD10938832B2FE07
        const pathParts = location.pathname.split('/redeem/');
        const codeFromUrl = decodeURIComponent(pathParts[1] ?? '').split('?')[0].trim();

        if (!codeFromUrl) {
            console.log('[LootNova/GOG] No code in URL path, standing by.');
            return;
        }

        console.log('[LootNova/GOG] Auto-redeem for code:', codeFromUrl);

        // Show overlay
        const overlay = createOverlay(codeFromUrl);

        try {
            // ── Step 1: Wait for input to be populated ──────────────────────
            const input = await waitForFilledInput(codeFromUrl, CONTENT_WAIT_MS, POLL_MS);

            if (!input) {
                // GOG might skip step 1 if the code is in the URL — check if we're
                // already on the confirmation page (step 2)
                const alreadyOnConfirmation = await isOnConfirmationPage();
                if (alreadyOnConfirmation) {
                    console.log('[LootNova/GOG] Skipped input step — already on confirmation page.');
                    await handleConfirmationStep(overlay, codeFromUrl);
                    return;
                }
                console.warn('[LootNova/GOG] Input not populated after', CONTENT_WAIT_MS, 'ms');
                updateOverlay(overlay,
                    `⚠️ No se encontró el campo. Clave: ${codeFromUrl}`, true);
                return;
            }

            await wait(600);

            // ── Step 2: Click Continue ──────────────────────────────────────
            const continueBtn = await waitForButton(
                ['Continue', 'Continuar', 'Check', 'Verify'],
                5_000, POLL_MS
            );
            if (!continueBtn) {
                console.warn('[LootNova/GOG] Continue button not found.');
                updateOverlay(overlay,
                    `⚠️ Botón no encontrado. Haz click en Continue. Clave: ${codeFromUrl}`, true);
                return;
            }

            updateOverlay(overlay, '🖱️ Haciendo click en Continue…');
            await wait(400);
            continueBtn.click();

            // ── Step 3: Handle the confirmation page ────────────────────────
            // Wait for the confirmation page to render (GOG validates the code server-side)
            await wait(3000);
            await handleConfirmationStep(overlay, codeFromUrl);

        } catch (err) {
            console.error('[LootNova/GOG] Unexpected error:', err);
            updateOverlay(overlay, `⚠️ Error inesperado. Clave: ${codeFromUrl}`, true);
        }
    },
});

// ── Confirmation step (Step 2) ────────────────────────────────────────────────

/**
 * Handles the GOG confirmation page that appears after Continue/code validation:
 *   - Shows game name + image
 *   - Has a checkbox (terms/agreement)
 *   - Has "Cancel" and "Redeem" buttons
 */
async function handleConfirmationStep(overlay: HTMLElement, code: string): Promise<void> {
    updateOverlay(overlay, '⏳ Esperando página de confirmación…');

    // Wait for the Redeem button or confirmation page to appear
    const redeemBtn = await waitForRedeemButton(12_000, POLL_MS);

    if (!redeemBtn) {
        // Maybe the code was invalid or already used
        const bodyText = document.body?.textContent ?? '';
        if (/already.*redeemed|ya.*canjeado|invalid|no.*valid|expired|expirado/i.test(bodyText)) {
            updateOverlay(overlay, `⚠️ Código inválido o ya canjeado: ${code}`, true);
        } else {
            updateOverlay(overlay,
                `⚠️ No se encontró el botón Redeem. Complétalo manualmente. Clave: ${code}`, true);
        }
        console.warn('[LootNova/GOG] Redeem button not found on confirmation page.');
        return;
    }

    // ── Tick the checkbox (if present) ────────────────────────────────────
    updateOverlay(overlay, '☑️ Marcando casilla de confirmación…');
    await tickCheckbox();
    await wait(500);

    // ── Click Redeem ─────────────────────────────────────────────────────
    updateOverlay(overlay, '🖱️ Haciendo click en Redeem…');
    await wait(300);
    redeemBtn.click();

    // ── Wait for final result ────────────────────────────────────────────
    updateOverlay(overlay, '⏳ Esperando confirmación final de GOG…');
    const success = await waitForFinalSuccess(15_000);

    if (success) {
        updateOverlay(overlay, '✅ ¡Juego añadido a tu biblioteca de GOG!', false, true);
        console.log('[LootNova/GOG] Redemption confirmed!');
        setTimeout(() => window.close(), 4_000);
    } else {
        updateOverlay(overlay,
            `ℹ️ Verifica el resultado. Si hay CAPTCHA, complétalo. Clave: ${code}`, true);
        console.log('[LootNova/GOG] Could not confirm success automatically.');
    }
}

// ── DOM helpers ───────────────────────────────────────────────────────────────

/**
 * Checks if we're already on the confirmation page (step 2)
 * by looking for the Redeem button or game info display.
 */
async function isOnConfirmationPage(): Promise<boolean> {
    const buttons = Array.from(document.querySelectorAll('button'));
    return buttons.some(b => {
        const text = b.textContent?.trim().toLowerCase() ?? '';
        return text === 'redeem' || text === 'canjear';
    });
}

/**
 * Waits for the code input to appear on the page AND be populated.
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
                if (el.value && el.value.toUpperCase().includes(expectedCode.toUpperCase().slice(0, 6))) {
                    return el;
                }
                if (el.value.trim().length > 5) return el;
            }
        }
        await wait(intervalMs);
    }
    return null;
}

/**
 * Waits for a button by text content (e.g., "Continue", "Continuar").
 */
async function waitForButton(
    labels: string[],
    timeoutMs: number,
    intervalMs: number
): Promise<HTMLButtonElement | null> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const allBtns = Array.from(document.querySelectorAll<HTMLButtonElement>(
            'button:not([disabled]), input[type="submit"]:not([disabled])'
        ));
        for (const btn of allBtns) {
            const text = btn.textContent?.trim().toLowerCase() ?? '';
            if (labels.some(l => text.includes(l.toLowerCase())) && btn.offsetParent !== null) {
                return btn;
            }
        }
        // Also try submit buttons
        const submitBtns = Array.from(document.querySelectorAll<HTMLButtonElement>(
            'button[type="submit"]:not([disabled])'
        ));
        if (submitBtns.length > 0 && submitBtns[0].offsetParent !== null) {
            return submitBtns[0];
        }
        await wait(intervalMs);
    }
    return null;
}

/**
 * Waits specifically for the green "Redeem" button on the confirmation page.
 */
async function waitForRedeemButton(timeoutMs: number, intervalMs: number): Promise<HTMLButtonElement | null> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        // Strategy 1: Find by text content
        const allBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('button'));
        for (const btn of allBtns) {
            const text = btn.textContent?.trim().toLowerCase() ?? '';
            if ((text === 'redeem' || text === 'canjear') && !btn.disabled && btn.offsetParent !== null) {
                return btn;
            }
        }

        // Strategy 2: Find by class/style (GOG uses green styled buttons)
        const greenBtns = document.querySelectorAll<HTMLButtonElement>(
            'button[class*="redeem" i], button[class*="primary" i], button[class*="green" i]'
        );
        for (const btn of Array.from(greenBtns)) {
            const text = btn.textContent?.trim().toLowerCase() ?? '';
            if (!btn.disabled && btn.offsetParent !== null && text !== 'cancel' && text !== 'cancelar') {
                return btn;
            }
        }

        // Strategy 3: Second button in a Cancel/Redeem pair
        const visibleBtns = allBtns.filter(b => b.offsetParent !== null && !b.disabled);
        if (visibleBtns.length === 2) {
            const second = visibleBtns[1];
            const text = second.textContent?.trim().toLowerCase() ?? '';
            if (text !== 'cancel' && text !== 'cancelar') return second;
        }

        await wait(intervalMs);
    }
    return null;
}

/**
 * Finds and ticks any checkbox on the confirmation page.
 * GOG requires agreeing to terms before the Redeem button works.
 */
async function tickCheckbox(): Promise<void> {
    // Strategy 1: Direct checkbox inputs
    const checkboxes = Array.from(document.querySelectorAll<HTMLInputElement>(
        'input[type="checkbox"]:not(:checked)'
    ));
    for (const cb of checkboxes) {
        cb.checked = true;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
        cb.dispatchEvent(new Event('input', { bubbles: true }));
        cb.click();
        console.log('[LootNova/GOG] Ticked checkbox:', cb.name || cb.id || cb.className);
    }

    // Strategy 2: Custom checkbox elements (span/div styled as checkbox)
    const customCheckboxes = Array.from(document.querySelectorAll(
        '[class*="checkbox" i]:not(.checked):not([class*="checked"]), ' +
        '[role="checkbox"][aria-checked="false"], ' +
        'label[class*="checkbox" i]'
    ));
    for (const el of customCheckboxes) {
        (el as HTMLElement).click();
        console.log('[LootNova/GOG] Clicked custom checkbox:', (el as HTMLElement).className);
        await wait(200);
    }

    // Strategy 3: Find by label text
    const labels = Array.from(document.querySelectorAll('label'));
    for (const label of labels) {
        const text = label.textContent?.toLowerCase() ?? '';
        if (/agree|accept|terms|i understand|entiendo|acepto|condicion/i.test(text)) {
            const input = label.querySelector<HTMLInputElement>('input[type="checkbox"]');
            if (input && !input.checked) {
                input.checked = true;
                input.dispatchEvent(new Event('change', { bubbles: true }));
                input.click();
                console.log('[LootNova/GOG] Ticked checkbox via label:', text.substring(0, 40));
            } else if (!input) {
                // Label IS the clickable element
                label.click();
                console.log('[LootNova/GOG] Clicked label as checkbox:', text.substring(0, 40));
            }
        }
    }
}

/**
 * Waits for FINAL success after clicking Redeem.
 * Distinguished from the confirmation page by checking for stronger success indicators.
 */
async function waitForFinalSuccess(timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    const originalUrl = location.href;

    while (Date.now() < deadline) {
        const body = document.body?.textContent ?? '';

        // Strong success indicators (these only appear AFTER successful redemption)
        if (/successfully\s+redeemed|canjeado\s+exitosamente|thank\s+you\s+for\s+redeem/i.test(body)) return true;
        if (/has\s+been\s+added|fue\s+añadido|se\s+ha\s+añadido/i.test(body)) return true;

        // Page changed to a success/thank-you page
        if (location.href !== originalUrl && /success|thank|gracias/i.test(location.href)) return true;

        // Success banner/element appeared
        const successEl = document.querySelector(
            '[class*="success-message" i], [class*="successMessage" i], ' +
            '[class*="thank-you" i], [class*="redeemed" i], ' +
            '.redemption-success, .code-redeemed'
        );
        if (successEl) return true;

        // The Redeem button disappeared (GOG removes it after success)
        const allBtns = Array.from(document.querySelectorAll('button'));
        const redeemGone = !allBtns.some(b => {
            const text = b.textContent?.trim().toLowerCase() ?? '';
            return text === 'redeem' || text === 'canjear';
        });
        const cancelGone = !allBtns.some(b => {
            const text = b.textContent?.trim().toLowerCase() ?? '';
            return text === 'cancel' || text === 'cancelar';
        });
        // Both buttons gone = page transitioned to success state
        if (redeemGone && cancelGone && allBtns.length > 0) return true;

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

    const shadow = host.attachShadow({ mode: 'open' });

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
