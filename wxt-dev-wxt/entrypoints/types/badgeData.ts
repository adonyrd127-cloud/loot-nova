/** Response shape from GET https://api.opencritic.com/api/game/search?criteria={name} */
export interface OpenCriticGame {
    id: number;
    name: string;
    /** Average score (0–100). May be absent if not yet reviewed. */
    score?: number;
    /** Percentage of critics who recommend it */
    percentRecommended?: number;
    /** Number of reviews */
    numReviews?: number;
}

/** Response shape from GET https://www.protondb.com/api/v1/reports/summaries/{appId}.json */
export interface ProtonDbSummary {
    /** "platinum" | "gold" | "silver" | "bronze" | "borked" | "pending" */
    tier: 'platinum' | 'gold' | 'silver' | 'bronze' | 'borked' | 'pending';
    /** Total number of reports */
    total: number;
    /** Percentage of positive reports */
    trendingTier?: string;
}

/** Cached badge entry stored in local:badgeCache */
export interface BadgeCacheEntry {
    /** ISO timestamp when this entry was cached */
    cachedAt: string;
    opencritic?: { score: number | null };
    protondb?: { tier: ProtonDbSummary['tier'] | null };
}
