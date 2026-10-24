import React, { useEffect, useRef, useState } from "react";
import { mapHtml, parseMapMessage } from "./map-html";
export default function RideMap({ data, onPick, style }) {
  const ref = useRef(null), latest = useRef(data), pick = useRef(onPick), [ready, setReady] = useState(false);
  latest.current = data; pick.current = onPick;
  useEffect(() => { const receive = e => { if (e.source !== ref.current?.contentWindow) return; const d = parseMapMessage(e.data?.vaialeskMap); if (d?.type === "ready") { setReady(true); ref.current.contentWindow.postMessage({ vaialeskMapData: latest.current }, "*"); } if (d?.type === "pick") pick.current?.(d); }; window.addEventListener("message", receive); return () => window.removeEventListener("message", receive); }, []);
  useEffect(() => { if (ready) ref.current?.contentWindow?.postMessage({ vaialeskMapData: data }, "*"); }, [data, ready]);
  return <iframe ref={ref} title="Mapa del viaje" srcDoc={mapHtml} sandbox="allow-scripts allow-same-origin allow-popups" style={{ border: 0, width: "100%", height: 320, borderRadius: 22, ...style }} />;
}
