'use strict';

/**
 * Entry to store the data
 */
class AdequateCacheEntry {
  constructor(key, value, ttl, timestamp) {
    this.key = key;
    this.value = value;
    this.ttl = ttl;
    this.timestamp = timestamp;
    /** @type {AdequateCacheEntry} */
    this.next = null;
    /** @type {AdequateCacheEntry} */
    this.prev = null;
  }

  hasExpired(nowTimestamp) {
    return this.ttl && nowTimestamp - this.timestamp > this.ttl;
  }
}

/**
 * User supplied options for AdequateCache
 */
class AdequateCacheOptions {
  constructor(source) {
    /**
     * Default time to live for records, in ms. Null means entries live forever, unless forced out by lru.
     * @type {Number|null}
     */
    this.ttl = null;

    /**
     * Approximate max number of keys to hold in cache. Null means no limit.
     * @type {Number|null}
     */
    this.max = null;

    /**
     * How often do we "vacuum" the data, in ms.
     * Vacuuming refers to going through the list and clearing out expired data, then removing the overflowing
     * least used records.
     * Higher frequency favors memory usage, lower frequency favors CPU. Defaults to once a minute.
     * Set to null to disable.
     * @type {number|null}
     */
    this.vacuumFrequency = 60 * 1000;

    /**
     * If vacuum is still not due based on vacuumFrequency, but the key count has
     * reached max * vacuumOverflowFactor, we will trigger vacuum anyway.
     * This is a release valve if you have a slow vacuumFrequency, but keep adding new keys quickly.
     * @type {number}
     */
    this.vacuumOverflowFactor = 1.2;

    /**
     * If true, vacuum is done in a separate run-loop, so it doesn't interferes with your code. If you set this
     * to false, vacuum will be done before we return from your calls, resulting in a potentially
     * "spiky" performance.
     * @type {boolean}
     */
    this.vacuumInBackground = true;

    /**
     * Bind all public methods, so that you can use the cache methods in .map() and similar scenarios.
     * Defaults to true.
     * @type {boolean}
     */
    this.bindMethods = true;

    if (source) {
      for (const key in source) {
        if (!source.hasOwnProperty(key)) {
          continue;
        }
        if (key in this) {
          if (source[key] !== undefined) {
            this[key] = source[key];
          }
        } else {
          throw new TypeError(`Unknown option: ${key}`);
        }
      }
    }
  }
}

module.exports = {
  AdequateCacheEntry,
  AdequateCacheOptions,
};
