const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const babel = require("@babel/core");

function load(file, mocks = {}) {
  const code = babel.transformSync(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), {
    filename: file,
    presets: [["babel-preset-expo", { jsxRuntime: "classic" }]],
    plugins: ["@babel/plugin-transform-modules-commonjs"]
  }).code;
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports,
    require: (name) => {
      if (name in mocks) return mocks[name];
      if (name === "expo/virtual/env") return { env: {
        EXPO_PUBLIC_AUTH0_DOMAIN: "example.auth0.com",
        EXPO_PUBLIC_AUTH0_CLIENT_ID: "test-client",
        EXPO_PUBLIC_AUTH0_AUDIENCE: "https://api.example.com",
        EXPO_PUBLIC_API_URL: "https://api.example.com"
      } };
      if (name.startsWith("@babel/runtime/")) return require(name);
      throw new Error(`Unexpected native import: ${name}`);
    },
    setTimeout, clearTimeout, AbortController, fetch, process: { env: {
      EXPO_PUBLIC_AUTH0_DOMAIN: "example.auth0.com",
      EXPO_PUBLIC_AUTH0_CLIENT_ID: "test-client",
      EXPO_PUBLIC_AUTH0_AUDIENCE: "https://api.example.com",
      EXPO_PUBLIC_API_URL: "https://api.example.com"
    } }
  });
  return module.exports;
}

const react = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useCallback: (fn) => fn,
  useEffect: () => {},
  useMemo: (fn) => fn(),
  useState: (initial) => [initial, () => {}]
};
const rn = new Proxy({ StyleSheet: { create: (s) => s }, Platform: { OS: "android" } }, {
  get: (target, key) => target[key] || key
});

test("Expo Go shows installation guidance without importing Auth0 or NativeApp", () => {
  const { default: App } = load("App.js", {
    react,
    "react-native": rn,
    "expo-constants": { executionEnvironment: "storeClient" }
  });
  assert.match(JSON.stringify(App()), /Instala el APK/);
});

test("a standalone APK loads the native app", () => {
  function NativeApp() {}
  const { default: App } = load("App.js", {
    react, "react-native": rn,
    "expo-constants": { executionEnvironment: "standalone" },
    "./NativeApp": { default: NativeApp }
  });
  assert.equal(App().type, NativeApp);
});

const { requestApi } = load("api-request.js");
const defaults = {
  apiUrl: "https://api.example.com", path: "/api/me",
  getCredentials: async () => ({ accessToken: "test-token" })
};

test("successful profile request carries the access token", async () => {
  const result = await requestApi({ ...defaults, fetchImpl: async (url, options) => {
    assert.equal(url, "https://api.example.com/api/me");
    assert.equal(options.headers.Authorization, "Bearer test-token");
    return { ok: true, json: async () => ({ profile: { id: "1", role: "passenger" } }) };
  } });
  assert.equal(result.profile.id, "1");
});

test("offline API produces a recoverable connection message", async () => {
  await assert.rejects(requestApi({ ...defaults, fetchImpl: async () => { throw new Error("offline"); } }), /No se pudo conectar/);
});

test("a stalled credential lookup reaches the deadline without calling the API", async () => {
  await assert.rejects(requestApi({ ...defaults, timeoutMs: 10,
    getCredentials: () => new Promise(() => {}),
    fetchImpl: () => { throw new Error("must not fetch"); }
  }), /no respondió a tiempo/);
});

test("a stalled API reaches the deadline and aborts its request", async () => {
  let signal;
  await assert.rejects(requestApi({ ...defaults, timeoutMs: 10,
    fetchImpl: (_, options) => { signal = options.signal; return new Promise(() => {}); }
  }), /no respondió a tiempo/);
  assert.equal(signal.aborted, true);
});

test("invalid JSON and missing profile do not leave profile loading forever", async () => {
  await assert.rejects(requestApi({ ...defaults, fetchImpl: async () => ({
    status: 502, json: async () => { throw new Error("HTML"); }
  }) }), /respuesta inválida/);
  await assert.rejects(requestApi({ ...defaults, fetchImpl: async () => ({
    ok: true, json: async () => ({ profile: null })
  }) }), /perfil válido/);
});

test("API authentication errors remain visible", async () => {
  await assert.rejects(requestApi({ ...defaults, fetchImpl: async () => ({
    ok: false, status: 401, json: async () => ({ error: "Sesión inválida o vencida." })
  }) }), /Sesión inválida/);
});
