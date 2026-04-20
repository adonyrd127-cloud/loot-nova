import { useEffect } from 'react';
import './App.css';
import {useStorage} from "@/entrypoints/hooks/useStorage.ts";
import GamesList from "@/entrypoints/components/GamesList.tsx";
import {ActiveTabs} from "@/entrypoints/enums/activeTabs.ts";
import Settings from "@/entrypoints/components/Settings.tsx";
import History from "@/entrypoints/components/History.tsx";
import Footer from "@/entrypoints/components/Footer.tsx";

function App() {
    const [activeTab, setActiveTab] = useStorage<ActiveTabs>("activeTab", ActiveTabs.MAIN);

    // FIX: clearBadge was called directly in the render body, firing on EVERY re-render.
    // Using useEffect with [] ensures it only runs once when the popup mounts.
    useEffect(() => {
        browser.action.setBadgeText({ text: "" });
    }, []);

    return (
        <div className="App">
            <div className="tabs">
                <button onClick={() => setActiveTab(ActiveTabs.MAIN)}
                        className={activeTab === ActiveTabs.MAIN ? 'active' : ''}>
                    {browser.i18n.getMessage("tabSettings")}
                </button>
                <button onClick={() => setActiveTab(ActiveTabs.FREE_GAMES)}
                        className={activeTab === ActiveTabs.FREE_GAMES ? 'active' : ''}>
                    {browser.i18n.getMessage("tabFreeGames")}
                </button>
                <button onClick={() => setActiveTab(ActiveTabs.HISTORY)}
                        className={activeTab === ActiveTabs.HISTORY ? 'active' : ''}>
                    {browser.i18n.getMessage("tabHistory")}
                </button>
            </div>

            {activeTab === ActiveTabs.MAIN && (
                <Settings/>
            )}

            {activeTab === ActiveTabs.FREE_GAMES && (
                <div className="tab-content">
                    <GamesList/>
                </div>
            )}

            {activeTab === ActiveTabs.HISTORY && (
                <div className="tab-content">
                    <History/>
                </div>
            )}

            <Footer/>
        </div>
    );
}

export default App;
