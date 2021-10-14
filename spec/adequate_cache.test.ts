import { AdequateCache } from '../src';

describe(`AdequateCache`, () => {
  it('can perform basic operations', () => {
    const cache = new AdequateCache();

    cache.set('a', {
      A: true,
    });

    cache.set('b', {
      B: true,
    });

    expect(cache.has('a')).toEqual(true);
    expect(cache.has('b')).toEqual(true);

    cache.del('b');

    expect(cache.has('b')).toEqual(false);
    expect(cache.get('b')).toBeUndefined();

    expect(cache.get('a')).toEqual({
      A: true,
    });

    cache.set('a', {
      a2: 'UPDATED',
    });

    expect(cache.get('a')).toEqual({
      a2: 'UPDATED',
    });

    cache.set('c', 'c');
    cache.emptyOut();
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('c')).toBeUndefined();
  });

  describe('ttl', () => {
    it('will respect ttl from options and arguments', () => {
      const cache = new AdequateCache({
        ttl: 100,
      });
      cache['_now'] = () => 0;

      cache.set('a', 'A');
      cache.set('b', 'B', null);
      cache.set('c', 'C', 200);

      expect(['a', 'b', 'c'].map(cache.has)).toEqual([true, true, true]);
      expect(cache['_ttlCount']).toEqual(2);

      cache['_now'] = () => 101;
      expect(['a', 'b', 'c'].map(cache.has)).toEqual([false, true, true]);
      expect(cache['_ttlCount']).toEqual(1);

      cache['_now'] = () => 201;
      expect(['a', 'b', 'c'].map(cache.has)).toEqual([false, true, false]);
      expect(cache['_ttlCount']).toEqual(0);

      cache['_now'] = () => Number.MAX_SAFE_INTEGER;

      expect(['a', 'b', 'c'].map(cache.has)).toEqual([false, true, false]);
    });
  });

  describe('max', () => {
    it('when max is set, will keep entries properly linked and ordered', () => {
      const cache = new AdequateCache({
        max: 5,
      });

      cache.set('a', 'a');
      cache.set('b', 'b');
      cache.get('a');
      cache.set('c', 'c');
      cache.get('a');
      cache.set('d', 'd');
      cache.get('b');

      const [a, b, c, d] = ['a', 'b', 'c', 'd'].map(key => cache['_data'].get(key));

      expect(cache['_head']).toEqual(b);
      expect(cache['_tail']).toEqual(c);

      expect(b.prev).toBeNull();
      expect(b.next).toEqual(d);

      expect(d.prev).toEqual(b);
      expect(d.next).toEqual(a);

      expect(a.prev).toEqual(d);
      expect(a.next).toEqual(c);

      expect(c.prev).toEqual(a);
      expect(c.next).toBeNull();

      cache.del('a');

      expect(d.next).toEqual(c);
      expect(c.prev).toEqual(d);

      cache.del('c');

      expect(d.next).toBeNull();
      expect(cache['_tail']).toEqual(d);

      cache.del('b');

      expect(cache['_head']).toEqual(d);
      expect(cache['_tail']).toEqual(d);
      expect(d.prev).toBeNull();

      cache.del('d');

      expect(cache['_head']).toBeNull();
      expect(cache['_tail']).toBeNull();
    });

    it('will not bother linking entries if max is not set', () => {
      const cache = new AdequateCache({
        max: null,
      });

      cache.set('a', 'a');
      cache.set('b', 'b');
      cache.get('a');

      const [a, b] = ['a', 'b'].map(key => cache['_data'].get(key));

      expect(cache['_head']).toBeNull();
      expect(cache['_tail']).toBeNull();
      expect(a.next).toBeNull();
      expect(a.prev).toBeNull();
      expect(b.next).toBeNull();
      expect(b.prev).toBeNull();
    });
  });

  describe('keys', () => {
    it('will provide iterator for available keys which will not include expired entries', () => {
      const cache = new AdequateCache({
        max: 2,
      });

      cache.set(1, 10);
      cache.set('2', 20);
      cache.set(3, 30);

      // Vacuum not done yet
      expect(cache['_data'].has('1')).toEqual(true);

      expect(Array.from(cache.keys())).toEqual(['2', '3']);

      cache.del(2);

      expect(Array.from(cache.keys())).toEqual(['3']);

      cache.del('3');

      expect(Array.from(cache.keys())).toEqual([]);
    });
  });

  describe('binding', () => {
    it('will bind methods by default', () => {
      const { get, set, del, has } = new AdequateCache();
      set('a', 123);
      set('b', 123);
      expect(get('a')).toEqual(get('b'));

      del('a');
      expect(has('a')).toEqual(false);
    });

    it('can be configured not to bind methods', () => {
      const cache = new AdequateCache({
        bindMethods: false,
      });
      cache.set('x', 'X');

      const fakeCache = {
        get: cache.get,
        _data: {
          get: () => {
            // Empty
          },
        },
        _tryVacuum: () => {
          // Empty
        },
      };

      expect(fakeCache.get('x')).toBeUndefined();
    });
  });

  describe('_tryVacuum', () => {
    it('can trigger based on timing', () => {
      const cache = new AdequateCache({
        vacuumFrequency: 100,
        vacuumInBackground: false,
      });
      cache['_lastVacuumAt'] = 0;
      cache['_now'] = () => 100;

      let triggered = false;
      cache['_vacuum'] = () => {
        triggered = true;
      };

      cache.set('a', 'A', 200);

      expect(triggered).toEqual(true);
    });

    it('can trigger based on overflow', () => {
      const cache = new AdequateCache({
        max: 2,
        vacuumOverflowFactor: 1.5,
        vacuumInBackground: false,
      });
      cache['_lastVacuumAt'] = 0;
      cache['_now'] = () => 0;

      let triggered = false;
      cache['_vacuum'] = () => {
        triggered = true;
      };

      cache.set('a', 'A');
      expect(triggered).toEqual(false);
      cache.set('b', 'B');
      expect(triggered).toEqual(false);
      cache.set('c', 'C');
      expect(triggered).toEqual(true);
    });

    it('will be scheduled only once for background execution', done => {
      const cache = new AdequateCache({
        ttl: 20,
        vacuumFrequency: 100,
      });
      cache['_lastVacuumAt'] = 0;
      cache['_now'] = () => 100;

      let triggeredCount = 0;
      cache['_vacuum'] = () => {
        triggeredCount++;
      };

      cache.set('a', null);
      expect(triggeredCount).toEqual(0);
      cache.set('b', NaN);
      expect(triggeredCount).toEqual(0);
      cache.set('c', 3);
      expect(triggeredCount).toEqual(0);

      setTimeout(() => {
        expect(triggeredCount).toEqual(1);
        done();
      }, 100);
    });
  });

  describe('_vacuum', () => {
    it('can correctly reset flags', () => {
      const cache = new AdequateCache({});
      cache['_now'] = () => 123;

      cache['_pendingVacuum'] = true;
      cache['_lastVacuumAt'] = 100;

      cache['_vacuum']();

      expect(cache['_pendingVacuum']).toEqual(false);
      expect(cache['_lastVacuumAt']).toEqual(123);
    });

    it('can correctly perform when triggered by frequency', () => {
      const cache = new AdequateCache({
        max: 2,
        ttl: 100,
        vacuumFrequency: 100,
        vacuumInBackground: false,
        vacuumOverflowFactor: 5,
      });
      cache['_lastVacuumAt'] = 0;
      cache['_now'] = () => 0;

      cache.set('a', 'A', 50);
      cache.set('b', 'B');
      cache.set('c', 'C', null);
      cache.set('d', 'D', null);
      cache.set('e', 'E', 200);

      cache['_now'] = () => 101;
      cache.get('c');

      expect(['a', 'b', 'c', 'd', 'e'].map(cache.get)).toEqual([
        undefined,
        undefined,
        'C',
        undefined,
        'E',
      ]);
    });

    it('can correctly perform when triggered by overflow', () => {
      const cache = new AdequateCache({
        max: 2,
        ttl: 100,
        vacuumInBackground: false,
        vacuumOverflowFactor: 1.5,
      });
      cache['_lastVacuumAt'] = 0;
      cache['_now'] = () => 0;

      cache.set('a', 'A', 50);
      cache.set('b', 'B');
      cache.set('a', 'A second!', 100);
      cache.set('c', 'C', 100);

      expect(['a', 'b', 'c'].map(cache.get)).toEqual(['A second!', undefined, 'C']);

      cache['_now'] = () => 101;
      cache.set('b', 'B is back', 1);

      expect(['a', 'b', 'c'].map(cache.get)).toEqual([undefined, 'B is back', undefined]);
    });
  });

  describe('provider', () => {
    it('will not work if not configured', () => {
      const cache = new AdequateCache();
      expect(() => cache.provide('5')).toThrow('Provider must be configured');
    });

    it('will give value if already in cache', () => {
      const cache = new AdequateCache({
        provider: key => Promise.resolve('5'),
      });

      cache.set('key', '3');
      return cache.provide('key').then(result => {
        expect(result).toEqual('3');
        expect(cache.get('key')).toEqual('3');
      });
    });

    it('will call provider and store its value to cache', () => {
      const cache = new AdequateCache({
        provider: key => Promise.resolve('5'),
      });

      return cache.provide('key').then(result => {
        expect(result).toEqual('5');
        expect(cache.get('key')).toEqual('5');
      });
    });

    it('will handle non-promise values', () => {
      const cache = new AdequateCache({
        provider: key => false,
      });

      return cache.provide('key').then(result => {
        expect(result).toEqual(false);
        expect(cache.get('key')).toEqual(false);
      });
    });

    it('will not add undefined-s', () => {
      const cache = new AdequateCache({
        provider: key => Promise.resolve(undefined),
      });

      return cache.provide('key').then(result => {
        expect(result).toBeUndefined();
        expect(cache.has('key')).toEqual(false);
      });
    });

    it('will accept multiple arguments', () => {
      const cache = new AdequateCache({
        provider: (...args) => Promise.resolve(args.join('|')),
      });

      return cache.provide('1', 2, null).then(result => {
        expect(result).toEqual('1|2|');
        expect(cache.has('1,2,null')).toEqual(true);
      });
    });

    it('will utilize custom key provider', () => {
      const cache = new AdequateCache({
        provider: (a, b) => Promise.resolve(a + b),
        providerArgsToKey: (...args) => args.map(x => `"${x}"`).join('_'),
      });

      return cache.provide('a', 'b').then(result => {
        expect(result).toEqual('ab');
        expect(cache.has('"a"_"b"')).toEqual(true);
      });
    });

    it('will reuse the same promise when called multiple times quickly', () => {
      let callCount = 0;
      const cache = new AdequateCache({
        provider: key =>
          new Promise(resolve => {
            callCount++;
            setTimeout(() => resolve(key + '-result'), 50);
          }),
      });

      const promises = ['a', 'a', 'b'].map(arg => cache.provide(arg));
      expect(promises[0]).toBe(promises[1]);
      expect(promises[0]).not.toBe(promises[2]);

      return Promise.all(promises).then(results => {
        expect(results).toEqual(['a-result', 'a-result', 'b-result']);
        expect(callCount).toEqual(2);

        // Make sure it won't use cached promise again
        cache.del('a');
        return cache.provide('a').then(result => {
          expect(result).toEqual('a-result');
          expect(callCount).toEqual(3);
        });
      });
    });
  });
});
