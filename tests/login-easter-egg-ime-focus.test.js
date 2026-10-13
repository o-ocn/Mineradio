'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

async function run() {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'js', 'modules', '08-account', '00-login-easter-egg.js'),
    'utf8'
  );
  const context = {
    window: {},
    document: {
      addEventListener() {},
      getElementById() { return null; },
    },
    localStorage: { getItem() { return '1'; } },
    module: { exports: {} },
  };
  vm.createContext(context);
  vm.runInContext(source, context);

  const unlocked = await context.ensureLoginEasterEggStatus();
  assert.strictEqual(unlocked, true);
  const prepared = await context.prepareLoginEasterEggGate();
  assert.strictEqual(prepared, true);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
