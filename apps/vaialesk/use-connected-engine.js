import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import polling from "./shared/polling.cjs";
import { requestApi } from "./api-request";
const apiUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "");
export default function useConnectedEngine(getCredentials) {
  const [state, setState] = useState(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const fetching = useRef(false), mutating = useRef(false), mounted = useRef(true), generation = useRef(0);
  const latest = useRef(null), saver = useRef(false), poller = useRef(null); latest.current = state;
  const setDataSaver = useCallback(value => { saver.current = !!value; poller.current?.reschedule(); }, []);
  const request = useCallback((path, options = {}) => requestApi({ apiUrl, path, getCredentials, options }), [getCredentials]);
  const refresh = useCallback(async () => {
    if (fetching.current || mutating.current) return;
    fetching.current = true;
    const version = generation.current;
    try { const data = await request("/api/workspace"); if (mounted.current && version === generation.current) { latest.current = data; setState(data); setError(""); } return true; }
    catch (e) { if (mounted.current && version === generation.current) setError(e.message); return false; }
    finally { fetching.current = false; }
  }, [request]);
  useEffect(() => {
    mounted.current = true;
    const worker = polling.createPoller({ refresh, delay: failures => polling.pollDelay(latest.current, saver.current, failures) }); poller.current = worker;
    if (!AppState.currentState || AppState.currentState === "active") worker.start();
    const subscription = AppState.addEventListener("change", value => value === "active" ? worker.start() : worker.stop());
    return () => { mounted.current = false; worker.stop(); subscription.remove(); };
  }, [refresh]);
  async function action(type, payload = {}) {
    if (mutating.current) return false;
    mutating.current = true; setBusy(true); setError(""); generation.current++;
    const routes = {
      ROLE: ["/api/me/mode", "POST", { role: payload.role }], DRIVER: ["/api/drivers/application", "POST", payload.driver],
      ONLINE: ["/api/driver/availability", "POST", { online: payload.online }], REVIEW: [`/api/admin/drivers/${payload.id}/approval`, "PATCH", { approved: payload.approved }],
      ACCEPT: [`/api/rides/${payload.id}/accept`, "POST", {}], STATUS: [`/api/rides/${payload.id}/status`, "PATCH", { status: payload.status, pin:payload.pin, reason:payload.reason }],
      RATING: [`/api/rides/${payload.id}/rating`, "POST", { score: payload.score, comment:payload.comment }], LOCATION: ["/api/driver/location", "POST", payload.point]
    };
    if(type === "OPERATION") routes.OPERATION=["/api/operations","POST",{operation:payload.operation,payload:payload.payload}];
    if (type === "REQUEST") { const d = payload.draft; routes.REQUEST = ["/api/rides", "POST", { pickup_address: d.pickup.address, destination_address: d.destination.address, pickup_lat: d.pickup.latitude, pickup_lng: d.pickup.longitude, destination_lat: d.destination.latitude, destination_lng: d.destination.longitude, payment_method: "cash", category:d.category, pickup_note:d.pickup_note, preferences:d.preferences }]; }
    try {
      if (!routes[type]) throw new Error("Acción no disponible en modo conectado.");
      const [path, method, body] = routes[type]; await request(path, { method, body: JSON.stringify(body) });
      const data = await request("/api/workspace"); if (mounted.current) { latest.current = data; setState(data); setError(""); } return true;
    } catch (e) { if (mounted.current) setError(e.message); return false; }
    finally { mutating.current = false; if (mounted.current) { setBusy(false); poller.current?.reschedule(); } }
  }
  const ownDriver = state?.drivers?.find(d => d.id === state?.profile?.id);
  return { ...state, role: state?.profile?.role || "passenger", driver: ownDriver || { driver_status: state?.profile?.driver_status, ...state?.profile }, driverLocation: state?.driverLocation, ready: !!state, error, busy, presentation: false, action, refresh, setDataSaver, operation:(operation,payload={})=>action("OPERATION",{operation,payload}),
    registerPush:async token=>request("/api/notifications/register",{method:"POST",body:JSON.stringify({token})}),
    shareTrip:async id=>(await request(`/api/rides/${id}/share`,{method:"POST",body:"{}"})).url,
    uploadDocument:async base64=>(await request("/api/documents/upload",{method:"POST",body:JSON.stringify({base64})})).file_id,
    documentUrl:async id=>(await request(`/api/documents/${id}`)).url };
}
