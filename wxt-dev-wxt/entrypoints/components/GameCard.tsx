import { useState, useEffect } from 'react';
import { FreeGame } from "@/entrypoints/types/freeGame.ts";
import { Platforms } from "@/entrypoints/enums/platforms.ts";
import { fetchOpenCriticScore, fetchProtonDbTier } from "@/entrypoints/utils/badgeService.ts";

const PLATFORM_TAG: Record<string, { label: string; cls: string }> = {
  [Platforms.Epic]:   { label: 'Epic', cls: 'ln-tag-purple' },
  [Platforms.Amazon]: { label: 'Prime', cls: 'ln-tag-amber' },
  [Platforms.Steam]:  { label: 'Steam', cls: 'ln-tag-cyan' },
};

function extractSteamAppId(link: string): string | null {
  const m = link.match(/\/app\/(\d+)/);
  return m ? m[1] : null;
}

function getCountdown(endDate?: string) {
  if (!endDate) return null;
  const diff = new Date(endDate).getTime() - Date.now();
  if (diff <= 0) return null;
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  if (days > 0) return `⏱ ${days}d ${hours}h`;
  return `⏱ ${hours}h`;
}

function GameCard({ game, showDesc }: { game: FreeGame; showDesc: boolean }) {
  const tag = PLATFORM_TAG[game.platform] ?? { label: game.platform, cls: 'ln-tag-cyan' };
  const countdown = game.future ? null : getCountdown(game.endDate);

  const [ocScore, setOcScore] = useState<number | null>(null);
  const [protonTier, setProtonTier] = useState<string | null>(null);

  useEffect(() => {
    if (!game.future) {
      fetchOpenCriticScore(game.title).then(s => s && setOcScore(s));
      if (game.platform === Platforms.Steam) {
        const appId = extractSteamAppId(game.link);
        if (appId) fetchProtonDbTier(appId).then(t => t && setProtonTier(t));
      }
    }
  }, [game.title, game.link, game.platform, game.future]);

  return (
    <a href={game.link} target="_blank" rel="noopener noreferrer" className={`ln-game-card ${game.future ? 'future' : ''}`}>
      {/* Left accent */}
      <div className="ln-card-accent" />

      {/* Cover */}
      <div className="ln-card-cover">
        {game.img ? (
          <img src={game.img} alt={game.title} loading="lazy" />
        ) : (
          <span className="ln-card-emoji">🎮</span>
        )}
        {countdown && (
          <div className="ln-card-timer">
            <span>{countdown}</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="ln-card-body">
        <div className="ln-card-title">{game.title}</div>
        <div className="ln-card-tags">
          <span className={`ln-tag ${tag.cls}`}>{tag.label}</span>
          {game.future && <span className="ln-tag ln-tag-purple">🔜 Próx.</span>}
        </div>
        {showDesc && game.description && (
          <p className="ln-card-desc">{game.description}</p>
        )}
        <div className="ln-card-badges">
          {ocScore !== null && (
            <span className="ln-badge ln-badge-green">⭐ {ocScore}</span>
          )}
          {protonTier && (
            <span className="ln-badge ln-badge-cyan">🎮 {protonTier.charAt(0).toUpperCase() + protonTier.slice(1)}</span>
          )}
        </div>
      </div>
    </a>
  );
}

export default GameCard;