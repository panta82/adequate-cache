'use strict';

/**
 * Entry to store the data
 */
class AdequateCacheEntry {
  constructor(key, value, ttl, timestamp) {
    this.key = key;
  	this.value = value;
    this.ttl = ttl;
    this.timestamp = timestamp || Date.now();
    /** @type {AdequateCacheEntry} */
    this.next = null;
		/** @type {AdequateCacheEntry} */
    this.prev = null;
  }
}

module.exports = {
  AdequateCacheEntry,
};
