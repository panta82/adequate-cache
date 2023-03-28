import { AdequateCacheEntry } from './internals';
import { DEFAULT_OPTIONS, IAdequateCacheOptions } from './options';

/**
 * Entirely adequate node.js in-memory cache with lru and ttl support
 */
export class AdequateCache<TValue, TProviderArgs extends any[] = any[]> {
  private _options: IAdequateCacheOptions<TValue, TProviderArgs>;

  private _data = new Map<string, AdequateCacheEntry<TValue>>();
  private _head: AdequateCacheEntry<TValue> = null;
  private _tail: AdequateCacheEntry<TValue> = null;

  /**
   * Source of time information
   */
  private _now: () => number;

  private _ttlCount = 0;
  private _lastVacuumAt: number;
  private _pendingVacuum = false;

  private _providerPromises = new Map<string, Promise<TValue>>();

  constructor(userSuppliedOptions?: IAdequateCacheOptions<TValue, TProviderArgs>) {
    const options = { ...DEFAULT_OPTIONS } as IAdequateCacheOptions<TValue, TProviderArgs>;

    if (userSuppliedOptions) {
      for (const key in userSuppliedOptions) {
        if (
          Object.prototype.hasOwnProperty.call(userSuppliedOptions, key) &&
          userSuppliedOptions[key] !== undefined
        ) {
          options[key] = userSuppliedOptions[key];
        }
      }
    }

    this._options = options;
    this._now = options.now || Date.now;

    this._ttlCount = 0;
    this._lastVacuumAt = this._now();

    if (this._options.bindMethods) {
      this.has = this.has.bind(this);
      this.get = this.get.bind(this);
      this.set = this.set.bind(this);
      this.del = this.del.bind(this);
      this.emptyOut = this.emptyOut.bind(this);
      this.provide = this.provide.bind(this);
      this.keys = this.keys.bind(this);
    }
  }

  /**
   * Returns true if cache contains value at given key.
   * Note that there is no performance benefit to calling this over get(), it's just a convenience method.
   */
  has(key: string | number): boolean {
    return this.get(key) !== undefined;
  }

  /**
   * Get value at key, or return undefined
   */
  get(key: string | number): TValue | undefined {
    key = String(key);
    let entry = this._data.get(key);
    if (entry) {
      if (entry.hasExpired(this._now())) {
        // Delete expired entry
        this._doDelete(entry);
        entry = undefined;
      } else if (this._options.max) {
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
   * @param key
   * @param value
   * @param ttl Set TTL specifically for this key
   */
  set(key: string | number, value: TValue, ttl?: number): boolean {
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
    const entry = new AdequateCacheEntry<TValue>(key, value, ttl, this._now());

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
   */
  del(key: string | number) {
    key = String(key);
    const entry = this._data.get(key);

    if (!entry) {
      return false;
    }

    this._doDelete(entry);

    return true;
  }

  /**
   * Empty out all keys, reverting the cache to clear state.
   */
  emptyOut() {
    for (const key of this._data.keys()) {
      this.del(key);
    }
  }

  /**
   * Returns value if it is already in cache. Otherwise, calls the "provider" method (that must be given
   * through options) and stores the value in cache, before returning it.
   */
  provide(...args: TProviderArgs): Promise<TValue> {
    if (!this._options.provider) {
      throw new Error('Provider must be configured if you wish to use the "provide" method');
    }

    let key: string;
    if (this._options.providerArgsToKey) {
      key = this._options.providerArgsToKey(...args);
    } else {
      key = args.map(String).join(',');
    }

    if (this.has(key)) {
      return Promise.resolve(this.get(key));
    }

    let promise = this._providerPromises.get(key);
    if (promise) {
      // There is already an active provider promise. Reuse that one.
      return promise;
    }

    promise = Promise.resolve()
      .then(() => this._options.provider(...args))
      .finally(() => {
        this._providerPromises.delete(key);
      })
      .then(value => {
        this.set(key, value);
        return value;
      });

    this._providerPromises.set(key, promise);

    return promise;
  }

  /**
   * Returns an iterator of all the keys currently in cache.
   * Performs vacuum beforehand, so the keys you get are guaranteed
   * to be actually non-expired. Keys are provided converted to string.
   */
  keys(): IterableIterator<string> {
    this._vacuum();
    return this._data.keys();
  }

  private _doDelete(entry: AdequateCacheEntry<TValue>) {
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
   */
  private _attachToHead(entry: AdequateCacheEntry<TValue>) {
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
   */
  private _detach(entry: AdequateCacheEntry<TValue>) {
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
  private _tryVacuum() {
    if (this._pendingVacuum) {
      // We are already in process of vacuuming
      return;
    }

    if (!this._ttlCount && (!this._options.max || this._data.size < this._options.max)) {
      // We know we don't need to vacuum, so we won't bother
      return;
    }

    if (
      this._now() - this._lastVacuumAt >= this._options.vacuumFrequency ||
      (this._options.max &&
        this._data.size >= this._options.max * this._options.vacuumOverflowFactor)
    ) {
      // We should vacuum
      if (this._options.vacuumInBackground) {
        this._pendingVacuum = true;
        setTimeout(() => this._vacuum(), 0);
      } else {
        this._vacuum();
      }
    }
  }

  /**
   * Clean up expired keys, clean up overflowing keys
   */
  private _vacuum() {
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
