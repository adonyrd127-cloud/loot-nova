import { useState } from 'react';
import { MessageRequest } from "@/entrypoints/types/messageRequest.ts";
import { useStorage } from "@/entrypoints/hooks/useStorage.ts";
import { FreeGame } from "@/entrypoints/types/freeGame.ts";

/**
 * ManualClaimBtn — fires a 'claim' message to the background.
 *
 * Adds the .nova-glow pulsing animation whenever there are available
 * free games (i.e., gamesAvailable > 0), drawing attention to the button.
 */
export function ManualClaimBtn() {
    const [loading, setLoading] = useState(false);

    // Read game lists to determine if there are claimable games available
    const [steamGames]  = useStorage<FreeGame[]>("steamGames",  []);
    const [epicGames]   = useStorage<FreeGame[]>("epicGames",   []);
    const [amazonGames] = useStorage<FreeGame[]>("amazonGames", []);

    const gamesAvailable = (steamGames?.length ?? 0)
        + (epicGames?.length ?? 0)
        + (amazonGames?.length ?? 0);

    function claimGames() {
        if (loading) return;
        setLoading(true);
        sendMessage({ action: 'claim', target: 'background' });
        // Reset after 8 seconds — enough time for the extension to start opening tabs
        setTimeout(() => setLoading(false), 8000);
    }

    function sendMessage(request: MessageRequest) {
        browser.runtime.sendMessage(request);
    }

    const glowClass = !loading && gamesAvailable > 0 ? 'nova-glow' : '';

    return (
        <button
            className={`manual-btn ${loading ? 'loading' : ''} ${glowClass}`}
            onClick={claimGames}
            disabled={loading}
            title={browser.i18n.getMessage("manualClaimBtnTitle")}
        >
            {loading ? browser.i18n.getMessage("manualClaimBtnLoading") : browser.i18n.getMessage("manualClaimBtn")}
        </button>
    );
}