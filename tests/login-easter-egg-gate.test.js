'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  LoginEasterEggGate,
  LOGIN_EASTER_EGG_GATE_VERSION,
} = require('../desktop/login-easter-egg-gate');

async function run() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-login-gate-'));
  try {
    const gate = new LoginEasterEggGate({ userDataPath: root });
    const first = await gate.initialize();
    assert.strictEqual(first.unlocked, true);
    assert.strictEqual(first.resetComplete, true);
    assert.strictEqual(gate.isUnlocked(), true);

    const unlockResult = gate.unlock();
    assert.strictEqual(unlockResult.unlocked, true);
    assert.strictEqual(gate.publicStatus().unlocked, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
