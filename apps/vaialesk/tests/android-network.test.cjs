const { test } = require("node:test");
const assert = require("node:assert/strict");
const { getTestApiNetworkConfig } = require("../plugins/with-android-test-api");

test("preview allows HTTP only to the configured API host", () => {
  const xml = getTestApiNetworkConfig("http://20.12.0.165:3000", "preview");
  assert.match(xml, /base-config cleartextTrafficPermitted="false"/);
  assert.match(xml, /<domain includeSubdomains="false">20\.12\.0\.165<\/domain>/);
});

test("production and HTTPS do not add an HTTP exception", () => {
  assert.equal(getTestApiNetworkConfig("http://20.12.0.165:3000", "production"), null);
  assert.equal(getTestApiNetworkConfig("https://api.example.com", "preview"), null);
  assert.equal(getTestApiNetworkConfig("invalid", "development"), null);
});
