import {MessageRequest} from "@/entrypoints/types/messageRequest.ts";
import {getStorageItem, getStorageItems, setStorageItem} from "@/entrypoints/hooks/useStorage.ts";
import {FreeGame} from "@/entrypoints/types/freeGame.ts";
import {ClaimedGame} from "@/entrypoints/types/claimedGame.ts";
import {Platforms} from "@/entrypoints/enums/platforms.ts";
import {ClaimFrequency, ClaimFrequencyMinutes} from "@/entrypoints/enums/claimFrequency.ts";
import {parse} from 'node-html-parser';
import {browser} from "wxt/browser";
import {EpicElement, EpicKeyImage, EpicSearchResponse} from "@/entrypoints/types/epicGame.ts";
import {sendClaimNotification, sendNewGamesNotification, sendSessionExpiredNotification} from "@/entrypoints/utils/helpers.ts";
import {fetchRetailPrice} from "@/entrypoints/utils/priceService.ts";
import {logger} from "@/entrypoints/utils/logger.ts";
import {validateGameUrl} from "@/entrypoints/utils/urlValidator.ts";
import {sanitizeGameTitle, sanitizeUrl} from "@/entrypoints/utils/sanitize.ts";
import {EpicSearchResponseSchema} from "@/entrypoints/types/validators.ts";
import {PlatformOrchestrator} from "@/entrypoints/services/PlatformOrchestrator.ts";
import {registry} from "@/entrypoints/platforms/PlatformRegistry.ts";
import pLimit from "p-limit";

const orchestrator = new PlatformOrchestrator(registry);

const EPIC_API_URL    = "https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions?locale=en-US";
const EPIC_GAMES_URL  = "https://store.epicgames.com/";
const STEAM_GAMES_URL = "https://store.steampowered.com/search/?sort_by=Price_ASC&maxprice=free&category1=998&specials=1&ndl=1";
// Amazon Gaming now lives at luna.amazon.com — gaming.amazon.com redirects there.
// We open the home page and let the content script scrape + claim.
const AMAZON_GAMES_URL = "https://luna.amazon.com/claims/home";

const ALARM_NAME           = "checkFreeGames";
const SESSION_ALARM_NAME   = "sessionCheck";
const SESSION_ALARM_PERIOD = 720; // 12 hours in minutes
const TAB_LOAD_TIMEOUT_MS  = 45_000;

let isChecking = false;

export default defineBackground({
  main() {
    console.log('[LootNova] Background Service Worker initialized. Build: 2026-05-16-v2');
    browser.runtime.onStartup.addListener(() => {
      // Schedule a startup claim check via alarm (most reliable in MV3)
      void browser.alarms.create("startupClaim", { delayInMinutes: 0.1 }); // ~6 seconds
      console.log('[LootNova] Browser started — scheduled startup claim alarm.');
    });

    browser.runtime.onMessage.addListener((request: MessageRequest, sender: browser.runtime.MessageSender) =>
        this.handleMessage(request, sender)
    );

    browser.runtime.onInstalled.addListener((r: browser.runtime.InstalledDetails) => {
      this.handleInstall(r);
      // Also trigger a claim check on install/update
      void browser.alarms.create("startupClaim", { delayInMinutes: 0.1 });
    });

    browser.alarms.onAlarm.addListener((alarm: browser.alarms.Alarm) => {
      if (alarm.name === ALARM_NAME) {
        void this.handleAlarmTriggered();
      }
      if (alarm.name === SESSION_ALARM_NAME) {
        void this.silentSessionCheck();
      }
      if (alarm.name === "startupClaim") {
        console.log('[LootNova] Startup claim alarm fired.');
        void this.handleStartup();
      }
    });

    void browser.action.setBadgeBackgroundColor({ color: "#8b5cf6" }); // violet — LootNova brand color
    void this.initializeAlarms();
    void this.initializeSessionAlarm();

    // Always schedule a startup claim when the service worker initializes.
    // This covers: cold browser start, extension update, SW restart by Chrome.
    void browser.alarms.create("startupClaim", { delayInMinutes: 0.1 });
    console.log('[LootNova] Service worker initialized — startup alarm scheduled.');
  },

  async handleStartup() {
    // Login/session checks are best-effort — never block claiming
    try {
      await this.checkLoginStatuses();
    } catch (e) {
      logger.info('Startup login check failed (non-blocking)', { action: 'startup' });
    }

    try {
      await this.silentSessionCheck();
    } catch (e) {
      logger.info('Startup session check failed (non-blocking)', { action: 'startup' });
    }

    // This is the critical part — always attempt to claim
    try {
      const result = await getStorageItems(["active", "claimFrequency"]);
      // Default to true if never set (matches frontend default in OnButton.tsx)
      const isActive = result?.active !== undefined ? result.active : true;
      if (!isActive) {
        console.log('[LootNova] Auto-claim is disabled, skipping startup claim.');
        return;
      }
      const frequency = result.claimFrequency || ClaimFrequency.DAILY;
      console.log(`[LootNova] Startup claim triggered (frequency: ${frequency})`);
      await this.checkAndClaimIfDue(frequency);
    } catch (e) {
      logger.error('Startup claim failed', { action: 'startup' }, e as Error);
    }
  },

  async handleAlarmTriggered() {
    const result = await getStorageItems(["active", "claimFrequency"]);
    const isActive = result?.active !== undefined ? result.active : true;
    if (!isActive) return;
    const frequency = result.claimFrequency || ClaimFrequency.DAILY;
    await this.checkAndClaimIfDue(frequency);
  },

  async checkAndClaimIfDue(frequency: ClaimFrequency) {
    if (isChecking) return;
    isChecking = true;
    try {
      const today = new Date().toISOString();
      const lastOpened = await getStorageItem("lastOpened");
      if (!lastOpened) {
        await this.getFreeGamesAndSetOpenedFlag(today);
        return;
      }
      // BROWSER_START: always claim on every startup, no time check
      if (frequency === ClaimFrequency.BROWSER_START) {
        await this.getFreeGamesAndSetOpenedFlag(today);
        return;
      }
      if (frequency === ClaimFrequency.DAILY) {
        if (this.areDatesDifferent(lastOpened, today)) {
          await this.getFreeGamesAndSetOpenedFlag(today);
        }
      } else {
        const requiredMinutes = ClaimFrequencyMinutes[frequency];
        if (this.didEnoughTimePass(lastOpened, requiredMinutes)) {
          await this.getFreeGamesAndSetOpenedFlag(today);
        }
      }
    } finally {
      isChecking = false;
    }
  },

  areDatesDifferent(date1: string, date2: string): boolean {
    return !!date1 && new Date(date1).toDateString() !== new Date(date2).toDateString();
  },

  async getFreeGamesAndSetOpenedFlag(opened: string) {
    await setStorageItem("lastOpened", opened);
    await this.getFreeGamesList();
  },

  didEnoughTimePass(lastOpened: string, requiredMinutes: number): boolean {
    const lastDate = new Date(lastOpened);
    const now = new Date();
    const minutesElapsed = (now.getTime() - lastDate.getTime()) / (1000 * 60);
    return minutesElapsed >= requiredMinutes;
  },

  async initializeAlarms() {
    const result = await getStorageItems(["active", "claimFrequency"]);
    const isActive = result?.active !== undefined ? result.active : true;
    if (!isActive) {
      try { await browser.alarms.clear(ALARM_NAME); } catch (_) {}
      return;
    }
    const frequency = result.claimFrequency || ClaimFrequency.DAILY;
    if (frequency === ClaimFrequency.BROWSER_START) {
      try { await browser.alarms.clear(ALARM_NAME); } catch (_) {}
      return;
    }
    const minutes = ClaimFrequencyMinutes[frequency as ClaimFrequency];
    if (minutes > 0) {
      try {
        const existingAlarm = await browser.alarms.get(ALARM_NAME);
        if (existingAlarm && existingAlarm.periodInMinutes === minutes) return;
      } catch (_) {}
      await browser.alarms.create(ALARM_NAME, { periodInMinutes: minutes });
    }
  },

  /** Creates the 12-hour session-check alarm if it doesn't exist yet. */
  async initializeSessionAlarm() {
    try {
      const existing = await browser.alarms.get(SESSION_ALARM_NAME);
      if (existing) return; // already registered, nothing to do
      await browser.alarms.create(SESSION_ALARM_NAME, { periodInMinutes: SESSION_ALARM_PERIOD });
      console.log('[LootNova] Session check alarm registered (12h).');
    } catch (e) {
      console.warn('[LootNova] Could not register session alarm:', e);
    }
  },

  /**
   * Silently hits auth endpoints for GOG, Epic and Amazon with credentials.
   * If the server returns 401/403 (or a login redirect) and the user was
   * previously logged in, fires a localized session-expired notification.
   */
  async silentSessionCheck() {
    interface PlatformCheck {
      name: string;
      url: string;
      storageKey: string;
      /** Additional test beyond HTTP status: runs on the parsed JSON body */
      isLoggedIn?: (body: unknown) => boolean;
    }

    const platforms: PlatformCheck[] = [
      {
        name: 'GOG',
        url: 'https://www.gog.com/userData.json',
        storageKey: 'gogLoggedIn',
        isLoggedIn: (body: unknown) => {
          const b = body as { isLoggedIn?: boolean };
          return b?.isLoggedIn === true;
        },
      },
    ];

    await Promise.all(platforms.map(async (platform) => {
      try {
        const prevLoggedIn = await getStorageItem(platform.storageKey);
        // Only alert if we knew the user was logged in before
        if (prevLoggedIn !== true) return;

        const resp = await fetch(platform.url, {
          credentials: 'include',
          signal: AbortSignal.timeout(8_000),
        });

        let nowLoggedIn = resp.ok;
        if (nowLoggedIn && platform.isLoggedIn) {
          try {
            const body: unknown = await resp.json();
            nowLoggedIn = platform.isLoggedIn(body);
          } catch { nowLoggedIn = false; }
        }

        if (!nowLoggedIn) {
          // Session expired — fire localized notification
          const title   = browser.i18n.getMessage('session_expired_title');
          const message = browser.i18n.getMessage('session_expired_body', [platform.name]);
          browser.notifications.create(`session-silent-${platform.name}-${Date.now()}`, {
            type: 'basic',
            iconUrl: browser.runtime.getURL('/icon/128.png'),
            title,
            message,
          });
          // Update stored state so we don't spam notifications
          await setStorageItem(platform.storageKey, false);
          console.log(`[LootNova] Session expired detected via silent check: ${platform.name}`);
        }
      } catch (e) {
        // Network error — don't assume logged out, stay silent
        console.warn(`[LootNova] silentSessionCheck failed for ${platform.name}:`, e);
      }
    }));
  },

  async getFreeGamesList() {
    const checks = await getStorageItems(["steamCheck", "epicCheck", "amazonCheck", "gogCheck"]);
    // Default to true for platforms enabled by default in Settings.tsx
    const steamCheck  = checks?.steamCheck  !== undefined ? checks.steamCheck  : true;
    const epicCheck   = checks?.epicCheck   !== undefined ? checks.epicCheck   : true;
    const amazonCheck = checks?.amazonCheck !== undefined ? checks.amazonCheck : true;
    const gogCheck    = checks?.gogCheck    !== undefined ? checks.gogCheck    : false; // GOG defaults to false

    // ── Parallel fetching — Epic + Steam + GOG run concurrently (~2x faster) ──
    const promises: Promise<void>[] = [];

    if (epicCheck) {
      promises.push(
        this.getEpicGamesList(true).catch(async (e: unknown) => {
          logger.error('getEpicGamesList failed', { platform: 'epic' }, e as Error);
        })
      );
    }

    console.log(`[LootNova] Platform checks — steam:${steamCheck}, epic:${epicCheck}, amazon:${amazonCheck}, gog:${gogCheck}`);

    if (steamCheck) {
      promises.push(
        this.getSteamGamesList(true).catch(async (e: unknown) => {
          logger.error('getSteamGamesList failed', { platform: 'steam' }, e as Error);
        })
      );
    }

    if (gogCheck) {
      promises.push(
        (async () => {
          try {
            const gogPlatform = registry.get('gog');
            if (gogPlatform) {
              const games = await gogPlatform.fetchFreeGames();
              if (games && games.length > 0) {
                // Check if already claimed/known
                const currFreeGames: FreeGame[] = (await getStorageItem('gogGames')) || [];
                const currTitles = new Set(currFreeGames.map(g => g?.title));
                const newGames = games.filter(game => !currTitles.has(game?.title));
                
                if (newGames.length > 0) {
                  await setStorageItem('gogGames', newGames);
                  sendNewGamesNotification(newGames.length);
                  await this.claimGames(newGames);
                }
              }
            }
          } catch (e) {
            logger.error('getGogGamesList failed', { platform: 'gog' }, e as Error);
          }
        })()
      );
    }

    // Run in parallel
    await Promise.allSettled(promises);

    // Amazon has no public API — always use content script (sequential, needs its own tab)
    if (amazonCheck) {
      try {
        await setStorageItem('amazonGames', []);
        const tab = await browser.tabs.create({ url: AMAZON_GAMES_URL, active: false });
        if (tab?.id) {
          await this.waitForTabToLoad(tab.id);
          await browser.tabs.sendMessage(tab.id, { target: 'content', action: 'getFreeGames' });
          await this.waitForContentResponse('claimFreeGames', 45_000);
          try { await browser.tabs.remove(tab.id); } catch (_) {}
        }
      } catch (e) {
        logger.error('Amazon getFreeGames failed', { platform: 'amazon' }, e as Error);
      }
    }
  },

  async claimGames(games: FreeGame[]) {
    void this.setBadgeText(games.length.toString());
    const limit = pLimit(3);

    await Promise.all(games.map(game => limit(async () => {
      try {
        console.log(`[LootNova/Claim] Attempting: "${game.title}" (${game.platform}) — ${game.link}`);

        // ── Security: validate URL before opening tab ──
        if (!validateGameUrl(game.link, game.platform)) {
          logger.error('Blocked claim for invalid URL', { platform: game.platform, gameId: game.title });
          return;
        }

        // ── Silent Claiming Intercept ──
        if (game.platform === Platforms.Steam || game.platform === 'GOG') {
          // WE SKIP SILENT CLAIM FOR STEAM FOR NOW because it's unreliable.
          // This forces the extension to open a tab and use the content script.
          if (game.platform === Platforms.Steam) {
            console.log(`[LootNova/Claim] Skipping silent claim for Steam to ensure reliable tab-based claim for "${game.title}"`);
          } else {
            const platformId = 'gog';
            const platformInstance = registry.get(platformId);
            if (platformInstance) {
              console.log(`[LootNova/Claim] Trying silent claim for "${game.title}"...`);
              const success = await platformInstance.claimGame(game);
              console.log(`[LootNova/Claim] Silent claim result for "${game.title}": ${success}`);
              if (success) {
                sendClaimNotification(game.title, game.platform);
                await this.addToHistory(game);
                console.log(`[LootNova/Claim] ✅ "${game.title}" claimed silently!`);
                return; // Skip opening any tabs!
              }
              console.log(`[LootNova/Claim] Silent claim failed, falling back to tab for "${game.title}"...`);
            }
          }
        }

        const tab = await browser.tabs.create({ url: game.link, active: false });
        if (!tab?.id) return;
        await this.waitForTabToLoad(tab.id);
        await browser.tabs.sendMessage(tab.id, { target: 'content', action: 'claimGames' });

        // Wait for the content script to confirm the claim is done,
        // with a generous safety timeout. Amazon SPA needs more time.
        const isAmazon  = game.platform === 'Amazon Gaming';
        const timeoutMs = isAmazon ? 30_000 : 15_000;

        await this.waitForContentResponse('claimComplete', timeoutMs, tab.id);

        // Close the tab so the user isn't flooded with open tabs
        try { await browser.tabs.remove(tab.id); } catch (_) {}

        sendClaimNotification(game.title, game.platform);

        // Save to claimed history
        await this.addToHistory(game);
      } catch (e) {
        logger.error(`Failed to claim "${game.title}"`, { platform: game.platform }, e as Error);
      }
    })));
  },

  async addToHistory(game: FreeGame) {
    try {
      const history: ClaimedGame[] = (await getStorageItem("claimedHistory")) ?? [];
      // Avoid duplicates
      const historySet = new Set(history.map(h => `${h.title}|${h.platform}`));
      if (historySet.has(`${game.title}|${game.platform}`)) return;

      // Fetch retail price silently — never blocks saving if it fails
      const retailPrice = await fetchRetailPrice(game.title).catch(() => null) ?? undefined;

      const entry: ClaimedGame = {
        title:     game.title,
        platform:  game.platform as unknown as Platforms,
        link:      game.link,
        img:       game.img,
        claimedAt: new Date().toISOString(),
        ...(retailPrice != null && { retailPrice }),
      };
      // Keep last 100 entries, newest first
      const updated = [entry, ...history].slice(0, 100);
      await setStorageItem("claimedHistory", updated);
      logger.info(`Saved "${game.title}" to history (price: $${retailPrice ?? 'N/A'})`, { platform: game.platform, action: 'history' });
    } catch (e) {
      logger.error('addToHistory failed', { action: 'history' }, e as Error);
    }
  },

  steamAddToCart(tabId: number, appId: number) {
    return browser.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      args: [appId],
      func: (appId: any) => {
        const fn =
            (window as any).addToCart ||
            (window as any).AddToCart ||
            (window as any).g_cartAddToCart ||
            (window as any).g_AddToCart;
        if (typeof fn === "function") {
          try { fn(appId); return true; }
          catch (e) { console.error("addToCart failed:", e); return false; }
        }
        const el = document.querySelector(`div.btn_addtocart a[href^="javascript:addToCart(${appId})"]`);
        if (el) {
          el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
          el.dispatchEvent(new MouseEvent("mouseup",   { bubbles: true, cancelable: true }));
          el.dispatchEvent(new MouseEvent("click",     { bubbles: true, cancelable: true }));
          return true;
        }
        console.warn("No addToCart function or button found for", appId);
        return false;
      },
    });
  },

  async openTabAndSendActionToContent(url: string, action: string) {
    const tab = await browser.tabs.create({ url, active: false });
    if (!tab || !tab.id) return;
    await this.waitForTabToLoad(tab.id);
    await browser.tabs.sendMessage(tab.id, { target: "content", action });
  },

  async handleMessage(request: MessageRequest, sender?: browser.runtime.MessageSender) {
    if (request.target !== "background") return;

    if (request.action === "claim") {
      await this.clearGamesList();
      await this.getFreeGamesList();
    } else if (request.action === "claimFreeGames") {
      if (request.data?.loggedIn === false) {
        // Content script tells us the user is logged out — notify immediately
        const platform: string = request.data?.platform ?? 'la plataforma';
        sendSessionExpiredNotification(platform);
        return;
      }
      const games: FreeGame[] = request.data.freeGames;
      await this.claimGames(games);
    } else if (request.action === "openRedeemPage") {
      // Opened when Amazon gives an external key (GOG, Xbox, Steam, etc.)
      const { redeemUrl, platform, code } = request.data ?? {};
      if (!redeemUrl) return;

      console.log(`[LootNova] Opening ${platform} redeem page for code: ${code}`);

      if (platform === 'GOG') {
        // GOG: open in background — our gog.content.ts will auto-fill and submit
        const gogTab = await browser.tabs.create({ url: redeemUrl, active: false });
        if (gogTab?.id) {
          await this.waitForTabToLoad(gogTab.id);
          // Wait up to 45s for the GOG content script to complete redemption
          await this.wait(45_000);
          try { await browser.tabs.remove(gogTab.id); } catch (_) {}
        }
      } else {
        // Xbox, Steam, etc: open in foreground — user may need to handle CAPTCHA
        await browser.tabs.create({ url: redeemUrl, active: true });
      }

    } else if (request.action === "steamAddToCart") {
      const appId  = Number(request.data?.appId ?? request.data?.appid);
      const tabId  = sender?.tab?.id;
      if (tabId != null && Number.isFinite(appId)) {
        return this.steamAddToCart(tabId, appId);
      }
      console.warn("Missing tabId or appId", { tabId, appId, sender });
    } else if (request.action === "updateFrequency" || request.action === "updateActive") {
      await this.initializeAlarms();
    } else if (request.action === "checkLoginStatus") {
      // Popup is open — refresh login states via cookies immediately
      await this.checkLoginStatuses();
    }
  },

  async checkLoginStatuses() {
    // Uses the new Strategy pattern to check all platform session statuses
    await orchestrator.checkAllLoginStatuses();
  },



  wait(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  },

  sendMessage(target: any, action: any) {
    browser.runtime.sendMessage({ target, action });
  },

  async waitForTabToLoad(tabId: number): Promise<void> {
    const deadline = Date.now() + TAB_LOAD_TIMEOUT_MS;
    return new Promise((resolve, reject) => {
      async function checkTab() {
        if (Date.now() > deadline) {
          return reject(new Error(`Tab ${tabId} load timeout (${TAB_LOAD_TIMEOUT_MS}ms)`));
        }
        try {
          const tab = await browser.tabs.get(tabId);
          if (!tab) return reject(new Error("tab not found"));
          if (tab.status === "complete") resolve();
          else setTimeout(checkTab, 200);
        } catch (error) {
          reject(error);
        }
      }
      void checkTab();
    });
  },

  async handleInstall(r: browser.runtime.InstalledDetails) {
    // Ensure defaults are set on first install so the background script
    // reads the same defaults as the popup UI (OnButton defaults active=true)
    if (r.reason === "install") {
      await setStorageItem("active", true);
      await setStorageItem("claimFrequency", ClaimFrequency.DAILY);
      await setStorageItem("steamCheck", true);
      await setStorageItem("epicCheck", true);
      await setStorageItem("amazonCheck", true);
      await setStorageItem("notificationsEnabled", true);
    }
    if (r.reason === "update") {
      // Also ensure active is set for users upgrading from older versions
      const existing = await getStorageItem("active");
      if (existing === null || existing === undefined) {
        await setStorageItem("active", true);
      }

      // One-time fix: purge falsely claimed Steam entries from history.
      // The old code had a bug where super.claimGame() returned true without
      // actually claiming, so Steam games were added to history incorrectly.
      const history: ClaimedGame[] = (await getStorageItem("claimedHistory")) ?? [];
      const cleaned = history.filter(h => h.platform !== Platforms.Steam && h.platform !== 'Steam');
      if (cleaned.length !== history.length) {
        await setStorageItem("claimedHistory", cleaned);
        console.log(`[LootNova] Cleaned ${history.length - cleaned.length} false Steam entries from history.`);
      }

      browser.action.setBadgeBackgroundColor({ color: "#f59e0b" });
      void this.setBadgeText("New");
    }
  },

  async getEpicGamesList(shouldClaim: boolean = true) {
    const response = await fetch(EPIC_API_URL);
    if (!response.ok) {
      logger.error("Failed to fetch Epic Games data", { platform: 'epic' }, new Error(response.statusText));
      return;
    }
    const rawData = await response.json();
    const parsed = EpicSearchResponseSchema.safeParse(rawData);
    
    if (!parsed.success) {
      logger.warn('Invalid Epic game data received', { platform: 'epic', errors: parsed.error.errors });
      return;
    }

    const data = parsed.data;
    const games: EpicElement[] = (data?.data?.Catalog?.searchStore?.elements as unknown as EpicElement[]) ?? [];

    const freeGames = games.filter((game) =>
        game.price?.totalPrice?.discountPrice === 0 &&
        (game.promotions?.promotionalOffers?.length ?? 0) > 0
    );
    const futureFreeGames = games.filter((game) =>
        game.promotions?.upcomingPromotionalOffers?.[0]?.promotionalOffers?.[0]?.discountSetting?.discountPercentage === 0
    );

    const currFreeGames: FreeGame[] = (await getStorageItem("epicGames")) || [];
    const currTitles = new Set(currFreeGames.map(g => g?.title));
    const newGames = freeGames.filter((game) => !currTitles.has(game?.title));

    if (newGames.length > 0) {
      const formattedNewGames = newGames.map(g => this.formatEpicFreeGame(g, false));
      await setStorageItem("epicGames", formattedNewGames);
      sendNewGamesNotification(newGames.length);
      if (shouldClaim) await this.claimGames(formattedNewGames);
    }
    if (futureFreeGames.length > 0) {
      const formattedFutureGames = futureFreeGames.map(g => this.formatEpicFreeGame(g, true));
      await setStorageItem("futureGames", formattedFutureGames);
    }
  },

  formatEpicFreeGame(game: EpicElement, future: boolean): FreeGame {
    const epicSlug =
        game.productSlug ||
        game.catalogNs?.mappings?.[0]?.pageSlug ||
        game.offerMappings?.[0]?.pageSlug ||
        "";
    const isEpicBundle = Array.isArray(game.categories) && game.categories.some((c) => c?.path === "bundles");
    const path  = isEpicBundle ? "bundle" : "p";
    const promo = (future
        ? game.promotions?.upcomingPromotionalOffers?.[0]?.promotionalOffers?.[0]
        : game.promotions?.promotionalOffers?.[0]?.promotionalOffers?.[0]) ?? {};
    return {
      title: sanitizeGameTitle(game.title ?? ""),
      platform: Platforms.Epic,
      link: sanitizeUrl(`https://www.epicgames.com/store/en-US/${path}/${epicSlug}`),
      img:
          game.keyImages?.find((img: EpicKeyImage) => img.type === "Thumbnail")?.url ||
          game.keyImages?.[0]?.url ||
          "/icon/128.png",
      description: game.description ?? "",
      startDate: new Date(promo.startDate ?? 0).toISOString(),
      endDate:   new Date(promo.endDate ?? 0).toISOString(),
      future,
    };
  },

  async getSteamGamesList(shouldClaim: boolean = true): Promise<boolean> {
    console.log('[LootNova/Steam] Fetching free games list...');
    const html = await fetch(STEAM_GAMES_URL).then(r => r.text());
    console.log(`[LootNova/Steam] Fetched HTML (${html.length} chars)`);
    const root = parse(html);
    const resolveUrl = (u: string) =>
        u ? new URL(u, 'https://store.steampowered.com').toString() : '';

    const container = root.querySelector('div#search_result_container');
    const freeGameNodes = container ? container.querySelectorAll('a.search_result_row') : [];
    console.log(`[LootNova/Steam] Found ${freeGameNodes.length} search result nodes`);
    if (freeGameNodes.length === 0) {
      console.log('[LootNova/Steam] No free games found on search page.');
      return false;
    }

    const gamesArr: FreeGame[] = [];
    for (const node of freeGameNodes) {
      const href  = node.getAttribute('href') ?? '';
      const rawTitle = node.querySelector('span.title')?.text?.trim() ?? '';
      const title = sanitizeGameTitle(rawTitle);
      const imgEl = node.querySelector('img');
      const imgRaw =
          imgEl?.getAttribute('src')?.trim() ||
          imgEl?.getAttribute('data-src')?.trim() ||
          imgEl?.getAttribute('data-lazy')?.trim() || '';

      if (href && title) {
        gamesArr.push({
          link: sanitizeUrl(resolveUrl(href)),
          img: imgRaw ? sanitizeUrl(resolveUrl(imgRaw)) : '',
          title,
          platform: Platforms.Steam,
        });
      }
    }

    console.log(`[LootNova/Steam] Parsed ${gamesArr.length} games:`, gamesArr.map(g => g.title));

    if (gamesArr.length === 0) return false;

    // Always update the detected games list
    await setStorageItem('steamGames', gamesArr);

    // Filter out games that were already successfully claimed (in history)
    const claimedHistory: Array<{ title?: string; platform?: string }> =
        (await getStorageItem("claimedHistory")) ?? [];
    const claimedTitles = new Set(
        claimedHistory
            .filter(h => h.platform === Platforms.Steam)
            .map(h => h.title)
    );
    console.log(`[LootNova/Steam] Already claimed Steam titles:`, [...claimedTitles]);
    const unclaimedGames = gamesArr.filter(game => !claimedTitles.has(game.title));

    console.log(`[LootNova/Steam] Unclaimed games: ${unclaimedGames.length}`, unclaimedGames.map(g => g.title));

    if (unclaimedGames.length === 0) {
      console.log('[LootNova/Steam] All games already claimed.');
      return false;
    }

    sendNewGamesNotification(unclaimedGames.length);
    if (shouldClaim) {
      console.log('[LootNova/Steam] Starting claim process...');
      await this.claimGames(unclaimedGames);
    }
    return true;
  },

  async clearGamesList() {
    await setStorageItem("epicGames", []);
    await setStorageItem("futureGames", []);
    await setStorageItem("steamGames", []);
    await setStorageItem("amazonGames", []);
    await setStorageItem("gogGames", []);
  },

  async setBadgeText(text: string) {
    await browser.action.setBadgeText({ text });
  },

  /**
   * Waits for a content script to send a message with the given action name.
   * Resolves when the message arrives, or after `timeoutMs` (whichever comes first).
   * This replaces blind `wait(N)` timers — the content script actively signals completion.
   */
  waitForContentResponse(actionName: string, timeoutMs: number, expectedTabId?: number): Promise<void> {
    return new Promise<void>((resolve) => {
      let settled = false;

      const onMessage = (msg: any, sender: browser.runtime.MessageSender) => {
        if (settled) return;

        // If a tabId was specified, ensure the message came from that exact tab
        if (expectedTabId !== undefined && sender?.tab?.id !== expectedTabId) {
            return;
        }

        if (msg?.action === actionName || msg?.target === 'background' && msg?.action === actionName) {
          settled = true;
          browser.runtime.onMessage.removeListener(onMessage);
          resolve();
        }
      };

      browser.runtime.onMessage.addListener(onMessage);

      // Safety timeout — never hang forever if the content script crashes
      setTimeout(() => {
        if (!settled) {
          settled = true;
          browser.runtime.onMessage.removeListener(onMessage);
          // Changed to debug log to avoid cluttering Chrome's error console for non-critical timeouts
          logger.debug(`waitForContentResponse('${actionName}') timed out after ${timeoutMs}ms`, { action: 'timeout' });
          resolve();
        }
      }, timeoutMs);
    });
  },
});
