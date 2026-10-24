import { useCallback, useEffect, useRef, useState } from "react";
import { requestApi } from "./api-request";
const apiUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "");
export default function useConnectedEngine(getCredentials) {
  const [state, setState] = useState(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const fetching = useRef(false), mutating = useRef(false), mounted = useRef(true), generation = useRef(0);
  const request = useCallback((path, options = {}) => requestApi({ apiUrl, path, getCredentials, options }), [getCredentials]);
  const refresh = useCallback(async () => {
    if (fetching.current || mutating.current) return;
    fetching.current = true;
    const version = generation.current;
    try { const data = await request("/api/workspace"); if (mounted.current && version === generation.current) { setState(data); setError(""); } }
    catch (e) { if (mounted.current && version === generation.current) setError(e.message); }
    finally { fetching.current = false; }
  }, [request]);
  useEffect(() => { mounted.current = true; refresh(); const id = setInterval(refresh, 3000); return () => { mounted.current = false; clearInterval(id); }; }, [refresh]);
  async function action(type, payload = {}) {
    if (mutating.current) return false;
    mutating.current = true; setBusy(true); setError(""); generation.current++;
    const routes = {
      ROLE: ["/api/me/mode", "POST", { role: payload.role }], DRIVER: ["/api/drivers/application", "POST", payload.driver],
      ONLINE: ["/api/driver/availability", "POST", { online: payload.online }], REVIEW: [`/api/admin/drivers/${payload.id}/approval`, "PATCH", { approved: payload.approved }],
      ACCEPT: [`/api/rides/${payload.id}/accept`, "POST", {}], STATUS: [`/api/rides/${payload.id}/status`, "PATCH", { status: payload.status }],
      RATING: [`/api/rides/${payload.id}/rating`, "POST", { score: payload.score }], LOCATION: ["/api/driver/location", "POST", payload.point]
    };
    if (type === "REQUEST") { const d = payload.draft; routes.REQUEST = ["/api/rides", "POST", { pickup_address: d.pickup.address, destination_address: d.destination.address, pickup_lat: d.pickup.latitude, pickup_lng: d.pickup.longitude, destination_lat: d.destination.latitude, destination_lng: d.destination.longitude, payment_method: "cash" }]; }
    try {
      if (!routes[type]) throw new Error("Acción no disponible en modo conectado.");
      const [path, method, body] = routes[type]; await request(path, { method, body: JSON.stringify(body) });
      const data = await request("/api/workspace"); if (mounted.current) { setState(data); setError(""); } return true;
    } catch (e) { if (mounted.current) setError(e.message); return false; }
    finally { mutating.current = false; if (mounted.current) setBusy(false); }
  }
  const ownDriver = state?.drivers?.find(d => d.id === state?.profile?.id);
  return { ...state, role: state?.profile?.role || "passenger", driver: ownDriver || { driver_status: state?.profile?.driver_status, ...state?.profile }, driverLocation: state?.driverLocation, ready: !!state, error, busy, presentation: false, action, refresh };
}
