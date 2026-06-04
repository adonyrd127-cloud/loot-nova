import { useState } from 'react';
import { MessageRequest } from "@/entrypoints/types/messageRequest.ts";
import { useStorage } from "@/entrypoints/hooks/useStorage.ts";
import { FreeGame } from "@/entrypoints/types/freeGame.ts";
import { IconBolt, IconSpinner } from './icons/Icons';

import { ToastMessage } from "@/entrypoints/types/ui";

interface ManualClaimBtnProps {
  setToast: (toast: ToastMessage | null) => void;
}

export function ManualClaimBtn({ setToast }: ManualClaimBtnProps) {
  const [loading, setLoading] = useState(false);
  const [steamGames]  = useStorage<FreeGame[]>("steamGames", []);
  const [epicGames]   = useStorage<FreeGame[]>("epicGames", []);
  const [amazonGames] = useStorage<FreeGame[]>("amazonGames", []);
  const [gogGames]    = useStorage<FreeGame[]>("gogGames", []);

  const gamesAvailable = (steamGames?.length ?? 0) + (epicGames?.length ?? 0) + (amazonGames?.length ?? 0) + (gogGames?.length ?? 0);

  function claimGames() {
    if (loading) return;
    setLoading(true);
    setToast({
      id: Math.random().toString(),
      message: browser.i18n.getMessage("toast_claim_started") || "Reclamando juegos...",
      type: "info"
    });
    browser.runtime.sendMessage({ action: 'claim', target: 'background' } as MessageRequest);
    setTimeout(() => setLoading(false), 8000);
  }

  const claimLabel = loading 
    ? browser.i18n.getMessage("claiming_btn") || "Reclamando..."
    : browser.i18n.getMessage("claim_all_btn") || "Reclamar Todo";

  return (
    <button
      className={`ln-claim-btn ${loading ? 'loading' : ''} ${!loading && gamesAvailable > 0 ? 'ln-has-games' : ''}`}
      onClick={claimGames}
      disabled={loading}
      title={browser.i18n.getMessage("manualClaimBtnTitle")}
    >
      {loading ? (
        <>
          <IconSpinner size={16} />
          <span>{claimLabel}</span>
        </>
      ) : (
        <>
          <IconBolt size={16} />
          <span>{claimLabel}</span>
          {gamesAvailable > 0 && (
            <span className="ln-claim-btn-count">{gamesAvailable}</span>
          )}
        </>
      )}
    </button>
  );
}

export default ManualClaimBtn;