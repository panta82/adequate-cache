'use strict';

const assert = require('assert');

/**
 * Entry to store the data
 */
class AdequateCacheEntry {
  constructor(value, ttl) {
    this.value = value;
    this.ttl = ttl;
    this.last_touched = Date.now();
  }

  touch() {
    this.last_touched = Date.now();
  }

  isExpired() {
    return this.ttl && Date.now() - this.last_touched > this.ttl;
  }
}

/**
 * Bucket to store generic values in . Buckets are recycled in and out of memory
 */
class AdequateCacheBucket {
  constructor(size) {
    this.size = size;
    this.data = [];
    this.count = 0;
  }

  /**
   * Add value, return index.
   */
  add(value) {
    assert.ok(this.count < this.size, 'bucket must not be full when adding new value');

    if (this.count >= this.data.length) {
      // Push the data size
      this.data.push(value);
      this.count++;
    } else {
      // We have some free space
      this.data[this.count] = value;
      this.count++;
    }

    return this.count - 1;
  }

  /**
   * Remove value at index, return value
   */
  remove(index) {
    assert.ok(this.count > 0, 'bucket must not be empty');

    const value = this.data[index];
    assert.ok(value, 'index must be valid');

    // Move last entry to empty spot
    if (index !== this.count) {
      this.data[index] = this.data[this.count];
    }
    this.count--;
  }

  full() {
    return this.count;
  }
}

/**
 * Store for keys, utilizes buckets
 */
class AdequateCacheKeyStore {
  /** @param {AdequateCacheOptions} options */
  constructor(options) {
    /** @type {Array<Array<string>>} */
    this.buckets = [];

    this.bucket_count = options.bucket_count;

    // We round the bucket size so the number of entries will gravitate around the desired size
    this.bucket_size = Math.floor(options.max / (options.bucket_count - 0.5));
  }

  /**
   * Add key to store
   */
  add(key) {
    if (this.buckets[0].length >= this.bucket_size) {
      // Bucket is full, add a new one
      this.buckets.unshift([]);
    }

    // Add key to the head and return index
    this.buckets[0].unshift(key);

    // Do we have too many buckets now? Get rid of the last one
    if (this.buckets.length > this.bucket_count) {
      const removed = this.buckets.splice(-1, 1);
      // TODO: Notify someone some keys were removed
    }

    // Return index of the key
    return 0;
  }

  touch(key) {
    // TODO: Reshuffle keys somehow :)
  }
}

module.exports = {
  AdequateCacheEntry,
  AdequateCacheKeyStore,
};
