/**
 * logger.ts — Structured logger for LootNova.
 *
 * Usage:
 *   logger.info('Free games fetched', { platform: 'epic' });
 *   logger.error('Claim failed', { platform: 'amazon', gameId: '123' }, error);
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  platform?: string;
  gameId?: string;
  action?: string;
  [key: string]: unknown;
}

class Logger {
  private prefix = '[LootNova]';

  private format(ctx?: LogContext): string {
    if (!ctx || Object.keys(ctx).length === 0) return '';
    return ' [' + Object.entries(ctx).map(([k, v]) => `${k}=${v}`).join(' ') + ']';
  }

  debug(msg: string, ctx?: LogContext) {
    console.log(`${this.prefix}${this.format(ctx)} ${msg}`);
  }

  info(msg: string, ctx?: LogContext) {
    console.log(`${this.prefix}${this.format(ctx)} ${msg}`);
  }

  warn(msg: string, ctx?: LogContext) {
    console.warn(`${this.prefix}${this.format(ctx)} ${msg}`);
  }

  error(msg: string, ctx?: LogContext, err?: Error | unknown) {
    console.error(`${this.prefix}${this.format(ctx)} ${msg}`, err ?? '');
  }
}

export const logger = new Logger();
