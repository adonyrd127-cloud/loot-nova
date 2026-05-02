import GameCard from "@/entrypoints/components/GameCard.tsx";
import { FreeGame } from "@/entrypoints/types/freeGame.ts";

interface GamesListProps {
  games: FreeGame[];
  showDesc: boolean;
  emptyMessage?: string;
}

export function GamesList({ games, showDesc, emptyMessage }: GamesListProps) {
  if (games.length === 0) {
    return (
      <div className="ln-empty">
        <div className="ln-empty-icon">🎮</div>
        <div className="ln-empty-title">{emptyMessage || browser.i18n.getMessage("noGames")}</div>
        <div className="ln-empty-sub">{browser.i18n.getMessage("noGamesSub")}</div>
      </div>
    );
  }

  return (
    <div className="ln-games-list">
      {games.map((game, i) => (
        <GameCard game={game} showDesc={showDesc} key={i} />
      ))}
    </div>
  );
}

export default GamesList;