/**
 * contentScriptFramework.ts — Reusable claim overlay + step runner for content scripts.
 *
 * Eliminates duplicated Shadow DOM overlay code across Epic, Amazon, and GOG content scripts.
 *
 * Usage:
 *   const runner = new ContentScriptRunner();
 *   await runner.run([
 *     { name: 'clickBuy', execute: () => clickWhenVisible('.buy-btn') },
 *     { name: 'confirm',  execute: () => clickWhenVisible('.confirm'), timeoutMs: 10000 },
 *   ], 'epic', 'Hogwarts Legacy');
 */
import { browser } from 'wxt/browser';

export type PlatformId = 'epic' | 'amazon' | 'steam' | 'gog';

export interface ClaimStep {
  name: string;
  execute: () => Promise<void>;
  /** Per-step timeout in ms. Default: 15000 */
  timeoutMs?: number;
}

const PLATFORM_GRADIENTS: Record<PlatformId, string> = {
  epic:   'linear-gradient(135deg,#6d28d9,#8b5cf6)',
  amazon: 'linear-gradient(135deg,#b45309,#f59e0b)',
  steam:  'linear-gradient(135deg,#0369a1,#06b6d4)',
  gog:    'linear-gradient(135deg,#be185d,#ec4899)',
};

export class ContentScriptRunner {
  private overlay: HTMLElement | null = null;
  private shadow: ShadowRoot | null = null;
  private textEl: HTMLElement | null = null;
  private badgeEl: HTMLElement | null = null;

  /**
   * Runs a sequence of claim steps with an overlay badge + error handling.
   * Automatically removes the overlay and signals the background on completion.
   */
  async run(steps: ClaimStep[], platform: PlatformId, gameTitle?: string): Promise<void> {
    this.overlay = this.createOverlay(platform, gameTitle);
    try {
      for (const step of steps) {
        await this.executeStep(step);
      }
    } finally {
      this.removeOverlay();
      await this.signalComplete();
    }
  }

  public updateStatus(text: string, isError = false, isSuccess = false): void {
    if (this.textEl) this.textEl.textContent = text;
    if (this.badgeEl) {
        if (isError) this.badgeEl.style.background = 'linear-gradient(135deg,#7f1d1d,#ef4444)';
        if (isSuccess) this.badgeEl.style.background = 'linear-gradient(135deg,#064e3b,#10b981)';
    }
  }

  private createOverlay(platform: PlatformId, gameTitle?: string): HTMLElement {
    const host = document.createElement('div');
    host.id = 'loot-nova-overlay-host';
    host.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:2147483647;pointer-events:none;';

    this.shadow = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = [
      '@keyframes ln-fadein{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}',
      '@keyframes ln-spin{to{transform:rotate(360deg)}}',
    ].join('');
    this.shadow.appendChild(style);

    this.badgeEl = document.createElement('div');
    this.badgeEl.style.cssText = [
      'display:flex;align-items:center;gap:10px;',
      `background:${PLATFORM_GRADIENTS[platform]};`,
      'color:#fff;font-family:system-ui,sans-serif;font-size:13px;font-weight:500;',
      'padding:10px 16px;border-radius:12px;',
      'box-shadow:0 4px 20px rgba(0,0,0,0.3);',
      'animation:ln-fadein .3s ease;',
    ].join('');

    const spinner = document.createElement('span');
    spinner.textContent = '🎮';
    spinner.style.cssText = 'font-size:16px;display:inline-block;animation:ln-spin 1.2s linear infinite;';

    this.textEl = document.createElement('span');
    this.textEl.textContent = gameTitle
      ? `LootNova: reclamando "${gameTitle}"…`
      : 'LootNova: reclamando…';

    this.badgeEl.append(spinner, this.textEl);
    this.shadow.appendChild(this.badgeEl);
    document.body.appendChild(host);
    return host;
  }

  private removeOverlay(): void {
    try { this.overlay?.remove(); } catch (_) {}
    this.overlay = null;
  }

  private async signalComplete(): Promise<void> {
    try {
      await browser.runtime.sendMessage({ target: 'background', action: 'claimComplete' });
    } catch (_) { /* tab may be closing */ }
  }

  private async executeStep(step: ClaimStep): Promise<void> {
    const timeout = step.timeoutMs ?? 15000;
    const timer = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Step "${step.name}" timed out after ${timeout}ms`)), timeout)
    );
    await Promise.race([step.execute(), timer]);
  }
}
