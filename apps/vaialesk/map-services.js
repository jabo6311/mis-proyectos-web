import { distanceKm, validPoint } from "./ride-utils";
const cache = new Map(), pending = new Map();
const LIMIT = 64;
async function cached(key, ttl, task) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.at < ttl) { cache.delete(key); cache.set(key, entry); return entry.value; }
  cache.delete(key);
  if (pending.has(key)) return pending.get(key);
  const promise = Promise.resolve().then(task).then(value => {
    cache.set(key, {value, at:Date.now()});
    while (cache.size > LIMIT) cache.delete(cache.keys().next().value);
    return value;
  }).finally(() => pending.delete(key));
  pending.set(key, promise); return promise;
}
let searchQueue = Promise.resolve();
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
  return cached(`search:${key.toLocaleLowerCase()}`, 86400000, () => {
    const task = searchQueue.catch(() => {}).then(async () => {
      const wait = Math.max(0, 1100 - (Date.now() - lastSearch));
      if (wait) await new Promise(resolve => setTimeout(resolve, wait));
      lastSearch = Date.now();
      const body = await fetchMapJson(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=es&q=${encodeURIComponent(key)}`, {headers:{"User-Agent":"VAI-MVP/1.3 (https://github.com/jabo6311/mis-proyectos-web)"}});
      return body.map(p => ({latitude:Number(p.lat),longitude:Number(p.lon),address:p.display_name})).filter(validPoint);
    });
    searchQueue = task; return task;
  });
}
export async function getRoute(pickup, destination) {
  if (!validPoint(pickup) || !validPoint(destination)) throw new Error("Selecciona dos puntos válidos.");
  const key = [pickup.latitude, pickup.longitude, destination.latitude, destination.longitude].join(",");
  try {
    return await cached(`route:${key}`, 300000, async () => {
    const data = await fetchMapJson(`https://router.project-osrm.org/route/v1/driving/${pickup.longitude},${pickup.latitude};${destination.longitude},${destination.latitude}?overview=full&geometries=geojson&steps=true`), r = data.routes?.[0];
    if (data.code !== "Ok" || !r?.geometry?.coordinates?.length) throw new Error("no road route");
    const route = { coordinates: r.geometry.coordinates.map(([longitude, latitude]) => ({ latitude, longitude })), distanceKm: r.distance / 1000, minutes: Math.max(1, Math.ceil(r.duration / 60)), approximate: false, steps:(r.legs||[]).flatMap(leg=>leg.steps||[]).map(s=>({type:s.maneuver?.type,modifier:s.maneuver?.modifier,name:s.name||"",distance:s.distance,location:s.maneuver?.location})) };
    return route;
    });
  } catch {
    const km = distanceKm(pickup, destination);
    return { coordinates: [pickup, destination], distanceKm: km * 1.3, minutes: Math.max(1, Math.ceil(km * 3)), approximate: true };
  }
}
