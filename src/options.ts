interface IAdequateCacheBaseOptions {
  /**
   * Default time to live for records, in ms. Null/undefined means entries live forever, unless forced out by LRU.
   */
  ttl?: number | null;

  /**
   * Approximate max number of keys to hold in cache. Null/undefined means no limit.
   */
  max?: number | null;

  /**
   * How often do we "vacuum" the data, in ms.
   * Vacuuming refers to going through the list and clearing out expired data, then removing the overflowing
   * least used records.
   * Higher frequency favors memory usage, lower frequency favors CPU. Defaults to once a minute.
   * Set to null to disable.
   */
  vacuumFrequency?: number;

  /**
   * If vacuum is still not due based on vacuumFrequency, but the key count has
   * reached max * vacuumOverflowFactor, we will trigger vacuum anyway.
   * This is a release valve if you have a slow vacuumFrequency, but keep adding new keys quickly.
   * Defaults to 1.2.
   */
  vacuumOverflowFactor?: number;

  /**
   * If true, vacuum is done in a separate run-loop, so it doesn't interferes with your code. If you set this
   * to false, vacuum will be done before we return from your calls, resulting in a potentially
   * "spiky" performance. Defaults to true.
   */
  vacuumInBackground?: boolean;

  /**
   * Bind all public methods, so that you can use the cache methods in .map() and similar scenarios.
   * Defaults to true.
   * @type {boolean}
   */
  bindMethods?: boolean;

  /**
   * Method to return current timestamp. Useful in testing and similar scenarios. Defaults to Date.now().
   */
  now?: () => number;
}

export interface IAdequateCacheOptions<TValue, TProviderArgs extends any[] = any[]>
  extends IAdequateCacheBaseOptions {
  /**
   * Method that will be called when you call cache.provide(key) for a value that is not in the cache.
   * Upon obtaining it, the value is placed in cache. Return undefined to keep the value out of cache.
   *
   * This is just a little utility to help you reduce the boilerplate around
   * the most usual use patterns of caches like this.
   */
  provider?: (...args: TProviderArgs) => Promise<TValue> | TValue;

  /**
   * Function to convert arguments used to call provider into a key. By default, arguments
   * are stringified and joined.
   */
  providerArgsToKey?: (...args: TProviderArgs) => string | null;
}

export const DEFAULT_OPTIONS: IAdequateCacheBaseOptions = {
  vacuumFrequency: 60 * 1000,
  vacuumOverflowFactor: 1.2,
  vacuumInBackground: true,
  bindMethods: true,
};
