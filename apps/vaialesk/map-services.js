import { distanceKm, validPoint } from "./ride-utils";
const cache = new Map();
let lastSearch = 0;
// React Native's AbortSignal polyfill does not provide AbortSignal.timeout.
export async function fetchMapJson(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error("El servicio de mapas no respondió. Puedes elegir un punto directamente en el mapa.");
    return await response.json();
  } finally { clearTimeout(timer); }
}
export async function searchPlaces(query) {
  const key = query.trim();
  if (key.length < 3) throw new Error("Escribe al menos 3 caracteres y la ciudad.");
  if (cache.has(key)) return cache.get(key);
  const wait = Math.max(0, 1100 - (Date.now() - lastSearch));
  if (wait) await new Promise(resolve => setTimeout(resolve, wait));
  lastSearch = Date.now();
  const body = await fetchMapJson(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=es&q=${encodeURIComponent(key)}`, {
    headers: { "User-Agent": "Vaialesk-MVP/1.1 (https://github.com/jabo6311/mis-proyectos-web)" }
  });
  const places = body.map(p => ({ latitude: Number(p.lat), longitude: Number(p.lon), address: p.display_name })).filter(validPoint);
  cache.set(key, places);
  return places;
}
export async function getRoute(pickup, destination) {
  if (!validPoint(pickup) || !validPoint(destination)) throw new Error("Selecciona dos puntos válidos.");
  const key = [pickup.latitude, pickup.longitude, destination.latitude, destination.longitude].join(",");
  if (cache.has(key)) return cache.get(key);
  try {
    const data = await fetchMapJson(`https://router.project-osrm.org/route/v1/driving/${pickup.longitude},${pickup.latitude};${destination.longitude},${destination.latitude}?overview=full&geometries=geojson`), r = data.routes?.[0];
    if (data.code !== "Ok" || !r?.geometry?.coordinates?.length) throw new Error("no road route");
    const route = { coordinates: r.geometry.coordinates.map(([longitude, latitude]) => ({ latitude, longitude })), distanceKm: r.distance / 1000, minutes: Math.max(1, Math.ceil(r.duration / 60)), approximate: false };
    cache.set(key, route);
    return route;
  } catch {
    const km = distanceKm(pickup, destination);
    return { coordinates: [pickup, destination], distanceKm: km * 1.3, minutes: Math.max(1, Math.ceil(km * 3)), approximate: true };
  }
}
