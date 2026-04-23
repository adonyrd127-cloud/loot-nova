import { useState, useEffect } from 'react';
import { FreeGame } from "@/entrypoints/types/freeGame.ts";
import { Platforms } from "@/entrypoints/enums/platforms.ts";
import { fetchOpenCriticScore, fetchProtonDbTier } from "@/entrypoints/utils/badgeService.ts";
import type { ProtonDbSummary } from "@/entrypoints/types/badgeData.ts";

/** Maps each platform to a brand color for the badge */
const PLATFORM_COLORS: Record<string, string> = {
    [Platforms.Steam]:  "#1b9cde",
    [Platforms.Epic]:   "#313131",
    [Platforms.Amazon]: "#ff9900",
};

const PLATFORM_ICONS: Record<string, string> = {
    [Platforms.Steam]:  "🎮",
    [Platforms.Epic]:   "🟣",
    [Platforms.Amazon]: "📦",
};

/**
 * Returns a human-readable countdown string and urgency level for an expiry date.
 * Returns null if the game has no end date or is in the past.
 */
function getCountdown(endDate?: string): { label: string; urgency: "low" | "medium" | "high" } | null {
    if (!endDate) return null;
    const end = new Date(endDate).getTime();
    const now = Date.now();
    const diff = end - now;
    if (diff <= 0) return null;

    const days  = Math.floor(diff / 86_400_000);
    const hours = Math.floor((diff % 86_400_000) / 3_600_000);
    const mins  = Math.floor((diff % 3_600_000)  / 60_000);

    let label: string;
    let urgency: "low" | "medium" | "high";

    if (days >= 3) {
        label   = `${days}d left`;
        urgency = "low";
    } else if (days >= 1) {
        label   = `${days}d ${hours}h left`;
        urgency = "medium";
    } else if (hours >= 1) {
        label   = `${hours}h ${mins}m left`;
        urgency = "high";
    } else {
        label   = `${mins}m left`;
        urgency = "high";
    }

    return { label, urgency };
}

const URGENCY_STYLES: Record<string, React.CSSProperties> = {
    low:    { color: "#10b981", borderColor: "rgba(16,185,129,0.35)",  background: "rgba(16,185,129,0.08)"  },
    medium: { color: "#f59e0b", borderColor: "rgba(245,158,11,0.35)", background: "rgba(245,158,11,0.08)" },
    high:   { color: "#ef4444", borderColor: "rgba(239,68,68,0.35)",  background: "rgba(239,68,68,0.08)"  },
};

// ── OpenCritic badge ──────────────────────────────────────────────────────────

function openCriticColor(score: number): string {
    if (score >= 80) return "#10b981"; // green
    if (score >= 60) return "#f59e0b"; // yellow
    return "#ef4444";                  // red
}

function OpenCriticBadge({ gameName }: { gameName: string }) {
    const [score, setScore] = useState<number | null | undefined>(undefined);

    useEffect(() => {
        let cancelled = false;
        fetchOpenCriticScore(gameName).then(s => { if (!cancelled) setScore(s); });
        return () => { cancelled = true; };
    }, [gameName]);

    if (score === undefined || score === null) return null;

    const color = openCriticColor(score);
    return (
        <span
            className="countdown-badge"
            title={browser.i18n.getMessage('badge_opencritic')}
            style={{ color, borderColor: color + '55', background: color + '18', fontVariantNumeric: 'tabular-nums' }}
        >
            ⭐ {score}
        </span>
    );
}

// ── ProtonDB badge ────────────────────────────────────────────────────────────

const PROTON_TIER_STYLES: Record<string, React.CSSProperties> = {
    platinum: { color: "#e5e7eb", borderColor: "rgba(229,231,235,0.5)", background: "rgba(229,231,235,0.1)" },
    gold:     { color: "#fbbf24", borderColor: "rgba(251,191,36,0.5)",  background: "rgba(251,191,36,0.1)"  },
    silver:   { color: "#94a3b8", borderColor: "rgba(148,163,184,0.5)", background: "rgba(148,163,184,0.1)" },
    bronze:   { color: "#b45309", borderColor: "rgba(180,83,9,0.5)",    background: "rgba(180,83,9,0.1)"    },
    borked:   { color: "#ef4444", borderColor: "rgba(239,68,68,0.5)",   background: "rgba(239,68,68,0.1)"   },
    pending:  { color: "#6b7280", borderColor: "rgba(107,114,128,0.5)", background: "rgba(107,114,128,0.1)" },
};

const PROTON_TIER_ICONS: Record<string, string> = {
    platinum: "🏆",
    gold:     "🥇",
    silver:   "🥈",
    bronze:   "🥉",
    borked:   "💀",
    pending:  "⏳",
};

const PROTON_I18N_KEYS: Record<string, string> = {
    platinum: 'badge_steam_deck_platinum',
    gold:     'badge_steam_deck_gold',
    silver:   'badge_steam_deck_silver',
    borked:   'badge_steam_deck_borked',
};

/** Extracts a Steam App ID from a Steam store URL */
function extractSteamAppId(link: string): string | null {
    const m = link.match(/\/app\/(\d+)/);
    return m ? m[1] : null;
}

function ProtonDbBadge({ link }: { link: string }) {
    const appId = extractSteamAppId(link);
    const [tier, setTier] = useState<ProtonDbSummary['tier'] | null | undefined>(undefined);

    useEffect(() => {
        if (!appId) return;
        let cancelled = false;
        fetchProtonDbTier(appId).then(t => { if (!cancelled) setTier(t); });
        return () => { cancelled = true; };
    }, [appId]);

    if (!appId || tier === undefined || tier === null || tier === 'pending') return null;
    const label = PROTON_I18N_KEYS[tier] ? browser.i18n.getMessage(PROTON_I18N_KEYS[tier]) : tier;

    return (
        <span
            className="countdown-badge"
            title={label}
            style={PROTON_TIER_STYLES[tier] ?? PROTON_TIER_STYLES.pending}
        >
            {PROTON_TIER_ICONS[tier] ?? "🎮"} {label}
        </span>
    );
}

// ── GameCard ──────────────────────────────────────────────────────────────────

function GameCard({ game, showDesc }: { game: FreeGame; showDesc: boolean }) {
    const color     = PLATFORM_COLORS[game.platform] ?? "#555";
    const icon      = PLATFORM_ICONS[game.platform]  ?? "🎮";
    const countdown = game.future ? null : getCountdown(game.endDate);

    return (
        <div className={`card${game.future ? " future" : ""}`}>
            <a href={game.link} target="_blank" rel="noopener noreferrer">
                {game.img && <img src={game.img} alt={game.title} loading="lazy"/>}
                <div className="card-info">
                    <p className="game-title">{game.title}</p>
                    <div className="card-badges">
                        <span
                            className="platform-badge"
                            style={{ backgroundColor: color + "22", border: `1px solid ${color}55`, color }}
                        >
                            {icon} {game.platform}
                        </span>
                        {countdown && (
                            <span
                                className="countdown-badge"
                                style={URGENCY_STYLES[countdown.urgency]}
                            >
                                ⏳ {countdown.label}
                            </span>
                        )}
                        {game.future && (
                            <span className="countdown-badge" style={{ color: "#8b5cf6", borderColor: "rgba(139,92,246,0.35)", background: "rgba(139,92,246,0.08)" }}>
                                🔜 Coming soon
                            </span>
                        )}
                        {/* Dynamic score badges — lazy loaded, graceful fallback */}
                        {!game.future && <OpenCriticBadge gameName={game.title} />}
                        {!game.future && game.platform === Platforms.Steam && <ProtonDbBadge link={game.link} />}
                    </div>
                    {(game.description && showDesc) && (
                        <p className="game-description">{game.description}</p>
                    )}
                    <div className="game-dates">
                        {game.startDate && (
                            <span className="game-date date-start">
                                From: {new Date(game.startDate).toLocaleDateString()}
                            </span>
                        )}
                        {game.endDate && (
                            <span className="game-date date-end">
                                Until: {new Date(game.endDate).toLocaleDateString()}
                            </span>
                        )}
                    </div>
                </div>
            </a>
        </div>
    );
}

export default GameCard;