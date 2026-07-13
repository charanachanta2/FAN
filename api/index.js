'use strict';

/**
 * Vercel serverless entry point.
 *
 * All application logic lives under src/ (see src/app.js for the full
 * architecture overview and problem-statement-to-module mapping). Keeping
 * this file tiny means Vercel's `@vercel/node` builder has one clear entry
 * to bundle, while the implementation itself stays organized as small,
 * single-purpose, independently testable modules.
 */

const app = require('../src/app');

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Stadium Copilot running locally at http://localhost:${port}`);
  });
}

module.exports = app;
