export default {
  expo: {
    name: "Vaialesk",
    slug: "vaialesk",
    version: "1.0.0",
    orientation: "portrait",
    userInterfaceStyle: "light",
    plugins: ["expo-status-bar"],
    ios: {
      supportsTablet: true,
      config: {
        googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || ""
      }
    },
    android: {
      config: {
        googleMaps: {
          apiKey: process.env.GOOGLE_MAPS_API_KEY || ""
        }
      }
    }
  }
};
