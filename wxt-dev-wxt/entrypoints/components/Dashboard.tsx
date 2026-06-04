import { useEffect, useState, useCallback } from 'react';
import { useStorage, getStorageItem } from "@/entrypoints/hooks/useStorage.ts";
import { FreeGame } from "@/entrypoints/types/freeGame.ts";
import { ClaimedGame } from "@/entrypoints/types/claimedGame.ts";
import { ClaimFrequency, ClaimFrequencyMinutes } from "@/entrypoints/enums/claimFrequency.ts";
import { Platforms } from "@/entrypoints/enums/platforms.ts";
import { computeTotalSavings, formatUSD } from "@/entrypoints/utils/priceService.ts";
import { ToastMessage } from "@/entrypoints/types/ui";
import { PlatformCard } from "./PlatformCard";
import { GamesList } from "./GamesList";
import Checkbox from "./Checkbox";
import { ManualClaimBtn } from "./ManualClaimBtn";

function formatDuration(ms: number): string {
  if (ms <= 0) return "00:00:00";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return [h, m, s].map(v => String(v).padStart(2, "0")).join(":");
}

interface DashboardProps {
  setToast: (toast: ToastMessage | null) => void;
}

export function Dashboard({ setToast }: DashboardProps) {
  const [steamGames]  = useStorage<FreeGame[]>("steamGames", []);
  const [epicGames]   = useStorage<FreeGame[]>("epicGames", []);
  const [amazonGames] = useStorage<FreeGame[]>("amazonGames", []);
  const [gogGames]    = useStorage<FreeGame[]>("gogGames", []);
  const [futureGames] = useStorage<FreeGame[]>("futureGames", []);
  const [counter]     = useStorage<number>("counter", 0);
  const [history]     = useStorage<ClaimedGame[]>("claimedHistory", []);
  const [claimFrequency] = useStorage<ClaimFrequency>("claimFrequency", ClaimFrequency.DAILY);
  const [showFutureGames, setShowFutureGames] = useStorage<boolean>("showFutureGames", true);
  const [showDesc, setShowDesc] = useStorage<boolean>("showDesc", true);

  const [steamLoggedIn]  = useStorage<boolean | null>("steamLoggedIn", null);
  const [epicLoggedIn]   = useStorage<boolean | null>("epicLoggedIn", null);
  const [amazonLoggedIn] = useStorage<boolean | null>("amazonLoggedIn", null);
  const [gogLoggedIn]    = useStorage<boolean | null>("gogLoggedIn", null);
  
  const [steamCheck]  = useStorage<boolean>("steamCheck", true);
  const [epicCheck]   = useStorage<boolean>("epicCheck", true);
  const [amazonCheck] = useStorage<boolean>("amazonCheck", true);
  const [gogCheck]    = useStorage<boolean>("gogCheck", false);

  // Countdown State
  const [remaining, setRemaining] = useState<number | null>(null);

  const computeRemaining = useCallback(async () => {
    if (claimFrequency === ClaimFrequency.BROWSER_START) {
      setRemaining(null);
      return;
    }
    const lastOpened = await getStorageItem("lastOpened") as string | null;
    if (!lastOpened) {
      setRemaining(null);
      return;
    }
    const periodMs = (ClaimFrequencyMinutes[claimFrequency] ?? 1440) * 60000;
    const elapsed = Date.now() - new Date(lastOpened).getTime();
    setRemaining(Math.max(0, periodMs - elapsed));
  }, [claimFrequency]);

  useEffect(() => {
    void computeRemaining();
  }, [computeRemaining]);

  useEffect(() => {
    const id = setInterval(() => {
      setRemaining(p => p === null ? null : Math.max(0, p - 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    browser.runtime.sendMessage({ target: "background", action: "checkLoginStatus" });
  }, []);

  const totalSavings = computeTotalSavings(history ?? []);
  const currentGames = [...(steamGames ?? []), ...(epicGames ?? []), ...(amazonGames ?? []), ...(gogGames ?? [])];
  const allGames = showFutureGames ? [...currentGames, ...(futureGames ?? [])] : currentGames;

  const platforms = [
    { platform: Platforms.Epic, name: 'Epic Games', connected: epicLoggedIn === true, gamesAvailable: epicGames?.length ?? 0, sessionExpired: epicLoggedIn === false, enabled: epicCheck },
    { platform: Platforms.Amazon, name: 'Prime Gaming', connected: amazonLoggedIn === true, gamesAvailable: amazonGames?.length ?? 0, sessionExpired: amazonLoggedIn === false, enabled: amazonCheck },
    { platform: Platforms.Steam, name: 'Steam', connected: steamLoggedIn === true, gamesAvailable: steamGames?.length ?? 0, sessionExpired: steamLoggedIn === false, enabled: steamCheck },
    { platform: Platforms.Gog, name: 'GOG', connected: gogLoggedIn === true, gamesAvailable: gogGames?.length ?? 0, sessionExpired: gogLoggedIn === false, enabled: gogCheck },
  ].filter(p => p.enabled);

  return (
    <div className="ln-fade-in">
      {/* Hero Stats */}
      <div className="ln-hero">
        <div className="ln-hero-grid">
          <div className="ln-hero-stat">
            <div className="ln-hero-number ln-gradient">{counter}</div>
            <div className="ln-hero-label">{browser.i18n.getMessage("gamesClaimed") ? browser.i18n.getMessage("gamesClaimed").replace('🎮', '').trim() : "Claimed"}</div>
          </div>
          <div className="ln-hero-divider" />
          <div className="ln-hero-stat">
            <div className="ln-hero-number ln-gradient">{formatUSD(totalSavings)}</div>
            <div className="ln-hero-label">{browser.i18n.getMessage("stat_total_saved") || "Total Saved"}</div>
          </div>
        </div>
        {remaining !== null && (
          <div className="ln-countdown">
            <div className="ln-countdown-label">
              <span className="ln-pulse-dot" />
              <span>{browser.i18n.getMessage("next_autoclaim_label") || "Next auto-claim in"}</span>
            </div>
            <div className="ln-countdown-timer">{formatDuration(remaining)}</div>
          </div>
        )}
      </div>

      {/* Platforms header and pills */}
      <div className="ln-section">
        <div className="ln-section-title">
          <span>{browser.i18n.getMessage("platforms_section") || "Platforms"}</span>
          <span className="ln-section-line" />
        </div>
        <div className="ln-platforms">
          {platforms.map(p => (
            <PlatformCard 
              key={p.platform} 
              platform={p.platform} 
              name={p.name} 
              connected={p.connected} 
              gamesAvailable={p.gamesAvailable} 
              sessionExpired={p.sessionExpired} 
            />
          ))}
        </div>
      </div>

      {/* Manual Claim Button */}
      <ManualClaimBtn setToast={setToast} />

      {/* Filter Checkboxes */}
      <div className="ln-filters">
        <Checkbox 
          checked={showFutureGames} 
          onChange={e => setShowFutureGames(e.target.checked)} 
          name={browser.i18n.getMessage("filterFutureGames") || "Future Games"} 
        />
        <Checkbox 
          checked={showDesc} 
          onChange={e => setShowDesc(e.target.checked)} 
          name={browser.i18n.getMessage("filterDescriptions") || "Descriptions"} 
        />
      </div>

      {/* Available Games Section */}
      <div className="ln-section">
        <div className="ln-section-title">
          <span>{browser.i18n.getMessage("available_games") || "Available Games"}</span>
          <span className="ln-section-line" />
        </div>
        <GamesList games={allGames} showDesc={showDesc} />
      </div>
    </div>
  );
}

export default Dashboard;
