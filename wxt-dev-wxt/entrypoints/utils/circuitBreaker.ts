/**
 * circuitBreaker.ts — Prevents hammering failing APIs.
 *
 * States:
 *   CLOSED   → Normal operation, requests pass through.
 *   OPEN     → Too many failures, all requests immediately rejected.
 *   HALF_OPEN → After reset timeout, one request allowed through to test recovery.
 *
 * Usage:
 *   const breaker = new CircuitBreaker({ failureThreshold: 5, resetTimeoutMs: 600_000 });
 *   const price = await breaker.execute(() => fetchRetailPrice(title));
 */
import { logger } from './logger';

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerOptions {
  /** Number of consecutive failures to trip the breaker. Default: 5 */
  failureThreshold?: number;
  /** Ms to wait before allowing a test request. Default: 10 minutes */
  resetTimeoutMs?: number;
  /** Label for logging */
  name?: string;
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures = 0;
  private lastFailureTime = 0;
  private readonly threshold: number;
  private readonly resetTimeout: number;
  private readonly label: string;

  constructor(opts: CircuitBreakerOptions = {}) {
    this.threshold = opts.failureThreshold ?? 5;
    this.resetTimeout = opts.resetTimeoutMs ?? 10 * 60 * 1000;
    this.label = opts.name ?? 'unnamed';
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'HALF_OPEN';
        logger.info('Circuit breaker half-open, testing', { action: this.label });
      } else {
        throw new Error(`Circuit breaker OPEN (${this.label})`);
      }
    }

    try {
      const result = await fn();
      // Success → reset
      if (this.state === 'HALF_OPEN') {
        logger.info('Circuit breaker recovered', { action: this.label });
      }
      this.failures = 0;
      this.state = 'CLOSED';
      return result;
    } catch (e) {
      this.failures++;
      this.lastFailureTime = Date.now();
      if (this.failures >= this.threshold) {
        this.state = 'OPEN';
        logger.warn(`Circuit breaker OPEN after ${this.failures} failures`, { action: this.label });
      }
      throw e;
    }
  }

  /** Current state for monitoring/debugging */
  getState(): CircuitState {
    return this.state;
  }
}
