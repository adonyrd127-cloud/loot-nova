import { useStorage } from "@/entrypoints/hooks/useStorage.ts";
import { setStorageItem } from "@/entrypoints/hooks/useStorage.ts";
import { ClaimedGame } from "@/entrypoints/types/claimedGame.ts";
import { Platforms } from "@/entrypoints/enums/platforms.ts";
import { computeTotalSavings, formatUSD } from "@/entrypoints/utils/priceService.ts";

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

function formatDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

// ── Savings summary banner ────────────────────────────────────────────────────

function SavingsBanner({ history }: { history: ClaimedGame[] }) {
    const total      = computeTotalSavings(history);
    const priced     = history.filter(g => (g.retailPrice ?? 0) > 0).length;
    const unpriced   = history.length - priced;

    if (total === 0) return null;

    return (
        <div className="savings-banner">
            <div className="savings-banner-main">
                <span className="savings-icon">💰</span>
                <div className="savings-text">
                    <span className="savings-amount">{formatUSD(total)}</span>
                    <span className="savings-label">
                        {browser.i18n.getMessage("stat_total_saved")}
                    </span>
                </div>
            </div>
            {unpriced > 0 && (
                <span className="savings-note">
                    +{unpriced} {browser.i18n.getMessage("savings_no_price")}
                </span>
            )}
        </div>
    );
}

// ── History ───────────────────────────────────────────────────────────────────

function History() {
    const [history, setHistory] = useStorage<ClaimedGame[]>("claimedHistory", []);

    async function clearHistory() {
        await setStorageItem("claimedHistory", []);
        setHistory([]);
    }

    if (!history || history.length === 0) {
        return (
            <div className="no-games">
                <span style={{ fontSize: "2.5rem", opacity: 0.3 }}>📜</span>
                <p>{browser.i18n.getMessage("historyEmpty")}</p>
                <p style={{ fontSize: "0.8rem" }}>{browser.i18n.getMessage("historyEmptySub")}</p>
            </div>
        );
    }

    return (
        <div style={{ width: "100%" }}>
            {/* Savings summary */}
            <SavingsBanner history={history} />

            {/* Header row */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <span style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.5)" }}>
                    {history.length} {browser.i18n.getMessage("historyCount")}
                </span>
                <button
                    id="clear-history-btn"
                    onClick={clearHistory}
                    style={{
                        background:   "rgba(239,68,68,0.08)",
                        border:       "1px solid rgba(239,68,68,0.25)",
                        color:        "rgba(239,68,68,0.7)",
                        borderRadius: "8px",
                        padding:      "4px 10px",
                        fontSize:     "11px",
                        cursor:       "pointer",
                        transition:   "all 0.2s",
                    }}
                >
                    🗑️ {browser.i18n.getMessage("historyClear")}
                </button>
            </div>

            {/* Game cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {history.map((game, i) => {
                    const color = PLATFORM_COLORS[game.platform] ?? "#555";
                    const icon  = PLATFORM_ICONS[game.platform]  ?? "🎮";
                    return (
                        <a
                            key={i}
                            href={game.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="history-card"
                        >
                            {game.img && (
                                <img
                                    src={game.img}
                                    alt={game.title}
                                    loading="lazy"
                                    className="history-card-img"
                                />
                            )}
                            <div className="history-card-info">
                                <p className="game-title">{game.title}</p>

                                <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                                    <span
                                        className="platform-badge"
                                        style={{ backgroundColor: color + "22", border: `1px solid ${color}55`, color }}
                                    >
                                        {icon} {game.platform}
                                    </span>

                                    {/* Retail price badge */}
                                    {(game.retailPrice ?? 0) > 0 && (
                                        <span className="savings-price-badge">
                                            💸 {formatUSD(game.retailPrice!)}
                                        </span>
                                    )}
                                </div>

                                <span className="history-date">
                                    ✅ {formatDate(game.claimedAt)}
                                </span>
                            </div>
                        </a>
                    );
                })}
            </div>
        </div>
    );
}

export default History;
