/**
 * Badge data service — fetches OpenCritic scores and ProtonDB tiers for game cards.
 *
 * All results are cached in chrome.storage.local with a 24-hour TTL.
 * Cache keys: `local:badgeCache:{gameName}` and `local:badgeCache:proton:{steamAppId}`
 *
 * Failures are caught gracefully — the badge simply won't render, never blocking the card.
 */
import { storage } from '#imports';
import type { BadgeCacheEntry, OpenCriticGame, ProtonDbSummary } from '@/entrypoints/types/badgeData.ts';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ── Cache helpers ─────────────────────────────────────────────────────────────

function cacheKey(type: 'oc' | 'pdb', id: string): string {
    return `local:badgeCache:${type}:${id}`;
}

async function readCache(key: string): Promise<BadgeCacheEntry | null> {
    try {
        const entry = await storage.getItem<BadgeCacheEntry>(key);
        if (!entry) return null;
        const age = Date.now() - new Date(entry.cachedAt).getTime();
        return age < CACHE_TTL_MS ? entry : null; // expired
    } catch {
        return null;
    }
}

async function writeCache(key: string, entry: BadgeCacheEntry): Promise<void> {
    try {
        await storage.setItem(key, entry);
    } catch { /* ignore write errors */ }
}

// ── OpenCritic ────────────────────────────────────────────────────────────────

/**
 * Fetches the OpenCritic score for a game title.
 * Returns the score (0–100) or null if unavailable / API error.
 */
export async function fetchOpenCriticScore(gameName: string): Promise<number | null> {
    const key = cacheKey('oc', gameName.toLowerCase().replace(/\s+/g, '_'));
    const cached = await readCache(key);
    if (cached) return cached.opencritic?.score ?? null;

    try {
        const url = `https://api.opencritic.com/api/game/search?criteria=${encodeURIComponent(gameName)}`;
        const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!resp.ok) throw new Error(`OpenCritic HTTP ${resp.status}`);

        const results = (await resp.json()) as OpenCriticGame[];
        const score = results?.[0]?.score ?? null;

        await writeCache(key, {
            cachedAt: new Date().toISOString(),
            opencritic: { score },
        });
        return score;
    } catch {
        return null; // graceful fallback — badge won't show
    }
}

// ── ProtonDB ──────────────────────────────────────────────────────────────────

/**
 * Fetches the ProtonDB Steam Deck compatibility tier for a Steam App ID.
 * Returns the tier string or null if unavailable.
 */
export async function fetchProtonDbTier(steamAppId: string): Promise<ProtonDbSummary['tier'] | null> {
    if (!steamAppId) return null;

    const key = cacheKey('pdb', steamAppId);
    const cached = await readCache(key);
    if (cached) return cached.protondb?.tier ?? null;

    try {
        const url = `https://www.protondb.com/api/v1/reports/summaries/${steamAppId}.json`;
        const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!resp.ok) throw new Error(`ProtonDB HTTP ${resp.status}`);

        const data = (await resp.json()) as ProtonDbSummary;
        const tier = data?.tier ?? null;

        await writeCache(key, {
            cachedAt: new Date().toISOString(),
            protondb: { tier },
        });
        return tier;
    } catch {
        return null; // graceful fallback — badge won't show
    }
}
