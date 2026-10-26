import ConnectionStatus from "./connection-status";
import AppVersion from "./AppVersion";
import React, { useState, useEffect, useRef } from "react";
import { ActivityIndicator, StyleSheet, Text, View, TouchableOpacity, ScrollView, Linking } from "react-native";
import useVaiAuth from "./use-vai-auth";
import ProviderButtons from "./ProviderButtons";
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
  return <SafeAreaView style={s.welcome}><ScrollView contentContainerStyle={s.hero}><Text style={s.brand}>VAI<Text style={s.dot}>.</Text></Text><Text style={s.kicker}>TU CIUDAD. A TU RITMO.</Text><AppVersion/><View style={s.art}><Text style={s.route}>A ━━━━━━━ ● ━━━ B</Text><Text style={s.artCaption}>Un punto de partida. Muchas posibilidades.</Text></View><Text style={s.title}>{connected ? "Qué bueno verte." : "El próximo viaje\nempieza contigo."}</Text><Text style={s.body}>{connected ? "Inicia sesión para viajar o conducir con tu cuenta." : "Pide un viaje, descubre la experiencia de conducir y explora la administración. Todo en un solo lugar."}</Text>
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    {connected ? <><ProviderButtons auth={auth}/><TouchableOpacity accessibilityRole="button" style={s.link} onPress={onDemo}><Text style={s.linkText}>Volver al inicio</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" style={s.link} onPress={()=>Linking.openURL("https://accounts.google.com/signin/recovery")}><Text style={s.linkText}>Recuperar acceso de Google</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" style={s.link} onPress={()=>Linking.openURL("https://account.live.com/password/reset")}><Text style={s.linkText}>Recuperar acceso de Microsoft</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" style={s.link} onPress={()=>Linking.openURL("https://iforgot.apple.com/")}><Text style={s.linkText}>Recuperar acceso de Apple</Text></TouchableOpacity><ConnectionStatus/></> : <><TouchableOpacity accessibilityRole="button" style={s.primary} onPress={()=>onDemo("passenger")}><Text style={s.primaryText}>Probar como usuario →</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" style={[s.secondary,{marginBottom:10}]} onPress={()=>onDemo("driver")}><Text style={s.secondaryText}>Probar como conductor</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" style={[s.secondary,{marginBottom:10}]} onPress={()=>onDemo("admin")}><Text style={s.secondaryText}>Probar como administrador</Text></TouchableOpacity>{onConnect && <TouchableOpacity accessibilityRole="button" style={s.secondary} onPress={onConnect}><Text style={s.secondaryText}>Entrar con mi cuenta</Text></TouchableOpacity>}<Text style={s.note}>La presentación funciona sin servidor. Usa viajes de prueba y guarda tu progreso en este teléfono.</Text></>}
  </ScrollView></SafeAreaView>;
}
const s = StyleSheet.create({ loading: { flex: 1, justifyContent: "center", alignItems: "center", gap: 14 }, welcome: { flex: 1, backgroundColor: "#f4f7f3" }, hero: { flexGrow: 1, justifyContent: "center", padding: 28, width: "100%", maxWidth: 560, alignSelf: "center" }, brand: { fontSize: 43, color: "#153e31", fontWeight: "900", letterSpacing: -2 }, dot: { color: "#e88e62" }, kicker: { fontSize: 10, color: "#5b7766", letterSpacing: 2.3, fontWeight: "800", marginTop: 7 }, art: { backgroundColor: "#e2eddf", borderRadius: 28, padding: 26, marginVertical: 30 }, route: { fontSize: 29, color: "#197652", fontWeight: "800", textAlign: "center" }, artCaption: { textAlign: "center", fontSize: 11, color: "#627a66", marginTop: 15 }, title: { fontSize: 34, lineHeight: 40, fontWeight: "800", color: "#163d30", letterSpacing: -1 }, body: { fontSize: 15, lineHeight: 23, color: "#65796b", marginTop: 14, marginBottom: 25 }, primary: { backgroundColor: "#197652", padding: 17, borderRadius: 16, alignItems: "center", marginBottom: 10 }, primaryText: { color: "white", fontSize: 15, fontWeight: "800" }, secondary: { padding: 17, borderRadius: 16, borderWidth: 1, borderColor: "#cad8cc", alignItems: "center" }, secondaryText: { color: "#214c37", fontSize: 14, fontWeight: "700" }, note: { fontSize: 12, lineHeight: 18, color: "#718475", marginTop: 20, textAlign: "center" }, link: { padding: 18, alignItems: "center" }, linkText: { color: "#197652", fontWeight: "700" }, error: { color: "#ad423b", backgroundColor: "#fff0eb", padding: 12, marginBottom: 14, borderRadius: 12 } });
