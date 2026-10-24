export default {
  expo: {
    name: "Vaialesk",
    slug: "vaialesk",
    version: "1.1.0",
    scheme: "vaialesk",
    orientation: "portrait",
    userInterfaceStyle: "light",
    plugins: [
      ["expo-location", { locationWhenInUsePermission: "Permite que Vaialesk use tu ubicación para elegir el origen y compartir tu posición durante el viaje." }],
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
      supportsTablet: true
    },
    android: {
      package: "com.vaialesk.mobile",
      versionCode: 2
    },
    extra: {
      eas: {
        projectId: "fcf4ec62-e9cb-44d5-aa9b-0ade8d3f2641"
      }
    }
  }
};

