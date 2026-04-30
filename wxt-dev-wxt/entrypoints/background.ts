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
  async main() {
    browser.runtime.onStartup.addListener(async () => {
      await this.handleStartup();
    });

    browser.runtime.onMessage.addListener((request: MessageRequest, sender: browser.runtime.MessageSender) =>
        this.handleMessage(request, sender)
    );

    browser.runtime.onInstalled.addListener((r: browser.runtime.InstalledDetails) => this.handleInstall(r));

    browser.alarms.onAlarm.addListener((alarm: browser.alarms.Alarm) => {
      if (alarm.name === ALARM_NAME) {
        void this.handleAlarmTriggered();
      }
      if (alarm.name === SESSION_ALARM_NAME) {
        void this.silentSessionCheck();
      }
    });

    void browser.action.setBadgeBackgroundColor({ color: "#8b5cf6" }); // violet — LootNova brand color
    await this.initializeAlarms();
    // Register the 12-hour session check alarm once (idempotent)
    await this.initializeSessionAlarm();
  },

  async handleStartup() {
    // Check login status immediately so the popup shows accurate indicators
    void this.checkLoginStatuses();
    // Run a silent session check on startup too
    void this.silentSessionCheck();
    const result = await getStorageItems(["active", "claimFrequency"]);
    if (!result?.active) return;
    const frequency = result.claimFrequency || ClaimFrequency.DAILY;
    await this.checkAndClaimIfDue(frequency);
  },

  async handleAlarmTriggered() {
    const result = await getStorageItems(["active", "claimFrequency"]);
    if (!result?.active) return;
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
      if (frequency === ClaimFrequency.DAILY || frequency === ClaimFrequency.BROWSER_START) {
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
    if (!result?.active) {
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
        url: 'https://auth.gog.com/userData.json',
        storageKey: 'gogLoggedIn',
      },
      {
        name: 'Epic',
        url: 'https://www.epicgames.com/account/v2/profile/ajaxGet',
        storageKey: 'epicLoggedIn',
      },
      {
        name: 'Amazon',
        url: 'https://gaming.amazon.com/player/a/profile',
        storageKey: 'amazonLoggedIn',
        // Amazon may redirect (200 with login page) instead of proper 401
        isLoggedIn: (body: unknown) => {
          if (typeof body !== 'object' || body === null) return false;
          const b = body as Record<string, unknown>;
          return !!(b.playerId || b.userId || b.customerId);
        },
      },
    ];

    for (const platform of platforms) {
      try {
        const prevLoggedIn = await getStorageItem(platform.storageKey);
        // Only alert if we knew the user was logged in before
        if (prevLoggedIn !== true) continue;

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
    }
  },

  async getFreeGamesList() {
    const { steamCheck, epicCheck, amazonCheck } = await getStorageItems(["steamCheck", "epicCheck", "amazonCheck"]);

    try {
      await this.getEpicGamesList(epicCheck);
    } catch (e) {
      console.error("getEpicGamesList failed:", e);
      if (epicCheck) await this.openTabAndSendActionToContent(EPIC_GAMES_URL, "getFreeGames");
    }

    try {
      await this.getSteamGamesList(steamCheck);
    } catch (e) {
      console.error("getSteamGamesList failed:", e);
      if (steamCheck) await this.openTabAndSendActionToContent(STEAM_GAMES_URL, "getFreeGames");
    }

    // Amazon has no public API — always use content script.
    // We wait for the content script to finish scraping and send back a
    // 'claimFreeGames' message, with a safety timeout of 45s.
    try {
      if (amazonCheck) {
        // Always clear stale data before fetching fresh games
        await setStorageItem('amazonGames', []);
        const tab = await browser.tabs.create({ url: AMAZON_GAMES_URL, active: false });
        if (tab?.id) {
          await this.waitForTabToLoad(tab.id);
          await browser.tabs.sendMessage(tab.id, { target: 'content', action: 'getFreeGames' });
          // Wait for content script to respond OR safety timeout
          await this.waitForContentResponse('claimFreeGames', 45_000);
          try { await browser.tabs.remove(tab.id); } catch (_) {}
        }
      }
    } catch (e) {
      console.error("Amazon getFreeGames failed:", e);
    }
  },

  async claimGames(games: FreeGame[]) {
    void this.setBadgeText(games.length.toString());
    for (const game of games) {
      try {
        const tab = await browser.tabs.create({ url: game.link, active: false });
        if (!tab?.id) continue;
        await this.waitForTabToLoad(tab.id);
        await browser.tabs.sendMessage(tab.id, { target: 'content', action: 'claimGames' });

        // Wait for the content script to confirm the claim is done,
        // with a generous safety timeout. Amazon SPA needs more time.
        const isAmazon  = game.platform === 'Amazon Gaming';
        const timeoutMs = isAmazon ? 30_000 : 15_000;

        await this.waitForContentResponse('claimComplete', timeoutMs);

        // Close the tab so the user isn't flooded with open tabs
        try { await browser.tabs.remove(tab.id); } catch (_) {}

        sendClaimNotification(game.title, game.platform);

        // Save to claimed history
        await this.addToHistory(game);
      } catch (e) {
        console.error(`Failed to claim "${game.title}":`, e);
      }
    }
  },

  async addToHistory(game: FreeGame) {
    try {
      const history: ClaimedGame[] = (await getStorageItem("claimedHistory")) ?? [];
      // Avoid duplicates
      const alreadySaved = history.some(h => h.title === game.title && h.platform === game.platform);
      if (alreadySaved) return;

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
      console.log(`[LootNova] Saved "${game.title}" to history (price: $${retailPrice ?? 'N/A'})`);
    } catch (e) {
      console.error("addToHistory failed:", e);
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

  /**
   * Checks login status for Steam, Epic, and Amazon.
   *
   * Strategy (in order):
   *  1. Find an already-open tab for the platform and read the DOM via executeScript
   *     — same logic the content scripts use, so it's always accurate.
   *  2. Fall back to browser.cookies.getAll() searching for known session cookies.
   *  3. Leave null (Unknown) only if truly undetectable.
   */
  async checkLoginStatuses() {
    try {
      // ── Steam ─────────────────────────────────────────────────────────────
      let steamLoggedIn: boolean | null = null;

      const steamTabs = await browser.tabs.query({ url: "https://store.steampowered.com/*" }).catch(() => []);
      if (steamTabs.length > 0 && steamTabs[0].id) {
        try {
          const results = await browser.scripting.executeScript({
            target: { tabId: steamTabs[0].id },
            func: () => !!document.querySelector("#account_pulldown"),
          });
          if (results?.[0]?.result !== undefined) {
            steamLoggedIn = results[0].result as boolean;
          }
        } catch (_) {}
      }

      if (steamLoggedIn === null) {
        // Cookie fallback — steamLoginSecure is set on .steampowered.com
        const cookies = await browser.cookies.getAll({ name: "steamLoginSecure" }).catch(() => []);
        if (cookies.length > 0) steamLoggedIn = true;
      }

      if (steamLoggedIn === null) {
        // Fetch fallback — Steam's userdata endpoint returns { logoff: 0 } when logged in
        try {
          const resp = await fetch("https://store.steampowered.com/dynamicstore/userdata/?t=0", {
            credentials: "include",
          });
          if (resp.ok) {
            const json = await resp.json();
            // rgWishlist only exists when logged in; logoff:0 means session is active
            steamLoggedIn = Array.isArray(json?.rgWishlist) && json.logoff === 0;
          }
        } catch (_) {}
      }

      // ── Save & compare Steam login state ────────────────────────────────
      if (steamLoggedIn !== null) {
        const prevSteam = await getStorageItem("steamLoggedIn");
        if (prevSteam === true && steamLoggedIn === false) {
          sendSessionExpiredNotification('Steam');
        }
        await setStorageItem("steamLoggedIn", steamLoggedIn);
      }

      // ── Epic Games ────────────────────────────────────────────────────────
      let epicLoggedIn: boolean | null = null;

      const epicTabs = await browser.tabs.query({ url: "https://store.epicgames.com/*" }).catch(() => []);
      if (epicTabs.length === 0) {
        // Also check www.epicgames.com (account pages, etc.)
        const epicTabs2 = await browser.tabs.query({ url: "https://www.epicgames.com/*" }).catch(() => []);
        epicTabs.push(...epicTabs2);
      }

      if (epicTabs.length > 0 && epicTabs[0].id) {
        try {
          const results = await browser.scripting.executeScript({
            target: { tabId: epicTabs[0].id },
            func: () => {
              const nav = document.querySelector("egs-navigation") as HTMLElement | null;
              if (nav) return nav.getAttribute("isloggedin") === "true";
              // Fallback: look for account/avatar element rendered only when logged in
              return !!(
                document.querySelector('[data-testid="account-button"]') ||
                document.querySelector("egs-user-widget")
              );
            },
          });
          if (results?.[0]?.result !== undefined) {
            epicLoggedIn = results[0].result as boolean;
          }
        } catch (_) {}
      }

      if (epicLoggedIn === null) {
        // Cookie fallback — Epic Bearer token
        const cookies = await browser.cookies.getAll({ name: "EPIC_BEARER_TOKEN" }).catch(() => []);
        if (cookies.length > 0) epicLoggedIn = true;
      }

      if (epicLoggedIn === null) {
        // Fetch fallback — Epic's account API returns 401 when not logged in
        try {
          const resp = await fetch("https://www.epicgames.com/account/v2/ajaxCheckLogin", {
            credentials: "include",
          });
          // 200 = logged in, 401/403 = not logged in
          epicLoggedIn = resp.status === 200;
        } catch (_) {}
      }

      // ── Save & compare Epic login state ──────────────────────────────────
      if (epicLoggedIn !== null) {
        const prevEpic = await getStorageItem("epicLoggedIn");
        if (prevEpic === true && epicLoggedIn === false) {
          sendSessionExpiredNotification('Epic');
        }
        await setStorageItem("epicLoggedIn", epicLoggedIn);
      }


      // ── Amazon Gaming ─────────────────────────────────────────────────────
      let amazonLoggedIn: boolean | null = null;

      const amazonTabs = await browser.tabs.query({ url: "https://luna.amazon.com/*" }).catch(() => []);
      if (amazonTabs.length === 0) {
        const amazonTabs2 = await browser.tabs.query({ url: "https://gaming.amazon.com/*" }).catch(() => []);
        amazonTabs.push(...amazonTabs2);
      }

      if (amazonTabs.length > 0 && amazonTabs[0].id) {
        try {
          const results = await browser.scripting.executeScript({
            target: { tabId: amazonTabs[0].id },
            func: () => {
              // Amazon Gaming is logged in when the sign-in button is absent
              const signInBtn = document.querySelector('[data-a-target="sign-in-button"]');
              return !signInBtn;
            },
          });
          if (results?.[0]?.result !== undefined) {
            amazonLoggedIn = results[0].result as boolean;
          }
        } catch (_) {}
      }

      if (amazonLoggedIn === null) {
        // Cookie fallback — check multiple known Amazon session cookies
        const AMAZON_COOKIE_NAMES = ["lwa-session-cookie", "session-id", "x-main", "ubid-main"];
        for (const name of AMAZON_COOKIE_NAMES) {
          const cookies = await browser.cookies.getAll({ name }).catch(() => []);
          if (cookies.length > 0) { amazonLoggedIn = true; break; }
        }
      }

      // ── Save & compare Amazon login state ────────────────────────────────
      if (amazonLoggedIn !== null) {
        const prevAmazon = await getStorageItem("amazonLoggedIn");
        if (prevAmazon === true && amazonLoggedIn === false) {
          sendSessionExpiredNotification('Amazon');
        }
        await setStorageItem("amazonLoggedIn", amazonLoggedIn);
      }

      console.log("[LootNova] Login status refreshed:", { steamLoggedIn, epicLoggedIn, amazonLoggedIn });
    } catch (e) {
      console.error("[LootNova] checkLoginStatuses failed:", e);
    }
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

  handleInstall(r: browser.runtime.InstalledDetails) {
    if (r.reason === "update") {
      browser.action.setBadgeBackgroundColor({ color: "#f59e0b" });
      void this.setBadgeText("New");
    }
  },

  async getEpicGamesList(shouldClaim: boolean = true) {
    const response = await fetch(EPIC_API_URL);
    if (!response.ok) {
      console.error("Failed to fetch Epic Games data:", response.statusText);
      return;
    }
    const data = (await response.json()) as EpicSearchResponse;
    const games: EpicElement[] = data?.data?.Catalog?.searchStore?.elements ?? [];

    const freeGames = games.filter((game) =>
        game.price?.totalPrice?.discountPrice === 0 &&
        (game.promotions?.promotionalOffers?.length ?? 0) > 0
    );
    const futureFreeGames = games.filter((game) =>
        game.promotions?.upcomingPromotionalOffers?.[0]?.promotionalOffers?.[0]?.discountSetting?.discountPercentage === 0
    );

    const currFreeGames: FreeGame[] = (await getStorageItem("epicGames")) || [];
    const newGames = freeGames.filter((game) =>
        !currFreeGames.some((g) => g?.title === game?.title)
    );

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
      title: game.title ?? "",
      platform: Platforms.Epic,
      link: `https://www.epicgames.com/store/en-US/${path}/${epicSlug}`,
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

  async getSteamGamesList(shouldClaim: boolean = true) {
    const html = await fetch(STEAM_GAMES_URL).then(r => r.text());
    const root = parse(html);
    const resolveUrl = (u: string) =>
        u ? new URL(u, 'https://store.steampowered.com').toString() : '';

    const container = root.querySelector('div#search_result_container');
    const freeGameNodes = container ? container.querySelectorAll('a.search_result_row') : [];
    if (freeGameNodes.length === 0) return;

    const gamesArr: FreeGame[] = [];
    for (const node of freeGameNodes) {
      const href  = node.getAttribute('href') ?? '';
      const title = node.querySelector('span.title')?.text?.trim() ?? '';
      const imgEl = node.querySelector('img');
      const imgRaw =
          imgEl?.getAttribute('src')?.trim() ||
          imgEl?.getAttribute('data-src')?.trim() ||
          imgEl?.getAttribute('data-lazy')?.trim() || '';

      if (href && title) {
        gamesArr.push({
          link: resolveUrl(href),
          img: imgRaw ? resolveUrl(imgRaw) : '',
          title,
          platform: Platforms.Steam,
        });
      }
    }

    const currFreeGames: FreeGame[] = (await getStorageItem("steamGames")) || [];
    const newGames: FreeGame[] = gamesArr.filter(game =>
        !currFreeGames.some(g => g?.title === game?.title)
    );
    if (newGames.length === 0) return;
    await setStorageItem('steamGames', newGames);
    sendNewGamesNotification(newGames.length);
    if (shouldClaim) await this.claimGames(newGames);
  },

  async clearGamesList() {
    await setStorageItem("epicGames", []);
    await setStorageItem("futureGames", []);
    await setStorageItem("steamGames", []);
    await setStorageItem("amazonGames", []);
  },

  async setBadgeText(text: string) {
    await browser.action.setBadgeText({ text });
  },

  /**
   * Waits for a content script to send a message with the given action name.
   * Resolves when the message arrives, or after `timeoutMs` (whichever comes first).
   * This replaces blind `wait(N)` timers — the content script actively signals completion.
   */
  waitForContentResponse(actionName: string, timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve) => {
      let settled = false;

      const onMessage = (msg: any) => {
        if (settled) return;
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
          console.warn(`[LootNova] waitForContentResponse('${actionName}') timed out after ${timeoutMs}ms`);
          resolve();
        }
      }, timeoutMs);
    });
  },
});
