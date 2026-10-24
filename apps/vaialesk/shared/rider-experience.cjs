// Small, dependency-free validation shared by the device and API.
const PREFERENCES = { quiet: "Viaje tranquilo", cool: "Ambiente fresco", luggage: "Llevo equipaje" };
function rideDetails(input = {}) {
  const note = input.pickup_note ?? "", prefs = input.preferences ?? [];
  if (typeof note !== "string" || note.trim().length > 160 || /[\u0000-\u001f]/.test(note)) throw new Error("La referencia de recogida admite hasta 160 caracteres, en una sola línea.");
  if (!Array.isArray(prefs) || prefs.length > 3 || prefs.some(p => !Object.hasOwn(PREFERENCES, p))) throw new Error("Preferencias de viaje inválidas.");
  return { pickup_note: note.trim(), preferences: [...new Set(prefs)] };
}
function place(point) {
  if (!point || !Number.isFinite(point.latitude) || Math.abs(point.latitude) > 90 || !Number.isFinite(point.longitude) || Math.abs(point.longitude) > 180 || typeof point.address !== "string" || !point.address.trim()) return null;
  return { latitude: point.latitude, longitude: point.longitude, address: point.address.trim().slice(0, 300) };
}
function settings(raw) {
  return { dataSaver: raw?.dataSaver === true, favorites: Object.fromEntries(["Casa", "Trabajo"].flatMap(label => { const p = place(raw?.favorites?.[label]); return p ? [[label, p]] : []; })) };
}
function repeatRoute(ride) {
  const pickup = place({ latitude: ride.pickup_lat, longitude: ride.pickup_lng, address: ride.pickup_address });
  const destination = place({ latitude: ride.destination_lat, longitude: ride.destination_lng, address: ride.destination_address });
  return pickup && destination ? { pickup, destination } : null;
}
module.exports = { PREFERENCES, rideDetails, place, settings, repeatRoute };
