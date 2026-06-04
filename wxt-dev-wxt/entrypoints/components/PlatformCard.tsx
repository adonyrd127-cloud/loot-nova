import { Platforms } from '@/entrypoints/enums/platforms';
import {
  IconSteam,
  IconEpic,
  IconAmazon,
  IconGog,
} from './icons/Icons';

interface PlatformCardProps {
  platform: string;
  name: string;
  connected: boolean;
  gamesAvailable: number;
  sessionExpired?: boolean;
}

export function PlatformCard({
  platform,
  name,
  connected,
  gamesAvailable,
  sessionExpired,
}: PlatformCardProps) {
  let IconComponent = IconSteam;
  let iconColor = 'var(--ln-steam)';

  if (platform === Platforms.Epic) {
    IconComponent = IconEpic;
    iconColor = 'var(--ln-epic)';
  } else if (platform === Platforms.Amazon) {
    IconComponent = IconAmazon;
    iconColor = 'var(--ln-amazon)';
  } else if (platform === Platforms.Gog) {
    IconComponent = IconGog;
    iconColor = 'var(--ln-gog)';
  }

  let statusClass = 'ln-dot-unknown';
  let statusText = browser.i18n.getMessage('platform_unknown') || 'Sin conectar';

  if (connected) {
    statusClass = 'ln-dot-connected';
    statusText = browser.i18n.getMessage('platform_connected') || 'Conectado';
  } else if (sessionExpired) {
    statusClass = 'ln-dot-expired';
    statusText = browser.i18n.getMessage('platform_expired') || 'Sesión expirada';
  }

  return (
    <div className="ln-platform-pill" title={`${name}: ${statusText}`}>
      <span className="ln-platform-pill-icon" style={{ color: iconColor }}>
        <IconComponent size={16} />
      </span>
      <span className="ln-platform-pill-name">{name}</span>
      <span className={`ln-platform-pill-dot ${statusClass}`} />
      <span className="ln-platform-pill-count">{gamesAvailable}</span>
    </div>
  );
}

export default PlatformCard;
