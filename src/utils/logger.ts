import pino from 'pino';

// Create logger with safe configuration
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss Z',
      ignore: 'pid,hostname'
    }
  } : undefined,
  // Redact sensitive information
  redact: {
    paths: ['password', 'token', 'authorization', 'cookie', 'secret'],
    remove: true
  }
});

// Safe logger wrapper that never crashes
export const safeLogger = {
  info: (...args: any[]) => {
    try {
      logger.info(...args);
    } catch (error) {
      console.log('[INFO]', ...args);
    }
  },
  error: (...args: any[]) => {
    try {
      logger.error(...args);
    } catch (error) {
      console.error('[ERROR]', ...args);
    }
  },
  warn: (...args: any[]) => {
    try {
      logger.warn(...args);
    } catch (error) {
      console.warn('[WARN]', ...args);
    }
  },
  debug: (...args: any[]) => {
    try {
      logger.debug(...args);
    } catch (error) {
      console.debug('[DEBUG]', ...args);
    }
  }
};

// Export both the original logger and safe logger
export { logger };
export default safeLogger;