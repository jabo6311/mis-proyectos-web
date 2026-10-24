export const ACTIVE = ["searching", "accepted", "in_progress"];
export function validCoordinates(lat, lng) { return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180; }
export function distance(a, b) { const r = Math.PI / 180, h = Math.sin((b.latitude - a.latitude) * r / 2) ** 2 + Math.cos(a.latitude * r) * Math.cos(b.latitude * r) * Math.sin((b.longitude - a.longitude) * r / 2) ** 2; return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h))); }
export function fare(km) { return Math.round((4500 + km * 1800) / 500) * 500; }
const routes = new Map();
export async function planRoute(a, b) {
  const key = JSON.stringify([a, b]); if (routes.has(key)) return routes.get(key);
  let route;
  try { const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${a.longitude},${a.latitude};${b.longitude},${b.latitude}?overview=full&geometries=geojson`, { signal: AbortSignal.timeout(6000) }); const body = await res.json(), r = body.routes?.[0]; if (!res.ok || body.code !== "Ok" || !r?.geometry?.coordinates) throw new Error("no route"); route = { distance_km: r.distance / 1000, duration_minutes: Math.max(1, Math.ceil(r.duration / 60)), route_geometry: r.geometry.coordinates.map(([longitude, latitude]) => ({ latitude, longitude })), route_approximate: false }; }
  catch { const km = distance(a, b) * 1.3; route = { distance_km: km, duration_minutes: Math.max(1, Math.ceil(km * 3)), route_geometry: [a, b], route_approximate: true }; }
  if (routes.size > 200) routes.clear(); routes.set(key, route); return route;
}
