const nodeCrypto = require('node:crypto');
const cryptoObj = nodeCrypto.webcrypto || nodeCrypto;

try {
  Object.defineProperty(globalThis, 'crypto', {
    get() {
      return cryptoObj;
    },
    set(v) {
      // prevent unsetting
      if (v) return;
    },
    configurable: true,
    enumerable: true
  });
} catch (e) {
  globalThis.crypto = cryptoObj;
}
