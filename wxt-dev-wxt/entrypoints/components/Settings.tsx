import {useStorage} from "@/entrypoints/hooks/useStorage.ts";
import OnButton from "@/entrypoints/components/OnButton.tsx";
import {ManualClaimBtn} from "@/entrypoints/components/ManualClaimBtn.tsx";
import Checkbox from "@/entrypoints/components/Checkbox.tsx";
import FrequencySelect from "@/entrypoints/components/FrequencySelect.tsx";
import { ClaimFrequency } from "@/entrypoints/enums/claimFrequency.ts";
import { MessageRequest } from "@/entrypoints/types/messageRequest.ts";
import LoginStatus from "@/entrypoints/components/LoginStatus.tsx";

function Settings() {
    const [counter]        = useStorage<number>("counter", 0);
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
            <h1>LootNova</h1>
            <p className="tagline">{browser.i18n.getMessage("tagline")}</p>
            <p className="counter-text">{browser.i18n.getMessage("gamesClaimed")} <strong>{counter}</strong></p>

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
                    <Checkbox name={browser.i18n.getMessage("steamPlatform")} checked={steamCheck} onChange={e => setSteamCheck(e.target.checked)}/>
                    <Checkbox name={browser.i18n.getMessage("epicPlatform")} checked={epicCheck} onChange={e => setEpicCheck(e.target.checked)}/>
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