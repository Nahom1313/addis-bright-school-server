/**
 * cache.js — In-memory LRU cache (no Redis needed)
 * Caches expensive query results (leaderboard, analytics, school info)
 * with a configurable TTL per key.
 *
 * When you're ready to scale to multiple servers, swap this for
 * ioredis by replacing get/set/del with redis.get/set/del.
 */

class LRUCache {
  constructor(maxSize = 500) {
    this.maxSize = maxSize;
    this.map = new Map();
  }

  get(key) {
    const entry = this.map.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) { this.map.delete(key); return null; }
    // Move to end (most recently used)
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key, value, ttlSeconds = 60) {
    if (this.map.has(key)) this.map.delete(key); // refresh position
    if (this.map.size >= this.maxSize) {
      // Evict oldest (first entry)
      this.map.delete(this.map.keys().next().value);
    }
    this.map.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  del(key) { this.map.delete(key); }

  delPattern(prefix) {
    for (const key of this.map.keys()) {
      if (key.startsWith(prefix)) this.map.delete(key);
    }
  }

  clear() { this.map.clear(); }

  get size() { return this.map.size; }
}

export const cache = new LRUCache(500);

/**
 * cacheMiddleware(ttl, keyFn?)
 * Express middleware that caches GET responses.
 *
 * Usage:
 *   router.get('/leaderboard', protect, cacheMiddleware(120), handler)
 *   router.get('/analytics',   protect, cacheMiddleware(300, req => `analytics:${req.user.role}`), handler)
 */
export const cacheMiddleware = (ttlSeconds = 60, keyFn = null) =>
  (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') return next();

    const key = keyFn ? keyFn(req) : `route:${req.originalUrl}`;
    const cached = cache.get(key);

    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cached);
    }

    // Monkey-patch res.json to store the response
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      // Only cache successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        cache.set(key, body, ttlSeconds);
      }
      res.setHeader('X-Cache', 'MISS');
      return originalJson(body);
    };

    next();
  };

/**
 * invalidateCache(...prefixes)
 * Call this in mutation handlers to bust stale cache entries.
 *
 * Usage:
 *   invalidateCache('route:/api/marks', 'route:/api/grades');
 */
export const invalidateCache = (...prefixes) => {
  prefixes.forEach(p => cache.delPattern(p));
};
