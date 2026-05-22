import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry } from './retry';

describe('withRetry', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        // Math.random is used for jitter, mock it to be predictable
        vi.spyOn(Math, 'random').mockReturnValue(0.5);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('should succeed on the first attempt without delays', async () => {
        const fn = vi.fn().mockResolvedValue('success');

        const resultPromise = withRetry(fn);

        await expect(resultPromise).resolves.toBe('success');
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should succeed after a few failures', async () => {
        const fn = vi
            .fn()
            .mockRejectedValueOnce(new Error('fail 1'))
            .mockRejectedValueOnce(new Error('fail 2'))
            .mockResolvedValue('success');

        // Start the retry operation
        const resultPromise = withRetry(fn, { baseDelayMs: 100, maxDelayMs: 1000, maxRetries: 3 });

        // We need to advance timers while the promise is resolving because of the internal await logic.
        // Instead of waiting manually step-by-step with advanceTimersByTimeAsync, we can let the test run by
        // advancing timers enough to cover all retries, but we must do it concurrently with the promise resolution.
        // Vi.runAllTimersAsync is useful here.
        await vi.runAllTimersAsync();

        const result = await resultPromise;
        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw the last error if maxRetries is exceeded', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('persistent failure'));

        // Instead of holding the promise, await it directly while running timers.
        // However, since it's testing rejection, we use expect().rejects
        // To allow timers to tick, we can start the promise, then use vi.runAllTimersAsync(), then await the promise.

        let caughtError;
        const promise = withRetry(fn, { maxRetries: 2, baseDelayMs: 100, maxDelayMs: 1000 }).catch((e) => {
            caughtError = e;
        });

        await vi.runAllTimersAsync();
        await promise; // wait for it to settle

        expect(caughtError).toBeInstanceOf(Error);
        expect(caughtError?.message).toBe('persistent failure');
        expect(fn).toHaveBeenCalledTimes(3); // attempt 0, 1, 2 = 3 times
    });

    it('should respect maxDelayMs', async () => {
        const fn = vi.fn().mockRejectedValueOnce(new Error('fail 1')).mockResolvedValue('success');

        const resultPromise = withRetry(fn, { baseDelayMs: 5000, maxDelayMs: 2000, maxRetries: 3 });

        await Promise.resolve(); // Let attempt 0 process and fail

        // Delay = min(5000 * 2^0 + 500, 2000) = 2000
        // Advance by less than 2000 -> should not have retried yet
        await vi.advanceTimersByTimeAsync(1999);
        expect(fn).toHaveBeenCalledTimes(1);

        // Advance by 1 more ms -> should retry
        await vi.advanceTimersByTimeAsync(1);

        await expect(resultPromise).resolves.toBe('success');
        expect(fn).toHaveBeenCalledTimes(2);
    });
});
