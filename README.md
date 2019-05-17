# Adequate Cache

Entirely adequate node.js in-memory cache with lru and ttl support.

```
npm i --save adequate-cache
```

### Usage

The cache is a class with typical API surface.

```javascript
const AdequateCache = require('adequate-cache');
const cache = new AdequateCache();

cache.set('key', 'value');
cache.has('key'); // true
cache.get('key'); // 'value'
cache.del('key'); // true
cache.has('key'); // false
```

All operations are synchronous. Keys are always cast to `string`. Values can be any javascript value, except `undefined` (setting `undefined` is equivalent to deleting an entry).

TTL (time-to-live, in ms) can be provided as a setting "`ttl`" when creating the cache, or for each key. Max keys are configured through `max` option.

```javascript
const AdequateCache = require('adequate-cache');

const cache = new AdequateCache({
  max: 2, // Hold only 2 keys, get rid of the least used ones
  ttl: 1000 // Live for 1 second
});

cache.set('a', {value: 'A'}); // TTL: 1 second (default)
cache.set('b', {value: 'B'}, 2000); // TTL: 2 seconds
cache.set('c', {value: 'C'}, null); // TTL: none (live forever)

cache.get('a'); // undefined, it was removed due to 'max' setting.
```

A few more fiddly options can be seen in [the `AdequateCacheOptions` class](lib/internals.js).

#### Provider

Provide allows you to reduce boilerplate in a very common usage pattern, where you try to get a value from cache and fall back to an asynchronous fetch method.

```javascript
const userCache = new AdequateCache();

function getUser(id) {
  if (userCache.has(id)) {
    return Promise.resolve(userCache.get(id));
  }
  
  return fetchUser(id).then(user => {
    userCache.set(id, user);
    return user;
  });
}

//...

getUser(id).then(user => {
  console.log(user.name);
});
```

Provider allows you to reduce the boilerplate above. Like this:

```javascript
const userCache = new AdequateCache({
  provider: fetchUser
});

//...

userCache.provide(id).then(user => {
  console.log(user.name);
});
```

You can also have multiple input values. By default they will be stringified and joined into a string key, but you can also provide your own key generator.

```javascript
const conversionRateCache = new AdequateCache({
  provider: getConversionRate
  providerArgsToKey: (a, b) => `${a} to ${b}`
});

//...

userCache.provide('USD', 'EUR').then(rate => {
  console.log('USD is worth ' + rate + ' EUR');
});
```

### Version history

|Date|Version|Details
|----|-------|-------
|2018/09/10|`0.1.0`|Initial release
|2018/11/01|`0.2.0`|Added `cache.provide(key)` and `provider` option.
|2018/11/01|`0.2.1`|Better docs
|2018/12/14|`0.3.0`|`cache.provide` now accepts multiple arguments. `providerArgsToKey` added.
|2019/05/17|`0.3.1`|`cache.emptyOut()` added.  

### Implementation details

All values are stored as internal entries, in a native js `Map`. If cache is configured to have max capacity, entries are connected in a doubly-linked list and rearranged any time cache is touched.

There are no background intervals or timers. Cleaning ("vacuuming") is triggered occasionally, when user "touches" the cache and some of the conditions for vacuuming are met (enough time has passed, overflow is above certain factor, etc.). These factors are configurable through options. Vacuuming is (by default) done in a separate run loop instance, so the duration of cache calls remains constant.  

Vacuuming complexity is at most `O(N)`. All other operations are `O(1)`. The trade-off is in potential memory fragmentation. The magnitude of this is to be determined.

### Project status

Library is feature-complete, and covered with unit tests. I've been using it for a few months and seems pretty stable (still untested in production, though). Also, there is no benchmarking at the moment.

## License

MIT