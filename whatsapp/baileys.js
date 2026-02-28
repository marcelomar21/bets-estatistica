/**
 * Baileys ESM-to-CJS bridge.
 *
 * Baileys v6 is ESM-only ("type": "module"). This project uses CommonJS.
 * This shim provides a lazy async loader and re-exports key Baileys symbols.
 *
 * Usage:
 *   const { loadBaileys } = require('./baileys');
 *   const { makeWASocket, initAuthCreds, ... } = await loadBaileys();
 */

let _baileys = null;

async function loadBaileys() {
  if (!_baileys) {
    _baileys = await import('@whiskeysockets/baileys');
  }
  return _baileys;
}

module.exports = { loadBaileys };
