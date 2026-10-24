import express from "express";
import cors from "cors";
import { ACTIVE, validCoordinates, distance, fare, planRoute } from "./domain.js";
const fail = (status, message) => Object.assign(new Error(message), { status });
const text = (value, max) => typeof value === "string" && value.trim().length > 0 && value.trim().length <= max;
export function createApp({ repository: repo, verifyToken, store, routePlanner = planRoute, adminSubjects = [] }) {
  const app = express(), locks = new Map();
  app.disable("x-powered-by"); app.use(cors()); app.use(express.json({ limit: "32kb" }));
  const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
  async function locked(key, action) { const previous = locks.get(key) || Promise.resolve(); const next = previous.catch(() => {}).then(action); locks.set(key, next); try { return await next; } finally { if (locks.get(key) === next) locks.delete(key); } }
  const extraDriver = p => ({ id: p.id, full_name: p.full_name, role: p.role, driver_status: p.driver_status, online: false, ...store.state.drivers[p.id] });
  const extraRide = r => ({ ...r, ...store.state.rides[r.id] });
  async function authenticated(req, _res, next) {
    try {
      const token = req.get("authorization")?.match(/^Bearer (.+)$/)?.[1]; if (!token) throw fail(401, "Se requiere una sesión.");
      let claims; try { claims = await verifyToken(token); } catch { throw fail(401, "Sesión inválida o vencida. Vuelve a iniciar sesión."); }
      if (typeof claims.sub !== "string" || !claims.sub) throw fail(401, "La sesión no tiene una identidad válida.");
      req.profile = await repo.getProfile(claims.sub);
      if (!req.profile) { try { req.profile = await repo.createProfile({ auth0_sub: claims.sub, full_name: claims["https://vaialesk.app/name"] || claims.name || "Pasajero" }); } catch (error) { if (error.code !== "23505") throw error; req.profile = await repo.getProfile(claims.sub); } }
      if (adminSubjects.includes(claims.sub) && req.profile.role !== "admin") req.profile = await repo.updateProfile(req.profile.id, { role: "admin" });
      next();
    } catch (error) { next(error); }
  }
  const admin = (req, _res, next) => req.profile.role === "admin" ? next() : next(fail(403, "Solo administración puede realizar esta acción."));
  const driver = req => { if (req.profile.role !== "driver" || req.profile.driver_status !== "approved") throw fail(403, "Se requiere un conductor aprobado."); };
  const ownActive = async p => (await repo.listRides(p)).find(r => ACTIVE.includes(r.status) && (r.passenger_id === p.id || r.driver_id === p.id));
  app.get("/health", (_req, res) => res.json({ status: "ok", version: "1.1.0" }));
  app.get("/api/me", authenticated, (req, res) => res.json({ profile: extraDriver(req.profile) }));
  app.get("/api/workspace", authenticated, wrap(async (req, res) => {
    const p = req.profile, online = store.state.drivers[p.id]?.online;
    const rides = await repo.listRides(p, p.role === "driver" && p.driver_status === "approved" && online);
    const profiles = p.role === "admin" ? await repo.listProfiles() : [p];
    const ids = [...new Set(rides.filter(r => r.passenger_id === p.id || r.driver_id === p.id).map(r => r.driver_id).filter(Boolean))];
    if (p.role !== "admin") for (const id of ids) if (!profiles.some(u => u.id === id)) { const d = await repo.getProfileById(id); if (d) profiles.push(d); }
    const current = rides.find(r => ACTIVE.includes(r.status) && (r.passenger_id === p.id || r.driver_id === p.id));
    res.json({ profile: extraDriver(p), rides: rides.map(extraRide), drivers: profiles.filter(u => u.role === "driver" || u.driver_status === "approved").map(extraDriver), users: p.role === "admin" ? profiles.map(u => ({ id: u.id, full_name: u.full_name, role: u.role })) : [], driverLocation: current?.driver_id ? store.state.drivers[current.driver_id]?.location || null : null });
  }));
  app.post("/api/me/mode", authenticated, wrap(async (req, res) => {
    const role = req.body?.role, p = req.profile;
    if (!["passenger", "driver"].includes(role) || p.role === "admin") throw fail(403, "Este cambio de modo no está permitido.");
    if (await ownActive(p)) throw fail(409, "Termina o cancela tu viaje antes de cambiar de modo.");
    if (role === "driver" && p.driver_status !== "approved") throw fail(403, "Completa tu perfil de conductor y espera la aprobación de administración.");
    const updated = await repo.updateProfile(p.id, { role });
    if (store.state.drivers[p.id]) { store.state.drivers[p.id].online = false; await store.save(); }
    res.json({ profile: extraDriver(updated) });
  }));
  app.post("/api/drivers/application", authenticated, wrap(async (req, res) => {
    const { full_name, vehicle, plate } = req.body || {};
    if (req.profile.role === "admin") throw fail(403, "La cuenta de administración no puede solicitar perfil de conductor.");
    if (![full_name, vehicle, plate].every((v, i) => text(v, [80, 100, 15][i]))) throw fail(400, "Completa tu nombre, vehículo y placa.");
    if (await ownActive(req.profile)) throw fail(409, "Finaliza tu viaje antes de cambiar tu perfil.");
    const profile = await repo.updateProfile(req.profile.id, { full_name: full_name.trim(), role: "driver", driver_status: "pending" });
    store.state.drivers[profile.id] = { vehicle: vehicle.trim(), plate: plate.trim().toUpperCase(), online: false }; await store.save(); res.json({ profile: extraDriver(profile) });
  }));
  app.post("/api/driver/availability", authenticated, wrap(async (req, res) => {
    driver(req); if (typeof req.body?.online !== "boolean") throw fail(400, "Indica tu disponibilidad.");
    if (!req.body.online && await ownActive(req.profile)) throw fail(409, "Finaliza el viaje antes de desconectarte.");
    store.state.drivers[req.profile.id] = { ...store.state.drivers[req.profile.id], online: req.body.online }; await store.save(); res.json({ online: req.body.online });
  }));
  app.post("/api/driver/location", authenticated, wrap(async (req, res) => {
    driver(req); const { latitude, longitude } = req.body || {};
    if (!validCoordinates(latitude, longitude)) throw fail(400, "Ubicación inválida.");
    if (!store.state.drivers[req.profile.id]?.online) throw fail(409, "Conéctate antes de compartir tu ubicación.");
    store.state.drivers[req.profile.id].location = { latitude, longitude, updated_at: new Date().toISOString() }; await store.save(); res.json({ ok: true });
  }));
  app.get("/api/rides/current", authenticated, wrap(async (req, res) => { const r = await ownActive(req.profile); res.json({ ride: r ? extraRide(r) : null }); }));
  app.get("/api/rides/available", authenticated, wrap(async (req, res) => { driver(req); res.json({ rides: (await repo.listRides(req.profile, true)).filter(r => r.status === "searching" && r.passenger_id !== req.profile.id).map(extraRide) }); }));
  app.post("/api/rides", authenticated, wrap(async (req, res) => locked(`passenger:${req.profile.id}`, async () => {
    const p = req.profile, b = req.body || {};
    if (p.role !== "passenger") throw fail(403, "Pide un viaje desde el modo pasajero.");
    if (!text(b.pickup_address, 300) || !text(b.destination_address, 300) || !validCoordinates(b.pickup_lat, b.pickup_lng) || !validCoordinates(b.destination_lat, b.destination_lng) || b.payment_method !== "cash") throw fail(400, "Origen, destino o medio de pago inválidos.");
    const a = { latitude: b.pickup_lat, longitude: b.pickup_lng }, z = { latitude: b.destination_lat, longitude: b.destination_lng };
    if (distance(a, z) < 0.1) throw fail(400, "El origen y el destino deben estar al menos a 100 m.");
    if (await ownActive(p)) throw fail(409, "Ya tienes un viaje activo.");
    const route = await routePlanner(a, z);
    const ride = await repo.insertRide({ passenger_id: p.id, pickup_address: b.pickup_address.trim(), destination_address: b.destination_address.trim(), pickup_lat: a.latitude, pickup_lng: a.longitude, destination_lat: z.latitude, destination_lng: z.longitude, payment_method: "cash", status: "searching", estimated_fare: fare(route.distance_km) });
    store.state.rides[ride.id] = route; await store.save(); res.status(201).json({ ride: extraRide(ride) });
  })));
  app.get("/api/rides/:id", authenticated, wrap(async (req, res) => { const r = await repo.getRide(req.params.id); if (!r || (req.profile.role !== "admin" && r.passenger_id !== req.profile.id && r.driver_id !== req.profile.id)) throw fail(404, "No se encontró el viaje."); res.json({ ride: extraRide(r) }); }));
  app.post("/api/rides/:id/accept", authenticated, wrap(async (req, res) => locked(`driver:${req.profile.id}`, async () => {
    driver(req); if (!store.state.drivers[req.profile.id]?.online) throw fail(409, "Conéctate para aceptar viajes.");
    if (await ownActive(req.profile)) throw fail(409, "Ya tienes un viaje activo.");
    const r = await repo.getRide(req.params.id); if (!r || r.passenger_id === req.profile.id) throw fail(403, "No puedes aceptar este viaje.");
    const ride = await repo.updateRide(r.id, { driver_id: req.profile.id, status: "accepted" }, { status: ["searching"], unassigned: true });
    if (!ride) throw fail(409, "Otro conductor ya aceptó el viaje.");
    res.json({ ride: extraRide(ride) });
  })));
  app.patch("/api/rides/:id/status", authenticated, wrap(async (req, res) => {
    const status = req.body?.status, allowed = { in_progress: ["accepted"], completed: ["in_progress"], cancelled: ACTIVE };
    if (!allowed[status]) throw fail(400, "Estado inválido.");
    const r = await repo.getRide(req.params.id), p = req.profile;
    if (!r) throw fail(404, "No se encontró el viaje.");
    const canCancel = status === "cancelled" && (p.role === "admin" || r.passenger_id === p.id || r.driver_id === p.id);
    if (!canCancel && (p.role !== "driver" || p.driver_status !== "approved" || r.driver_id !== p.id)) throw fail(403, "No puedes cambiar el estado de este viaje.");
    const ride = await repo.updateRide(r.id, { status }, { status: allowed[status] }); if (!ride) throw fail(409, "El viaje cambió o la transición no es válida."); res.json({ ride: extraRide(ride) });
  }));
  app.post("/api/rides/:id/rating", authenticated, wrap(async (req, res) => {
    const score = req.body?.score, r = await repo.getRide(req.params.id);
    if (!Number.isInteger(score) || score < 1 || score > 5) throw fail(400, "Selecciona entre 1 y 5 estrellas.");
    if (!r || r.passenger_id !== req.profile.id || r.status !== "completed" || !r.driver_id) throw fail(403, "Solo el pasajero puede calificar un viaje finalizado.");
    const rating = await repo.addRating({ ride_id: r.id, passenger_id: r.passenger_id, driver_id: r.driver_id, score, comment: "" }); store.state.rides[r.id] = { ...store.state.rides[r.id], rating: score }; await store.save(); res.status(201).json({ rating });
  }));
  app.get("/api/admin/rides", authenticated, admin, wrap(async (req, res) => res.json({ rides: (await repo.listRides(req.profile)).map(extraRide) })));
  app.get("/api/admin/drivers/pending", authenticated, admin, wrap(async (_req, res) => res.json({ drivers: (await repo.listProfiles()).filter(p => p.role === "driver" && p.driver_status === "pending").map(extraDriver) })));
  app.patch("/api/admin/drivers/:id/approval", authenticated, admin, wrap(async (req, res) => {
    const p = await repo.getProfileById(req.params.id), approved = req.body?.approved;
    if (!p || (p.role !== "driver" && p.driver_status !== "approved")) throw fail(404, "No se encontró al conductor.");
    if (typeof approved !== "boolean") throw fail(400, "Indica si apruebas al conductor.");
    if (!approved && await ownActive(p)) throw fail(409, "Cancela o finaliza el viaje antes de suspender al conductor.");
    const updated = await repo.updateProfile(p.id, { driver_status: approved ? "approved" : "rejected" });
    store.state.drivers[p.id] = { ...store.state.drivers[p.id], online: false }; await store.save(); res.json({ driver: extraDriver(updated) });
  }));
  app.use((error, _req, res, _next) => { const status = error.status || (error.code === "23505" ? 409 : error.type === "entity.parse.failed" ? 400 : 500); if (status === 500) console.error("API error:", error.code || error.message); res.status(status).json({ error: error.status ? error.message : status === 409 ? "Este registro ya existe o el viaje ya fue procesado." : "No se pudo completar la operación. Intenta otra vez." }); });
  return app;
}
