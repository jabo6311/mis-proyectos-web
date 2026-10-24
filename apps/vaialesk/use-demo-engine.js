import { useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import rules from "./shared/operations.cjs";
import { initialDemoState, demoReducer } from "./demo-state";
const KEY = "vai.presentation.v2";
export default function useDemoEngine() {
  const [state, setState] = useState(initialDemoState), [ready, setReady] = useState(false), [error, setError] = useState("");
  const current = useRef(state), writes = useRef(Promise.resolve());
  useEffect(() => { let active = true; AsyncStorage.getItem(KEY).then(value => {
    if (!active || !value) return;
    const parsed = JSON.parse(value);
    if (parsed.version !== 2 || !Array.isArray(parsed.rides) || !parsed.driver || !["passenger", "driver", "admin", "dispatcher"].includes(parsed.role)) throw new Error("invalid saved presentation");
    current.current = parsed; setState(parsed);
  }).catch(() => { if (active) setError("No se pudo recuperar la prueba anterior. Puedes comenzar una nueva."); }).finally(() => { if (active) setReady(true); }); return () => { active = false; }; }, []);
  async function action(type, payload = {}) {
    try {
      const next = demoReducer(current.current, { type, ...payload, id: payload.id || `demo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` });
      current.current = next; setState(next); setError("");
      writes.current = writes.current.catch(() => {}).then(() => AsyncStorage.setItem(KEY, JSON.stringify(next)));
      await writes.current.catch(() => { setError("La prueba funciona, pero el teléfono no pudo guardarla. Evita cerrar la app hasta terminar."); });
      return true;
    } catch (e) { setError(e.message); return false; }
  }
  return { ...state, profile: { id: state.role === "driver" ? state.driver.id : "demo-passenger", full_name: state.operations?.profiles?.[state.role === "driver" ? state.driver.id : "demo-passenger"]?.full_name || (state.role === "driver" ? state.driver.full_name : "Invitado"), role: state.role }, drivers: [{...state.driver, online: state.driver.online && !rules.eligibility(state.operations, state.driver)}], users: [{id:"demo-passenger",full_name:"Pasajero de prueba",role:"passenger"},{id:state.driver.id,full_name:state.driver.full_name,role:"driver"}], ready, error, busy: false, presentation: true, operation: (operation,payload={})=>action("OPERATION",{operation,payload,id:payload.id}), action, refresh: () => setError("") };
}
