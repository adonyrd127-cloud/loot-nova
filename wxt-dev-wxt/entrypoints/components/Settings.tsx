import { useStorage } from "@/entrypoints/hooks/useStorage.ts";
import { ClaimFrequency } from "@/entrypoints/enums/claimFrequency.ts";
import { MessageRequest } from "@/entrypoints/types/messageRequest.ts";

function Toggle({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <div onClick={onClick} className={`ln-toggle ${active ? 'active' : ''}`}>
      <div className="ln-toggle-knob" />
    </div>
  );
}

function SettingsGroup({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="ln-settings-group">
      {title && (
        <div className="ln-section-header">
          <span>{title}</span>
          <span className="ln-section-line" />
        </div>
      )}
      <div className="ln-settings-box">{children}</div>
    </div>
  );
}

function SettingsItem({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="ln-settings-item">
      <div>
        <div className="ln-settings-label">{label}</div>
        {description && <div className="ln-settings-desc">{description}</div>}
      </div>
      {children}
    </div>
  );
}

function getFrequencyLabel(f: ClaimFrequency) {
  switch (f) {
    case ClaimFrequency.BROWSER_START: return browser.i18n.getMessage("freqBrowserStart");
    case ClaimFrequency.HOURLY: return browser.i18n.getMessage("freqHourly");
    case ClaimFrequency.EVERY_6_HOURS: return browser.i18n.getMessage("freqEvery6Hours");
    case ClaimFrequency.EVERY_12_HOURS: return browser.i18n.getMessage("freqEvery12Hours");
    case ClaimFrequency.DAILY: return browser.i18n.getMessage("freqDaily");
    default: return f;
  }
}

function Settings() {
  const [steamCheck, setSteamCheck]   = useStorage<boolean>("steamCheck", true);
  const [epicCheck, setEpicCheck]     = useStorage<boolean>("epicCheck", true);
  const [amazonCheck, setAmazonCheck] = useStorage<boolean>("amazonCheck", true);
  const [gogCheck, setGogCheck]       = useStorage<boolean>("gogCheck", false);
  const [claimFrequency, setClaimFrequency] = useStorage<ClaimFrequency>("claimFrequency", ClaimFrequency.DAILY);
  const [notificationsEnabled, setNotificationsEnabled] = useStorage<boolean>("notificationsEnabled", true);
  const [sessionMonitoring, setSessionMonitoring] = useStorage<boolean>("sessionMonitoring", true);
  const [animationsEnabled, setAnimationsEnabled] = useStorage<boolean>("animationsEnabled", true);
  const [language, setLanguage] = useStorage<string>("language", "es");

  function handleFrequency(f: ClaimFrequency) {
    setClaimFrequency(f);
    sendMessage({ action: "updateFrequency", target: "background" });
  }

  function sendMessage(req: MessageRequest) {
    browser.runtime.sendMessage(req);
  }

  return (
    <div className="ln-fade-in">
      <SettingsGroup title="Plataformas">
        <SettingsItem label="🟣 Epic Games" description="Reclamar juegos gratis automáticamente">
          <Toggle active={epicCheck} onClick={() => setEpicCheck(!epicCheck)} />
        </SettingsItem>
        <SettingsItem label="🟠 Amazon Prime Gaming" description="Incluye redención de claves GOG">
          <Toggle active={amazonCheck} onClick={() => setAmazonCheck(!amazonCheck)} />
        </SettingsItem>
        <SettingsItem label="🔵 Steam" description="Reclamar ofertas gratuitas">
          <Toggle active={steamCheck} onClick={() => setSteamCheck(!steamCheck)} />
        </SettingsItem>
        <SettingsItem label="⚪ GOG" description="Redención automática de claves">
          <Toggle active={gogCheck} onClick={() => setGogCheck(!gogCheck)} />
        </SettingsItem>
      </SettingsGroup>

      <SettingsGroup title="Auto-Claim">
        <SettingsItem label="Frecuencia" description="Con qué frecuencia verificar nuevos juegos">
          <select
            value={claimFrequency}
            onChange={e => handleFrequency(e.target.value as ClaimFrequency)}
            className="ln-select"
          >
            {Object.values(ClaimFrequency).map(f => (
              <option key={f} value={f}>{getFrequencyLabel(f)}</option>
            ))}
          </select>
        </SettingsItem>
        <SettingsItem label="🔔 Notificaciones push" description="Alertar cuando hay nuevos juegos">
          <Toggle active={notificationsEnabled} onClick={() => setNotificationsEnabled(!notificationsEnabled)} />
        </SettingsItem>
        <SettingsItem label="🔐 Monitoreo de sesión" description="Verificar login cada 12 horas">
          <Toggle active={sessionMonitoring} onClick={() => setSessionMonitoring(!sessionMonitoring)} />
        </SettingsItem>
      </SettingsGroup>

      <SettingsGroup title="Apariencia">
        <SettingsItem label="🎨 Animaciones" description="Efectos visuales y transiciones">
          <Toggle active={animationsEnabled} onClick={() => setAnimationsEnabled(!animationsEnabled)} />
        </SettingsItem>
      </SettingsGroup>

      <div className="ln-info-block">
        {browser.i18n.getMessage("infoLogin")}{' '}
        <a href="https://store.steampowered.com/login/" target="_blank">Steam</a>,{' '}
        <a href="https://www.epicgames.com/id/login" target="_blank">Epic</a>{' '}
        {browser.i18n.getMessage("infoAnd")}{' '}
        <a href="https://gaming.amazon.com" target="_blank">Amazon Prime Gaming</a>{' '}
        {browser.i18n.getMessage("infoBeforeClaim")}
      </div>

      <div className="ln-version">LootNova v1.1.1 • MIT License</div>
    </div>
  );
}

export default Settings;