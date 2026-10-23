export default {
  expo: {
    name: "Vaialesk",
    slug: "vaialesk",
    version: "1.0.0",
    scheme: "vaialesk",
    orientation: "portrait",
    userInterfaceStyle: "light",
    plugins: [
      [
        "./plugins/with-android-test-api",
        {
          apiUrl: process.env.EXPO_PUBLIC_API_URL,
          buildProfile: process.env.EAS_BUILD_PROFILE || "development"
        }
      ],
      "expo-status-bar",
      [
        "react-native-auth0",
        {
          domain:
            process.env.EXPO_PUBLIC_AUTH0_DOMAIN ||
            "vaialesk-auth0-not-configured.auth0.com",
          customScheme: "vaialesk"
        }
      ]
    ],
    ios: {
      bundleIdentifier: "com.vaialesk.mobile",
      supportsTablet: true,
      config: {
        googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || ""
      }
    },
    android: {
      package: "com.vaialesk.mobile",
      config: {
        googleMaps: {
          apiKey: process.env.GOOGLE_MAPS_API_KEY || ""
        }
      }
    },
    extra: {
      // Keep the native build's capability in the manifest used by Metro too.
      androidMapsConfigured: Boolean(process.env.GOOGLE_MAPS_API_KEY?.trim()),
      eas: {
        projectId: "fcf4ec62-e9cb-44d5-aa9b-0ade8d3f2641"
      }
    }
  }
};

