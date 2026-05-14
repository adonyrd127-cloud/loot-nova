import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CircuitBreaker } from './circuitBreaker';

// Mock logger to avoid noisy test output
vi.mock('./logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('CircuitBreaker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should start in CLOSED state', () => {
    const breaker = new CircuitBreaker();
    expect(breaker.getState()).toBe('CLOSED');
  });

  it('should successfully execute a function when CLOSED', async () => {
    const breaker = new CircuitBreaker();
    const result = await breaker.execute(async () => 'success');
    expect(result).toBe('success');
    expect(breaker.getState()).toBe('CLOSED');
  });

  it('should trip to OPEN after reaching the failure threshold', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 3 });
    const failFn = async () => {
      throw new Error('Test failure');
    };

    // 1st failure
    await expect(breaker.execute(failFn)).rejects.toThrow('Test failure');
    expect(breaker.getState()).toBe('CLOSED');

    // 2nd failure
    await expect(breaker.execute(failFn)).rejects.toThrow('Test failure');
    expect(breaker.getState()).toBe('CLOSED');

    // 3rd failure - reaches threshold
    await expect(breaker.execute(failFn)).rejects.toThrow('Test failure');
    expect(breaker.getState()).toBe('OPEN');
  });

  it('should fast-fail when OPEN without executing the function', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 1, name: 'test-breaker' });
    const failFn = async () => { throw new Error('First failure'); };
    const notCalledFn = vi.fn().mockResolvedValue('success');

    // Trip the breaker
    await expect(breaker.execute(failFn)).rejects.toThrow('First failure');
    expect(breaker.getState()).toBe('OPEN');

    // Attempt to execute while OPEN
    await expect(breaker.execute(notCalledFn)).rejects.toThrow('Circuit breaker OPEN (test-breaker)');
    expect(notCalledFn).not.toHaveBeenCalled();
    expect(breaker.getState()).toBe('OPEN');
  });

  it('should transition to HALF_OPEN and then CLOSED on recovery', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 1000 });
    const failFn = async () => { throw new Error('Fail'); };

    await expect(breaker.execute(failFn)).rejects.toThrow('Fail');
    expect(breaker.getState()).toBe('OPEN');

    // Advance time past the reset timeout
    vi.advanceTimersByTime(1001);

    // Provide a successful function
    const successFn = vi.fn().mockResolvedValue('success');

    // The execution should succeed and reset the breaker to CLOSED
    const result = await breaker.execute(successFn);

    expect(result).toBe('success');
    expect(successFn).toHaveBeenCalled();
    expect(breaker.getState()).toBe('CLOSED');
  });

  it('should trip back to OPEN if HALF_OPEN execution fails', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 1000 });
    const failFn = async () => { throw new Error('Fail'); };

    // Trip the breaker
    await expect(breaker.execute(failFn)).rejects.toThrow('Fail');
    expect(breaker.getState()).toBe('OPEN');

    // Advance time to allow HALF_OPEN state
    vi.advanceTimersByTime(1001);

    // Fail again during HALF_OPEN
    await expect(breaker.execute(failFn)).rejects.toThrow('Fail');

    // Should be OPEN again
    expect(breaker.getState()).toBe('OPEN');
  });

  it('should reset failures count on successful execution when CLOSED', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 3 });
    const failFn = async () => { throw new Error('Fail'); };
    const successFn = async () => 'success';

    // 2 failures
    await expect(breaker.execute(failFn)).rejects.toThrow();
    await expect(breaker.execute(failFn)).rejects.toThrow();

    expect(breaker.getState()).toBe('CLOSED');

    // Success resets failures to 0
    await expect(breaker.execute(successFn)).resolves.toBe('success');

    // Should take 3 more failures to trip
    await expect(breaker.execute(failFn)).rejects.toThrow();
    await expect(breaker.execute(failFn)).rejects.toThrow();
    expect(breaker.getState()).toBe('CLOSED');
    await expect(breaker.execute(failFn)).rejects.toThrow();

    expect(breaker.getState()).toBe('OPEN');
  });
});
