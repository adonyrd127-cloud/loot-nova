import { useEffect } from "react";
import {useStorage} from "@/entrypoints/hooks/useStorage.ts";

interface Props {
    steamEnabled:  boolean;
    epicEnabled:   boolean;
    amazonEnabled: boolean;
}

function LoginStatus({ steamEnabled, epicEnabled, amazonEnabled }: Props) {
    const [steamLoggedIn]  = useStorage<boolean | null>("steamLoggedIn",  null);
    const [epicLoggedIn]   = useStorage<boolean | null>("epicLoggedIn",   null);
    const [amazonLoggedIn] = useStorage<boolean | null>("amazonLoggedIn", null);

    // Every time the popup opens, ask the background to refresh login states
    // via its cookie-based check. Storage updates will trickle back via useStorage.
    useEffect(() => {
        browser.runtime.sendMessage({ target: "background", action: "checkLoginStatus" });
    }, []);

    const noneEnabled = !steamEnabled && !epicEnabled && !amazonEnabled;
    if (noneEnabled) return null;

    function statusIcon(loggedIn: boolean | null) {
        if (loggedIn === null) return { icon: "❔", label: browser.i18n.getMessage("statusUnknown"), cls: "status-unknown" };
        return loggedIn
            ? { icon: "✅", label: browser.i18n.getMessage("statusOk"),   cls: "status-ok"   }
            : { icon: "⚠️", label: browser.i18n.getMessage("statusWarn"), cls: "status-warn" };
    }

    const steam  = statusIcon(steamLoggedIn);
    const epic   = statusIcon(epicLoggedIn);
    const amazon = statusIcon(amazonLoggedIn);

    return (
        <div className="login-status">
            {steamEnabled && (
                <span className={`login-pill ${steam.cls}`}>
                    <span className="login-icon">{steam.icon}</span>
                    <span>{browser.i18n.getMessage("steamPlatform")}: {steam.label}</span>
                </span>
            )}
            {epicEnabled && (
                <span className={`login-pill ${epic.cls}`}>
                    <span className="login-icon">{epic.icon}</span>
                    <span>{browser.i18n.getMessage("epicPlatform")}: {epic.label}</span>
                </span>
            )}
            {amazonEnabled && (
                <span className={`login-pill ${amazon.cls}`}>
                    <span className="login-icon">{amazon.icon}</span>
                    <span>{browser.i18n.getMessage("amazonPlatform")}: {amazon.label}</span>
                </span>
            )}
        </div>
    );
}

export default LoginStatus;
