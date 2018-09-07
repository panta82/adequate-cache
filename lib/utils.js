'use strict';

/**
 * Like Object.assign, except it doesn't assign undefineds and only assigns props that target already has
 */
function safeAssign(target, source) {
  if (source) {
    for (const key in source) {
      if (key in this && source.hasOwnProperty(key) && source[key] !== undefined) {
        this[key] = source[key];
      }
    }
  }
}

module.exports = {
  safeAssign,
};
