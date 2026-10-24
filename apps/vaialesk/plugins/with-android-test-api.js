const { withAndroidManifest, withDangerousMod } = require("expo/config-plugins");
const fs = require("node:fs/promises");
const path = require("node:path");

function getTestApiNetworkConfig(apiUrl, buildProfile) {
  if (!["preview", "development"].includes(buildProfile)) return null;
  let url;
  try { url = new URL(apiUrl); } catch { return null; }
  if (url.protocol !== "http:") return null;
  const host = url.hostname.replace(/[<>&"']/g, "");
  return `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false" />
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">${host}</domain>
  </domain-config>
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
