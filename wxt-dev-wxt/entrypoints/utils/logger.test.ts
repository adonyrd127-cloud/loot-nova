import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger, LogLevel } from './logger';

describe('Logger', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should format logs correctly', () => {
    const logger = new Logger();
    logger.level = LogLevel.DEBUG;
    logger.info('Test message', { platform: 'epic' });
    expect(console.log).toHaveBeenCalledWith('[LootNova] [platform=epic] Test message');
  });

  it('should not log debug or info when level is WARN', () => {
    const logger = new Logger();
    logger.level = LogLevel.WARN;

    logger.debug('Debug message');
    logger.info('Info message');

    expect(console.log).not.toHaveBeenCalled();

    logger.warn('Warn message');
    expect(console.warn).toHaveBeenCalledWith('[LootNova] Warn message');
  });

  it('should not log anything when level is NONE', () => {
    const logger = new Logger();
    logger.level = LogLevel.NONE;

    logger.error('Error message');

    expect(console.error).not.toHaveBeenCalled();
  });
});
