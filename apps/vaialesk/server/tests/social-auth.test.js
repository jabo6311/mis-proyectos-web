import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createTokenVerifier } from '../src/auth.js';
const url = 'https://vai-auth-test.supabase.co';
const user = 'c5a41968-d4ee-472f-ac1d-7e5c399430f8';
const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const jwk = { ...pair.publicKey.export({ format: 'jwk' }), kid: 'vai-test-key', alg: 'ES256', use: 'sig' };
const claims = () => ({ sub: user, iss: `${url}/auth/v1`, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now()/1000)+3600, app_metadata: { provider: 'google' }, user_metadata: { full_name: 'Prueba', role: 'admin' } });
const base64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
function jwt(payload) {
  const data = `${base64({ alg: 'ES256', kid: jwk.kid, typ: 'JWT' })}.${base64(payload)}`;
  return `${data}.${sign('sha256', Buffer.from(data), { key: pair.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
}
function verifier() {
  const db = createClient(url, 'public-test-key', { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async request => {
    assert.ok(String(request).startsWith(`${url}/auth/v1/.well-known/jwks.json`));
    return new Response(JSON.stringify({ keys: [jwk] }), { headers: { 'Content-Type': 'application/json' } });
  } } });
  return createTokenVerifier(db.auth, url);
}
test('real signed Supabase JWTs from all three providers verify; user metadata cannot grant roles', async () => {
  const verify = verifier();
  for (const provider of ['google','azure','apple']) {
    const result = await verify(jwt({ ...claims(), app_metadata: { provider } }));
    assert.equal(result.sub, user); assert.equal(result.name, 'Prueba'); assert.equal(result.role, undefined);
  }
});
test('altered signature, foreign issuer, wrong audience, anonymous, legacy and expired sessions fail closed', async () => {
  const verify = verifier(), valid = jwt(claims());
  const pieces = valid.split('.'); pieces[1] = base64({ ...claims(), role: 'service_role' });
  await assert.rejects(verify(pieces.join('.')));
  for (const patch of [{ iss: 'https://example.auth0.com/' }, { aud: 'another-api' }, { role: 'service_role' }, { exp: 0 }, { sub: 'google-oauth2|123' }, { is_anonymous: true }, { app_metadata: { provider: 'email' } }, { app_metadata: {} }]) await assert.rejects(verify(jwt({ ...claims(), ...patch })));
  await assert.rejects(verify('unsigned-or-invalid'));
});
