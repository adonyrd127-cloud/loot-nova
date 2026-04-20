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
    incrementCounter
} from "@/entrypoints/utils/helpers.ts";
import {defineContentScript} from "wxt/utils/define-content-script";

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
                    const anchor = card.closest('a') || card.querySelector('a');
                    if (!anchor) return;
                    gamesArr.push({
                        link: anchor.href ?? '',
                        img: card.querySelector('img')?.src ?? '',
                        title: card.querySelector('h6, h5, h4')?.textContent?.trim() ?? '',
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
                        link: freeGame.href ?? '',
                        img: freeGame.getElementsByTagName('img')[0]?.dataset.image ?? '',
                        title: freeGame.getElementsByTagName('h6')[0]?.innerHTML ?? '',
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
            await clickWhenVisible('[data-testid="purchase-cta-button"]');
            await wait(getRndInteger(100, 500));
            await tryClickDeviceNotSupportedContinue();
            await clickWhenVisibleIframe('#webPurchaseContainer iframe', 'button.payment-btn.payment-order-confirm__btn');
            await wait(getRndInteger(100, 500));
            await clickWhenVisibleIframe('#webPurchaseContainer iframe', 'button.payment-confirm__btn.payment-btn--primary');
            await incrementCounter();
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
    },
});