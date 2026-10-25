import React from "react";
import { Text, Platform } from "react-native";
import Constants from "expo-constants";
export default function AppVersion() {
  const config = Constants.expoConfig;
  const version = config?.version || "desarrollo";
  const build = Platform.OS === "android" ? config?.android?.versionCode : Platform.OS === "ios" ? config?.ios?.buildNumber : null;
  return <Text accessibilityLabel={`Versión de VAI ${version}${build ? `, compilación ${build}` : ""}`} style={{fontSize:11,lineHeight:16,color:"#65796b",marginTop:4}}>VAI {version}{build ? ` · compilación ${build}` : ""}</Text>;
}
