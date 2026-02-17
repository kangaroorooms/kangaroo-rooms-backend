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
      if (args.length === 1) {
        logger.info(args[0]);
      } else {
        logger.info(args[0], args[1]);
      }
    } catch (error) {
      console.log('[INFO]', ...args);
    }
  },
  error: (...args: any[]) => {
    try {
      if (args.length === 1) {
        logger.error(args[0]);
      } else {
        logger.error(args[0], args[1]);
      }
    } catch (error) {
      console.error('[ERROR]', ...args);
    }
  },
  warn: (...args: any[]) => {
    try {
      if (args.length === 1) {
        logger.warn(args[0]);
      } else {
        logger.warn(args[0], args[1]);
      }
    } catch (error) {
      console.warn('[WARN]', ...args);
    }
  },
  debug: (...args: any[]) => {
    try {
      if (args.length === 1) {
        logger.debug(args[0]);
      } else {
        logger.debug(args[0], args[1]);
      }
    } catch (error) {
      console.debug('[DEBUG]', ...args);
    }
  }
};

// Export both the original logger and safe logger
export { logger };
export default safeLogger;