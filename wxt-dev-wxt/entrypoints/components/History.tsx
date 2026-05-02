import { useStorage, setStorageItem } from "@/entrypoints/hooks/useStorage.ts";
import { ClaimedGame } from "@/entrypoints/types/claimedGame.ts";
import { Platforms } from "@/entrypoints/enums/platforms.ts";
import { computeTotalSavings, formatUSD } from "@/entrypoints/utils/priceService.ts";

const PLATFORM_ICONS: Record<string, string> = {
  [Platforms.Steam]: '🔵', [Platforms.Epic]: '🟣', [Platforms.Amazon]: '🟠',
};

function groupByMonth(games: ClaimedGame[]) {
  const groups: Record<string, ClaimedGame[]> = {};
  games.forEach(g => {
    const d = new Date(g.claimedAt);
    const key = d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    if (!groups[key]) groups[key] = [];
    groups[key].push(g);
  });
  return groups;
}

function History() {
  const [history, setHistory] = useStorage<ClaimedGame[]>("claimedHistory", []);

  async function clearHistory() {
    await setStorageItem("claimedHistory", []);
    setHistory([]);
  }

  const sorted = [...(history ?? [])].sort((a, b) => new Date(b.claimedAt).getTime() - new Date(a.claimedAt).getTime());
  const totalSavings = computeTotalSavings(sorted);
  const grouped = groupByMonth(sorted);

  if (!history || history.length === 0) {
    return (
      <div className="ln-fade-in">
        <div className="ln-empty">
          <div className="ln-empty-icon">📜</div>
          <div className="ln-empty-title">{browser.i18n.getMessage("historyEmpty")}</div>
          <div className="ln-empty-sub">{browser.i18n.getMessage("historyEmptySub")}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="ln-fade-in">
      {/* Mini hero */}
      <div className="ln-hero-card">
        <div className="ln-hero-accent" />
        <div className="ln-hero-grid">
          <div className="ln-hero-stat">
            <div className="ln-hero-number">{sorted.length}</div>
            <div className="ln-hero-label">Total Reclamados</div>
          </div>
          <div className="ln-hero-divider" />
          <div className="ln-hero-stat">
            <div className="ln-hero-number">{formatUSD(totalSavings)}</div>
            <div className="ln-hero-label">Valor Total</div>
          </div>
        </div>
      </div>

      {/* Clear button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="ln-clear-btn" onClick={clearHistory}>
          🗑️ {browser.i18n.getMessage("historyClear")}
        </button>
      </div>

      {/* Grouped cards */}
      {Object.entries(grouped).map(([month, games]) => (
        <div key={month} className="ln-history-group">
          <div className="ln-section-header">
            <span>{month.charAt(0).toUpperCase() + month.slice(1)}</span>
            <span className="ln-section-line" />
          </div>
          <div className="ln-history-grid">
            {games.map((game, i) => (
              <a key={i} href={game.link} target="_blank" rel="noopener noreferrer" className="ln-history-tile">
                <div className="ln-history-cover">
                  {game.img ? <img src={game.img} alt={game.title} loading="lazy" /> : <span>{PLATFORM_ICONS[game.platform] ?? '🎮'}</span>}
                </div>
                <div className="ln-history-title">{game.title}</div>
                <div className="ln-history-date">
                  {new Date(game.claimedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                </div>
                {(game.retailPrice ?? 0) > 0 && (
                  <div className="ln-history-price">{formatUSD(game.retailPrice!)}</div>
                )}
              </a>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default History;
