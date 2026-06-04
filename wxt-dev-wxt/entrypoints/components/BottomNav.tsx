import { TabId } from '@/entrypoints/types/ui';
import { IconDashboard, IconHistory, IconSettings } from './icons/Icons';

interface BottomNavProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  badgeCounts?: Record<TabId, number>;
}

export function BottomNav({ activeTab, onTabChange, badgeCounts }: BottomNavProps) {
  const tabs = [
    { 
      id: 'dashboard' as TabId, 
      icon: <IconDashboard size={18} />, 
      label: browser.i18n.getMessage("nav_dashboard") || "Dashboard" 
    },
    { 
      id: 'history' as TabId, 
      icon: <IconHistory size={18} />, 
      label: browser.i18n.getMessage("nav_history") || "History" 
    },
    { 
      id: 'settings' as TabId, 
      icon: <IconSettings size={18} />, 
      label: browser.i18n.getMessage("nav_settings") || "Settings" 
    },
  ];

  return (
    <nav className="ln-nav" role="tablist" aria-label="Main Navigation">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const badge = badgeCounts?.[tab.id] ?? 0;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            aria-controls={`panel-${tab.id}`}
            id={`tab-${tab.id}`}
            onClick={() => onTabChange(tab.id)}
            className={`ln-nav-item ${isActive ? 'active' : ''}`}
          >
            <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              {tab.icon}
              {badge > 0 && <span className="ln-nav-badge">{badge}</span>}
            </div>
            <span style={{ marginTop: '2px' }}>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
