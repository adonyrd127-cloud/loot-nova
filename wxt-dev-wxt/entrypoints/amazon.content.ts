import { browser } from 'wxt/browser';
import { oncePerPageRun } from "@/entrypoints/utils/oncePerPageRun";
import { MessageRequest } from "@/entrypoints/types/messageRequest.ts";
import { FreeGame } from "@/entrypoints/types/freeGame.ts";
import { Platforms } from "@/entrypoints/enums/platforms.ts";
import { FreeGamesResponse } from "@/entrypoints/types/freeGamesResponse.ts";
import { setStorageItem, getStorageItem } from "@/entrypoints/hooks/useStorage.ts";
import {
    wait,
    getRndInteger,
    waitForElement,
    waitForPageLoad,
    incrementCounter,
} from "@/entrypoints/utils/helpers.ts";
import { defineContentScript } from "wxt/utils/define-content-script";

// ── Shadow DOM overlay helpers ────────────────────────────────────────────────
// Using a closed ShadowRoot ensures Amazon/Luna CSS never leaks into our badge.

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
        'background:linear-gradient(135deg,#b45309,#f59e0b);',  // Amazon amber brand
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
        ? `LootNova: reclamando “${gameTitle}”…`
        : 'LootNova: reclamando en Amazon…';

    badge.appendChild(spinner);
    badge.appendChild(text);
    shadow.appendChild(badge);
    return host;
}

function removeClaimOverlay(host: HTMLElement | null) {
    try { host?.remove(); } catch(_) {}
}

// Confirmed by DOM inspection on 2026:
//   Home: https://gaming.amazon.com/home  OR  https://luna.amazon.com/claims/home
//   Game: https://luna.amazon.com/claims/[slug]/dp/amzn1.pg.item.[uuid]
//   Claim button: button[data-a-target="buy-box_button"] → text "Obtener juego" / "Get game"
//   Luna streaming games show a "Jugar" button instead — these are NOT claimable.

/** How long (ms) to keep polling for game cards before giving up */
const CARD_WAIT_MS   = 20_000;
const CARD_POLL_MS   = 600;

/** How long to wait for the SPA to hydrate on the game detail page */
const DETAIL_WAIT_MS = 5_000;

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

        // ─────────────────────────────────────────────────────────────────
        // HOME PAGE — scrape game cards and send list to background
        // ─────────────────────────────────────────────────────────────────
        async function getFreeGamesList() {
            await waitForPageLoad();

            const isLoggedIn = detectLogin();
            await setStorageItem('amazonLoggedIn', isLoggedIn);

            // Give React/SPA time to render all game cards
            await wait(3000);

            // Scrape all game cards using card-first approach
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

            // Fetch upcoming games from the API; fall back to DOM-scraped ones
            const apiUpcoming = await fetchUpcomingGames();
            const allUpcoming = apiUpcoming.length > 0 ? apiUpcoming : domUpcoming;

            // ── Store claimable games in amazonGames ───────────────────────
            await setStorageItem('amazonGames', claimable);

            // ── Merge Amazon upcoming into futureGames (shared with Epic) ──
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

            // ── Send only claimable games to background for auto-claiming ──
            const response: FreeGamesResponse = { freeGames: claimable, loggedIn: isLoggedIn };
            await browser.runtime.sendMessage({
                target: 'background',
                action: 'claimFreeGames',
                data: response,
            });
        }

        // ─────────────────────────────────────────────────────────────────
        // CARD SCRAPING — card-first approach
        // ─────────────────────────────────────────────────────────────────

        /**
         * Scans ALL game card containers on the page and classifies them as:
         *  - claimable: have a /claims/dp/ link AND are NOT already obtained
         *  - upcoming: in a "Próximamente" / "Coming Soon" section
         *
         * KEY FIX: This is card-first (not link-first), so it correctly detects
         * Luna streaming games (like "Deep Sky Derelicts") that show a "Jugar" button
         * instead of a /claims/dp/ claim link — and properly excludes them.
         */
        function scrapeAllGameCards(): { claimable: FreeGame[]; upcoming: FreeGame[] } {
            const claimable: FreeGame[] = [];
            const upcoming: FreeGame[]  = [];
            const seenLinks  = new Set<string>();
            const seenTitles = new Set<string>();

            // Only anchors with /claims/ AND /dp/ are truly claimable
            const claimLinks = Array.from(
                document.querySelectorAll<HTMLAnchorElement>('a[href*="/claims/"][href*="/dp/"]')
            ).filter(a => !a.href.includes('/claims/home'));

            for (const anchor of claimLinks) {
                const link = anchor.href;
                if (seenLinks.has(link)) continue;

                // Find the outermost card container for this anchor
                const card = findCardContainer(anchor);

                // KEY CHECK: if the card shows "Jugar" / "Cómo jugar" / disabled state
                // → game is already claimed or is a Luna streaming title → skip it
                if (isAlreadyObtained(card)) {
                    console.log('[LootNova/Amazon] Skipping already-obtained:', card.textContent?.trim().substring(0, 60));
                    continue;
                }

                const title = extractTitleFromAnchor(anchor, card);
                const img   = extractImgFromAnchor(anchor, card);

                if (!title || /cómo jugar|how to play/i.test(title)) continue;

                seenLinks.add(link);
                seenTitles.add(title.toLowerCase());
                claimable.push({ title, link, img, platform: Platforms.Amazon });
            }

            // Also look for "Próximamente" / "Coming Soon" sections in the DOM
            const headings = Array.from(document.querySelectorAll('h2, h3, [class*="section-title"], [class*="sectionTitle"]'));
            for (const heading of headings) {
                const headingText = heading.textContent?.trim() ?? '';
                if (!/próximamente|coming soon|upcoming|soon|pronto/i.test(headingText)) continue;

                const section = heading.closest('section, [class*="section"], [class*="carousel"]') ||
                                heading.parentElement?.nextElementSibling ||
                                heading.nextElementSibling;
                if (!section) continue;

                const cards = Array.from(section.querySelectorAll('[data-a-target="item-card"], [class*="card"], li'));
                for (const upCard of cards) {
                    const upAnchor = upCard.querySelector<HTMLAnchorElement>('a[href]');
                    const upTitle  = upCard.querySelector('[data-a-target="item-title"], h2, h3, h4')?.textContent?.trim() ||
                                     upCard.textContent?.trim().substring(0, 60) || '';
                    const upImg    = extractImgFromAnchor(upAnchor || document.createElement('a'), upCard);
                    const upLink   = upAnchor?.href || 'https://gaming.amazon.com/home';

                    if (!upTitle || seenTitles.has(upTitle.toLowerCase())) continue;
                    seenTitles.add(upTitle.toLowerCase());
                    upcoming.push({
                        title: upTitle,
                        link: upLink,
                        img: upImg,
                        platform: Platforms.Amazon,
                        future: true,
                    });
                }
            }

            console.log(`[LootNova/Amazon] Scraped: ${claimable.length} claimable, ${upcoming.length} upcoming (from DOM).`);
            return { claimable, upcoming };
        }

        /** Finds the best outermost card container element for a given anchor */
        function findCardContainer(anchor: HTMLAnchorElement): Element {
            // Try with Amazon's own attribute first
            const byTarget = anchor.closest('[data-a-target="item-card"]');
            if (byTarget) return byTarget;

            // Walk up looking for semantic card-like containers
            let level = 0;
            let curr: HTMLElement | null = anchor;
            while (curr && level < 6 && curr.tagName !== 'BODY') {
                const tag = curr.tagName;
                const cls = curr.className?.toLowerCase() ?? '';
                if (tag === 'LI' || tag === 'ARTICLE' ||
                    cls.includes('card') || cls.includes('grid-item') ||
                    cls.includes('item') || cls.includes('tile')) {
                    return curr;
                }
                curr = curr.parentElement;
                level++;
            }

            // Fallback: 3 levels up
            return anchor.parentElement?.parentElement?.parentElement || anchor;
        }

        // ─────────────────────────────────────────────────────────────────
        // UPCOMING GAMES API
        // ─────────────────────────────────────────────────────────────────

        /**
         * Fetches upcoming Prime Gaming offers.
         * Strategy 1: HTML scrape of gaming.amazon.com/home for embedded JSON state.
         * Strategy 2: GraphQL persisted query (tries multiple known hashes).
         */
        async function fetchUpcomingGames(): Promise<FreeGame[]> {
            // Strategy 1: HTML scrape — Amazon embeds state JSON in the page
            try {
                const resp = await fetch('https://gaming.amazon.com/home', {
                    credentials: 'include',
                    headers: { 'Accept': 'text/html', 'Accept-Language': navigator.language || 'es-ES' },
                });
                if (resp.ok) {
                    const html = await resp.text();
                    const stateMatch =
                        html.match(/window\.__STORE__\s*=\s*(\{.+?\});/) ||
                        html.match(/__NEXT_DATA__[^>]*>([^<]+)</) ||
                        html.match(/"offers":\[(.+?)\],"/);
                    if (stateMatch) {
                        console.log('[LootNova/Amazon] Found embedded state in HTML, parsing...');
                        try {
                            const parsed = JSON.parse(stateMatch[1]);
                            const result = extractOffersFromState(parsed);
                            if (result.length > 0) return result;
                        } catch { /* parse error — continue to next strategy */ }
                    }
                }
            } catch (e) {
                console.warn('[LootNova/Amazon] HTML scrape failed:', e);
            }

            // Strategy 2: GraphQL persisted query (try multiple known hashes)
            const graphqlHashes = [
                'bf30169c5879cdc926a2aa0988028f51ee75e74c5e60e3ddfa3e75e3edcfedf5',
                'a99bc0b63ff9040b72e3a557adeaa1e40d9c35b70b59fc3d304e5073a12d945d',
            ];
            for (const hash of graphqlHashes) {
                try {
                    const vars = encodeURIComponent(JSON.stringify({
                        pageSize: 30,
                        nextToken: null,
                        filterCriteria: { availability: 'UPCOMING' },
                    }));
                    const ext = encodeURIComponent(JSON.stringify({
                        persistedQuery: { version: 1, sha256Hash: hash },
                    }));
                    const url = `https://gaming.amazon.com/graphql?operationName=getOffers&variables=${vars}&extensions=${ext}`;
                    const resp = await fetch(url, {
                        credentials: 'include',
                        headers: { 'Accept': 'application/json', 'Accept-Language': navigator.language || 'es-ES' },
                    });
                    if (!resp.ok) continue;
                    const json = await resp.json();
                    if (json?.errors?.length) continue; // persisted query mismatch

                    const offers: any[] =
                        json?.data?.primeOffers?.offers ??
                        json?.data?.getOffers?.offers ??
                        json?.data?.offers ?? [];
                    if (offers.length === 0) continue;

                    return mapOffersToGames(offers);
                } catch (e) {
                    console.warn(`[LootNova/Amazon] GraphQL hash ${hash.substring(0, 8)} failed:`, e);
                }
            }

            console.warn('[LootNova/Amazon] All upcoming-games strategies failed.');
            return [];
        }

        /** Maps raw GraphQL offer objects to FreeGame entries */
        function mapOffersToGames(offers: any[]): FreeGame[] {
            const result: FreeGame[] = [];
            for (const offer of offers) {
                const title = offer?.title ?? offer?.game?.title ?? offer?.name ?? '';
                const img   = offer?.cardImage?.url ??
                              offer?.assets?.find((a: any) => a?.purpose === 'BoxArt' || a?.purpose === 'Thumbnail')?.url ??
                              offer?.game?.assets?.[0]?.url ?? '';
                const slug  = offer?.self ?? offer?.linkedJourney?.assets?.[0]?.externalClaimLink ?? '';
                const link  = slug ? `https://gaming.amazon.com${slug}` : 'https://gaming.amazon.com/home';
                const startDate: string = offer?.startTime ?? offer?.startDate ?? offer?.offerStartTime ?? '';
                const endDate: string   = offer?.endTime   ?? offer?.endDate   ?? offer?.offerEndTime   ?? '';

                if (!title) continue;

                result.push({
                    title,
                    link,
                    img,
                    platform: Platforms.Amazon,
                    future: true,
                    startDate: startDate ? new Date(startDate).toISOString() : undefined,
                    endDate:   endDate   ? new Date(endDate).toISOString()   : undefined,
                });
            }
            console.log(`[LootNova/Amazon] ${result.length} upcoming games from API.`);
            return result;
        }

        /** Tries to extract upcoming offer data from embedded JS state object */
        function extractOffersFromState(state: any): FreeGame[] {
            try {
                const offers = state?.offers ?? state?.primeOffers?.offers ?? state?.initialState?.offers ?? [];
                if (Array.isArray(offers) && offers.length > 0) {
                    return mapOffersToGames(offers.filter((o: any) => {
                        return o?.availability === 'UPCOMING' ||
                               (o?.startTime && new Date(o.startTime) > new Date());
                    }));
                }
            } catch { /* ignore */ }
            return [];
        }

        // ─────────────────────────────────────────────────────────────────
        // DETAIL PAGE — click "Obtener juego" / "Get game"
        // luna.amazon.com/claims/[slug]/dp/[id]
        // ─────────────────────────────────────────────────────────────────
        async function claimCurrentFreeGame() {
            await waitForPageLoad();

            // Wait for React SPA to hydrate the detail page
            await wait(DETAIL_WAIT_MS);

            // Show an isolated Shadow DOM overlay so the user knows LootNova is active
            const pageTitle = document.title.replace(/\s*[|-].*$/, '').trim() || undefined;
            const overlay = createClaimOverlay(pageTitle);

            try {
                // --- Step 1: check if already obtained ---
                // IMPORTANT: Even if already obtained, the page may show an unredeemed
                // external key (GOG/Steam/Xbox). We MUST check that before skipping.
                const earlyCheck = document.querySelector<HTMLButtonElement>('button[data-a-target="buy-box_button"]');
                const bodyText   = document.body?.textContent ?? '';

                const alreadyObtained =
                    (earlyCheck && earlyCheck.disabled) ||
                    /lo obtuviste el|ya lo tienes|you obtained it|already in library/i.test(bodyText);

                if (alreadyObtained) {
                    console.log('[LootNova/Amazon] Already obtained:', document.title, '— checking for unredeemed key…');
                    // Snapshot check: the code is already rendered on the page, no need to poll
                    const redeemInfo = extractRedeemCode();
                    if (redeemInfo) {
                        console.log('[LootNova/Amazon] Unredeemed key found:',
                            redeemInfo.platform, redeemInfo.code);
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
                // After clicking claim, Amazon takes several seconds to render the key.
                // We poll for up to 15s so we don't miss it.
                const redeemInfo = await pollForRedeemCode(15_000);
                if (redeemInfo) {
                    console.log('[LootNova/Amazon] External key detected:', redeemInfo.platform, redeemInfo.code);
                    // Store the code so the GOG content script can pick it up
                    if (redeemInfo.platform === 'GOG') {
                        await setStorageItem('pendingGogCode', redeemInfo.code);
                    }
                    await browser.runtime.sendMessage({
                        target: 'background',
                        action: 'openRedeemPage',
                        data: redeemInfo,
                    });
                    // Give the new tab time to start loading before we continue
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

        // ─────────────────────────────────────────────────────────────────
        // HELPERS
        // ─────────────────────────────────────────────────────────────────

        /**
         * Polls the DOM until we find anchor elements that point to claim
         * detail pages. Used as a secondary/fallback check.
         * Main logic is in scrapeAllGameCards().
         */
        async function pollForGameLinks(): Promise<HTMLAnchorElement[] | null> {
            const deadline = Date.now() + CARD_WAIT_MS;
            while (Date.now() < deadline) {
                const byHref = Array.from(
                    document.querySelectorAll<HTMLAnchorElement>('a[href*="/claims/"][href*="/dp/"]')
                ).filter(a => !a.href.includes('/claims/home'));

                if (byHref.length > 0) {
                    await wait(2000);
                    return Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/claims/"][href*="/dp/"]'))
                        .filter(a => !a.href.includes('/claims/home'));
                }

                const byTarget = Array.from(
                    document.querySelectorAll('[data-a-target="item-card"] a[href]')
                ) as HTMLAnchorElement[];
                if (byTarget.length > 0) return byTarget;

                await wait(CARD_POLL_MS);
            }
            return null;
        }

        /**
         * Finds the primary "Obtener juego" / "Get game" / "Claim" button
         * on the game detail page.
         */
        async function findClaimButton(): Promise<HTMLButtonElement | null> {
            // 1. Most reliable — Amazon's own test attribute (lang-independent)
            const byTarget = await waitForElement(document, 'button[data-a-target="buy-box_button"]', 800, 12) as HTMLButtonElement | null;
            if (byTarget && !byTarget.disabled) return byTarget;

            // 2. Try to find by text content (bilingual)
            const allBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('button'));
            const byText = allBtns.find(b =>
                !b.disabled &&
                /obtener juego|get game|reclamar|claim game|claim/i.test(b.textContent?.trim() ?? '')
            );
            if (byText) return byText;

            // 3. Try Twitch-style primary button
            const byClass = await waitForElement(
                document,
                'button.tw-core-button--primary:not([disabled]), button[class*="Button-primary"]:not([disabled])',
                800, 6
            ) as HTMLButtonElement | null;
            if (byClass) return byClass;

            return null;
        }

        /** Extracts the hero/cover image from the Amazon Luna game detail page */
        function extractHeroImage(): string {
            const selectors = [
                'img[data-a-image-name="heroImage"]',
                'img[class*="HeroImage"]',
                'img[class*="hero-image"]',
                '[class*="hero"] img',
                '[class*="Hero"] img',
                '[class*="cover"] img',
                '[class*="Cover"] img',
                '[class*="thumbnail"] img',
                '[class*="Thumbnail"] img',
                'main img',
            ];
            for (const sel of selectors) {
                const img = document.querySelector<HTMLImageElement>(sel);
                if (img) {
                    const src = img.getAttribute('src') || img.src || '';
                    if (src && !src.startsWith('data:image')) return src;
                    const dataSrc = img.getAttribute('data-src');
                    if (dataSrc && !dataSrc.startsWith('data:image')) return dataSrc;
                }
            }
            const allEls = document.querySelectorAll('[class*="hero" i], [class*="cover" i], [class*="header" i]');
            for (const el of Array.from(allEls)) {
                const bg = window.getComputedStyle(el).backgroundImage;
                if (bg && bg !== 'none' && bg.startsWith('url(')) {
                    const match = bg.match(/url\(["']?(.*?)["']?\)/);
                    if (match && match[1] && !match[1].startsWith('data:image')) return match[1];
                }
            }
            return '';
        }

        /**
         * Polls the DOM after a claim button click, waiting for an external key
         * (GOG, Xbox, Steam) to appear on the page. Amazon takes several seconds
         * to render the key modal after the claim is processed.
         *
         * @param timeoutMs - Maximum time to wait (default 15 000 ms)
         */
        async function pollForRedeemCode(
            timeoutMs = 15_000
        ): Promise<{ code: string; redeemUrl: string; platform: string } | null> {
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
        function extractRedeemCode(): { code: string; redeemUrl: string; platform: string } | null {
            const bodyText = document.body?.textContent ?? '';
            const bodyHtml = document.body?.innerHTML ?? '';

            // ── Priority 1: Find the "Código de canje" / "Redeem code" anchor ──
            // Amazon puts the full GOG URL (with code embedded) in this link.
            // This is the most reliable source — no need to separately extract the code.
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

                // Generic redeem/canje link text (Amazon sometimes uses 'C\u00f3digo de canje')
                if (
                    text.includes('canje') || text.includes('redeem code') ||
                    text.includes('c\u00f3digo') || text.includes('canjer')
                ) {
                    if (href.includes('gog.com'))   return extractFromGogHref(href);
                    if (href.includes('xbox.com'))  return { code: '', redeemUrl: href, platform: 'Xbox' };
                    if (href.includes('steam'))     return { code: '', redeemUrl: href, platform: 'Steam' };
                }
            }

            // ── Priority 2: "Tu c\u00f3digo: XXX" text element (visible on Amazon detail page) ──
            // Amazon renders this after claiming: “Tu c\u00f3digo: QQPUAE5BADC73947AC”
            const codeTextMatch = bodyText.match(
                /(?:tu\s+c[o\u00f3]digo|your\s+code|c[o\u00f3]digo)[:\s]+([A-Z0-9]{10,30}(?:-[A-Z0-9]{4,5})*)/i
            );
            if (codeTextMatch) {
                const code = codeTextMatch[1].trim();
                // Still need to know the platform — check body for clues
                const isGOG   = bodyHtml.includes('gog.com');
                const isXbox  = bodyHtml.includes('xbox.com');
                const isSteam = bodyHtml.includes('steampowered.com');
                if (isGOG)   return { code, redeemUrl: `https://www.gog.com/redeem/${code}`,   platform: 'GOG'   };
                if (isXbox)  return { code, redeemUrl: `https://www.xbox.com/redeemtoken?token=${code}`, platform: 'Xbox'  };
                if (isSteam) return { code, redeemUrl: `https://store.steampowered.com/account/registerkey?key=${code}`, platform: 'Steam' };
            }

            // ── Priority 3: Regex fallback ──
            // Determine platform from HTML first, then extract code
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
                // GOG codes: XXXX-XXXX-XXXX-XXXX  OR  18-char continuous like QQPUAE5BADC73947AC
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

        function extractFromGogHref(href: string): { code: string; redeemUrl: string; platform: string } | null {
            const code = href.split('/redeem/')[1]?.split('?')[0]?.split('#')[0] ?? '';
            if (!code) return null;
            return { code, redeemUrl: `https://www.gog.com/redeem/${code}`, platform: 'GOG' };
        }

        /** Extracts title from a game card anchor using multiple fallbacks */
        function extractTitleFromAnchor(anchor: HTMLAnchorElement, parent: Element): string {
            let t = parent.querySelector<HTMLElement>('[data-a-target="item-title"]')?.textContent?.trim() ||
                parent.querySelector<HTMLElement>('h2, h3, h4')?.textContent?.trim() ||
                parent.getAttribute('aria-label')?.trim();

            if (!t || /cómo|how to|play|jugar/i.test(t)) {
                t = anchor.querySelector<HTMLElement>('[data-a-target="item-title"]')?.textContent?.trim() ||
                    anchor.querySelector<HTMLElement>('h2, h3, h4')?.textContent?.trim() ||
                    anchor.getAttribute('aria-label')?.trim() ||
                    anchor.title?.trim() ||
                    anchor.textContent?.trim() || '';
            }
            return t ? t.replace(/\n.*/g, '').trim() : '';
        }

        function extractImgFromAnchor(anchor: HTMLAnchorElement, parent: Element): string {
            const imgEls = Array.from(parent.querySelectorAll<HTMLImageElement>('img'));
            if (parent !== anchor) imgEls.push(...Array.from(anchor.querySelectorAll<HTMLImageElement>('img')));

            for (const imgEl of imgEls) {
                let src = imgEl.getAttribute('src') || '';
                if (src.startsWith('data:image') && imgEl.hasAttribute('data-src')) {
                    src = imgEl.getAttribute('data-src') || '';
                }
                if (!src || src.startsWith('data:image')) {
                    src = imgEl.dataset.src || src;
                }
                if (src && !src.startsWith('data:image')) return src;
                if (imgEl.src && !imgEl.src.startsWith('data:image')) return imgEl.src;
            }

            const pic = parent.querySelector('picture source');
            const picSrc = pic?.getAttribute('srcset')?.split(' ')[0] || pic?.getAttribute('src');
            if (picSrc && !picSrc.startsWith('data:image')) return picSrc;

            const elementsToCheck = [parent, ...Array.from(parent.querySelectorAll('*'))];
            for (const el of elementsToCheck) {
                const bgInline = (el as HTMLElement).style?.backgroundImage;
                const bgComputed = window.getComputedStyle(el).backgroundImage;
                const bg = (bgInline && bgInline !== 'none') ? bgInline : bgComputed;

                if (bg && bg !== 'none' && bg.includes('url(')) {
                    const match = bg.match(/url\(["']?(.*?)["']?\)/);
                    if (match && match[1] && !match[1].startsWith('data:image')) {
                        return match[1];
                    }
                }
            }

            return '';
        }

        /**
         * Returns true if the game card already shows an "obtained" / "play" state.
         *
         * Confirmed indicators from DOM inspection (2026):
         *  - button[data-a-target="buy-box_button"] is disabled
         *  - Card has a button with text "Cómo jugar" / "How to play" (already claimed)
         *  - Card has a button with text "Jugar" (Luna streaming game — not claimable)
         *  - Card text contains "Obtenido" / "obtained"
         */
        function isAlreadyObtained(card: Element): boolean {
            // Check for a disabled claim button inside the card
            const btn = card.querySelector<HTMLButtonElement>('button[data-a-target="buy-box_button"]');
            if (btn && btn.disabled) return true;

            // Check ALL buttons — "Jugar" / "Cómo jugar" / "How to play" all mean already claimable
            const allBtns = Array.from(card.querySelectorAll<HTMLButtonElement>('button'));
            const hasPlayBtn = allBtns.some(b => {
                const text = b.textContent?.trim() ?? '';
                return /^(cómo jugar|how to play|jugar|play now|play|ya disponible|available now)$/i.test(text);
            });
            if (hasPlayBtn) return true;

            // Check for "Obtenido" / "obtained" text in the card
            const cardText = card.textContent ?? '';
            if (/obtenido|lo obtuviste|ya lo tienes|obtained|in library/i.test(cardText)) return true;

            return false;
        }

        /** Detects if the user is logged in to Amazon Prime Gaming / Luna */
        function detectLogin(): boolean {
            const hasSignInBtn = Array.from(document.querySelectorAll('a, button')).some(el => {
                const text = (el.textContent || '').trim().toLowerCase();
                return ['sign in', 'log in', 'iniciar sesión', 'inicia sesión', 'identifícate'].includes(text);
            });

            if (hasSignInBtn) return false;

            const hasProfileIndicators = !!(
                document.querySelector('[data-a-target="navbar-account-menu"]') ||
                document.querySelector('[data-a-target="prime-account-dropdown"]') ||
                document.querySelector('[data-a-target="user-display-name"]') ||
                document.querySelector('a[href*="/account/profile"]') ||
                document.querySelector('button[aria-label*="cuenta" i], button[aria-label*="account" i], button[aria-label*="perfil" i], button[aria-label*="profile" i]') ||
                document.querySelector('[class*="user-avatar" i]') ||
                document.querySelector('img[alt*="profile" i], img[alt*="perfil" i], img[src*="avatar" i]') ||
                document.querySelector('img.avatar, img.profile, .user-profile img')
            );

            return hasProfileIndicators || true;
        }
    },
});
