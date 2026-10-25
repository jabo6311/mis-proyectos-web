export default {
  expo: {
    name: "VAI",
    slug: "vaialesk",
    version: "1.3.1",
    scheme: "vaialesk",
    orientation: "portrait",
    userInterfaceStyle: "light",
    icon: "./assets/vai-icon.png",
    web: { name: "VAI · Administración y despacho", favicon: "./assets/vai-icon.png" },
    plugins: [
      "expo-notifications",
      ["expo-image-picker",{photosPermission:"Selecciona una fotografía de tu documento para que VAI valide tu perfil.",cameraPermission:false,microphonePermission:false}],
      ["expo-location", { locationWhenInUsePermission: "Permite que VAI use tu ubicación para elegir el origen y compartir tu posición durante el viaje." }],
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
      versionCode: 5
    },
    extra: {
      eas: {
        projectId: "fcf4ec62-e9cb-44d5-aa9b-0ade8d3f2641"
      }
    }
  }
};

