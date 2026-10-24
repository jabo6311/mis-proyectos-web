import React, { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Linking } from "react-native";
import { WebView } from "react-native-webview";
import { mapHtml, parseMapMessage } from "./map-html";

export default function RideMap({ data, onPick, style }) {
  const ref = useRef(null), latest = useRef(data), [ready, setReady] = useState(false), [failed, setFailed] = useState(false), [key, setKey] = useState(0);
  latest.current = data;
  function send(d) { ref.current?.injectJavaScript(`window.setMapData&&window.setMapData(${JSON.stringify(d).replace(/</g, "\\u003c")});true;`); }
  useEffect(() => { if (ready) send(data); }, [data, ready]);
  useEffect(() => { const timer = setTimeout(() => { if (!ready) setFailed(true); }, 15000); return () => clearTimeout(timer); }, [ready, key]);
  return <View style={[s.wrap, style]}>
    <WebView key={key} ref={ref} source={{ html: mapHtml, baseUrl: "https://jabo6311.github.io/mis-proyectos-web/" }} style={s.map}
      javaScriptEnabled domStorageEnabled applicationNameForUserAgent="VAI-MVP/1.1 (github.com/jabo6311/mis-proyectos-web)"
      onMessage={event => { const d = parseMapMessage(event.nativeEvent.data); if (d?.type === "ready") { setReady(true); setFailed(false); send(latest.current); } if (d?.type === "error") setFailed(true); if (d?.type === "pick") onPick?.(d); }}
      onError={() => setFailed(true)} onShouldStartLoadWithRequest={request => { if (request.url.includes("openstreetmap.org/copyright")) { Linking.openURL(request.url); return false; } return request.url === "about:blank" || request.url.startsWith("https://jabo6311.github.io/"); }} />
    {failed && <View style={s.error}><Text style={s.text}>El mapa necesita conexión a Internet.</Text><TouchableOpacity accessibilityRole="button" onPress={() => { setReady(false); setFailed(false); setKey(k => k + 1); }}><Text style={s.retry}>Recargar mapa</Text></TouchableOpacity></View>}
  </View>;
}
const s = StyleSheet.create({ wrap: { overflow: "hidden", borderRadius: 22, minHeight: 260 }, map: { flex: 1, backgroundColor: "#e9eeea" }, error: { position: "absolute", bottom: 26, left: 12, right: 12, backgroundColor: "white", padding: 14, borderRadius: 14 }, text: { color: "#273e34", fontSize: 13 }, retry: { color: "#197652", fontWeight: "700", marginTop: 8 } });
