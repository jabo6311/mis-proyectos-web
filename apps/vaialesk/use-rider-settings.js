import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import experience from "./shared/rider-experience.cjs";
export default function useRiderSettings(scope) {
  const key = `vai.rider.v1:${scope}`, [record, setRecord] = useState(null), [error, setError] = useState("");
  const current = useRef(null), queue = useRef(Promise.resolve());
  useEffect(() => {
    let live = true; current.current = null; setRecord(null); setError("");
    // Await pending writes before reading on an identity change.
    queue.current.then(() => AsyncStorage.getItem(key)).then(value => {
      if (!live) return;
      let parsed; try { parsed = JSON.parse(value || "null"); } catch { parsed = null; }
      current.current = { key, ...experience.settings(parsed) }; setRecord(current.current);
    }).catch(() => { if (live) { current.current = { key, ...experience.settings(null) }; setRecord(current.current); setError("No pudimos recuperar tus favoritos en este teléfono."); } });
    return () => { live = false; };
  }, [key]);
  const update = useCallback(patch => {
    if (current.current?.key !== key) return;
    const next = { key, ...experience.settings({ ...current.current, ...patch }) };
    current.current = next; setRecord(next); setError("");
    queue.current = queue.current.catch(() => {}).then(() => AsyncStorage.setItem(key, JSON.stringify(experience.settings(next)))).catch(() => { if (current.current?.key === key) setError("No se guardó el cambio. Reintenta; al salir podría perderse."); });
  }, [key]);
  return { ...(record?.key === key ? record : experience.settings(null)), ready: record?.key === key, update, error };
}
