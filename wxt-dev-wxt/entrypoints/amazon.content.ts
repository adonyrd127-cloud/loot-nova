/**
 * amazon.content.ts — Amazon Prime Gaming / Luna content script.
 *
 * This is the orchestrator. Heavy logic is split into:
 *   - amazon/amazonScraper.ts     — DOM scraping, card detection, upcoming API
 *   - amazon/amazonClaimer.ts     — Claim button, hero image, link polling
 *   - amazon/amazonKeyRedeemer.ts — External key extraction (GOG/Steam/Xbox)
 */

import { browser } from 'wxt/browser';
import { oncePerPageRun } from '@/entrypoints/utils/oncePerPageRun';
import { MessageRequest } from '@/entrypoints/types/messageRequest.ts';
import { FreeGame } from '@/entrypoints/types/freeGame.ts';
import { FreeGamesResponse } from '@/entrypoints/types/freeGamesResponse.ts';
import { setStorageItem, getStorageItem } from '@/entrypoints/hooks/useStorage.ts';
import {
    wait,
    getRndInteger,
    waitForPageLoad,
    incrementCounter,
} from '@/entrypoints/utils/helpers.ts';
import { defineContentScript } from 'wxt/utils/define-content-script';

// ── Modules ───────────────────────────────────────────────────────────────────
import { scrapeAllGameCards, fetchUpcomingGames, detectLogin } from '@/entrypoints/amazon/amazonScraper.ts';
import { findClaimButton, extractHeroImage } from '@/entrypoints/amazon/amazonClaimer.ts';
import { extractRedeemCode, pollForRedeemCode } from '@/entrypoints/amazon/amazonKeyRedeemer.ts';

/** How long to wait for the SPA to hydrate on the game detail page */
const DETAIL_WAIT_MS = 5_000;

// ── Shadow DOM overlay ────────────────────────────────────────────────────────

function createClaimOverlay(gameTitle?: string): HTMLElement {
    const host = document.createElement('div');
    host.id = 'loot-nova-overlay-host';
    host.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:2147483647;pointer-events:none;';
    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = [
        '@keyframes ln-fadein{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}',
        '@keyframes ln-spin{to{transform:rotate(360deg)}}',
    ].join('');
    shadow.appendChild(style);

    const badge = document.createElement('div');
    badge.style.cssText = [
        'display:flex;align-items:center;gap:10px;',
        'background:linear-gradient(135deg,#b45309,#f59e0b);',
        'color:#fff;font-family:system-ui,sans-serif;font-size:13px;font-weight:500;',
        'padding:10px 16px;border-radius:12px;',
        'box-shadow:0 4px 20px rgba(245,158,11,.4);',
        'animation:ln-fadein .3s ease;',
    ].join('');

    const spinner = document.createElement('span');
    spinner.textContent = '🎮';
    spinner.style.cssText = 'font-size:16px;display:inline-block;animation:ln-spin 1.2s linear infinite;';

    const text = document.createElement('span');
    text.textContent = gameTitle
        ? `LootNova: reclamando "${gameTitle}"…`
        : 'LootNova: reclamando en Amazon…';

    badge.appendChild(spinner);
    badge.appendChild(text);
    shadow.appendChild(badge);
    return host;
}

function removeClaimOverlay(host: HTMLElement | null) {
    try { host?.remove(); } catch (_) { /* silent */ }
}

// ── Content Script ────────────────────────────────────────────────────────────

export default defineContentScript({
    matches: [
        'https://gaming.amazon.com/*',
        'https://luna.amazon.com/*',
    ],
    main(_: any) {
        if (!oncePerPageRun('_myAmazonContentScriptInjected' as keyof Window)) {
            return;
        }

        browser.runtime.onMessage.addListener((request: MessageRequest) => handleMessage(request));

        function handleMessage(request: MessageRequest) {
            if (request.target !== 'content') return;
            if (request.action === 'getFreeGames') void getFreeGamesList();
            if (request.action === 'claimGames')   void claimCurrentFreeGame();
        }

        // ── HOME PAGE — scrape and send list to background ────────────────
        async function getFreeGamesList() {
            await waitForPageLoad();

            const isLoggedIn = detectLogin();
            await setStorageItem('amazonLoggedIn', isLoggedIn);

            // Give React/SPA time to render all game cards
            await wait(3000);

            const { claimable, upcoming: domUpcoming } = scrapeAllGameCards();

            if (claimable.length === 0) {
                console.warn('[LootNova/Amazon] No claimable game links found.');
                await browser.runtime.sendMessage({
                    target: 'background',
                    action: 'claimFreeGames',
                    data: { freeGames: [], loggedIn: isLoggedIn },
                });
                return;
            }

            const apiUpcoming = await fetchUpcomingGames();
            const allUpcoming = apiUpcoming.length > 0 ? apiUpcoming : domUpcoming;

            await setStorageItem('amazonGames', claimable);

            if (allUpcoming.length > 0) {
                const existingFuture: FreeGame[] = ((await getStorageItem('futureGames')) as FreeGame[]) || [];
                const newFuture = allUpcoming.filter(upGame =>
                    !existingFuture.some(g => g.title.toLowerCase() === upGame.title.toLowerCase())
                );
                if (newFuture.length > 0) {
                    await setStorageItem('futureGames', [...existingFuture, ...newFuture]);
                    console.log(`[LootNova/Amazon] Added ${newFuture.length} upcoming Amazon game(s) to futureGames.`);
                }
            }

            const response: FreeGamesResponse = { freeGames: claimable, loggedIn: isLoggedIn };
            await browser.runtime.sendMessage({
                target: 'background',
                action: 'claimFreeGames',
                data: response,
            });
        }

        // ── DETAIL PAGE — click "Obtener juego" / "Get game" ──────────────
        async function claimCurrentFreeGame() {
            await waitForPageLoad();
            await wait(DETAIL_WAIT_MS);

            const pageTitle = document.title.replace(/\s*[|-].*$/, '').trim() || undefined;
            const overlay = createClaimOverlay(pageTitle);

            try {
                // --- Step 1: check if already obtained ---
                const earlyCheck = document.querySelector<HTMLButtonElement>('button[data-a-target="buy-box_button"]');
                const bodyText   = document.body?.textContent ?? '';

                const alreadyObtained =
                    (earlyCheck && earlyCheck.disabled) ||
                    /lo obtuviste el|ya lo tienes|you obtained it|already in library/i.test(bodyText);

                if (alreadyObtained) {
                    console.log('[LootNova/Amazon] Already obtained:', document.title, '— checking for unredeemed key…');
                    const redeemInfo = extractRedeemCode();
                    if (redeemInfo) {
                        console.log('[LootNova/Amazon] Unredeemed key found:', redeemInfo.platform, redeemInfo.code);
                        if (redeemInfo.platform === 'GOG') {
                            await setStorageItem('pendingGogCode', redeemInfo.code);
                        }
                        await browser.runtime.sendMessage({
                            target: 'background',
                            action: 'openRedeemPage',
                            data: redeemInfo,
                        });
                        await wait(2000);
                    } else {
                        console.log('[LootNova/Amazon] No unredeemed key on page, skipping.');
                    }
                    return;
                }

                // --- Step 2: find and click primary claim button ---
                const btn = await findClaimButton();
                if (!btn) {
                    console.warn('[LootNova/Amazon] Claim button not found on', location.href);
                    return;
                }

                await wait(getRndInteger(400, 800));
                btn.click();

                // --- Step 3: wait for confirmation page to render ---
                await wait(getRndInteger(2500, 3500));

                // --- Step 4: extract hero image from detail page and update storage ---
                const detailImg = extractHeroImage();
                if (detailImg) {
                    const storedGames: FreeGame[] = ((await getStorageItem('amazonGames')) as FreeGame[]) || [];
                    const idx = storedGames.findIndex(g => location.href.includes(g.link) || g.link.includes(location.pathname));
                    if (idx !== -1) {
                        storedGames[idx].img = detailImg;
                        await setStorageItem('amazonGames', storedGames);
                    }
                }

                // --- Step 5: poll for GOG (or other) redemption code ---
                const redeemInfo = await pollForRedeemCode(15_000);
                if (redeemInfo) {
                    console.log('[LootNova/Amazon] External key detected:', redeemInfo.platform, redeemInfo.code);
                    if (redeemInfo.platform === 'GOG') {
                        await setStorageItem('pendingGogCode', redeemInfo.code);
                    }
                    await browser.runtime.sendMessage({
                        target: 'background',
                        action: 'openRedeemPage',
                        data: redeemInfo,
                    });
                    await wait(2000);
                }

                await incrementCounter();
            } finally {
                removeClaimOverlay(overlay);
                // Signal the background that we're done so it can close the tab
                try {
                    await browser.runtime.sendMessage({
                        target: 'background', action: 'claimComplete',
                    });
                } catch (_) { /* tab may already be closing */ }
            }
        }
    },
});
