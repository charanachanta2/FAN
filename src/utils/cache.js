'use strict';

/**
 * Minimal in-memory TTL cache (per serverless instance) used to cut down on
 * redundant AI/API calls (directions, crowd snapshot, briefings, tips).
 * Resets on cold start — deliberately simple, since correctness here only
 * needs "good enough" de-duplication within a warm instance's lifetime, not
 * cross-instance consistency.
 */
class TTLCache {
  constructor() {
    this.store = new Map();
  }

  /** Returns the cached value for `key`, or `undefined` if missing/expired. */
  get(key) {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (Date.now() > hit.expires) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  /** Stores `value` under `key` for `ttlMs` milliseconds. */
  set(key, value, ttlMs) {
    this.store.set(key, { value, expires: Date.now() + ttlMs });
  }

  /** Removes a single key (mainly useful for tests). */
  delete(key) {
    this.store.delete(key);
  }

  /** Clears the whole cache (mainly useful for tests). */
  clear() {
    this.store.clear();
  }
}

module.exports = { TTLCache };
