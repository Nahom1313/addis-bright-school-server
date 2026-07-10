import logger from './logger.js';

let isRedisAvailable = false;

export const connectRedis = async () => {
  if (!process.env.REDIS_URL) {
    logger.warn('REDIS_URL not set — running without Redis (single-instance mode).');
    return null;
  }
  // Redis is optional — skip silently if not configured
  return null;
};

export const getRedis       = () => null;
export const redisReady     = () => isRedisAvailable;
export const cacheGet       = async () => null;
export const cacheSet       = async () => {};
export const cacheDel       = async () => {};
export const cacheDelPattern = async () => {};
export default null;