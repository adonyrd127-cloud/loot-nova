import GameCard from "@/entrypoints/components/GameCard.tsx";
import {ManualClaimBtn} from "@/entrypoints/components/ManualClaimBtn.tsx";
import {useStorage} from "@/entrypoints/hooks/useStorage.ts";
import {setStorageItem} from "@/entrypoints/hooks/useStorage.ts";
import {FreeGame} from "@/entrypoints/types/freeGame.ts";
import Checkbox from "@/entrypoints/components/Checkbox.tsx";

function GamesList() {
    const [steamGames]  = useStorage<FreeGame[]>("steamGames",  []);
    const [epicGames]   = useStorage<FreeGame[]>("epicGames",   []);
    const [amazonGames, setAmazonGames] = useStorage<FreeGame[]>("amazonGames", []);
    const [futureGames] = useStorage<FreeGame[]>("futureGames", []);

    const [showFutureGames, setShowFutureGames] = useStorage<boolean>("showFutureGames", true);
    const [showDesc, setShowDesc]               = useStorage<boolean>("showDesc", true);

    async function clearCache() {
        await setStorageItem("steamGames", []);
        await setStorageItem("epicGames", []);
        await setStorageItem("amazonGames", []);
        await setStorageItem("futureGames", []);
    }

    const currentGames = [...steamGames, ...epicGames, ...amazonGames];
    const allGames = showFutureGames ? [...currentGames, ...futureGames] : currentGames;

    return (
        <div style={{ width: '100%' }}>
            {!allGames || allGames.length === 0 ? (
                <div className="no-games">
                    <p>{browser.i18n.getMessage("noGames")}<br/>{browser.i18n.getMessage("noGamesSub")}</p>
                    <span className="center">
                        <ManualClaimBtn />
                    </span>
                </div>
            ) : (
                <div>
                    <div className="checkboxes checkboxes-row mb-2">
                        <Checkbox checked={showFutureGames} onChange={e => setShowFutureGames(e.target.checked)} name={browser.i18n.getMessage("filterFutureGames")}/>
                        <Checkbox checked={showDesc}        onChange={e => setShowDesc(e.target.checked)}        name={browser.i18n.getMessage("filterDescriptions")}/>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
                        <button
                            id="clear-cache-btn"
                            onClick={clearCache}
                            title={browser.i18n.getMessage("clearCacheTitle") || "Limpiar datos en caché"}
                            style={{
                                background: 'rgba(255,255,255,0.06)',
                                border: '1px solid rgba(255,255,255,0.12)',
                                color: 'rgba(255,255,255,0.5)',
                                borderRadius: '8px',
                                padding: '4px 10px',
                                fontSize: '11px',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                        >
                            🗑️ {browser.i18n.getMessage("clearCache") || "Limpiar caché"}
                        </button>
                    </div>
                    {allGames.map((game, index) => (
                        <GameCard game={game} showDesc={showDesc} key={index} />
                    ))}
                </div>
            )}
        </div>
    );
}

export default GamesList;