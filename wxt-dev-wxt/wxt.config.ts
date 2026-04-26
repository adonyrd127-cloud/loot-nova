import { defineConfig } from 'wxt';

export default defineConfig({
  outDir: "dist",
  modules: ['@wxt-dev/module-react'],
  alias: {
    '@': '.',
  },
  manifest: {
    name: "__MSG_extName__",
    description: "__MSG_extDesc__",
    default_locale: "en",
    permissions: ['storage', "tabs", "scripting", "alarms", "notifications", "cookies"],
    host_permissions: [
      // Steam
      'https://store.steampowered.com/*',
      // Epic (direct API call from background)
      'https://store-site-backend-static-ipv4.ak.epicgames.com/*',
      // Amazon Gaming (old domain — now redirects to luna.amazon.com)
      'https://gaming.amazon.com/*',
      // Luna (the actual Amazon Gaming destination as of 2024)
      'https://luna.amazon.com/*',
      // Amazon account (same-origin for login detection)
      'https://www.amazon.com/*',
      // GOG — for auto-redeeming Amazon Gaming codes + session check
      'https://www.gog.com/*',
      'https://auth.gog.com/*',
      // Epic Games store (cookie login check + session check)
      'https://www.epicgames.com/*',
      'https://store.epicgames.com/*',
      // OpenCritic — game score badges
      'https://api.opencritic.com/*',
      // ProtonDB — Steam Deck compatibility badges
      'https://www.protondb.com/*',
      // IsThereAnyDeal — retail price lookup for Savings Dashboard
      'https://api.isthereanydeal.com/*',
    ],
    browser_specific_settings: {
      gecko: {
        id: '{2f7a1b3c-8e4d-4f9a-b2c5-6d1e0a3f7d8b}',
        strict_min_version: '109.0',
      },
    },
  },
});
