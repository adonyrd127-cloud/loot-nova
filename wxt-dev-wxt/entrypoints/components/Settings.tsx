import { useStorage } from "@/entrypoints/hooks/useStorage.ts";
import { ClaimFrequency } from "@/entrypoints/enums/claimFrequency.ts";
import { MessageRequest } from "@/entrypoints/types/messageRequest.ts";
import {
  IconSteam,
  IconEpic,
  IconAmazon,
  IconGog,
  IconBell,
  IconShield,
  IconStar,
  IconChevronDown,
} from './icons/Icons';

interface ToggleProps {
  active: boolean;
  onChange: () => void;
  id: string;
}

function Toggle({ active, onChange, id }: ToggleProps) {
  return (
    <label className="ln-toggle" htmlFor={id}>
      <input
        type="checkbox"
        id={id}
        checked={active}
        onChange={onChange}
        role="switch"
        aria-checked={active}
      />
      <span className="ln-toggle-track" />
    </label>
  );
}

interface SettingsGroupProps {
  title?: string;
  children: React.ReactNode;
}

function SettingsGroup({ title, children }: SettingsGroupProps) {
  return (
    <div className="ln-settings-group">
      {title && <div className="ln-settings-header">{title}</div>}
      <div className="ln-settings-card">{children}</div>
    </div>
  );
}

interface SettingsItemProps {
  label: string;
  description?: string;
  icon: React.ReactNode;
  iconBgClass: string;
  children: React.ReactNode;
}

function SettingsItem({ label, description, icon, iconBgClass, children }: SettingsItemProps) {
  return (
    <div className="ln-settings-item">
      <div className="ln-settings-item-left">
        <div className={`ln-settings-item-icon ${iconBgClass}`}>
          {icon}
        </div>
        <div className="ln-settings-item-text">
          <div className="ln-settings-item-name">{label}</div>
          {description && <div className="ln-settings-item-desc">{description}</div>}
        </div>
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

export function Settings() {
  const [steamCheck, setSteamCheck]   = useStorage<boolean>("steamCheck", true);
  const [epicCheck, setEpicCheck]     = useStorage<boolean>("epicCheck", true);
  const [amazonCheck, setAmazonCheck] = useStorage<boolean>("amazonCheck", true);
  const [gogCheck, setGogCheck]       = useStorage<boolean>("gogCheck", false);
  const [claimFrequency, setClaimFrequency] = useStorage<ClaimFrequency>("claimFrequency", ClaimFrequency.DAILY);
  const [notificationsEnabled, setNotificationsEnabled] = useStorage<boolean>("notificationsEnabled", true);
  const [sessionMonitoring, setSessionMonitoring] = useStorage<boolean>("sessionMonitoring", true);
  const [animationsEnabled, setAnimationsEnabled] = useStorage<boolean>("animationsEnabled", true);

  const extensionVersion = browser.runtime.getManifest().version;

  function handleFrequency(f: ClaimFrequency) {
    setClaimFrequency(f);
    browser.runtime.sendMessage({ action: "updateFrequency", target: "background" } as MessageRequest);
  }

  return (
    <div className="ln-fade-in">
      {/* Platforms Settings */}
      <SettingsGroup title={browser.i18n.getMessage("settings_platforms") || "Platforms"}>
        <SettingsItem 
          label={browser.i18n.getMessage("epicPlatform") || "Epic Games"} 
          description={browser.i18n.getMessage("settings_autoclaim_desc") || "Automatically claim free games"}
          icon={<IconEpic size={18} />}
          iconBgClass="ln-bg-epic"
        >
          <Toggle id="toggle-epic" active={epicCheck} onChange={() => setEpicCheck(!epicCheck)} />
        </SettingsItem>

        <SettingsItem 
          label={browser.i18n.getMessage("amazonPlatform") || "Amazon Gaming"} 
          description={browser.i18n.getMessage("settings_autoclaim_desc") || "Automatically claim free games"}
          icon={<IconAmazon size={18} />}
          iconBgClass="ln-bg-amazon"
        >
          <Toggle id="toggle-amazon" active={amazonCheck} onChange={() => setAmazonCheck(!amazonCheck)} />
        </SettingsItem>

        <SettingsItem 
          label={browser.i18n.getMessage("steamPlatform") || "Steam"} 
          description={browser.i18n.getMessage("settings_autoclaim_desc") || "Automatically claim free games"}
          icon={<IconSteam size={18} />}
          iconBgClass="ln-bg-steam"
        >
          <Toggle id="toggle-steam" active={steamCheck} onChange={() => setSteamCheck(!steamCheck)} />
        </SettingsItem>

        <SettingsItem 
          label={browser.i18n.getMessage("gogPlatform") || "GOG"} 
          description={browser.i18n.getMessage("settings_autoclaim_desc") || "Automatically claim free games"}
          icon={<IconGog size={18} />}
          iconBgClass="ln-bg-gog"
        >
          <Toggle id="toggle-gog" active={gogCheck} onChange={() => setGogCheck(!gogCheck)} />
        </SettingsItem>
      </SettingsGroup>

      {/* Auto-Claim Settings */}
      <SettingsGroup title={browser.i18n.getMessage("settings_autoclaim") || "Auto-Claim"}>
        <SettingsItem 
          label={browser.i18n.getMessage("checkFrequency") || "Check Frequency:"} 
          description={browser.i18n.getMessage("settings_autoclaim_desc") || "Automatically claim free games"}
          icon={<IconStar size={16} />}
          iconBgClass="ln-bg-steam"
        >
          <div className="ln-select-wrapper">
            <select
              value={claimFrequency}
              onChange={e => handleFrequency(e.target.value as ClaimFrequency)}
              className="ln-select"
              id="select-frequency"
            >
              {Object.values(ClaimFrequency).map(f => (
                <option key={f} value={f}>{getFrequencyLabel(f)}</option>
              ))}
            </select>
            <span className="ln-select-chevron">
              <IconChevronDown size={12} />
            </span>
          </div>
        </SettingsItem>

        <SettingsItem 
          label={browser.i18n.getMessage("settings_notifications") || "Notifications"} 
          description={browser.i18n.getMessage("settings_autoclaim_desc") || "Automatically claim free games"}
          icon={<IconBell size={16} />}
          iconBgClass="ln-bg-amazon"
        >
          <Toggle id="toggle-notifications" active={notificationsEnabled} onChange={() => setNotificationsEnabled(!notificationsEnabled)} />
        </SettingsItem>

        <SettingsItem 
          label={browser.i18n.getMessage("settings_session_monitor") || "Session Monitoring"} 
          description={browser.i18n.getMessage("settings_session_monitor_desc") || "Alert when login sessions expire"}
          icon={<IconShield size={16} />}
          iconBgClass="ln-bg-epic"
        >
          <Toggle id="toggle-session-monitor" active={sessionMonitoring} onChange={() => setSessionMonitoring(!sessionMonitoring)} />
        </SettingsItem>
      </SettingsGroup>

      {/* Appearance Settings */}
      <SettingsGroup title={browser.i18n.getMessage("settings_appearance") || "Appearance"}>
        <SettingsItem 
          label={browser.i18n.getMessage("settings_animations") || "Animations"} 
          description={browser.i18n.getMessage("settings_autoclaim_desc") || "Automatically claim free games"}
          icon={<IconStar size={16} />}
          iconBgClass="ln-bg-gog"
        >
          <Toggle id="toggle-animations" active={animationsEnabled} onChange={() => setAnimationsEnabled(!animationsEnabled)} />
        </SettingsItem>
      </SettingsGroup>

      {/* Info Login instructions */}
      <div className="ln-about">
        <div>
          {browser.i18n.getMessage("settings_login_info") || "Log in to each platform before claiming"}
        </div>
        <div style={{ marginTop: '8px', display: 'flex', gap: '8px', justifyContent: 'center' }}>
          <a href="https://store.steampowered.com/login/" target="_blank" rel="noopener noreferrer">Steam</a>
          <span>•</span>
          <a href="https://www.epicgames.com/id/login" target="_blank" rel="noopener noreferrer">Epic</a>
          <span>•</span>
          <a href="https://gaming.amazon.com" target="_blank" rel="noopener noreferrer">Amazon</a>
          <span>•</span>
          <a href="https://www.gog.com" target="_blank" rel="noopener noreferrer">GOG</a>
        </div>
        <div style={{ marginTop: '16px' }} className="ln-about-version">
          LootNova v{extensionVersion}
        </div>
      </div>
    </div>
  );
}

export default Settings;