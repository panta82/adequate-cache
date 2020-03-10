'use strict';

const expect = require('chai').expect;

const AdequateCache = require('../index');

describe(`AdequateCache`, () => {
  it('can perform basic operations', () => {
    const cache = new AdequateCache();

    cache.set('a', {
      A: true,
    });

    cache.set('b', {
      B: true,
    });

    expect(cache.has('a')).to.be.true;
    expect(cache.has('b')).to.be.true;

    cache.del('b');

    expect(cache.has('b')).to.be.false;
    expect(cache.get('b')).to.be.undefined;

    expect(cache.get('a')).to.eql({
      A: true,
    });

    cache.set('a', {
      a2: 'UPDATED',
    });

    expect(cache.get('a')).to.eql({
      a2: 'UPDATED',
    });

    cache.set('c', 'c');
    cache.emptyOut();
    expect(cache.get('a')).to.be.undefined;
    expect(cache.get('c')).to.be.undefined;
  });

  describe('ttl', () => {
    it('will respect ttl from options and arguments', () => {
      const cache = new AdequateCache({
        ttl: 100,
      });
      cache._now = () => 0;

      cache.set('a', 'A');
      cache.set('b', 'B', null);
      cache.set('c', 'C', 200);

      expect(['a', 'b', 'c'].map(cache.has)).to.eql([true, true, true]);
      expect(cache._ttlCount).to.equal(2);

      cache._now = () => 101;
      expect(['a', 'b', 'c'].map(cache.has)).to.eql([false, true, true]);
      expect(cache._ttlCount).to.equal(1);

      cache._now = () => 201;
      expect(['a', 'b', 'c'].map(cache.has)).to.eql([false, true, false]);
      expect(cache._ttlCount).to.equal(0);

      cache._now = () => Number.MAX_SAFE_INTEGER;

      expect(['a', 'b', 'c'].map(cache.has)).to.eql([false, true, false]);
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

      const [a, b, c, d] = ['a', 'b', 'c', 'd'].map(key => cache._data.get(key));

      expect(cache._head).to.equal(b);
      expect(cache._tail).to.equal(c);

      expect(b.prev).to.be.null;
      expect(b.next).to.equal(d);

      expect(d.prev).to.equal(b);
      expect(d.next).to.equal(a);

      expect(a.prev).to.equal(d);
      expect(a.next).to.equal(c);

      expect(c.prev).to.equal(a);
      expect(c.next).to.be.null;

      cache.del('a');

      expect(d.next).to.equal(c);
      expect(c.prev).to.equal(d);

      cache.del('c');

      expect(d.next).to.be.null;
      expect(cache._tail).to.equal(d);

      cache.del('b');

      expect(cache._head).to.equal(d);
      expect(cache._tail).to.equal(d);
      expect(d.prev).to.be.null;

      cache.del('d');

      expect(cache._head).to.be.null;
      expect(cache._tail).to.be.null;
    });

    it('will not bother linking entries if max is not set', () => {
      const cache = new AdequateCache({
        max: null,
      });

      cache.set('a', 'a');
      cache.set('b', 'b');
      cache.get('a');

      const [a, b] = ['a', 'b'].map(key => cache._data.get(key));

      expect(cache._head).to.be.null;
      expect(cache._tail).to.be.null;
      expect(a.next).to.be.null;
      expect(a.prev).to.be.null;
      expect(b.next).to.be.null;
      expect(b.prev).to.be.null;
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
      expect(cache._data.has('1')).to.be.true;

      expect(Array.from(cache.keys())).to.eql(['2', '3']);

      cache.del(2);

      expect(Array.from(cache.keys())).to.eql(['3']);

      cache.del('3');

      expect(Array.from(cache.keys())).to.eql([]);
    });
  });

  describe('binding', () => {
    it('will bind methods by default', () => {
      const { get, set, del, has } = new AdequateCache();
      set('a', 123);
      set('b', 123);
      expect(get('a')).to.equal(get('b'));

      del('a');
      expect(has('a')).to.be.false;
    });

    it('can be configured not to bind methods', () => {
      const cache = new AdequateCache({
        bindMethods: false,
      });
      cache.set('x', 'X');

      const fakeCache = {
        get: cache.get,
        _data: {
          get: () => {},
        },
        _tryVacuum: () => {},
      };

      expect(fakeCache.get('x')).to.be.undefined;
    });
  });

  describe('_tryVacuum', () => {
    it('can trigger based on timing', () => {
      const cache = new AdequateCache({
        vacuumFrequency: 100,
        vacuumInBackground: false,
      });
      cache._lastVacuumAt = 0;
      cache._now = () => 100;

      let triggered = false;
      cache._vacuum = () => {
        triggered = true;
      };

      cache.set('a', 'A', 200);

      expect(triggered).to.be.true;
    });

    it('can trigger based on overflow', () => {
      const cache = new AdequateCache({
        max: 2,
        vacuumOverflowFactor: 1.5,
        vacuumInBackground: false,
      });
      cache._lastVacuumAt = 0;
      cache._now = () => 0;

      let triggered = false;
      cache._vacuum = () => {
        triggered = true;
      };

      cache.set('a', 'A');
      expect(triggered).to.be.false;
      cache.set('b', 'B');
      expect(triggered).to.be.false;
      cache.set('c', 'C');
      expect(triggered).to.be.true;
    });

    it('will be scheduled only once for background execution', done => {
      const cache = new AdequateCache({
        ttl: 20,
        vacuumFrequency: 100,
      });
      cache._lastVacuumAt = 0;
      cache._now = () => 100;

      let triggeredCount = 0;
      cache._vacuum = () => {
        triggeredCount++;
      };

      cache.set('a', null);
      expect(triggeredCount).to.equal(0);
      cache.set('b', NaN);
      expect(triggeredCount).to.equal(0);
      cache.set('c', 3);
      expect(triggeredCount).to.equal(0);

      setTimeout(() => {
        expect(triggeredCount).to.equal(1);
        done();
      }, 100);
    });
  });

  describe('_vacuum', () => {
    it('can correctly reset flags', () => {
      const cache = new AdequateCache({});
      cache._now = () => 123;

      cache._pendingVacuum = true;
      cache._lastVacuumAt = 100;

      cache._vacuum();

      expect(cache._pendingVacuum).to.be.false;
      expect(cache._lastVacuumAt).to.equal(123);
    });

    it('can correctly perform when triggered by frequency', () => {
      const cache = new AdequateCache({
        max: 2,
        ttl: 100,
        vacuumFrequency: 100,
        vacuumInBackground: false,
        vacuumOverflowFactor: 5,
      });
      cache._lastVacuumAt = 0;
      cache._now = () => 0;

      cache.set('a', 'A', 50);
      cache.set('b', 'B');
      cache.set('c', 'C', null);
      cache.set('d', 'D', null);
      cache.set('e', 'E', 200);

      cache._now = () => 101;
      cache.get('c');

      expect(['a', 'b', 'c', 'd', 'e'].map(cache.get)).to.eql([
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
      cache._lastVacuumAt = 0;
      cache._now = () => 0;

      cache.set('a', 'A', 50);
      cache.set('b', 'B');
      cache.set('a', 'A second!', 100);
      cache.set('c', 'C', 100);

      expect(['a', 'b', 'c'].map(cache.get)).to.eql(['A second!', undefined, 'C']);

      cache._now = () => 101;
      cache.set('b', 'B is back', 1);

      expect(['a', 'b', 'c'].map(cache.get)).to.eql([undefined, 'B is back', undefined]);
    });
  });

  describe('provider', () => {
    it('will not work if not configured', () => {
      const cache = new AdequateCache();
      expect(() => cache.provide('5')).to.throw('Provider must be configured');
    });

    it('will give value if already in cache', () => {
      const cache = new AdequateCache({
        provider: () => Promise.resolve('5'),
      });

      cache.set('key', '3');
      return cache.provide('key').then(result => {
        expect(result).to.equal('3');
        expect(cache.get('key')).to.equal('3');
      });
    });

    it('will call provider and store its value to cache', () => {
      const cache = new AdequateCache({
        provider: () => Promise.resolve('5'),
      });

      return cache.provide('key').then(result => {
        expect(result).to.equal('5');
        expect(cache.get('key')).to.equal('5');
      });
    });

    it('will handle non-promise values', () => {
      const cache = new AdequateCache({
        provider: () => false,
      });

      return cache.provide('key').then(result => {
        expect(result).to.be.false;
        expect(cache.get('key')).to.be.false;
      });
    });

    it('will not add undefined-s', () => {
      const cache = new AdequateCache({
        provider: () => Promise.resolve(undefined),
      });

      return cache.provide('key').then(result => {
        expect(result).to.be.undefined;
        expect(cache.has('key')).to.be.false;
      });
    });

    it('will accept multiple arguments', () => {
      const cache = new AdequateCache({
        provider: (...args) => Promise.resolve(args.join('|')),
      });

      return cache.provide('1', 2, null).then(result => {
        expect(result).to.equal('1|2|');
        expect(cache.has('1,2,null')).to.be.true;
      });
    });

    it('will utilize custom key provider', () => {
      const cache = new AdequateCache({
        provider: (...args) => Promise.resolve(args.join('')),
        providerArgsToKey: (...args) => args.map(x => `"${x}"`).join('_'),
      });

      return cache.provide('a', 'b').then(result => {
        expect(result).to.equal('ab');
        expect(cache.has('"a"_"b"')).to.be.true;
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
      expect(promises[0]).to.equal(promises[1]);
      expect(promises[0]).to.not.equal(promises[2]);

      return Promise.all(promises).then(results => {
        expect(results).to.eql(['a-result', 'a-result', 'b-result']);
        expect(callCount).to.equal(2);

        // Make sure it won't use cached promise again
        cache.del('a');
        return cache.provide('a').then(result => {
          expect(result).to.equal('a-result');
          expect(callCount).to.equal(3);
        });
      });
    });
  });
});
