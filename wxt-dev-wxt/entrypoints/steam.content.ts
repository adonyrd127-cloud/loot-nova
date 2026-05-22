import {oncePerPageRun} from "@/entrypoints/utils/oncePerPageRun.ts";
import {browser} from "wxt/browser";
import {MessageRequest} from "@/entrypoints/types/messageRequest.ts";
import {FreeGame} from "@/entrypoints/types/freeGame.ts";
import {Platforms} from "@/entrypoints/enums/platforms.ts";
import {FreeGamesResponse} from "@/entrypoints/types/freeGamesResponse.ts";
import {setStorageItem} from "@/entrypoints/hooks/useStorage.ts";
import {
    clickWhenVisible,
    incrementCounter, waitForAllElements,
    waitForElement,
    waitForPageLoad,
    isVisible,
    wait
} from "@/entrypoints/utils/helpers.ts";
import { ContentScriptRunner } from "@/entrypoints/utils/contentScriptFramework.ts";
import { sanitizeGameTitle, sanitizeUrl } from "@/entrypoints/utils/sanitize.ts";

const runner = new ContentScriptRunner();

export default defineContentScript({
    matches: ['https://store.steampowered.com/*'],
    main(_: any) {
        if (!oncePerPageRun('_mySteamContentScriptInjected' as keyof Window)) {
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
            const games = document.querySelector('div#search_result_container');
            const freeGames = games?.querySelectorAll('a.search_result_row:not(.ds_owned)') as NodeListOf<HTMLAnchorElement>;
            const isLoggedIn: boolean = !!document.querySelector('div#global_actions #account_pulldown');
            
            // Store login status so popup can show an indicator
            await setStorageItem("steamLoggedIn", isLoggedIn);

            const gamesArr: FreeGame[] = [];
            freeGames?.forEach((freeGame) => {
                const newFreeGame = {
                    link: sanitizeUrl(freeGame.href ?? ''),
                    img: sanitizeUrl(freeGame.getElementsByTagName('img')[0]?.src ?? ''),
                    title: sanitizeGameTitle(freeGame.querySelector('span.title')?.textContent?.trim() ?? ''),
                    platform: Platforms.Steam
                };
                gamesArr.push(newFreeGame);
            });
            
            if (gamesArr.length === 0) return;
            
            await setStorageItem("steamGames", gamesArr);
            const freeGamesResponse: FreeGamesResponse = {
                freeGames: gamesArr,
                loggedIn: isLoggedIn
            };
            await browser.runtime.sendMessage({
                target: 'background',
                action: 'claimFreeGames',
                data: freeGamesResponse
            });
        }

        async function claimCurrentFreeGame() {
            await waitForPageLoad();
            const buyOptions = await waitForAllElements(document, "div.game_area_purchase_game");
            if (!buyOptions) return;

            const pageTitle = document.title.replace(/\s*[|-].*$/, '').trim() || undefined;

            await runner.run([{
                name: 'steamClaim',
                timeoutMs: 15000,
                execute: async () => {
                    const freeOptions = Array.from(buyOptions).filter(bo => bo && isCurrentGameFree(bo));
                    if (freeOptions.length === 0) return;

                    let anchor: HTMLAnchorElement | null = null;
                    let selectedBuyOption: HTMLElement | null = null;
                    let retry = 0;
                    const maxRetry = 10;
                    const timeout = 500;

                    while (retry < maxRetry) {
                        for (const buyOption of freeOptions) {
                            const a = buyOption.querySelector("div.btn_addtocart a") as HTMLAnchorElement | null;
                            if (a && isVisible(a)) {
                                anchor = a;
                                selectedBuyOption = buyOption as HTMLElement;
                                break;
                            }
                        }
                        if (anchor) break;
                        await wait(timeout);
                        retry++;
                    }

                    if (!anchor || !selectedBuyOption) return;

                    const href = anchor.getAttribute("href") || "";

                    // Special-case Steam's javascript: URL to avoid CSP violation
                    const m = href.match(/^javascript:\s*addToCart\(\s*(\d+)\s*\)\s*;?\s*$/i);
                    if (m) {
                        const appid = parseInt(m[1], 10);
                        await browser.runtime.sendMessage({
                            target: "background",
                            action: "steamAddToCart",
                            data: { appid }
                        });
                    } else {
                        await clickWhenVisible("div.btn_addtocart a", selectedBuyOption);
                    }

                    await incrementCounter();
                }
            }], 'steam', pageTitle);
        }

        function isCurrentGameFree(el: { querySelector: (arg0: string) => any; }): boolean {
            const gamePrice = el?.querySelector('div.game_purchase_action_bg');
            // Check multiple indicators of a free game for robustness
            const pct = gamePrice?.querySelector('div.discount_pct')?.textContent?.trim();
            const priceText = gamePrice?.querySelector('div.game_purchase_price')?.textContent?.toLowerCase() ?? '';
            const finalPriceText = gamePrice?.querySelector('div.discount_final_price')?.textContent?.trim() ?? '';
            return pct === '-100%'
                || priceText.includes('free')
                || priceText.includes('free to play')
                || priceText.includes('gratis')
                || priceText.includes('$0.00')
                || finalPriceText.includes('$0.00')
                || finalPriceText.toLowerCase().includes('free')
                || finalPriceText.toLowerCase().includes('gratis');
        }
    },
});
