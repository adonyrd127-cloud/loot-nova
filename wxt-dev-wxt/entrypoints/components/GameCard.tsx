import {FreeGame} from "@/entrypoints/types/freeGame.ts";
import {Platforms} from "@/entrypoints/enums/platforms.ts";

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

function GameCard({game, showDesc}: {game: FreeGame, showDesc: boolean}) {
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