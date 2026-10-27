import WelcomeScreen from "./WelcomeScreen";
import AppVersion from "./AppVersion";
import React, { useState, useEffect, useRef } from "react";
import { ActivityIndicator, StyleSheet, Text, View, TouchableOpacity, ScrollView, Linking } from "react-native";
import useVaiAuth from "./use-vai-auth";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import MobilityApp from "./MobilityApp";
import useDemoEngine from "./use-demo-engine";
import useConnectedEngine from "./use-connected-engine";
export default function NativeApp() {
  const [mode, setMode] = useState(null),[demoRole,setDemoRole]=useState("passenger");
  useEffect(()=>{let live=true;Linking.getInitialURL().then(url=>{if(live&&url?.startsWith("vaialesk://auth/callback"))setMode("connected");}).catch(()=>{});return()=>{live=false;};},[]);
  const openDemo=(role="passenger")=>{setDemoRole(role);setMode("demo");};
  return <SafeAreaProvider><StatusBar style="dark" />{mode === "demo" ? <Demo initialRole={demoRole} onExit={() => setMode(null)} /> : mode === "connected" ?
    <Connected onExit={() => setMode(null)} /> :
    <Welcome onDemo={openDemo} onConnect={() => setMode("connected")} />}</SafeAreaProvider>;
}
function Demo({ onExit,initialRole }) { const engine = useDemoEngine();const started=useRef(false);useEffect(()=>{if(engine.ready&&!started.current){started.current=true;engine.action("ROLE",{role:initialRole});}},[engine.ready]); return <MobilityApp engine={engine} onExit={onExit} />; }
function Connected({ onExit }) {
  const auth = useVaiAuth();
  if (auth.loading) return <SafeAreaView style={s.loading}><ActivityIndicator color="#197652" /><Text>Cargando tu sesión…</Text><AppVersion/></SafeAreaView>;
  if (auth.session) return <ConnectedWorkspace auth={auth} onExit={onExit} />;
  return <Welcome onDemo={onExit} connected auth={auth} error={auth.error} />;
}
function ConnectedWorkspace({ auth, onExit }) {
  const engine = useConnectedEngine(auth.getCredentials);
  async function logout() { if (await auth.signOut()) onExit(); }
  return <View style={{flex:1}}>{auth.error ? <Text accessibilityRole="alert" style={s.error}>{auth.error}</Text> : null}<MobilityApp engine={engine} onExit={onExit} onLogout={logout} /></View>;
}

function Welcome({ onDemo, onConnect, connected, auth, error }) {
  return <WelcomeScreen onDemo={onDemo} onConnect={onConnect} connected={connected} auth={auth} error={error} onBack={onDemo}/>;
}
const s=StyleSheet.create({loading:{flex:1,justifyContent:"center",alignItems:"center",gap:14,backgroundColor:"#f5f7f9"},error:{color:"#a53224",backgroundColor:"#fff0ee",padding:14}});
