'use strict';

const { TTLCache } = require('./utils/cache');

/** Process-wide cache instance shared by every route that needs de-duplication. */
const cache = new TTLCache();

module.exports = { cache };
