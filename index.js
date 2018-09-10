'use strict';

const { AdequateCache } = require('./lib/adequate_cache');
const { AdequateCacheEntry, AdequateCacheOptions } = require('./lib/internals');

AdequateCache.Options = AdequateCacheOptions;
AdequateCache.Entry = AdequateCacheEntry;

module.exports = AdequateCache;
