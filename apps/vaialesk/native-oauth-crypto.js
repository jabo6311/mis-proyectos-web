import * as Crypto from 'expo-crypto';
// Hermes lacks complete WebCrypto. Prevent fallback to Math.random / PKCE plain.
if (!globalThis.crypto) globalThis.crypto = {};
if (!globalThis.crypto.getRandomValues) globalThis.crypto.getRandomValues = Crypto.getRandomValues;
if (!globalThis.crypto.subtle) globalThis.crypto.subtle = {};
if (!globalThis.crypto.subtle.digest) globalThis.crypto.subtle.digest = (algorithm, data) => {
  if ((typeof algorithm === 'string' ? algorithm : algorithm.name).toUpperCase() !== 'SHA-256') throw new Error('Unsupported OAuth digest');
  return Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, data);
};
