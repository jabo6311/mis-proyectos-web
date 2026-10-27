const { withAndroidManifest, withDangerousMod } = require("expo/config-plugins");
const fs = require("node:fs/promises");
const path = require("node:path");

function getTestApiNetworkConfig(apiUrl, buildProfile) {
  if (!["preview", "development"].includes(buildProfile)) return null;
  let url;
  try { url = new URL(require("../api-endpoint-store.cjs").normalizeApiUrl(apiUrl, {allowLocalhost:true})); } catch { return null; }
  // Android has no CIDR matching for a changing LAN address. Only test builds
  // allow cleartext at platform level; the endpoint store rejects public HTTP.
  return `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="true" />
</network-security-config>
`;

}

module.exports = function withAndroidTestApi(config, options = {}) {
  const xml = getTestApiNetworkConfig(options.apiUrl, options.buildProfile);
  if (!xml) return config;
  config = withAndroidManifest(config, (mod) => {
    mod.modResults.manifest.application[0].$["android:networkSecurityConfig"] =
      "@xml/vaialesk_test_api";
    return mod;
  });
  return withDangerousMod(config, ["android", async (mod) => {
    const directory = path.join(mod.modRequest.platformProjectRoot, "app/src/main/res/xml");
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, "vaialesk_test_api.xml"), xml);
    return mod;
  }]);
};
module.exports.getTestApiNetworkConfig = getTestApiNetworkConfig;
