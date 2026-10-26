import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Constants from "expo-constants";

export default function App() {
  if (Constants.executionEnvironment === "storeClient") {
    return (
      <View style={styles.screen}>
        <Text style={styles.brand}>VAI</Text>
        <Text style={styles.title}>Instala el APK de VAI</Text>
        <Text style={styles.body}>
          Para regresar correctamente desde Google, Microsoft o Apple,
          utiliza la aplicación instalada de VAI.
        </Text>
        <Text style={styles.body}>
          Instala el APK de prueba generado con el perfil preview y abre
          VAI desde su propio icono en Android.
        </Text>
      </View>
    );
  }

  // OAuth needs the application's registered callback, unavailable in Expo Go.
  const NativeApp = require("./NativeApp").default;
  return <NativeApp />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: "center", padding: 28, backgroundColor: "#f5f8f6" },
  brand: { color: "#1a7758", fontSize: 34, fontWeight: "800", marginBottom: 24 },
  title: { color: "#153d33", fontSize: 24, fontWeight: "700", marginBottom: 12 },
  body: { color: "#426253", fontSize: 16, lineHeight: 24, marginBottom: 16 }
});
