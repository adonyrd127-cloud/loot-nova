import {oncePerPageRun} from "@/entrypoints/utils/oncePerPageRun.ts";
import {browser} from "wxt/browser";
import {MessageRequest} from "@/entrypoints/types/messageRequest.ts";
import {FreeGame} from "@/entrypoints/types/freeGame.ts";
import {Platforms} from "@/entrypoints/enums/platforms.ts";
import {FreeGamesResponse} from "@/entrypoints/types/freeGamesResponse.ts";
import {setStorageItem} from "@/entrypoints/hooks/useStorage.ts";
import {
    clickWhenVisible,
    realClick,
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

            // ── Age Gate / Mature Content Bypass ──────────────────────
            // Steam shows an age verification page for mature content games.
            // The URL is like /agecheck/app/XXXXX/ and the page has a
            // "View Page" / "Ver página" button we need to click first.
            const ageGateBypassed = await handleAgeGate();
            if (ageGateBypassed) {
                // After clicking "View Page", Steam redirects to the actual
                // game page. We need to wait for it to fully load.
                await waitForPageLoad();
                // Give extra time for Steam's JS to hydrate the page
                await wait(2000);
            }

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

        /**
         * Detects and bypasses Steam's age verification / mature content gate.
         * Returns true if an age gate was found and clicked, false otherwise.
         */
        async function handleAgeGate(): Promise<boolean> {
            // Method 1: Check if we're on the /agecheck/ URL
            const isAgeCheckUrl = window.location.pathname.includes('/agecheck/');

            // Method 2: Check for the age gate container element on the page
            const ageGateContainer = document.querySelector('#agegate_box')
                || document.querySelector('.agegate_text_container')
                || document.querySelector('#age_gate_btn_continue');

            if (!isAgeCheckUrl && !ageGateContainer) {
                return false;
            }

            console.log('[LootNova] Steam age gate detected, attempting to bypass...');

            // Try clicking the "View Page" / "Ver página" button
            // Steam uses different selectors depending on the page type:

            // 1. The /agecheck/ page has an <a> with id="view_product_page_btn"
            const viewPageBtn = document.querySelector('#view_product_page_btn') as HTMLAnchorElement | null;
            if (viewPageBtn) {
                console.log('[LootNova] Clicking #view_product_page_btn');
                realClick(viewPageBtn);
                await wait(2000);
                return true;
            }

            // 2. Some pages use a generic "Continue" button inside #agegate_box
            const continueBtn = document.querySelector('#age_gate_btn_continue') as HTMLElement | null;
            if (continueBtn) {
                console.log('[LootNova] Clicking #age_gate_btn_continue');
                realClick(continueBtn);
                await wait(2000);
                return true;
            }

            // 3. Fallback: look for any <a> or <span> inside .agegate_text_container
            //    that looks like a "View Page" link
            const ageGateLinks = document.querySelectorAll('.agegate_text_container a, .age_gate_btn_container a');
            for (const link of ageGateLinks) {
                const text = link.textContent?.toLowerCase() ?? '';
                if (text.includes('view page') || text.includes('ver página') || text.includes('continue') || text.includes('continuar')) {
                    console.log('[LootNova] Clicking age gate link:', text.trim());
                    realClick(link as HTMLElement);
                    await wait(2000);
                    return true;
                }
            }

            // 4. Date-based age gate: some Steam pages ask for a birthday.
            //    Select a year that makes the user 25+ and submit.
            const yearSelect = document.querySelector('#ageYear') as HTMLSelectElement | null;
            if (yearSelect) {
                console.log('[LootNova] Filling date-based age gate');
                // Set day
                const daySelect = document.querySelector('#ageDay') as HTMLSelectElement | null;
                if (daySelect) daySelect.value = '1';
                // Set month
                const monthSelect = document.querySelector('#ageMonth') as HTMLSelectElement | null;
                if (monthSelect) monthSelect.value = 'January';
                // Set year (25+ years old)
                yearSelect.value = '1990';
                // Trigger change event
                yearSelect.dispatchEvent(new Event('change', { bubbles: true }));
                await wait(500);
                // Click the submit/view button
                const submitBtn = document.querySelector('#view_product_page_btn, .btnv6_blue_hoverfade, #age_gate_btn_continue') as HTMLElement | null;
                if (submitBtn) {
                    realClick(submitBtn);
                    await wait(2000);
                    return true;
                }
            }

            console.log('[LootNova] Age gate detected but no bypass button found');
            return false;
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
