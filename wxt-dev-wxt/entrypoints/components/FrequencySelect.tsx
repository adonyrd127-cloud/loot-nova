import { ClaimFrequency, ClaimFrequencyLabels } from "@/entrypoints/enums/claimFrequency.ts";

function FrequencySelect(props: { 
    value: ClaimFrequency, 
    onChange: (value: ClaimFrequency) => void 
}) {
    function getFrequencyLabel(frequency: ClaimFrequency) {
        switch (frequency) {
            case ClaimFrequency.BROWSER_START: return browser.i18n.getMessage("freqBrowserStart");
            case ClaimFrequency.HOURLY: return browser.i18n.getMessage("freqHourly");
            case ClaimFrequency.EVERY_6_HOURS: return browser.i18n.getMessage("freqEvery6Hours");
            case ClaimFrequency.EVERY_12_HOURS: return browser.i18n.getMessage("freqEvery12Hours");
            case ClaimFrequency.DAILY: return browser.i18n.getMessage("freqDaily");
            default: return ClaimFrequencyLabels[frequency];
        }
    }

    return (
        <div className="day-select">
            <label htmlFor="frequency-select" style={{ fontWeight: 500, color: "#c0bbbb" }}>
                {browser.i18n.getMessage("checkFrequency")}
            </label>
            <select
                id="frequency-select"
                value={props.value}
                onChange={(e) => props.onChange(e.target.value as ClaimFrequency)}
                style={{ 
                    flex: 1, 
                    cursor: "pointer",
                    outline: "none"
                }}
            >
                {Object.values(ClaimFrequency).map((frequency) => (
                    <option key={frequency} value={frequency}>
                        {getFrequencyLabel(frequency)}
                    </option>
                ))}
            </select>
        </div>
    );
}

export default FrequencySelect;

