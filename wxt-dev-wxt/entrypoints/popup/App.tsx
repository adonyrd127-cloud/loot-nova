import { useEffect, useState } from 'react';
import { useStorage } from "@/entrypoints/hooks/useStorage.ts";
import { TabId, ToastMessage } from "@/entrypoints/types/ui";
import { BottomNav } from "@/entrypoints/components/BottomNav";
import { Dashboard } from "@/entrypoints/components/Dashboard";
import History from "@/entrypoints/components/History";
import Settings from "@/entrypoints/components/Settings";
import { Toast } from "@/entrypoints/components/Toast";
import { FreeGame } from "@/entrypoints/types/freeGame";
import { MessageRequest } from "@/entrypoints/types/messageRequest";

function App() {
  const [activeTab, setActiveTab] = useStorage<TabId>("activeTab", "dashboard");
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [fabLoading, setFabLoading] = useState(false);

  const [steamGames]  = useStorage<FreeGame[]>("steamGames", []);
  const [epicGames]   = useStorage<FreeGame[]>("epicGames", []);
  const [amazonGames] = useStorage<FreeGame[]>("amazonGames", []);

  // Login states
  const [steamLoggedIn]  = useStorage<boolean | null>("steamLoggedIn", null);
  const [epicLoggedIn]   = useStorage<boolean | null>("epicLoggedIn", null);
  const [amazonLoggedIn] = useStorage<boolean | null>("amazonLoggedIn", null);

  const hasExpiredSession = steamLoggedIn === false || epicLoggedIn === false || amazonLoggedIn === false;

  const availableCount = (steamGames?.length ?? 0) + (epicGames?.length ?? 0) + (amazonGames?.length ?? 0);

  useEffect(() => {
    browser.action.setBadgeText({ text: "" });
  }, []);

  function handleFabClaim() {
    if (fabLoading) return;
    setFabLoading(true);
    browser.runtime.sendMessage({ action: 'claim', target: 'background' } as MessageRequest);
    setTimeout(() => setFabLoading(false), 8000);
  }

  return (
    <div className="ln-popup">
      {/* Toast */}
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      {/* Header */}
      <header className="ln-header">
        <div className="ln-header-left">
          <div className="ln-logo-icon">🎮</div>
          <div className="ln-logo-text">
            Loot<span className="ln-text-gradient">Nova</span>
          </div>
        </div>
        <div className="ln-header-right">
          {hasExpiredSession && (
            <button 
              className="ln-header-btn ln-header-btn-warn"
              onClick={() => setActiveTab('dashboard')}
              title="¡Sesión expirada! Revisa el Dashboard."
            >
              ⚠️
              <span className="ln-header-btn-dot" />
            </button>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="ln-content">
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'history' && <History />}
        {activeTab === 'settings' && <Settings />}
      </main>

      {/* FAB */}
      <button
        className={`ln-fab ${fabLoading ? 'loading' : ''}`}
        onClick={handleFabClaim}
        disabled={fabLoading}
        title="Reclamar todo ahora"
      >
        {fabLoading ? (
          <>
            <span className="ln-fab-spinner">⟳</span>
            <span className="ln-fab-ring" />
          </>
        ) : (
          <span>⚡</span>
        )}
      </button>

      {/* Bottom Nav */}
      <BottomNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        badgeCounts={{ dashboard: availableCount, history: 0, settings: 0 }}
      />
    </div>
  );
}

export default App;
