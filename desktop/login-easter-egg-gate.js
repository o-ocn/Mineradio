'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LOGIN_EASTER_EGG_GATE_VERSION = 'world-peace-v1';
const LOGIN_EASTER_EGG_STATE_FILE = 'login-easter-egg.json';
const LOGIN_EASTER_EGG_PASSWORD = '世界和平';
const LOGIN_EASTER_EGG_CREDENTIAL_FILES = [
  '.cookie',
  '.qq-cookie',
  '.kugou-cookie',
  '.kugou-vip-evidence.json',
  '.qishui-cookie',
  '.qishui-token',
  '.spotify-token.json',
];

function safeReadJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) || {};
  } catch (_) {
    return {};
  }
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tempFile = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(tempFile, file);
}

function securePasswordMatch(input) {
  const expected = Buffer.from(LOGIN_EASTER_EGG_PASSWORD, 'utf8');
  const received = Buffer.from(String(input || ''), 'utf8');
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

class LoginEasterEggGate {
  constructor(options = {}) {
    this.userDataPath = path.resolve(String(options.userDataPath || '.'));
    this.credentialRoots = options.credentialRoots || [];
    this.stateFile = path.join(this.userDataPath, LOGIN_EASTER_EGG_STATE_FILE);
    this.now = typeof options.now === 'function' ? options.now : () => Date.now();
    this.state = this.readState();
  }

  readState() {
    const raw = safeReadJson(this.stateFile);
    return {
      schema: 1,
      gateVersion: String(raw.gateVersion || ''),
      cookieResetVersion: String(raw.cookieResetVersion || ''),
      resetComplete: raw.resetComplete === true,
      unlocked: raw.unlocked === true,
      resetAt: Number(raw.resetAt || 0) || 0,
      unlockedAt: Number(raw.unlockedAt || 0) || 0,
      resetError: String(raw.resetError || ''),
    };
  }

  writeState(next) {
    this.state = Object.assign({}, this.state, next, { schema: 1 });
    writeJsonAtomic(this.stateFile, this.state);
    return this.state;
  }

  publicStatus() {
    return {
      ok: true,
      gateVersion: LOGIN_EASTER_EGG_GATE_VERSION,
      unlocked: true,
      resetComplete: true,
      disabled: true,
    };
  }

  isUnlocked() {
    return true;
  }

  resolveCredentialRoots() {
    return [];
  }

  clearCredentialFiles() {
    // Disabled: never wipe user credentials
  }

  async clearCredentialState(clearProviderSessions) {
    // Disabled: never wipe user credentials
  }

  async initialize(clearProviderSessions) {
    return Object.assign({ resetPerformed: false }, this.publicStatus());
  }

  async resetForReplay(clearProviderSessions) {
    return Object.assign({ resetPerformed: false, replayReset: false }, this.publicStatus());
  }

  unlock(input) {
    return this.publicStatus();
  }
}

module.exports = {
  LoginEasterEggGate,
  LOGIN_EASTER_EGG_GATE_VERSION,
  LOGIN_EASTER_EGG_STATE_FILE,
  LOGIN_EASTER_EGG_CREDENTIAL_FILES,
  securePasswordMatch,
};
