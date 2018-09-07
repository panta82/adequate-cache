'use strict';

const {safeAssign} = require('./utils');

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
    
    safeAssign(this, source);
  }
}

// *********************************************************************************************************************

class AdequateCache {
  constructor(options) {
    if (!(options instanceof AdequateCacheOptions)) {
      options = new AdequateCacheOptions(options);
    }
    
    /** @type {AdequateCacheOptions} */
    this._options = options;
    
    /** @type {Map<string, AdequateCacheEntry>} */
    this._data = new Map();
  }
  
  /**
   * Returns true if cache contains value at given key.
   * Note that there is no performance benefit to calling this over get(), it's just a convenience method. 
   * @param {string|number} key
   * @return {*|undefined}
   */
  has(key) {
    return this.get(key) !== undefined;
  }
  
  /**
   * Get value at key, or return undefined
   * @param {string|number} key
   * @return {*|undefined}
   */
  get(key) {
    let entry = this._data.get(String(key));
    if (entry && entry.isExpired()) {
      // Delete
      entry = undefined;
    }
    
    return entry ? entry.value : undefined;
  }
  
  /**
   * Set value at key. Optionally set ttl for this particular key, otherwise use the global option.
   * @param {string|number} key
   * @param {*} value
   * @param {Number|null} ttl Set TTL specifically for this key
   * @return {*|undefined}
   */
  set(key, value, ttl = undefined) {
    if (ttl === undefined) {
      ttl = this._options.ttl;
    }
    const entry = new AdequateCacheEntry(value, ttl);
    this._data.set(String(key), entry);
  }
}

// *********************************************************************************************************************

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

module.exports = {};