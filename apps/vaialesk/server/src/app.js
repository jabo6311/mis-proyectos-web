import experience from "../../shared/rider-experience.cjs";
import {mountNotifications} from "./notifications.js";
import { mountDocuments } from "./document-api.js";
import { randomBytes } from "node:crypto";
import rules from "../../shared/operations.cjs";
import { mountOperations, visibleOperations } from "./operations-api.js";
import express from "express";
import cors from "cors";
import { ACTIVE, validCoordinates, distance, fare, planRoute } from "./domain.js";
const fail = (status, message) => Object.assign(new Error(message), { status });
const text = (value, max) => typeof value === "string" && value.trim().length > 0 && value.trim().length <= max;
export function createApp({ repository: repo, verifyToken, store, routePlanner = planRoute, adminSubjects = [] }) {
  const app = express(), locks = new Map();
  store.state.operations = rules.normalize(store.state.operations);
  app.disable("x-powered-by"); app.use(cors(process.env.CORS_ORIGINS ? {origin:process.env.CORS_ORIGINS.split(",").map(s=>s.trim())} : {})); app.use(express.json({ limit: "3mb" }));
  const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
  async function locked(key, action) { const previous = locks.get(key) || Promise.resolve(); const next = previous.catch(() => {}).then(action); locks.set(key, next); try { return await next; } finally { if (locks.get(key) === next) locks.delete(key); } }
  const extraDriver = p => ({ id: p.id, full_name: p.full_name, role: p.role, driver_status: p.driver_status, online: false, ...store.state.drivers[p.id], online: !!store.state.drivers[p.id]?.online && !rules.eligibility(store.state.operations, { ...p, ...store.state.drivers[p.id] }) });
  const extraRide = r => ({ ...r, ...store.state.rides[r.id], currency:store.state.rides[r.id]?.currency || (store.state.rides[r.id]?.pin?"DOP":"COP") });
  const safeRide = (r,p) => { const result=extraRide(r); if(p.role!=="admin" && result.passenger_id!==p.id) { delete result.pin; delete result.passenger_phone; } if (!["admin","dispatcher"].includes(p.role) && result.passenger_id!==p.id && result.driver_id!==p.id) { delete result.pickup_note; delete result.preferences; } return result; };
  async function authenticated(req, _res, next) {
    try {
      const token = req.get("authorization")?.match(/^Bearer (.+)$/)?.[1]; if (!token) throw fail(401, "Se requiere una sesión.");
      let claims; try { claims = await verifyToken(token); } catch { throw fail(401, "Sesión inválida o vencida. Vuelve a iniciar sesión."); }
      if (typeof claims.sub !== "string" || !claims.sub) throw fail(401, "La sesión no tiene una identidad válida.");
      req.profile = await repo.getProfile(claims.sub);
      if (!req.profile) { try { req.profile = await repo.createProfile({ auth0_sub: claims.sub, full_name: claims["https://vaialesk.app/name"] || claims.name || "Pasajero" }); } catch (error) { if (error.code !== "23505") throw error; req.profile = await repo.getProfile(claims.sub); } }
      if (adminSubjects.includes(claims.sub) && req.profile.role !== "admin") req.profile = await repo.updateProfile(req.profile.id, { role: "admin" });
      if(req.profile.role!=="admin" && store.state.operations.staff[req.profile.id]) req.profile={...req.profile,role:store.state.operations.staff[req.profile.id]};
      next();
    } catch (error) { next(error); }
  }
  const admin = (req, _res, next) => req.profile.role === "admin" ? next() : next(fail(403, "Solo administración puede realizar esta acción."));
  const driver = req => { if (req.profile.role !== "driver" || req.profile.driver_status !== "approved") throw fail(403, "Se requiere un conductor aprobado."); };
  const ownActive = async p => (await repo.listRides(p)).find(r => ACTIVE.includes(r.status) && (r.passenger_id === p.id || r.driver_id === p.id));
  app.use((req,res,next)=>{if(["GET","HEAD","OPTIONS"].includes(req.method))return next();locked("all-mutations",()=>new Promise(resolve=>{res.once("finish",resolve);res.once("close",resolve);next();})).catch(next);});
  mountNotifications(app,{store,authenticated,wrap});
  mountDocuments(app,{repo,store,authenticated,wrap});
  mountOperations(app,{repo,store,authenticated,wrap,routePlanner});
  app.get("/health", (_req, res) => res.json({ status: "ok", version: "1.3.0" }));
  app.get("/health/ready",wrap(async(_req,res)=>{try{await repo.listProfiles();res.json({status:"ready",version:"1.3.0"});}catch{res.status(503).json({status:"unavailable"});}}));
  app.get("/api/me", authenticated, (req, res) => res.json({ profile: extraDriver(req.profile) }));
  app.get("/api/workspace", authenticated, wrap(async (req, res) => {
    const p=req.profile, isStaff=["admin","dispatcher"].includes(p.role), online=extraDriver(p).online;
    let rides=await repo.listRides(isStaff?{...p,role:"admin"}:p,p.role==="driver"&&online);
    rides=rides.filter(r=>p.role!=="driver"||r.status!=="searching"||!store.state.operations.rejections[r.id]?.includes(p.id));
    const allProfiles=await repo.listProfiles(), profiles=isStaff?allProfiles:[p];
    const current=rides.find(r=>ACTIVE.includes(r.status)&&(isStaff||r.passenger_id===p.id||r.driver_id===p.id));
    if(!isStaff)for(const id of new Set(rides.map(r=>r.driver_id).filter(Boolean)))if(!profiles.some(u=>u.id===id)){const d=await repo.getProfileById(id);if(d)profiles.push(d);}
    const nearby=p.role==="passenger"?allProfiles.map(extraDriver).filter(d=>d.id!==p.id&&d.online&&d.location&&Date.now()-Date.parse(d.location.updated_at)<120000).map(d=>({latitude:d.location.latitude,longitude:d.location.longitude})):[];
    res.json({profile:extraDriver(p),rides:rides.map(r=>({...safeRide(r,p),...((r.driver_id===p.id||isStaff)?{passenger_name:store.state.rides[r.id]?.passenger_name||allProfiles.find(u=>u.id===r.passenger_id)?.full_name||"Pasajero"}:{})})),drivers:profiles.filter(u=>u.role==="driver"||u.driver_status==="approved").map(u=>{const d=extraDriver(u);if(!isStaff&&u.id!==p.id)delete d.location;return d;}),users:p.role==="admin"?allProfiles.map(u=>({id:u.id,full_name:u.full_name,role:store.state.operations.staff[u.id]||u.role})):[],nearbyDrivers:nearby,operations:visibleOperations(store.state.operations,p,rides),driverLocation:current?.driver_id?store.state.drivers[current.driver_id]?.location||null:null});
  }));
  app.post("/api/me/mode", authenticated, wrap(async (req, res) => {
    const role = req.body?.role, p = req.profile;
    if (!["passenger", "driver"].includes(role) || ["admin","dispatcher"].includes(p.role)) throw fail(403, "Este cambio de modo no está permitido.");
    if (await ownActive(p)) throw fail(409, "Termina o cancela tu viaje antes de cambiar de modo.");
    if (role === "driver" && p.driver_status !== "approved") throw fail(403, "Completa tu perfil de conductor y espera la aprobación de administración.");
    const updated = await repo.updateProfile(p.id, { role });
    if (store.state.drivers[p.id]) { store.state.drivers[p.id].online = false; await store.save(); }
    res.json({ profile: extraDriver(updated) });
  }));
  app.post("/api/drivers/application", authenticated, wrap(async (req, res) => {
    const { full_name, vehicle, plate } = req.body || {};
    if (["admin","dispatcher"].includes(req.profile.role)) throw fail(403, "La cuenta de administración no puede solicitar perfil de conductor.");
    if (![full_name, vehicle, plate].every((v, i) => text(v, [80, 100, 15][i]))) throw fail(400, "Completa tu nombre, vehículo y placa.");
    if (await ownActive(req.profile)) throw fail(409, "Finaliza tu viaje antes de cambiar tu perfil.");
    const profile = await repo.updateProfile(req.profile.id, { full_name: full_name.trim(), role: "driver", driver_status: "pending" });
    store.state.drivers[profile.id] = { ...store.state.drivers[profile.id], vehicle: vehicle.trim(), plate: plate.trim().toUpperCase(), category: store.state.operations.settings.categories.includes(req.body.category) ? req.body.category : "Estándar", online: false }; await store.save(); res.json({ profile: extraDriver(profile) });
  }));
  app.post("/api/driver/availability", authenticated, wrap(async (req, res) => {
    driver(req); if(req.body?.online){const problem=rules.eligibility(store.state.operations,extraDriver(req.profile));if(problem)throw fail(409,problem);}
    if (typeof req.body?.online !== "boolean") throw fail(400, "Indica tu disponibilidad.");
    if (!req.body.online && await ownActive(req.profile)) throw fail(409, "Finaliza el viaje antes de desconectarte.");
    store.state.drivers[req.profile.id] = { ...store.state.drivers[req.profile.id], online: req.body.online }; await store.save(); res.json({ online: req.body.online });
  }));
  app.post("/api/driver/location", authenticated, wrap(async (req, res) => {
    driver(req); const { latitude, longitude } = req.body || {};
    if (!validCoordinates(latitude, longitude)) throw fail(400, "Ubicación inválida.");
    if (!store.state.drivers[req.profile.id]?.online && !(await ownActive(req.profile))) throw fail(409, "Conéctate antes de compartir tu ubicación.");
    store.state.drivers[req.profile.id].location = { latitude, longitude, updated_at: new Date().toISOString() }; await store.save(); res.json({ ok: true });
  }));
  app.get("/api/rides/current", authenticated, wrap(async (req, res) => { const r = await ownActive(req.profile); res.json({ ride: r ? safeRide(r,req.profile) : null }); }));
  app.get("/api/rides/available", authenticated, wrap(async (req, res) => { driver(req); res.json({ rides: (await repo.listRides(req.profile, true)).filter(r => r.status === "searching" && r.passenger_id !== req.profile.id).map(r=>safeRide(r,req.profile)) }); }));
  app.post("/api/rides", authenticated, wrap(async (req, res) => locked(`passenger:${req.profile.id}`, async () => {
    const p = req.profile, b = req.body || {};
    if (p.role !== "passenger") throw fail(403, "Pide un viaje desde el modo pasajero.");
    if (!text(b.pickup_address, 300) || !text(b.destination_address, 300) || !validCoordinates(b.pickup_lat, b.pickup_lng) || !validCoordinates(b.destination_lat, b.destination_lng) || b.payment_method !== "cash") throw fail(400, "Origen, destino o medio de pago inválidos.");
    let details; try { details=experience.rideDetails(b); } catch(error) { throw fail(400,error.message); }
    const a = { latitude: b.pickup_lat, longitude: b.pickup_lng }, z = { latitude: b.destination_lat, longitude: b.destination_lng };
    if(rules.km(a,store.state.operations.settings.zone)>store.state.operations.settings.zone.radius_km)throw fail(400,"El origen está fuera de la zona piloto de Santo Domingo.");
    if(!store.state.operations.settings.categories.includes(b.category||"Estándar"))throw fail(400,"Categoría inválida.");
    if (distance(a, z) < 0.1) throw fail(400, "El origen y el destino deben estar al menos a 100 m.");
    if (await ownActive(p)) throw fail(409, "Ya tienes un viaje activo.");
    const route = await routePlanner(a, z);
    const ride = await repo.insertRide({ passenger_id: p.id, pickup_address: b.pickup_address.trim(), destination_address: b.destination_address.trim(), pickup_lat: a.latitude, pickup_lng: a.longitude, destination_lat: z.latitude, destination_lng: z.longitude, payment_method: "cash", status: "searching", estimated_fare: fare(route.distance_km, route.duration_minutes, store.state.operations.settings,b.category) });
    store.state.rides[ride.id] = {...route,...details,currency:"DOP",pin:String(1000+randomBytes(4).readUInt32BE()%9000),category:store.state.operations.settings.categories.includes(b.category)?b.category:"Estándar",commission_percent:store.state.operations.settings.commission_percent}; rules.audit(store.state.operations,p,"REQUEST",{ride_id:ride.id}); await store.save(); res.status(201).json({ ride: extraRide(ride) });
  })));
  app.get("/api/rides/:id", authenticated, wrap(async (req, res) => { const r = await repo.getRide(req.params.id); if (!r || (req.profile.role !== "admin" && r.passenger_id !== req.profile.id && r.driver_id !== req.profile.id)) throw fail(404, "No se encontró el viaje."); res.json({ ride: safeRide(r,req.profile) }); }));
  app.post("/api/rides/:id/accept", authenticated, wrap(async (req, res) => locked(`driver:${req.profile.id}`, async () => {
    driver(req); const problem=rules.eligibility(store.state.operations,extraDriver(req.profile));if(problem)throw fail(409,problem);if (!store.state.drivers[req.profile.id]?.online) throw fail(409, "Conéctate para aceptar viajes.");
    if (await ownActive(req.profile)) throw fail(409, "Ya tienes un viaje activo.");
    const r = await repo.getRide(req.params.id); if (!r || r.passenger_id === req.profile.id) throw fail(403, "No puedes aceptar este viaje.");
    const ride = await repo.updateRide(r.id, { driver_id: req.profile.id, status: "accepted" }, { status: ["searching"], unassigned: true });
    if (!ride) throw fail(409, "Otro conductor ya aceptó el viaje.");
    store.state.rides[ride.id]={...store.state.rides[ride.id],phase:"assigned"};rules.audit(store.state.operations,req.profile,"ACCEPT",{ride_id:ride.id});await store.save();res.json({ ride: safeRide(ride,req.profile) });
  })));
  app.patch("/api/rides/:id/status", authenticated, wrap(async (req, res) => {
    const status = req.body?.status, allowed = { in_progress: ["accepted"], completed: ["in_progress"], en_route:["accepted"], arrived:["accepted"], cancelled: ACTIVE };
    if (!allowed[status]) throw fail(400, "Estado inválido.");
    const r = await repo.getRide(req.params.id), p = req.profile;
    if (!r) throw fail(404, "No se encontró el viaje.");
    const canCancel = status === "cancelled" && (["admin","dispatcher"].includes(p.role) || r.passenger_id === p.id || r.driver_id === p.id);
    if (!canCancel && (p.role !== "driver" || p.driver_status !== "approved" || r.driver_id !== p.id)) throw fail(403, "No puedes cambiar el estado de este viaje.");
    const meta=store.state.rides[r.id]||{};
    if(status==="in_progress"){
      if(meta.pin_blocked_until && Date.now()<meta.pin_blocked_until)throw fail(429,"Demasiados intentos. Espera cinco minutos.");
      if(meta.phase!=="arrived"||req.body.pin!==meta.pin){store.state.rides[r.id]={...meta,pin_attempts:(meta.pin_attempts||0)+1,...((meta.pin_attempts||0)>=4?{pin_blocked_until:Date.now()+300000,pin_attempts:0}:{})};await store.save();throw fail(409,"Confirma llegada e introduce el PIN del pasajero.");}
    }
    if(status==="cancelled"&&!text(req.body.reason,300))throw fail(400,"Indica el motivo de cancelación.");
    if(["en_route","arrived"].includes(status)){if(r.status!=="accepted")throw fail(409,"El viaje cambió.");store.state.rides[r.id]={...meta,phase:status};rules.audit(store.state.operations,p,status,{ride_id:r.id});await store.save();return res.json({ok:true});}
    const ride = await repo.updateRide(r.id, { status }, { status: allowed[status] }); if (!ride) throw fail(409, "El viaje cambió o la transición no es válida."); store.state.rides[r.id]={...meta,...(status==="cancelled"?{cancel_reason:req.body.reason}:{}),...(status==="completed"?{receipt:{number:`VAI-${r.id}`,fare:ride.estimated_fare,currency:extraRide(ride).currency,payment:"cash",at:new Date().toISOString()}}:{})};
    if(extraRide(ride).currency==="DOP")rules.commission(store.state.operations,extraRide(ride),p);rules.audit(store.state.operations,p,status,{ride_id:r.id});if(status==="completed"&&rules.eligibility(store.state.operations,extraDriver(p))&&store.state.drivers[p.id])store.state.drivers[p.id].online=false;await store.save();res.json({ ride: safeRide(ride,p) });
  }));
  app.post("/api/rides/:id/rating", authenticated, wrap(async (req, res) => {
    const score = req.body?.score, r = await repo.getRide(req.params.id);
    if (!Number.isInteger(score) || score < 1 || score > 5) throw fail(400, "Selecciona entre 1 y 5 estrellas.");
    if (!r || r.passenger_id !== req.profile.id || r.status !== "completed" || !r.driver_id) throw fail(403, "Solo el pasajero puede calificar un viaje finalizado.");
    const rating = await repo.addRating({ ride_id: r.id, passenger_id: r.passenger_id, driver_id: r.driver_id, score, comment: typeof req.body.comment === "string" ? req.body.comment.slice(0,500) : "" }); store.state.rides[r.id] = { ...store.state.rides[r.id], rating: score, review: typeof req.body.comment === "string" ? req.body.comment.slice(0,500) : "" }; await store.save(); res.status(201).json({ rating });
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
  app.locals.migrateLegacy=async()=>{
    for(const r of await repo.listRides({role:"admin"})){const meta=store.state.rides[r.id]||{};if(!meta.currency)meta.currency=meta.pin?"DOP":"COP";if(ACTIVE.includes(r.status)&&!meta.pin)meta.pin=String(1000+randomBytes(4).readUInt32BE()%9000);store.state.rides[r.id]=meta;}await store.save();
  };
  app.locals.tick=()=>locked("all-mutations",async()=>{
    await app.locals.releaseDueReservations();
    if(!store.state.operations.settings.auto_dispatch)return;
    const all=(await repo.listRides({role:"admin"})).map(extraRide), profiles=(await repo.listProfiles()).map(extraDriver);
    for(const ride of all.filter(r=>r.status==="searching"&&!r.driver_id&&r.currency==="DOP")){
      const chosen=rules.candidates(store.state.operations,profiles,ride,all)[0];if(!chosen)continue;
      const r=await repo.updateRide(ride.id,{driver_id:chosen.id,status:"accepted"},{status:["searching"],unassigned:true});if(!r)continue;
      Object.assign(ride,r);store.state.rides[r.id]={...store.state.rides[r.id],phase:"assigned",commission_percent:store.state.rides[r.id]?.commission_percent??store.state.operations.settings.commission_percent};rules.audit(store.state.operations,{id:"system",role:"system"},"AUTO_DISPATCH",{ride_id:r.id,driver_id:chosen.id});
    }
    await store.save();
  });
  app.use((error, _req, res, _next) => { const status = error.status || (error.code === "23505" ? 409 : error.type === "entity.parse.failed" ? 400 : 500); if (status === 500) console.error("API error:", error.code || error.message); res.status(status).json({ error: error.status ? error.message : status === 409 ? "Este registro ya existe o el viaje ya fue procesado." : "No se pudo completar la operación. Intenta otra vez." }); });
  return app;
}
