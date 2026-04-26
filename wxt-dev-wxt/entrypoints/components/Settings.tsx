import { useState, useEffect, useCallback } from 'react';
import { useStorage } from "@/entrypoints/hooks/useStorage.ts";
import OnButton from "@/entrypoints/components/OnButton.tsx";
import { ManualClaimBtn } from "@/entrypoints/components/ManualClaimBtn.tsx";
import Checkbox from "@/entrypoints/components/Checkbox.tsx";
import FrequencySelect from "@/entrypoints/components/FrequencySelect.tsx";
import { ClaimFrequency, ClaimFrequencyMinutes } from "@/entrypoints/enums/claimFrequency.ts";
import { MessageRequest } from "@/entrypoints/types/messageRequest.ts";
import LoginStatus from "@/entrypoints/components/LoginStatus.tsx";
import { getStorageItem } from "@/entrypoints/hooks/useStorage.ts";
import { ClaimedGame } from "@/entrypoints/types/claimedGame.ts";
import { computeTotalSavings, formatUSD } from "@/entrypoints/utils/priceService.ts";

// ── Next-autoclaim countdown ──────────────────────────────────────────────────

function formatDuration(ms: number): string {
    if (ms <= 0) return "00:00:00";
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return [h, m, s].map(v => String(v).padStart(2, "0")).join(":");
}

function NextClaimCountdown({ frequency }: { frequency: ClaimFrequency }) {
    const [remaining, setRemaining] = useState<number | null>(null);

    const computeRemaining = useCallback(async () => {
        if (frequency === ClaimFrequency.BROWSER_START) { setRemaining(null); return; }
        const lastOpened = await getStorageItem("lastOpened") as string | null;
        if (!lastOpened) { setRemaining(null); return; }
        const periodMs = (ClaimFrequencyMinutes[frequency] ?? 1440) * 60_000;
        const elapsed  = Date.now() - new Date(lastOpened).getTime();
        setRemaining(Math.max(0, periodMs - elapsed));
    }, [frequency]);

    useEffect(() => { void computeRemaining(); }, [computeRemaining]);

    useEffect(() => {
        const id = setInterval(() => {
            setRemaining(prev => prev === null ? null : Math.max(0, prev - 1000));
        }, 1000);
        return () => clearInterval(id);
    }, []);

    if (remaining === null) return null;

    return (
        <div className="next-claim-row">
            <span className="next-claim-label">{browser.i18n.getMessage("next_autoclaim_label")}</span>
            <span className="next-claim-timer">{formatDuration(remaining)}</span>
        </div>
    );
}

// ── Hero Stats ─────────────────────────────────────────────────────────────────

function HeroStats({ counter, history }: { counter: number; history: ClaimedGame[] }) {
    const totalSavings = computeTotalSavings(history);
    const hasSavings   = totalSavings > 0;

    return (
        <div className="hero-stats">
            {/* Games claimed */}
            <div className="hero-stat-item">
                <span className="hero-stat-number">{counter}</span>
                <span className="hero-stat-label">{browser.i18n.getMessage("gamesClaimed")}</span>
            </div>

            {/* Divider — only shown when we have savings data */}
            {hasSavings && <div className="hero-stat-divider" />}

            {/* Total savings */}
            {hasSavings && (
                <div className="hero-stat-item">
                    <span className="hero-stat-number hero-stat-savings">{formatUSD(totalSavings)}</span>
                    <span className="hero-stat-label">{browser.i18n.getMessage("stat_total_saved")}</span>
                </div>
            )}
        </div>
    );
}

// ── Settings ──────────────────────────────────────────────────────────────────

function Settings() {
    const [counter]        = useStorage<number>("counter", 0);
    const [history]        = useStorage<ClaimedGame[]>("claimedHistory", []);
    const [steamCheck,  setSteamCheck]  = useStorage<boolean>("steamCheck",  true);
    const [epicCheck,   setEpicCheck]   = useStorage<boolean>("epicCheck",   true);
    const [amazonCheck, setAmazonCheck] = useStorage<boolean>("amazonCheck", true);
    const [claimFrequency, setClaimFrequency] = useStorage<ClaimFrequency>("claimFrequency", ClaimFrequency.DAILY);

    function handleFrequencyChange(frequency: ClaimFrequency) {
        setClaimFrequency(frequency);
        sendMessage({ action: "updateFrequency", target: "background" });
    }

    function sendMessage(request: MessageRequest) {
        browser.runtime.sendMessage(request);
    }

    return (
        <div className="tab-content">
            {/* ── Hero Header ── */}
            <div className="nova-hero">
                <h1>LootNova</h1>
                <p className="tagline">{browser.i18n.getMessage("tagline")}</p>
                <HeroStats counter={counter} history={history ?? []} />
                <NextClaimCountdown frequency={claimFrequency} />
            </div>

            <OnButton/>

            <div className="inputs">
                <ManualClaimBtn/>

                <LoginStatus
                    steamEnabled={steamCheck}
                    epicEnabled={epicCheck}
                    amazonEnabled={amazonCheck}
                />

                <FrequencySelect value={claimFrequency} onChange={handleFrequencyChange} />

                <div className="checkboxes">
                    <Checkbox name={browser.i18n.getMessage("steamPlatform")}  checked={steamCheck}  onChange={e => setSteamCheck(e.target.checked)}/>
                    <Checkbox name={browser.i18n.getMessage("epicPlatform")}   checked={epicCheck}   onChange={e => setEpicCheck(e.target.checked)}/>
                    <Checkbox name={browser.i18n.getMessage("amazonPlatform")} checked={amazonCheck} onChange={e => setAmazonCheck(e.target.checked)}/>
                </div>
            </div>

            <span className="info-text">
                {browser.i18n.getMessage("infoLogin")}{' '}
                <a href="https://store.steampowered.com/login/" target="_blank">Steam</a>,{' '}
                <a href="https://www.epicgames.com/id/login" target="_blank">Epic</a>{' '}
                {browser.i18n.getMessage("infoAnd")}{' '}
                <a href="https://gaming.amazon.com" target="_blank">Amazon Prime Gaming</a>{' '}
                {browser.i18n.getMessage("infoBeforeClaim")}
            </span>
            <span className="info-text">{browser.i18n.getMessage("infoAutoClaim")}</span>
        </div>
    );
}

export default Settings;