import { TabId } from '@/entrypoints/types/ui';

interface BottomNavProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  badgeCounts?: Record<TabId, number>;
}

const tabs: { id: TabId; icon: string; label: string }[] = [
  { id: 'dashboard', icon: '🏠', label: 'Inicio' },
  { id: 'history', icon: '📜', label: 'Historial' },
  { id: 'settings', icon: '⚙️', label: 'Ajustes' },
];

export function BottomNav({ activeTab, onTabChange, badgeCounts }: BottomNavProps) {
  return (
    <nav className="ln-bottom-nav">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const badge = badgeCounts?.[tab.id] ?? 0;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`ln-nav-btn ${isActive ? 'active' : ''}`}
          >
            {isActive && <span className="ln-nav-indicator" />}
            <span className="ln-nav-icon">
              {tab.icon}
              {badge > 0 && <span className="ln-nav-badge">{badge}</span>}
            </span>
            <span className="ln-nav-label">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
