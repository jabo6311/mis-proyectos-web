const { test } = require('node:test');
const assert = require('node:assert/strict');
const { callbackCode, NATIVE_REDIRECT, oauthOptions, publicConfig } = require('../auth-flow.cjs');
const { codeExchange } = require('../oauth-session.cjs');
const { secureSessionStorage } = require('../secure-session-storage.cjs');

test('OAuth callback accepts one authorization code, rejects foreign destinations and implicit tokens', () => {
  assert.equal(callbackCode(`${NATIVE_REDIRECT}?code=one-use-code`, NATIVE_REDIRECT), 'one-use-code');
  for (const url of ['other://auth/callback?code=x','vaialesk://evil/callback?code=x','vaialesk://auth/callback/extra?code=x','vaialesk://auth/callback?code=','vaialesk://auth/callback?code=a&code=b','vaialesk://auth/callback#access_token=secret','vaialesk://auth/callback?error=denied&error_description=private']) assert.throws(() => callbackCode(url, NATIVE_REDIRECT));
});
test('web callbacks are bound to the exact HTTPS origin and root path', () => {
  assert.equal(callbackCode('https://panel.example/?code=x', 'https://panel.example/'), 'x');
  for (const url of ['http://panel.example/?code=x','https://other.example/?code=x','https://panel.example/callback?code=x','https://user@panel.example/?code=x']) assert.throws(() => callbackCode(url, 'https://panel.example/'));
});
test('Microsoft explicitly requests email; arbitrary provider names cannot start OAuth', () => {
  assert.equal(oauthOptions('azure', NATIVE_REDIRECT).options.scopes, 'email');
  assert.equal(oauthOptions('google', NATIVE_REDIRECT).options.skipBrowserRedirect, true);
  assert.equal(oauthOptions('apple', NATIVE_REDIRECT).provider, 'apple');
  assert.throws(() => oauthOptions('password', NATIVE_REDIRECT));
});
test('configuration rejects HTTP URLs, secret keys and credential-bearing URLs', () => {
  assert.equal(publicConfig('https://project.supabase.co', 'sb_publishable_test_123456789'), true);
  for (const [url,key] of [['http://project.supabase.co','public-key-that-is-long'],['https://user:secret@project.supabase.co','public-key-that-is-long'],['https://project.supabase.co?key=x','public-key-that-is-long'],['https://project.supabase.co','sb_secret_do-not-publish']]) assert.equal(publicConfig(url,key), false);
});
test('native browser result and deep-link event exchange the same code once', async () => {
  let calls = 0;
  const exchange = codeExchange({ exchangeCodeForSession: async code => { calls++; await new Promise(setImmediate); return { data: { session: { access_token: code } } }; } }, NATIVE_REDIRECT, callbackCode);
  const results = await Promise.all([exchange(`${NATIVE_REDIRECT}?code=a`), exchange(`${NATIVE_REDIRECT}?code=a`)]);
  assert.equal(calls, 1); assert.equal(results[0].access_token, 'a');
  await assert.rejects(async () => exchange('vaialesk://wrong/callback?code=a'));
});
test('failed OAuth exchange cannot masquerade as a completed login', async () => {
  const exchange = codeExchange({ exchangeCodeForSession: async () => ({ error: { message: 'secret diagnostic' } }) }, NATIVE_REDIRECT, callbackCode);
  await assert.rejects(exchange(`${NATIVE_REDIRECT}?code=x`), error => !error.message.includes('secret') && /sesión/.test(error.message));
});
function vault() {
  const values = new Map(); let fail = false;
  return { values, set fail(value) { fail = value; }, WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
    getItemAsync: async key => values.get(key) ?? null,
    setItemAsync: async (key,value) => { if (fail && /\.1$/.test(key)) throw Error('locked'); assert.ok(Buffer.byteLength(value) <= 2048); values.set(key,Buffer.from(value).toString('utf8')); },
    deleteItemAsync: async key => { values.delete(key); }
  };
}
test('large Unicode sessions round-trip in SecureStore-sized chunks and are removed on logout', async () => {
  const store = vault(), storage = secureSessionStorage(store), value = JSON.stringify({ refresh_token: '🔑'.repeat(2500) });
  await storage.setItem('session', value); assert.equal(await storage.getItem('session'), value);
  await storage.removeItem('session'); assert.equal(await storage.getItem('session'), null); assert.equal(store.values.size, 0);
});
test('interrupted secure writes preserve the previous session without exposing orphan chunks', async () => {
  const store = vault(), storage = secureSessionStorage(store);
  await storage.setItem('session', 'old-session'); store.fail = true;
  await assert.rejects(storage.setItem('session', 'x'.repeat(1200)));
  assert.equal(await storage.getItem('session'), 'old-session'); assert.equal(store.values.size, 2);
});
test('concurrent refresh writes serialize and leave only the final session', async () => {
  const store = vault(), storage = secureSessionStorage(store);
  await Promise.all([storage.setItem('session','first'),storage.setItem('session','second')]);
  assert.equal(await storage.getItem('session'), 'second'); assert.equal(store.values.size, 2);
});
test('Supabase OAuth generates an S256 challenge and keeps its verifier out of the URL', async () => {
  const { GoTrueClient } = await import('@supabase/auth-js');
  const values = new Map();
  const client = {auth: new GoTrueClient({url:'https://project.supabase.co/auth/v1',headers:{apikey:'public-test-key'}, flowType: 'pkce', persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, storage: { getItem: key => values.get(key) ?? null, setItem: (key,value) => values.set(key,value), removeItem: key => values.delete(key) } }) };
  const { data, error } = await client.auth.signInWithOAuth(oauthOptions('google', NATIVE_REDIRECT));
  assert.equal(error, null);
  const url = new URL(data.url); assert.equal(url.searchParams.get('code_challenge_method'), 's256');
  const verifier = [...values.entries()].find(([key]) => key.includes('code-verifier'))?.[1];
  assert.ok(verifier); assert.ok(!data.url.includes(verifier));
});

test('parallel PKCE flows pass their own verifier IDs to the SDK', async () => {
 let seen;
 const exchange=codeExchange({exchangeCodeForSession:async(code,options)=>{seen=options;return {data:{session:{access_token:code}}};}},NATIVE_REDIRECT,callbackCode);
 await exchange(`${NATIVE_REDIRECT}?code=x&sb_flow_id=flow_12345678`);assert.equal(seen.flowId,'flow_12345678');
 await assert.rejects(async()=>exchange(`${NATIVE_REDIRECT}?code=y&sb_flow_id=invalid!`));
});
test('Hermes OAuth shim uses native random values and SHA-256 instead of an insecure fallback', async () => {
 const fs=require('node:fs'),vm=require('node:vm'),babel=require('@babel/core'),crypto=require('node:crypto');
 let randomCalls=0,digestCalls=0;
 const native={getRandomValues:bytes=>{randomCalls++;return crypto.randomFillSync(bytes);},CryptoDigestAlgorithm:{SHA256:'SHA-256'},digest:async(algorithm,data)=>{digestCalls++;assert.equal(algorithm,'SHA-256');return crypto.webcrypto.subtle.digest('SHA-256',data);}};
 const source=babel.transformSync(fs.readFileSync(require('node:path').join(__dirname,'../native-oauth-crypto.js'),'utf8'),{plugins:['@babel/plugin-transform-modules-commonjs']}).code;
 const context={require:()=>native,exports:{},Uint8Array};vm.runInNewContext(source,context);
 context.crypto.getRandomValues(new Uint8Array(32));
 const digest=await context.crypto.subtle.digest('SHA-256',new TextEncoder().encode('abc'));
 assert.equal(Buffer.from(digest).toString('hex'),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');assert.equal(randomCalls,1);assert.equal(digestCalls,1);
});
