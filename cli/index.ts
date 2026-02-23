#!/usr/bin/env node

// This is a plain JS file (not TS) that serves as the executable entry point
// It imports and runs the compiled TypeScript CLI

import('../dist/cli/index.js')
  .then((module) => module.main())
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
