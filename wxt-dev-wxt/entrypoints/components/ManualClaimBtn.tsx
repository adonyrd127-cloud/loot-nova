import { useState } from 'react';
import { MessageRequest } from "@/entrypoints/types/messageRequest.ts";
import { useStorage } from "@/entrypoints/hooks/useStorage.ts";
import { FreeGame } from "@/entrypoints/types/freeGame.ts";

export function ManualClaimBtn() {
  const [loading, setLoading] = useState(false);
  const [steamGames]  = useStorage<FreeGame[]>("steamGames", []);
  const [epicGames]   = useStorage<FreeGame[]>("epicGames", []);
  const [amazonGames] = useStorage<FreeGame[]>("amazonGames", []);

  const gamesAvailable = (steamGames?.length ?? 0) + (epicGames?.length ?? 0) + (amazonGames?.length ?? 0);

  function claimGames() {
    if (loading) return;
    setLoading(true);
    browser.runtime.sendMessage({ action: 'claim', target: 'background' } as MessageRequest);
    setTimeout(() => setLoading(false), 8000);
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