export const ACTIVE_STATUSES = ["searching", "accepted", "in_progress"];
export const STATUS_LABELS = { searching: "Buscando conductor", accepted: "Tu conductor va en camino", in_progress: "Viaje en curso", completed: "Viaje finalizado", cancelled: "Viaje cancelado" };
export const DEFAULT_PICKUP = { latitude: 4.6767, longitude: -74.0486, address: "Parque de la 93, Bogotá" };
export const DEFAULT_DESTINATION = { latitude: 4.7016, longitude: -74.1469, address: "Aeropuerto El Dorado, Bogotá" };
export const PLACES = [DEFAULT_PICKUP, DEFAULT_DESTINATION,
  { latitude: 4.6591, longitude: -74.0599, address: "Zona T, Bogotá" },
  { latitude: 4.5981, longitude: -74.0758, address: "Plaza de Bolívar, Bogotá" },
  { latitude: 10.4969, longitude: -66.8534, address: "Plaza Francia, Caracas" },
  { latitude: 10.491, longitude: -66.9021, address: "Plaza Venezuela, Caracas" }
];
export function validPoint(p) { return p && Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180; }
export function distanceKm(a, b) {
  const rad = Math.PI / 180, lat = (b.latitude - a.latitude) * rad, lng = (b.longitude - a.longitude) * rad;
  const h = Math.sin(lat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(lng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
export function estimateFare(km) { return Math.round((4500 + km * 1800) / 500) * 500; }
export function money(value) { return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value || 0); }
export function routePoints(ride) { return ride ? { pickup: { latitude: ride.pickup_lat, longitude: ride.pickup_lng, address: ride.pickup_address }, destination: { latitude: ride.destination_lat, longitude: ride.destination_lng, address: ride.destination_address } } : {}; }
export function makeRide(draft, id, now = new Date().toISOString()) {
  if (!validPoint(draft.pickup) || !validPoint(draft.destination)) throw new Error("Selecciona el origen y el destino en el mapa.");
  if (distanceKm(draft.pickup, draft.destination) < 0.1) throw new Error("El origen y el destino deben estar al menos a 100 m.");
  return { id, passenger_id: "demo-passenger", passenger_name: "Pasajero de prueba", driver_id: null,
    pickup_address: draft.pickup.address, destination_address: draft.destination.address,
    pickup_lat: draft.pickup.latitude, pickup_lng: draft.pickup.longitude,
    destination_lat: draft.destination.latitude, destination_lng: draft.destination.longitude,
    estimated_fare: estimateFare(draft.route?.distanceKm || distanceKm(draft.pickup, draft.destination) * 1.3),
    distance_km: draft.route?.distanceKm || distanceKm(draft.pickup, draft.destination) * 1.3,
    duration_minutes: draft.route?.minutes || Math.ceil(distanceKm(draft.pickup, draft.destination) * 3),
    route_geometry: draft.route?.coordinates || [], payment_method: "cash", status: "searching", created_at: now, updated_at: now };
}
