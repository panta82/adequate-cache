# Adequate Cache

Entirely adequate node.js in-memory cache with lru and ttl support. Typescript typings are included.

```
npm i --save adequate-cache
```

or

```
yarn add adequate-cache
```

### Features

- In-memory cache: `get`, `set`, `del`, `has`, `keys` iterator
- Optional TTL expiration
- Optional LRU (least-recently used) pruning
- "Provider", helper for async workflows
- Full typescript support
- No dependencies

### Documentation

Full documentation is available at https://panta82.github.io/adequate-cache/

#### Basic usage

The cache is a class with a rather standard API surface.

```javascript
const AdequateCache = require('adequate-cache');
const cache = new AdequateCache();

// Set a value for key
cache.set('key', 'value');

// Check whether key is in cache. Returns undefined if not found.
cache.has('key'); // true

// Retrieve value for key.
cache.get('key'); // 'value'

// Add another value to cache
cache.set('key2', 'value2');

// Get iterator for all keys in the cache
Array.from(cache.keys()); // ['key', 'key2']

// Delete value from cache
cache.del('key'); // true
cache.has('key'); // false

// Delete everything from cache
cache.emptyOut();
cache.get('key2'); // undefined
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

#### Provider

Provide allows you to reduce boilerplate in a very common usage pattern, where you try to get a value from cache and fall back to an asynchronous fetch method.

Code like this:

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

Can be converted to something like this:

```javascript
const userCache = new AdequateCache({
  provider: fetchUser
});

//...

userCache.provide(id).then(user => {
  console.log(user.name);
});
```

You can also have multiple input values. By default, they will be stringified and joined into a string key, but you can also provide your own key generator.

```javascript
const conversionRateCache = new AdequateCache({
  provider: getConversionRate,
  providerArgsToKey: (a, b) => `${a} to ${b}`
});

//...

conversionRateCache.provide('USD', 'EUR').then(rate => {
  console.log('USD is worth ' + rate + ' EUR');
});
```

### Version history

##### 2018/09/10 - `0.1.0`

Initial release

##### 2018/09/10 - `0.1.0`

Initial release

#### 2018/11/01 - `0.2.0`

Added `cache.provide(key)` and `provider` option.

#### 2018/11/01 - `0.2.1`

Better docs

#### 2018/12/14 - `0.3.0`

`cache.provide` now accepts multiple arguments.
Also added `providerArgsToKey`.

#### 2019/05/17 - `0.3.1`

Added `cache.emptyOut()`.

#### 2019/07/10 - `0.3.2`

Added `cache.keys()`.

#### 2020/03/10 - `0.4.0`

Provider promises are now reused, so `provider()` won't be called multiple times needlessly
Also removed `package.lock` from repo.

#### 2020/03/10 - `0.4.1`

Minor JSDoc fix

#### 2021/10/14 - `1.0.0`

The entire library was rewritten in typescript. It now includes full types.
We now also ship full API documentation, at https://panta82.github.io/adequate-cache/.

The API has remained fully backwards compatible. However, there are a few minor changes, necessitating a major version bump:

- We no longer export `AdequateCache.Options` and `AdequateCache.Entry` classes. `Entry` is now fully internal, while `Options` are now a typescript interface and are no longer available as a class. If you did something like `new AdequateCache.Options({...})`, you can just remove that constructor and just use the `IAdequateCacheOptions` interface instead (or nothing at all).

- In lieu of `Options`, we now export `DEFAULT_OPTIONS`. You can mutate this if you want to change the defaults.

- Options now take `now` parameter, for customizing time generation officially.

- All previously "informally" private methods are now typescript private. Your IDE might mark them with red lines. They are still available at their own places, though.

#### 2023/03/28 - `1.0.1`

- Remove usage of setImmediate() in favor of setTimeout(). Move towards making the lib usable in browser.

### Implementation details

All values are stored as internal entries, in a native js `Map`. If cache is configured to have max capacity, entries are connected in a doubly-linked list and rearranged any time cache is touched.

There are no background intervals or timers. Cleaning ("vacuuming") is triggered occasionally, when user "touches" the cache and some of the conditions for vacuuming are met (enough time has passed, overflow is above certain factor, etc.). These factors are configurable through options. Vacuuming is (by default) done in a separate run loop instance, so the duration of cache calls remains constant.

Vacuuming complexity is at most `O(N)`. All other operations are `O(1)`. The trade-off is in potential memory fragmentation. The magnitude of this is to be determined.

### Project status

Library is feature-complete, and covered with unit tests. It's been in production for several years without issues.

## License

[MIT](LICENSE.txt)
