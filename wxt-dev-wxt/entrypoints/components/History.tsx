import { useState } from 'react';
import { useStorage, setStorageItem } from "@/entrypoints/hooks/useStorage.ts";
import { ClaimedGame } from "@/entrypoints/types/claimedGame.ts";
import { computeTotalSavings, formatUSD } from "@/entrypoints/utils/priceService.ts";
import { ConfirmDialog } from './ConfirmDialog';
import { IconHistory, IconTrash, IconGamepad } from './icons/Icons';

export function History() {
  const [history, setHistory] = useStorage<ClaimedGame[]>("claimedHistory", []);
  const [showConfirm, setShowConfirm] = useState(false);

  const userLocale = browser.i18n.getUILanguage() || 'en-US';

  function groupByMonth(games: ClaimedGame[]) {
    const groups: Record<string, ClaimedGame[]> = {};
    games.forEach(g => {
      const d = new Date(g.claimedAt);
      const key = d.toLocaleDateString(userLocale, { month: 'long', year: 'numeric' });
      if (!groups[key]) groups[key] = [];
      groups[key].push(g);
    });
    return groups;
  }

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
          <IconHistory size={48} className="ln-empty-icon" />
          <div className="ln-empty-title">{browser.i18n.getMessage("historyEmpty")}</div>
          <div className="ln-empty-sub">{browser.i18n.getMessage("historyEmptySub")}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="ln-fade-in">
      {/* History Stats */}
      <div className="ln-history-stats">
        <div className="ln-history-stat">
          <div className="ln-history-stat-value">{sorted.length}</div>
          <div className="ln-history-stat-label">
            {browser.i18n.getMessage("history_total") || "Total Claimed"}
          </div>
        </div>
        <div className="ln-history-stat-divider" />
        <div className="ln-history-stat">
          <div className="ln-history-stat-value">{formatUSD(totalSavings)}</div>
          <div className="ln-history-stat-label">
            {browser.i18n.getMessage("history_value") || "Total Value"}
          </div>
        </div>
      </div>

      {/* Grouped history lists */}
      {Object.entries(grouped).map(([month, games]) => (
        <div key={month} className="ln-history-group">
          <div className="ln-history-month">
            {month.charAt(0).toUpperCase() + month.slice(1)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {games.map((game) => (
              <a 
                key={`${game.title}-${game.platform}`} 
                href={game.link} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="ln-history-item"
              >
                {game.img ? (
                  <img className="ln-history-thumb" src={game.img} alt={game.title} loading="lazy" />
                ) : (
                  <div className="ln-history-thumb" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <IconGamepad size={16} color="var(--ln-text-muted)" />
                  </div>
                )}
                <div className="ln-history-info">
                  <div className="ln-history-title">{game.title}</div>
                  <div className="ln-history-date">
                    {new Date(game.claimedAt).toLocaleDateString(userLocale, { day: 'numeric', month: 'short' })}
                  </div>
                </div>
                {(game.retailPrice ?? 0) > 0 && (
                  <div className="ln-history-price">{formatUSD(game.retailPrice!)}</div>
                )}
              </a>
            ))}
          </div>
        </div>
      ))}

      {/* Clear history button */}
      <button 
        className="ln-history-clear" 
        onClick={() => setShowConfirm(true)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <IconTrash size={12} />
        <span>{browser.i18n.getMessage("historyClear")}</span>
      </button>

      {/* Confirmation Dialog */}
      {showConfirm && (
        <ConfirmDialog
          title={browser.i18n.getMessage("confirm_clear_title") || "Clear History?"}
          message={browser.i18n.getMessage("confirm_clear_message") || "This will permanently delete all your claimed game history. This action cannot be undone."}
          onConfirm={clearHistory}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  );
}

export default History;
