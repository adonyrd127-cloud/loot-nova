import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ContentScriptRunner, ClaimStep } from './contentScriptFramework';
import { browser } from 'wxt/browser';

// Mock WXT browser API
vi.mock('wxt/browser', () => ({
  browser: {
    runtime: {
      sendMessage: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

describe('ContentScriptRunner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  it('should be defined', () => {
    const runner = new ContentScriptRunner();
    expect(runner).toBeDefined();
  });

  it('should execute steps sequentially and signal complete', async () => {
    const runner = new ContentScriptRunner();
    const step1 = vi.fn().mockResolvedValue(undefined);
    const step2 = vi.fn().mockResolvedValue(undefined);

    const steps: ClaimStep[] = [
      { name: 'step1', execute: step1 },
      { name: 'step2', execute: step2 },
    ];

    await runner.run(steps, 'epic', 'Test Game');

    expect(step1).toHaveBeenCalled();
    expect(step2).toHaveBeenCalled();

    // Check that it signaled completion
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith({
      target: 'background',
      action: 'claimComplete',
    });
  });

  it('should create and remove the overlay', async () => {
    const runner = new ContentScriptRunner();
    const steps: ClaimStep[] = [
      { name: 'step1', execute: vi.fn().mockResolvedValue(undefined) },
    ];

    const runPromise = runner.run(steps, 'steam');

    // Overlay should be present while running
    expect(document.getElementById('loot-nova-overlay-host')).not.toBeNull();

    await runPromise;

    // Overlay should be removed after running
    expect(document.getElementById('loot-nova-overlay-host')).toBeNull();
  });

  it('should signal complete and remove overlay even if a step throws', async () => {
    const runner = new ContentScriptRunner();
    const errorStep: ClaimStep = {
      name: 'errorStep',
      execute: vi.fn().mockRejectedValue(new Error('Step failed')),
    };

    await expect(runner.run([errorStep], 'amazon')).rejects.toThrow('Step failed');

    // Overlay should be removed
    expect(document.getElementById('loot-nova-overlay-host')).toBeNull();

    // Should still signal complete
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith({
      target: 'background',
      action: 'claimComplete',
    });
  });

  it('should respect the provided timeout', async () => {
    const runner = new ContentScriptRunner();

    // Create a Promise that we can resolve/reject manually, or that just takes long
    const longStep: ClaimStep = {
      name: 'longStep',
      timeoutMs: 50,
      execute: () => new Promise(resolve => setTimeout(resolve, 100)),
    };

    await expect(runner.run([longStep], 'gog')).rejects.toThrow('Step "longStep" timed out after 50ms');
  });

  it('should correctly update status and badge colors', async () => {
    const runner = new ContentScriptRunner();

    const step: ClaimStep = {
      name: 'statusStep',
      execute: async () => {
        const anyRunner = runner as any;

        // Before updates, the text should be default
        expect(anyRunner.textEl?.textContent).toBe('LootNova: reclamando…');

        // Update to success status
        runner.updateStatus('Success Text', false, true);

        // Check text
        expect(anyRunner.textEl?.textContent).toBe('Success Text');
        // Check success color gradient (JSDOM normalizes hex to rgb)
        expect(anyRunner.badgeEl?.style.background).toContain('rgb(16, 185, 129)'); // #10b981

        // Update to error status
        runner.updateStatus('Error Text', true, false);

        // Check text
        expect(anyRunner.textEl?.textContent).toBe('Error Text');
        // Check error color gradient (JSDOM normalizes hex to rgb)
        expect(anyRunner.badgeEl?.style.background).toContain('rgb(239, 68, 68)'); // #ef4444
      }
    };

    await runner.run([step], 'epic');
  });

  it('should apply the correct platform gradient', async () => {
     const runner = new ContentScriptRunner();

     const step: ClaimStep = {
      name: 'checkColor',
      execute: async () => {
        const anyRunner = runner as any;

        // Amazon gradient part (JSDOM normalizes hex to rgb)
        expect(anyRunner.badgeEl?.style.background).toContain('rgb(245, 158, 11)'); // #f59e0b
      }
    };

    await runner.run([step], 'amazon');
  });
});
