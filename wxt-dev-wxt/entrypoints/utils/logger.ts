/**
 * logger.ts — Structured logger for LootNova.
 *
 * Usage:
 *   logger.info('Free games fetched', { platform: 'epic' });
 *   logger.error('Claim failed', { platform: 'amazon', gameId: '123' }, error);
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

interface LogContext {
  platform?: string;
  gameId?: string;
  action?: string;
  [key: string]: unknown;
}

export class Logger {
  private prefix = '[LootNova]';
  public level: LogLevel;

  constructor() {
    this.level = import.meta.env.PROD ? LogLevel.WARN : LogLevel.DEBUG;
  }

  private format(ctx?: LogContext): string {
    if (!ctx || Object.keys(ctx).length === 0) return '';
    return ' [' + Object.entries(ctx).map(([k, v]) => `${k}=${v}`).join(' ') + ']';
  }

  debug(msg: string, ctx?: LogContext) {
    if (this.level > LogLevel.DEBUG) return;
    console.log(`${this.prefix}${this.format(ctx)} ${msg}`);
  }

  info(msg: string, ctx?: LogContext) {
    if (this.level > LogLevel.INFO) return;
    console.log(`${this.prefix}${this.format(ctx)} ${msg}`);
  }

  warn(msg: string, ctx?: LogContext) {
    if (this.level > LogLevel.WARN) return;
    console.warn(`${this.prefix}${this.format(ctx)} ${msg}`);
  }

  error(msg: string, ctx?: LogContext, err?: Error | unknown) {
    if (this.level > LogLevel.ERROR) return;
    console.error(`${this.prefix}${this.format(ctx)} ${msg}`, err ?? '');
  }
}

export const logger = new Logger();
