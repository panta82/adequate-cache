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

module.exports = {
  AdequateCacheEntry,
};
