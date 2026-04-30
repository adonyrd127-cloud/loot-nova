/**
 * amazonKeyRedeemer.ts — External key extraction and redemption for Amazon Prime Gaming.
 *
 * Extracted from amazon.content.ts to improve maintainability.
 * Contains: extractRedeemCode, pollForRedeemCode, extractFromGogHref.
 */

import { wait } from '@/entrypoints/utils/helpers.ts';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RedeemInfo {
    code: string;
    redeemUrl: string;
    platform: string;
}

// ── Main exports ──────────────────────────────────────────────────────────────

/**
 * Polls the DOM after a claim button click, waiting for an external key
 * (GOG, Xbox, Steam) to appear on the page. Amazon takes several seconds
 * to render the key modal after the claim is processed.
 *
 * @param timeoutMs - Maximum time to wait (default 15 000 ms)
 */
export async function pollForRedeemCode(timeoutMs = 15_000): Promise<RedeemInfo | null> {
    const deadline = Date.now() + timeoutMs;
    const pollInterval = 800;

    while (Date.now() < deadline) {
        const result = extractRedeemCode();
        if (result) return result;
        await wait(pollInterval);
    }
    console.log('[LootNova/Amazon] No external key found after', timeoutMs, 'ms.');
    return null;
}

/**
 * Single snapshot check of the DOM for external redemption codes.
 * Called repeatedly by pollForRedeemCode().
 *
 * Strategy (in priority order):
 *  1. Find the "Código de canje" / "Redeem code" anchor → its href IS the GOG URL
 *  2. Find the "Tu código: XXX" element on the page
 *  3. Regex fallback on page text
 */
export function extractRedeemCode(): RedeemInfo | null {
    const bodyText = document.body?.textContent ?? '';
    const bodyHtml = document.body?.innerHTML ?? '';

    // ── Priority 1: Find the "Código de canje" / "Redeem code" anchor ──
    const redeemAnchors = Array.from(
        document.querySelectorAll<HTMLAnchorElement>('a[href]')
    );

    for (const a of redeemAnchors) {
        const href = a.href ?? '';
        const text = a.textContent?.toLowerCase() ?? '';

        // GOG: href looks like https://www.gog.com/redeem/QQPUAE5BADC73947AC
        if (href.includes('gog.com/redeem/')) {
            const code = href.split('/redeem/')[1]?.split('?')[0]?.split('#')[0] ?? '';
            if (code) {
                return {
                    code,
                    redeemUrl: `https://www.gog.com/redeem/${code}`,
                    platform: 'GOG',
                };
            }
        }

        // Steam: href contains registerkey?key=
        if (href.includes('steampowered.com/account/registerkey')) {
            const params = new URL(href).searchParams;
            const code = params.get('key') ?? '';
            if (code) return { code, redeemUrl: href, platform: 'Steam' };
        }

        // Xbox: href contains redeemtoken
        if (href.includes('xbox.com/redeemtoken') || href.includes('microsoft.com/redeem')) {
            return { code: '', redeemUrl: href, platform: 'Xbox' };
        }

        // Generic redeem/canje link text
        if (
            text.includes('canje') || text.includes('redeem code') ||
            text.includes('código') || text.includes('canjer')
        ) {
            if (href.includes('gog.com'))   return extractFromGogHref(href);
            if (href.includes('xbox.com'))  return { code: '', redeemUrl: href, platform: 'Xbox' };
            if (href.includes('steam'))     return { code: '', redeemUrl: href, platform: 'Steam' };
        }
    }

    // ── Priority 2: "Tu código: XXX" text element ──
    const codeTextMatch = bodyText.match(
        /(?:tu\s+c[oó]digo|your\s+code|c[oó]digo)[:\s]+([A-Z0-9]{10,30}(?:-[A-Z0-9]{4,5})*)/i
    );
    if (codeTextMatch) {
        const code = codeTextMatch[1].trim();
        const isGOG   = bodyHtml.includes('gog.com');
        const isXbox  = bodyHtml.includes('xbox.com');
        const isSteam = bodyHtml.includes('steampowered.com');
        if (isGOG)   return { code, redeemUrl: `https://www.gog.com/redeem/${code}`,   platform: 'GOG'   };
        if (isXbox)  return { code, redeemUrl: `https://www.xbox.com/redeemtoken?token=${code}`, platform: 'Xbox'  };
        if (isSteam) return { code, redeemUrl: `https://store.steampowered.com/account/registerkey?key=${code}`, platform: 'Steam' };
    }

    // ── Priority 3: Regex fallback ──
    const isGOG   = bodyHtml.includes('gog.com');
    const isXbox  = bodyHtml.includes('xbox.com');
    const isSteam = bodyHtml.includes('steampowered.com');
    if (!isGOG && !isXbox && !isSteam) return null;

    const codeSelectors = [
        '[data-a-target="key-code"]',
        '[data-a-target*="code"]',
        '[class*="KeyCode" i]',
        '[class*="key-code" i]',
        '[class*="redemptionCode" i]',
        '[class*="game-code" i]',
        '[class*="code-value" i]',
        '[class*="ClaimCode" i]',
        'code',
    ];
    let code = '';
    for (const sel of codeSelectors) {
        const txt = document.querySelector(sel)?.textContent?.trim() ?? '';
        if (txt && /[A-Z0-9]{6}/.test(txt)) { code = txt; break; }
    }
    if (!code) {
        const m = bodyText.match(/\b([A-Z0-9]{4,5}(?:-[A-Z0-9]{4,5}){3,5})\b/) ||
                  bodyText.match(/\b([A-Z][A-Z0-9]{15,25})\b/);
        code = m?.[1] ?? '';
    }
    if (!code) return null;

    if (isGOG)   return { code, redeemUrl: `https://www.gog.com/redeem/${code}`,   platform: 'GOG'   };
    if (isXbox)  return { code, redeemUrl: `https://www.xbox.com/redeemtoken?token=${code}`, platform: 'Xbox'  };
    if (isSteam) return { code, redeemUrl: `https://store.steampowered.com/account/registerkey?key=${code}`, platform: 'Steam' };
    return null;
}

function extractFromGogHref(href: string): RedeemInfo | null {
    const code = href.split('/redeem/')[1]?.split('?')[0]?.split('#')[0] ?? '';
    if (!code) return null;
    return { code, redeemUrl: `https://www.gog.com/redeem/${code}`, platform: 'GOG' };
}
