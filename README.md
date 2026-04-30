# 🎮 LootNova

<div align="center">
  <img src="./imgs/lootnova-banner.png" alt="LootNova Banner" width="100%" />

  <br/>
  <br/>

  **Automatically claim free games from Epic Games, Amazon Prime Gaming, Steam and GOG — without lifting a finger.**

  <br/>

  ![Chrome](https://img.shields.io/badge/Chrome-Supported-4285F4?logo=google-chrome&logoColor=white)
  ![Firefox](https://img.shields.io/badge/Firefox-Supported-FF7139?logo=firefox&logoColor=white)
  ![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)
  ![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
  ![WXT](https://img.shields.io/badge/WXT-Framework-purple)
  ![License](https://img.shields.io/badge/License-MIT-green)

</div>

---

## ✨ Features

| Feature | Description |
|---|---|
| 🤖 **Auto-Claim** | Automatically claims free games on a configurable schedule |
| ⚡ **Manual Claim** | One-click instant claiming for all available games |
| 🛍️ **Multi-Platform** | Supports Epic Games, Amazon Prime Gaming, Steam, and GOG |
| ⏱️ **Countdown Timers** | Live expiration timers on game cards + next auto-claim HH:MM:SS countdown |
| 📜 **Claim History** | Track every game you've claimed, with date, platform, and retail price |
| 💰 **Savings Dashboard** | See your total estimated savings across all claimed games (via IsThereAnyDeal) |
| 🔐 **Session Monitor** | 12-hour background alarm checks login status and notifies you on expiration |
| 🔔 **Push Notifications** | Get notified when new free games are detected or sessions expire |
| ⭐ **Game Badges** | OpenCritic scores and Steam Deck compatibility (ProtonDB) on each card |
| 🔑 **GOG Auto-Redeem** | Automatically redeems Amazon-provided GOG keys on gog.com |
| 🌐 **i18n Support** | Available in English and Spanish |
| 🎨 **Nova UI** | Premium dark-themed popup with glassmorphism, gradients, and micro-animations |
| 🔑 **Login Status** | Real-time connection status per platform |

---

## 🎯 Supported Platforms

<div align="center">

| Platform | Auto-Claim | Games List | Login Status | Key Redeem |
|---|:---:|:---:|:---:|:---:|
| 🟣 Epic Games | ✅ | ✅ | ✅ | — |
| 🟠 Amazon Prime Gaming | ✅ | ✅ | ✅ | ✅ GOG/Steam/Xbox |
| 🔵 Steam | ✅ | ✅ | ✅ | — |
| ⚪ GOG | ✅ | ✅ | ✅ | ✅ Auto-fill |

</div>

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** v18 or higher
- **npm**

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/adonyrd127-cloud/loot-nova.git
cd loot-nova/wxt-dev-wxt

# 2. Install dependencies
npm install

# 3. Start development server
npm run dev -- --browser=chrome
# or for Firefox:
npm run dev -- --browser=firefox
```

### Build for Production

```bash
# Chrome
npm run zip

# Firefox
npm run zip:firefox
```

### Load the Extension

1. Go to `chrome://extensions/` (or `about:debugging` in Firefox)
2. Enable **Developer Mode**
3. Click **Load unpacked** and select the `dist/chrome-mv3/` folder

---

## 🕹️ How to Use

1. **Open the popup** by clicking the LootNova icon in your browser toolbar
2. **Log in** to each platform you want to use (Epic, Amazon, Steam, GOG)
3. **Enable platforms** in the Settings tab
4. **Set your claim frequency** — from every hour to once daily
5. Sit back and let LootNova claim free games for you automatically!

### Claim Frequencies

| Option | Description |
|---|---|
| 🚀 On Browser Start | Claims only when browser launches |
| ⏰ Every Hour | Checks & claims every 60 minutes |
| 🕕 Every 6 Hours | Checks & claims every 6 hours |
| 🕛 Every 12 Hours | Checks & claims every 12 hours |
| 📅 Once Daily | Checks & claims once per day (default) |

---

## 💰 Savings Dashboard

LootNova tracks the retail value of every game you claim using the [IsThereAnyDeal](https://isthereanydeal.com/) API. Your popup shows:

- **Total games claimed** with a live counter
- **Total USD saved** as a gradient-styled number
- **Per-game prices** in the History tab with green `💸 $X.XX` badges

Prices are cached for 7 days to minimize API calls.

---

## 🔐 Session Monitoring

A background alarm runs every 12 hours, performing silent fetch requests to each platform's auth endpoint:

| Platform | Endpoint | Expiration Signal |
|---|---|---|
| GOG | `auth.gog.com/userData.json` | HTTP 401/403 |
| Epic | `epicgames.com/account/v2/profile/ajaxGet` | HTTP 401/403 |
| Amazon | `gaming.amazon.com/player/a/profile` | Redirect or invalid JSON |

When a session expires, you get a native browser notification so you can re-login before the next auto-claim.

---

## 🛠️ Tech Stack

- **[WXT](https://wxt.dev/)** — Web Extension Toolkit (build framework)
- **[React 19](https://react.dev/)** — UI components
- **TypeScript** — Type-safe codebase
- **Browser APIs** — `storage`, `tabs`, `scripting`, `alarms`, `notifications`
- **i18n** — Built-in Chrome/Firefox internationalization (`_locales`)
- **IsThereAnyDeal API** — Game price data
- **OpenCritic / ProtonDB** — Game quality and compatibility badges

---

## 📁 Project Structure

```
loot-nova/
└── wxt-dev-wxt/
    ├── entrypoints/
    │   ├── background.ts           # Main orchestrator, alarms & session checks
    │   ├── epic.content.ts         # Epic Games claiming logic
    │   ├── amazon.content.ts       # Amazon Prime Gaming claiming + key extraction
    │   ├── steam.content.ts        # Steam claiming logic
    │   ├── gog.content.ts          # GOG key auto-redemption
    │   ├── components/
    │   │   ├── GamesList.tsx        # Games list with countdown timers
    │   │   ├── GameCard.tsx         # Individual card with OpenCritic/ProtonDB badges
    │   │   ├── History.tsx          # Claimed games + savings banner
    │   │   ├── Settings.tsx         # Platform settings + Hero stats + countdown
    │   │   ├── LoginStatus.tsx      # Per-platform login indicators
    │   │   ├── ManualClaimBtn.tsx   # Pulsing novaGlow button
    │   │   └── ...
    │   ├── utils/
    │   │   ├── priceService.ts     # ITAD price lookups with 7-day cache
    │   │   ├── badgeService.ts     # OpenCritic/ProtonDB with 24h cache
    │   │   └── helpers.ts          # DOM helpers, notifications, counters
    │   ├── popup/                   # Extension popup (App.tsx, styles)
    │   └── types/                   # Shared TypeScript types
    └── public/
        ├── icon/                    # Extension icons (16-128px)
        └── _locales/                # i18n files (en, es)
```

---

## 🌐 Internationalization

LootNova supports multiple languages. Currently available:

- 🇺🇸 English (`en`)
- 🇪🇸 Spanish (`es`)

---

## 📝 Changelog

### v1.1.0 (Current)
- ✅ Savings Dashboard with ITAD price tracking
- ✅ OpenCritic / ProtonDB game badges
- ✅ GOG key auto-redemption from Amazon
- ✅ 12-hour session expiration monitoring
- ✅ Nova UI with glassmorphism and micro-animations
- ✅ Content script confirmation (replaced blind timers)
- ✅ `await` fix on `getFreeGamesAndSetOpenedFlag`

### v1.0.0
- Initial release with Epic, Amazon, Steam auto-claim
- Claim history and countdown timers
- Push notifications for new games
- i18n (English + Spanish)

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](./LICENSE) file for details.

---

<div align="center">
  Made with ❤️ by <strong>adonyrd127-cloud</strong>
  <br/>
  <em>Never miss a free game again.</em>
</div>
