import { Platforms } from "@/entrypoints/enums/platforms.ts";

export type TabId = 'dashboard' | 'history' | 'settings';

export interface PlatformStatus {
  id: string;
  platform: Platforms;
  name: string;
  connected: boolean;
  gamesAvailable: number;
  sessionExpired?: boolean;
}

export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}
