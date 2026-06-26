import {MessageRequest} from "@/entrypoints/types/messageRequest.ts";
import {FreeGame} from "@/entrypoints/types/freeGame.ts";
import { browser } from 'wxt/browser';
import {setStorageItem} from "@/entrypoints/hooks/useStorage.ts";
import { oncePerPageRun } from "@/entrypoints/utils/oncePerPageRun";
import {Platforms} from "@/entrypoints/enums/platforms.ts";
import {FreeGamesResponse} from "@/entrypoints/types/freeGamesResponse.ts";
import {
    getRndInteger,
    wait,
    clickWhenVisibleIframe,
    clickWhenVisible,
    waitForPageLoad,
    incrementCounter,
    isVisible
} from "@/entrypoints/utils/helpers.ts";
import {defineContentScript} from "wxt/utils/define-content-script";
import {ContentScriptRunner} from "@/entrypoints/utils/contentScriptFramework.ts";
import {sanitizeGameTitle, sanitizeUrl} from "@/entrypoints/utils/sanitize.ts";

const runner = new ContentScriptRunner();

export default defineContentScript({
    matches: ['https://store.epicgames.com/*'],
    main(_: any) {
        if (!oncePerPageRun('_myEpicContentScriptInjected')) {
            return;
        }
        browser.runtime.onMessage.addListener((request: MessageRequest) => handleMessage(request));

        function handleMessage(request: MessageRequest) {
            if (request.target !== 'content') return;
            if (request.action === 'getFreeGames') {
                void getFreeGamesList();
            } else if (request.action === "claimGames") {
                void claimCurrentFreeGame();
            }
        }

        async function getFreeGamesList() {
            await waitForPageLoad();

            // Detect login status via the egs-navigation custom element attribute
            const isLoggedIn: boolean =
                (document.querySelector('egs-navigation') as HTMLElement | null)
                    ?.getAttribute('isloggedin') === 'true';

            // Persist login status so the popup's LoginStatus component can render it (Issue #13)
            await setStorageItem("epicLoggedIn", isLoggedIn);
            await setStorageItem("epicLoginCheckedAt", new Date().toISOString());

            // NOTE: The Epic API (called from background.ts) is the primary source of free-game data
            // and is far more reliable than DOM scraping (which uses volatile CSS class names that
            // change with every Epic deploy — root cause of Issue #16).
            //
            // This getFreeGamesList fallback is kept only for the manual "getFreeGames" action that
            // background sends when the API call fails. It tries multiple stable selectors before
            // falling back to the volatile ones so it degrades gracefully.
            const gamesArr: FreeGame[] = [];

            // Attempt 1: stable data-testid selector
            const offerCards = document.querySelectorAll('[data-testid="offer-card-layout-container"]') as NodeListOf<HTMLAnchorElement>;
            if (offerCards.length > 0) {
                offerCards.forEach((card) => {
                    const anchor = card.closest('a') || card.getElementsByTagName('a')[0];
                    if (!anchor) return;
                    gamesArr.push({
                        link: sanitizeUrl(anchor.href ?? ''),
                        img: card.getElementsByTagName('img')[0]?.src ?? '',
                        title: sanitizeGameTitle((card.getElementsByTagName('h6')[0] || card.getElementsByTagName('h5')[0] || card.getElementsByTagName('h4')[0])?.textContent?.trim() ?? ''),
                        platform: Platforms.Epic,
                    });
                });
            }

            // Attempt 2: volatile CSS class selectors as last resort (original behavior)
            if (gamesArr.length === 0) {
                const games = document.querySelector('section.css-2u323');
                const freeGames = games?.querySelectorAll('a.css-g3jcms:has(div.css-82y1uz)') as NodeListOf<HTMLAnchorElement>;
                freeGames?.forEach((freeGame) => {
                    gamesArr.push({
                        link: sanitizeUrl(freeGame.href ?? ''),
                        img: freeGame.getElementsByTagName('img')[0]?.dataset.image ?? '',
                        title: sanitizeGameTitle(freeGame.getElementsByTagName('h6')[0]?.textContent?.trim() ?? ''),
                        platform: Platforms.Epic,
                    });
                });
            }

            if (gamesArr.length > 0) {
                const freeGamesResponse: FreeGamesResponse = {
                    freeGames: gamesArr,
                    loggedIn: isLoggedIn
                };
                await setStorageItem("epicGames", gamesArr);
                await browser.runtime.sendMessage({
                    target: 'background',
                    action: 'claimFreeGames',
                    data: freeGamesResponse
                });
            }
        }

        async function claimCurrentFreeGame() {
            await waitForPageLoad();
            await wait(getRndInteger(100, 500));

            const pageTitle = document.title.replace(/\s*[|-].*$/, '').trim() || undefined;

            // Uses ContentScriptRunner — overlay + step execution + auto-signal
            await runner.run([
                { name: 'clickPurchase', execute: () => clickWhenVisible('[data-testid="purchase-cta-button"]') },
                { name: 'humanDelay1', execute: () => wait(getRndInteger(100, 500)) },
                { name: 'deviceCheck', execute: tryClickDeviceNotSupportedContinue },
                { name: 'checkoutOrModal', execute: handleCheckoutOrModal, timeoutMs: 60000 }
            ], 'epic', pageTitle);

            await incrementCounter();
        }

        function normalizeText(text: string): string {
            return text.trim().toLowerCase().replace(/\s+/g, ' ');
        }

        function textMatches(elText: string, labels: string[]): boolean {
            const t = normalizeText(elText);
            return labels.some((label) => t === label || t.includes(label));
        }

        async function handleCheckoutOrModal() {
            const LABELS = [
                'add to library', 'agregar a la biblioteca',
                'place order', 'realizar pedido',
                'passer la commande', 'fazer o pedido'
            ];

            // Step 1: Wait for #webPurchaseContainer to appear (dynamically created after clicking "Get")
            console.log('[LootNova] Waiting for webPurchaseContainer to appear...');
            let container: HTMLElement | null = null;
            for (let i = 0; i < 30; i++) { // 15 seconds max
                container = document.querySelector('#webPurchaseContainer');
                if (container) break;
                await wait(500);
            }

            if (container) {
                console.log('[LootNova] webPurchaseContainer found! Waiting for iframe...');
                
                // Step 2: Wait for the iframe inside the container to appear
                let iframe: HTMLIFrameElement | null = null;
                for (let i = 0; i < 20; i++) { // 10 seconds max
                    iframe = container.querySelector('iframe') as HTMLIFrameElement | null;
                    if (iframe) break;
                    await wait(500);
                }

                if (iframe) {
                    console.log('[LootNova] Iframe found! Waiting for it to load...');
                    
                    // Step 3: Wait for the iframe to finish loading
                    if (iframe.contentDocument?.readyState !== 'complete') {
                        await new Promise<void>(resolve => {
                            const onLoad = () => resolve();
                            iframe!.addEventListener('load', onLoad, { once: true });
                            // Safety timeout in case load already fired
                            setTimeout(resolve, 8000);
                        });
                    }

                    // Step 4: Wait for iframe to become visible (class 'hidden' is removed)
                    for (let i = 0; i < 20; i++) {
                        if (!iframe.classList.contains('hidden')) break;
                        await wait(500);
                    }

                    // Step 5: Extra wait for React to hydrate the checkout UI inside the iframe
                    await wait(3000);

                    // Step 6: Search for the "Add to library" button inside the iframe
                    console.log('[LootNova] Searching for Add to library button inside iframe...');
                    for (let attempt = 0; attempt < 12; attempt++) { // 12 seconds max
                        try {
                            const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                            if (iframeDoc) {
                                const buttons = iframeDoc.querySelectorAll('button, a[role="button"], a, [role="button"]');
                                for (const btn of buttons) {
                                    const el = btn as HTMLElement;
                                    const text = normalizeText(el.textContent || '');
                                    const matchesLabel = LABELS.some(l => text === l || text.includes(l));
                                    const matchesClass = el.classList.contains('payment-order-confirm__btn') ||
                                                         el.classList.contains('payment-confirm__btn');
                                    
                                    if (matchesLabel || matchesClass) {
                                        console.log('[LootNova] ✅ Found checkout button in iframe:', text);
                                        el.scrollIntoView({ block: 'center' });
                                        await wait(200);
                                        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
                                        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
                                        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                                        await wait(6000); // Wait for Epic to process the order
                                        return; // Success!
                                    }
                                }
                            }
                        } catch (e) {
                            console.log('[LootNova] Error accessing iframe document:', e);
                        }
                        await wait(1000);
                    }
                }
            }

            // Fallback: check main DOM (in case Epic changes to a non-iframe modal)
            console.log('[LootNova] Trying main DOM fallback...');
            const candidates = Array.from(
                document.querySelectorAll<HTMLElement>('button, a[role="button"], a')
            );
            for (const el of candidates) {
                if (!isVisible(el)) continue;
                const testId = el.getAttribute('data-testid');
                if (testId === 'purchase-cta-button') continue;
                const text = normalizeText(el.textContent || '');
                if (LABELS.some(l => text === l || text.includes(l))) {
                    console.log('[LootNova] ✅ Found checkout button in main DOM:', text);
                    await realClick(el);
                    await wait(6000);
                    return; // Success!
                }
            }

            // If we get here, neither iframe nor main DOM had the button
            // Throw so ContentScriptRunner signals success=false to background
            throw new Error('Could not find Add to library button in checkout');
        }

        async function tryClickDeviceNotSupportedContinue() {
            const modalCtaButtons = document.querySelectorAll(
                'div.css-16r1tk9 div.css-15w5v2y-CTA button[type="button"]'
            );
            const continueButton = modalCtaButtons.length > 1
                ? (modalCtaButtons[modalCtaButtons.length - 1] as HTMLButtonElement)
                : null;

            if (!continueButton || continueButton.disabled) {
                return;
            }

            continueButton.click();
            await wait(getRndInteger(150, 350));
        }

        // Detectar login inmediatamente al cargar
        async function detectAndStoreLogin() {
          const nav = document.querySelector('egs-navigation');
          const isLoggedIn = nav?.getAttribute('isloggedin') === 'true';
          
          await setStorageItem("epicLoggedIn", isLoggedIn);
          await setStorageItem("epicLoginCheckedAt", new Date().toISOString());
        }

        // Ejecutar al inicio
        void detectAndStoreLogin();

        // Epic es SPA — detectar cambios cada 5 segundos
        let lastLoginState: boolean | null = null;
        let cachedNav: Element | null = null;
        setInterval(async () => {
          if (!cachedNav || !document.contains(cachedNav)) {
            cachedNav = document.querySelector('egs-navigation');
          }
          const current = cachedNav?.getAttribute('isloggedin') === 'true';
          
          if (current !== lastLoginState) {
            lastLoginState = current;
            await setStorageItem("epicLoggedIn", current);
            await setStorageItem("epicLoginCheckedAt", new Date().toISOString());
          }
        }, 5000);
    },
});