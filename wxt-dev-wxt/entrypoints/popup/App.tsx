import { useEffect, useState } from 'react';
import { useStorage } from "@/entrypoints/hooks/useStorage.ts";
import { TabId, ToastMessage } from "@/entrypoints/types/ui";
import { BottomNav } from "@/entrypoints/components/BottomNav";
import { Dashboard } from "@/entrypoints/components/Dashboard";
import History from "@/entrypoints/components/History";
import Settings from "@/entrypoints/components/Settings";
import { Toast } from "@/entrypoints/components/Toast";
import { FreeGame } from "@/entrypoints/types/freeGame";
import { IconGamepad, IconAlert } from "@/entrypoints/components/icons/Icons";

function App() {
  const [activeTab, setActiveTab] = useStorage<TabId>("activeTab", "dashboard");
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const [steamGames]  = useStorage<FreeGame[]>("steamGames", []);
  const [epicGames]   = useStorage<FreeGame[]>("epicGames", []);
  const [amazonGames] = useStorage<FreeGame[]>("amazonGames", []);
  const [gogGames]    = useStorage<FreeGame[]>("gogGames", []);

  // Login states
  const [steamLoggedIn]  = useStorage<boolean | null>("steamLoggedIn", null);
  const [epicLoggedIn]   = useStorage<boolean | null>("epicLoggedIn", null);
  const [amazonLoggedIn] = useStorage<boolean | null>("amazonLoggedIn", null);
  const [gogLoggedIn]    = useStorage<boolean | null>("gogLoggedIn", null);

  const hasExpiredSession = 
    steamLoggedIn === false || 
    epicLoggedIn === false || 
    amazonLoggedIn === false || 
    gogLoggedIn === false;

  const availableCount = 
    (steamGames?.length ?? 0) + 
    (epicGames?.length ?? 0) + 
    (amazonGames?.length ?? 0) + 
    (gogGames?.length ?? 0);

  useEffect(() => {
    browser.action.setBadgeText({ text: "" });
  }, []);

  return (
    <div className="ln-popup">
      {/* Toast Notification Container */}
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      {/* Main Header */}
      <header className="ln-header">
        <div className="ln-header-left">
          <div className="ln-logo-icon" style={{ padding: '4px' }}>
            <IconGamepad size={18} color="white" />
          </div>
          <div className="ln-logo-text">
            Loot<span className="ln-text-gradient">Nova</span>
          </div>
        </div>
        <div className="ln-header-right">
          {hasExpiredSession && (
            <button 
              className="ln-header-btn"
              onClick={() => {
                setActiveTab('dashboard');
                setToast({
                  id: Math.random().toString(),
                  message: browser.i18n.getMessage("session_expired_title") || "Session Expired! Check Dashboard.",
                  type: "error"
                });
              }}
              title={browser.i18n.getMessage("session_expired_title") || "Session Expired!"}
            >
              <IconAlert size={18} color="var(--ln-warning)" />
              <span className="ln-header-btn-dot" />
            </button>
          )}
        </div>
      </header>

      {/* Main Panel Content */}
      <main className="ln-content" id={`panel-${activeTab}`} role="tabpanel" aria-labelledby={`tab-${activeTab}`}>
        {activeTab === 'dashboard' && <Dashboard setToast={setToast} />}
        {activeTab === 'history' && <History />}
        {activeTab === 'settings' && <Settings />}
      </main>

      {/* Bottom Nav Bar */}
      <BottomNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        badgeCounts={{ dashboard: availableCount, history: 0, settings: 0 }}
      />
    </div>
  );
}

export default App;
