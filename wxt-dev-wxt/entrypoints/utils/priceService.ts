/**
 * priceService.ts — IsThereAnyDeal price lookup for the LootNova Savings Dashboard.
 *
 * API used: https://api.isthereanydeal.com  (free, no auth required for basic search)
 *
 * Endpoints:
 *   Search:  GET /games/search/v1?title={title}&results=5
 *   Prices:  POST /games/prices/v3?country=US&shops=61,35,16
 *            Body: ["itad-game-id"]
 *
 * Shops used: 61=Steam, 35=Epic, 16=GOG (covers all our platforms)
 *
 * Cache: stored in local:priceCache:{normalized_title} with 7-day TTL.
 * On any failure the function returns null — never blocks the claim flow.
 */

import { storage } from '#imports';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ItadSearchResult {
    id:    string;   // "itad-uuid"
    slug:  string;
    title: string;
}

interface ItadPriceOverview {
    id: string;
    deals: Array<{
        shop:      { id: number; name: string };
        price:     { amount: number; amountInt: number; currency: string };
        regular:   { amount: number; amountInt: number; currency: string };
        cut:       number;
        voucher:   string | null;
        storeLow:  { amount: number } | null;
    }>;
}

interface PriceCacheEntry {
    cachedAt: string;   // ISO timestamp
    price: number | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ITAD_BASE    = 'https://api.isthereanydeal.com';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;   // 7 days
const TIMEOUT_MS   = 6_000;

// ITAD shop IDs to check (Steam=61, Epic=35, GOG=16, Humble=37)
const SHOP_IDS = '61,35,16,37';

// ── Cache helpers ─────────────────────────────────────────────────────────────

function priceKey(title: string): string {
    const normalized = title.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 60);
    return `local:priceCache:${normalized}`;
}

async function readPriceCache(key: string): Promise<number | null | undefined> {
    try {
        const entry = await storage.getItem<PriceCacheEntry>(key);
        if (!entry) return undefined; // not cached
        const age = Date.now() - new Date(entry.cachedAt).getTime();
        if (age > CACHE_TTL_MS) return undefined; // expired
        return entry.price; // null means "looked up, not found"
    } catch {
        return undefined;
    }
}

async function writePriceCache(key: string, price: number | null): Promise<void> {
    try {
        await storage.setItem<PriceCacheEntry>(key, {
            cachedAt: new Date().toISOString(),
            price,
        });
    } catch { /* ignore */ }
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Fetches the regular (non-sale) retail price of a game in USD.
 *
 * Returns:
 *  - A number (USD price) if found
 *  - null  if the game was not found on ITAD or has no price data
 *  - null  on any network/parse error (graceful fallback)
 */
export async function fetchRetailPrice(gameTitle: string): Promise<number | null> {
    const key    = priceKey(gameTitle);
    const cached = await readPriceCache(key);

    // Cache hit (including negative cache — null means "not found")
    if (cached !== undefined) return cached;

    try {
        // ── Step 1: Search for the game ID ───────────────────────────────────
        const searchUrl = `${ITAD_BASE}/games/search/v1?title=${encodeURIComponent(gameTitle)}&results=5`;
        const searchResp = await fetch(searchUrl, {
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!searchResp.ok) throw new Error(`ITAD search HTTP ${searchResp.status}`);

        const searchResults = (await searchResp.json()) as ItadSearchResult[];
        if (!searchResults?.length) {
            await writePriceCache(key, null);
            return null;
        }

        // Pick the closest title match
        const gameId = findBestMatch(gameTitle, searchResults);
        if (!gameId) {
            await writePriceCache(key, null);
            return null;
        }

        // ── Step 2: Fetch prices for that game ────────────────────────────────
        const pricesUrl = `${ITAD_BASE}/games/prices/v3?country=US&shops=${SHOP_IDS}`;
        const pricesResp = await fetch(pricesUrl, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify([gameId]),
            signal:  AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!pricesResp.ok) throw new Error(`ITAD prices HTTP ${pricesResp.status}`);

        const pricesData = (await pricesResp.json()) as ItadPriceOverview[];
        const overview   = pricesData?.[0];
        if (!overview?.deals?.length) {
            await writePriceCache(key, null);
            return null;
        }

        // Use the highest regular price across all shops (most conservative estimate)
        const regularPrices = overview.deals
            .map(d => d.regular?.amount ?? 0)
            .filter(p => p > 0);

        if (!regularPrices.length) {
            await writePriceCache(key, null);
            return null;
        }

        const price = Math.max(...regularPrices);
        await writePriceCache(key, price);
        return price;

    } catch (err) {
        console.warn('[LootNova/ITAD] Price lookup failed for', gameTitle, ':', err);
        // Do NOT cache errors — retry on next claim
        return null;
    }
}

/**
 * Picks the ITAD search result whose title most closely matches the query.
 * Uses a simple normalized-contains check, then falls back to the first result.
 */
function findBestMatch(query: string, results: ItadSearchResult[]): string | null {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const q = normalize(query);

    // Exact normalized match
    const exact = results.find(r => normalize(r.title) === q);
    if (exact) return exact.id;

    // Contains match
    const contains = results.find(r => normalize(r.title).includes(q) || q.includes(normalize(r.title)));
    if (contains) return contains.id;

    // Fall back to first result (ITAD already ranks by relevance)
    return results[0]?.id ?? null;
}

/**
 * Computes the total savings from a list of claimed games.
 * Skips entries without a price.
 */
export function computeTotalSavings(history: Array<{ retailPrice?: number }>): number {
    return history.reduce((sum, g) => sum + (g.retailPrice ?? 0), 0);
}

/**
 * Formats a USD price for display.
 * e.g.  19.99 → "$19.99"   0.99 → "$0.99"
 */
export function formatUSD(amount: number): string {
    return new Intl.NumberFormat('en-US', {
        style:    'currency',
        currency: 'USD',
        maximumFractionDigits: 2,
    }).format(amount);
}
