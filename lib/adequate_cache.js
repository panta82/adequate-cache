'use strict';

const { safeAssign } = require('./utils');
const { AdequateCacheEntry } = require('./internals');

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

    safeAssign(this, source);
  }
}

/**
 * Entirely adequate node.js in-memory cache with lru and ttl support
 */
class AdequateCache {
	/**
	 * @constructor
	 * @param {AdequateCacheOptions} options
	 */
	constructor(options) {
		if (!(options instanceof AdequateCacheOptions)) {
			options = new AdequateCacheOptions(options);
		}

		/** @type {AdequateCacheOptions} */
		this._options = options;

		/** @type {Map<string, AdequateCacheEntry>} */
		this._data = new Map();

		/** @type {AdequateCacheEntry} */
		this._head = null;

		/** @type {AdequateCacheEntry} */
		this._tail = null;

		this._ttlCount = 0;
		this._lastVacuumAt = Date.now();
		this._pendingVacuum = false;

		if (this._options.bindMethods) {
			this.has = this.has.bind(this);
			this.get = this.get.bind(this);
			this.set = this.set.bind(this);
			this.del = this.del.bind(this);
		}

		/**
		 * Source of time information
		 * @return {Number}
		 */
		this._now = Date.now;
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
  	key = String(key);
    let entry = this._data.get(key);
    if (entry) {
    	if (entry.hasExpired(this._now())) {
				// Delete expired entry
				this._doDelete(entry);
				entry = undefined;
			}
			else if (this._options.max) {
				this._detach(entry);
				this._attachToHead(entry);
			}
    }

		this._tryVacuum();

    return entry ? entry.value : undefined;
  }

  /**
   * Set value at key. Optionally set ttl for this particular key, otherwise use the global default.
	 * If value is undefined, the key is deleted from cache.
   * @param {string|number} key
   * @param {*} value
   * @param {Number|null} ttl Set TTL specifically for this key
   * @return {Boolean}
   */
  set(key, value, ttl = undefined) {
    if (value === undefined) {
    	return this.del(key);
		}

		key = String(key);

		const existing = this._data.get(key);
    if (existing) {
    	this._doDelete(existing);
		}

  	if (ttl === undefined) {
      ttl = this._options.ttl;
    }
    const entry = new AdequateCacheEntry(key, value, ttl, this._now());

    if (this._options.max) {
			// New entries go to top if we are doing lru
			this._attachToHead(entry);
		}

    this._data.set(String(key), entry);

		if (ttl) {
			this._ttlCount++;
		}

    this._tryVacuum();

    return true;
  }

	/**
	 * Delete value at key. Returns true if value was in the cache, false if not.
	 * @param key
	 */
	del(key) {
		key = String(key);
		const entry = this._data.get(key);

		if (!entry) {
			return false;
		}

		this._doDelete(entry);

		return true;
	}

	/**
	 * @param {AdequateCacheEntry} entry
	 * @private
	 */
	_doDelete(entry) {
		if (this._options.max) {
			this._detach(entry);
		}
		this._data.delete(entry.key);
		if (entry.ttl) {
			this._ttlCount--;
		}
	}

	/**
	 * Attach entry to internal linked list head.
	 * @param entry
	 * @private
	 */
	_attachToHead(entry) {
		if (this._head) {
			entry.next = this._head;
			this._head.prev = entry;
		} else {
			entry.next = null;
		}
		if (!this._tail) {
			this._tail = entry;
		}
		entry.prev = null;
		this._head = entry;
	}

  /**
	 * Detach entry from the linked list. It stays in the lookup.
	 * @param {AdequateCacheEntry} entry
	 * @private
	 */
  _detach(entry) {
		if (this._head === entry) {
			this._head = entry.next;
		}
		if (this._tail === entry) {
			this._tail = entry.prev;
		}
  	if (entry.next) {
			entry.next.prev = entry.prev;
		}
		if (entry.prev) {
			entry.prev.next = entry.next;
		}
		entry.next = null;
		entry.prev = null;
	}

	/**
	 * Try schedule or perform a vacuum
	 */
	_tryVacuum() {
		if (this._pendingVacuum) {
			// We are already in process of vacuuming
			return;
		}

		if (!this._ttlCount && (!this._options.max || this._data.size < this._options.max)) {
			// We know we don't need to vacuum, so we won't bother
			return;
		}

		if ((this._now() - this._lastVacuumAt >= this._options.vacuumFrequency)
			|| (this._options.max && this._data.size >= this._options.max * this._options.vacuumOverflowFactor)
		) {
			// We should vacuum
			if (this._options.vacuumInBackground) {
				this._pendingVacuum = true;
				setImmediate(() => this._vacuum());
			} else {
				this._vacuum();
			}
		}
	}

	/**
	 * Clean up expired keys, clean up overflowing keys
	 * @private
	 */
	_vacuum() {
		this._pendingVacuum = false;
		this._lastVacuumAt = this._now();

		const now = this._now();

		if (this._ttlCount > 0) {
			for (const entry of this._data.values()) {
				if (entry.hasExpired(now)) {
					this._doDelete(entry);
					if (this._ttlCount <= 0) {
						break;
					}
				}
			}
		}

		if (this._options.max) {
			// Eat from tail until we are good
			while (this._data.size > this._options.max && this._tail) {
				this._doDelete(this._tail);
			}
		}

	}
}

// *********************************************************************************************************************

module.exports = {
  AdequateCache,
  AdequateCacheOptions,
};
