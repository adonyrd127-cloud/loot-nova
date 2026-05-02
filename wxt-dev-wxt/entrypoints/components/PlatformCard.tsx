import { Platforms } from '@/entrypoints/enums/platforms';

interface PlatformCardProps {
  platform: string;
  name: string;
  connected: boolean;
  gamesAvailable: number;
  sessionExpired?: boolean;
  onClick?: () => void;
}

const CFG: Record<string, { emoji: string; cls: string }> = {
  [Platforms.Epic]:   { emoji: '🟣', cls: 'ln-plat-purple' },
  [Platforms.Amazon]: { emoji: '🟠', cls: 'ln-plat-amber' },
  [Platforms.Steam]:  { emoji: '🔵', cls: 'ln-plat-cyan' },
};

export function PlatformCard({ platform, name, connected, gamesAvailable, sessionExpired, onClick }: PlatformCardProps) {
  const cfg = CFG[platform] ?? { emoji: '⚪', cls: 'ln-plat-cyan' };

  return (
    <div
      onClick={onClick}
      className={`ln-platform-card ${sessionExpired ? 'expired' : ''}`}
    >
      {sessionExpired && <span className="ln-expired-dot" />}
      <div className={`ln-plat-icon ${cfg.cls}`}>{cfg.emoji}</div>
      <div className="ln-plat-info">
        <div className="ln-plat-name">{name}</div>
        <div className="ln-plat-status">
          <span className={`ln-status-dot ${connected ? 'ok' : 'warn'}`} />
          {connected ? 'Conectado' : 'Sesión expirada'}
        </div>
      </div>
      <div className="ln-plat-count">{gamesAvailable}</div>
    </div>
  );
}
