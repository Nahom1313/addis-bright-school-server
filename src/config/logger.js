import winston from 'winston';
import 'winston-daily-rotate-file';
import { existsSync, mkdirSync } from 'fs';

const LOG_DIR = 'logs';
if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });

const { combine, timestamp, printf, colorize, errors } = winston.format;

const devFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp, stack }) =>
    stack ? `${timestamp} ${level}: ${message}\n${stack}` : `${timestamp} ${level}: ${message}`
  )
);

const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  winston.format.json()
);

const isProd = process.env.NODE_ENV === 'production';

const logger = winston.createLogger({
  level: isProd ? 'info' : 'debug',
  format: isProd ? prodFormat : devFormat,
  transports: [
    new winston.transports.Console(),
    ...(isProd ? [
      new winston.transports.DailyRotateFile({
        filename:    `${LOG_DIR}/error-%DATE%.log`,
        datePattern: 'YYYY-MM-DD',
        level:       'error',
        maxFiles:    '14d',
        maxSize:     '20m',
        zippedArchive: true,
      }),
      new winston.transports.DailyRotateFile({
        filename:    `${LOG_DIR}/combined-%DATE%.log`,
        datePattern: 'YYYY-MM-DD',
        maxFiles:    '14d',
        maxSize:     '20m',
        zippedArchive: true,
      }),
    ] : []),
  ],
  exceptionHandlers: [
    new winston.transports.Console(),
    ...(isProd ? [new winston.transports.File({ filename: `${LOG_DIR}/exceptions.log` })] : []),
  ],
  rejectionHandlers: [
    new winston.transports.Console(),
    ...(isProd ? [new winston.transports.File({ filename: `${LOG_DIR}/rejections.log` })] : []),
  ],
});

export default logger;
