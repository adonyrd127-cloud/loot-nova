import { useState, useEffect } from 'react';
import { FreeGame } from "@/entrypoints/types/freeGame.ts";
import { Platforms } from "@/entrypoints/enums/platforms.ts";
import { fetchOpenCriticScore, fetchProtonDbTier } from "@/entrypoints/utils/badgeService.ts";
import { IconGamepad, IconClock, IconStar } from './icons/Icons';

const PLATFORM_TAG: Record<string, { label: string; cls: string }> = {
  [Platforms.Epic]:   { label: 'Epic Games', cls: 'ln-badge-epic' },
  [Platforms.Amazon]: { label: 'Prime Gaming', cls: 'ln-badge-amazon' },
  [Platforms.Steam]:  { label: 'Steam', cls: 'ln-badge-steam' },
  [Platforms.Gog]:    { label: 'GOG', cls: 'ln-badge-gog' },
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
  const minutes = Math.floor((diff % 3600000) / 60000);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function GameCard({ game, showDesc }: { game: FreeGame; showDesc: boolean }) {
  const tag = PLATFORM_TAG[game.platform] ?? { label: game.platform, cls: 'ln-badge-steam' };
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
    <a href={game.link} target="_blank" rel="noopener noreferrer" className="ln-game-card">
      {/* Cover image or fallback */}
      {game.img ? (
        <img className="ln-game-img" src={game.img} alt={game.title} loading="lazy" />
      ) : (
        <div className="ln-game-img" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <IconGamepad size={24} color="var(--ln-text-muted)" />
        </div>
      )}

      {/* Body Info */}
      <div className="ln-game-info">
        <div className="ln-game-title">{game.title}</div>
        
        {showDesc && game.description && (
          <div className="ln-game-desc">{game.description}</div>
        )}

        <div className="ln-game-meta">
          <span className={`ln-badge ${tag.cls}`}>{tag.label}</span>
          
          {game.future && (
            <span className="ln-badge ln-badge-future">
              {browser.i18n.getMessage("upcoming_badge") || "Próximamente"}
            </span>
          )}

          {countdown && (
            <span className="ln-game-countdown">
              <IconClock size={11} />
              <span>{countdown}</span>
            </span>
          )}

          {ocScore !== null && (
            <span className="ln-badge ln-badge-score" title="OpenCritic Score">
              <IconStar size={10} />
              <span>{ocScore}</span>
            </span>
          )}

          {protonTier && (
            <span className="ln-badge ln-badge-proton" title="Steam Deck / Proton compatibility">
              <IconGamepad size={10} />
              <span>{protonTier.charAt(0).toUpperCase() + protonTier.slice(1)}</span>
            </span>
          )}
        </div>
      </div>
    </a>
  );
}

export default GameCard;