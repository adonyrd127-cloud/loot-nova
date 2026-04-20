import { useState } from 'react';
import {MessageRequest} from "@/entrypoints/types/messageRequest.ts";

export function ManualClaimBtn() {
    const [loading, setLoading] = useState(false);

    function claimGames() {
        if (loading) return;
        setLoading(true);
        sendMessage({action: 'claim', target: 'background'});
        // Reset after 8 seconds — enough time for the extension to start opening tabs
        setTimeout(() => setLoading(false), 8000);
    }

    function sendMessage(request: MessageRequest) {
        browser.runtime.sendMessage(request);
    }

    return (
        <button
            className={`manual-btn ${loading ? 'loading' : ''}`}
            onClick={claimGames}
            disabled={loading}
            title={browser.i18n.getMessage("manualClaimBtnTitle")}
        >
            {loading ? browser.i18n.getMessage("manualClaimBtnLoading") : browser.i18n.getMessage("manualClaimBtn")}
        </button>
    );
}