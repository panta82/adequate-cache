/**
 * Entry to store the data
 * @internal
 */
export class AdequateCacheEntry<TValue> {
  key: string;
  value: TValue;
  ttl: number;
  timestamp: number;

  next: AdequateCacheEntry<TValue> = null;
  prev: AdequateCacheEntry<TValue> = null;

  constructor(key, value, ttl, timestamp) {
    this.key = key;
    this.value = value;
    this.ttl = ttl;
    this.timestamp = timestamp;
  }

  hasExpired(nowTimestamp: number) {
    return this.ttl && nowTimestamp - this.timestamp > this.ttl;
  }
}
