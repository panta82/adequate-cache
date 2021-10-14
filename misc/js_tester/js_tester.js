/* eslint-disable */

const { AdequateCache } = require('adequate-cache');

const cache = new AdequateCache({});
cache.set('5', 5);
console.log(cache.get('5'));
