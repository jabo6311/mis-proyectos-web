import { randomBytes, createHmac, timingSafeEqual } from "node:crypto";
import rules from "../../shared/operations.cjs";
import { fare, planRoute } from "./domain.js";
const error=(status,message)=>Object.assign(new Error(message),{status});
export function mountOperations(app,{repo,store,authenticated,wrap,routePlanner=planRoute}) {
 store.state.operations=rules.normalize(store.state.operations);
 const context=async p=>({rides:(await repo.listRides({role:"admin"})).map(r=>({...r,...store.state.rides[r.id]})),drivers:(await repo.listProfiles()).filter(u=>u.driver_status).map(d=>({...d,...store.state.drivers[d.id]})),users:await repo.listProfiles()});
 app.locals.releaseDueReservations=async()=>{
  for(const booking of store.state.operations.reservations.filter(b=>b.status==="reserved"&&Date.parse(b.scheduled_at)<=Date.now())){
   const owner=booking.passenger_id||booking.created_by,p=await repo.getProfileById(owner);if(!p)continue;
   const rides=await repo.listRides({role:"admin"});if(rides.some(r=>rules.active(r)&&r.passenger_id===owner))continue;
   const route=await routePlanner(booking.pickup,booking.destination),ride=await repo.insertRide({passenger_id:owner,pickup_address:booking.pickup.address,destination_address:booking.destination.address,pickup_lat:booking.pickup.latitude,pickup_lng:booking.pickup.longitude,destination_lat:booking.destination.latitude,destination_lng:booking.destination.longitude,payment_method:"cash",status:"searching",estimated_fare:fare(route.distance_km,route.duration_minutes,store.state.operations.settings,booking.category)});
   store.state.rides[ride.id]={...route,currency:"DOP",passenger_name:booking.customer,passenger_phone:booking.phone,category:booking.category,pin:String(1000+randomBytes(4).readUInt32BE()%9000),commission_percent:store.state.operations.settings.commission_percent,reservation_id:booking.id};
   booking.status="dispatched";booking.ride_id=ride.id;rules.audit(store.state.operations,{id:"system",role:"system"},"SCHEDULE_RELEASE",{ride_id:ride.id,entity_id:booking.id});await store.save();
  }
 };
 app.post("/api/operations",authenticated,wrap(async(req,res)=>{
  const {operation,payload={}}=req.body||{}, p=req.profile, ctx=await context(p);
  if(operation==="ASSIGN") {
   if(!["admin","dispatcher"].includes(p.role))throw error(403,"Solo despacho puede asignar.");
   const r=ctx.rides.find(r=>r.id===payload.id),d=ctx.drivers.find(d=>d.id===payload.driver_id);
   if(!r||!["searching","accepted"].includes(r.status)||!d||!d.online)throw error(409,"Viaje o conductor no disponible.");
   if((store.state.rides[r.id]?.currency||"DOP")!=="DOP")throw error(409,"Este viaje anterior está cotizado en COP. Cancélalo y solicita uno nuevo en DOP antes de reasignar.");
   const problem=rules.eligibility(store.state.operations,d);if(problem)throw error(409,problem);
   if(ctx.rides.some(r=>r.id!==payload.id&&rules.active(r)&&r.driver_id===d.id))throw error(409,"El conductor ya tiene un viaje activo.");
   const updated=await repo.updateRide(r.id,{driver_id:d.id,status:"accepted"},{status:["searching","accepted"]});if(!updated)throw error(409,"El viaje cambió.");
   store.state.rides[r.id]={...store.state.rides[r.id],phase:"assigned",pin:randomBytes(4).readUInt32BE()%9000+1000+"",commission_percent:store.state.rides[r.id]?.commission_percent??store.state.operations.settings.commission_percent};
   rules.audit(store.state.operations,p,"ASSIGN",{ride_id:r.id,driver_id:d.id});await store.save();return res.json({ok:true});
  }
  if(operation==="RELEASE_BOOKING") {
   if(!["admin","dispatcher"].includes(p.role))throw error(403,"Solo despacho puede activar reservas.");
   const booking=store.state.operations.reservations.find(b=>b.id===payload.id&&b.status==="reserved");if(!booking)throw error(409,"Reserva no disponible.");
   // A reservation for a phone customer is attached to the authenticated dispatcher,
   // with the actual customer preserved as metadata, never impersonating a login.
   const passenger=booking.passenger_id?await repo.getProfileById(booking.passenger_id):p;
   if(!passenger)throw error(400,"El pasajero de la reserva no existe.");
   if(ctx.rides.some(r=>rules.active(r)&&r.passenger_id===passenger.id))throw error(409,"Este cliente ya tiene un viaje activo.");
   const route=await routePlanner(booking.pickup,booking.destination);
   const ride=await repo.insertRide({passenger_id:passenger.id,pickup_address:booking.pickup.address,destination_address:booking.destination.address,pickup_lat:booking.pickup.latitude,pickup_lng:booking.pickup.longitude,destination_lat:booking.destination.latitude,destination_lng:booking.destination.longitude,payment_method:"cash",status:"searching",estimated_fare:fare(route.distance_km,route.duration_minutes,store.state.operations.settings,booking.category)});
   store.state.rides[ride.id]={...route,currency:"DOP",passenger_name:booking.customer,passenger_phone:booking.phone,category:booking.category,pin:String(1000+randomBytes(4).readUInt32BE()%9000),commission_percent:store.state.operations.settings.commission_percent,reservation_id:booking.id};
   store.state.operations=rules.operate(store.state.operations,p,operation,{...payload,ride_id:ride.id},ctx);await store.save();return res.json({ok:true});
  }
  if(operation==="DOCUMENT"&&payload.file_id&&!store.state.document_files?.[payload.file_id])throw error(400,"Adjunta una fotografía válida del documento.");
  if(operation==="DOCUMENT"&&store.state.document_files?.[payload.file_id]?.owner!==p.id)throw error(403,"El documento no pertenece a esta cuenta.");
  if(operation==="DOCUMENT"&&!payload.file_id)throw error(400,"Adjunta una fotografía del documento.");
  try { store.state.operations=rules.operate(store.state.operations,p,operation,payload,ctx); }
  catch(e){throw error(400,e.message);}
  if(operation==="DOCUMENT"&&payload.file_id)store.state.operations.documents[p.id][payload.document_type].file_id=payload.file_id;
  if(operation==="PROFILE")await repo.updateProfile(p.id,{full_name:store.state.operations.profiles[p.id].full_name});
  for(const d of ctx.drivers)if(rules.eligibility(store.state.operations,d)&&store.state.drivers[d.id])store.state.drivers[d.id].online=false;
  await store.save();res.json({ok:true});
 }));
 app.post("/api/rides/:id/share",authenticated,wrap(async(req,res)=>{
  const r=await repo.getRide(req.params.id);if(!r||!rules.active(r)||(r.passenger_id!==req.profile.id&&r.driver_id!==req.profile.id))throw error(403,"Comparte únicamente tu viaje activo.");
  const base=process.env.PUBLIC_API_URL?.replace(/\/$/,"");if(!base?.startsWith("https://"))throw error(503,"Compartir por enlace requiere configurar PUBLIC_API_URL con el servidor HTTPS público.");
  if(!store.state.share_secret){store.state.share_secret=randomBytes(32).toString("hex");await store.save();}
  const body=Buffer.from(JSON.stringify({ride:r.id,expires:Date.now()+2*60*60*1000})).toString("base64url"),signature=createHmac("sha256",store.state.share_secret).update(body).digest("base64url");
  rules.audit(store.state.operations,req.profile,"SHARE",{ride_id:r.id});await store.save();res.json({url:`${base}/public/trips/${body}.${signature}`});
 }));
 async function shared(req){
  const token=req.params.token;if(typeof token!=="string"||token.length>1024)throw error(404,"Enlace no válido.");
  const [body,sig]=token.split(".");if(!body||!sig||!store.state.share_secret)throw error(404,"Enlace no válido.");
  const expected=createHmac("sha256",store.state.share_secret).update(body).digest(),actual=Buffer.from(sig,"base64url");if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw error(404,"Enlace no válido.");
  let payload;try{payload=JSON.parse(Buffer.from(body,"base64url").toString());}catch{throw error(404,"Enlace no válido.");}if(!Number.isFinite(payload.expires)||Date.now()>payload.expires)throw error(410,"Este enlace venció.");
  const r=await repo.getRide(payload.ride);if(!r||!rules.active(r))throw error(410,"El viaje terminó. El enlace dejó de estar disponible.");
  return {status:r.status,phase:store.state.rides[r.id]?.phase,pickup:{latitude:r.pickup_lat,longitude:r.pickup_lng},destination:{latitude:r.destination_lat,longitude:r.destination_lng},location:store.state.drivers[r.driver_id]?.location||null};
 }
 app.get("/public/trips/:token/data",wrap(async(req,res)=>{res.set("Cache-Control","no-store").json(await shared(req));}));
 app.get("/public/trips/:token",wrap(async(req,res)=>{
  await shared(req);res.set({"Cache-Control":"no-store","Referrer-Policy":"no-referrer","Content-Security-Policy":"default-src 'self'; script-src 'unsafe-inline' https://unpkg.com; style-src 'unsafe-inline' https://unpkg.com; img-src https://tile.openstreetmap.org data:; connect-src 'self'"});
  res.type("html").send(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>VAI · Viaje compartido</title><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"><body style="font-family:system-ui;margin:0"><h2 style="padding:16px">VAI · Viaje compartido</h2><p id="status" style="padding:16px">Actualizando…</p><div id="map" style="height:70vh"></div><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><script>const map=L.map('map').setView([18.48,-69.93],13),layer=L.layerGroup().addTo(map);L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(map);let fitted=false;async function update(){try{const r=await fetch(location.pathname+'/data',{cache:'no-store'}),d=await r.json();if(!r.ok){document.getElementById('status').textContent=d.error;layer.clearLayers();clearInterval(timer);return;}document.getElementById('status').textContent=d.status==='in_progress'?'Viaje en curso':'Conductor asignado · '+(d.phase||'En camino');layer.clearLayers();const points=[d.pickup,d.destination,d.location].filter(Boolean);points.forEach(p=>L.marker([p.latitude,p.longitude]).addTo(layer));if(!fitted){map.fitBounds(points.map(p=>[p.latitude,p.longitude]));fitted=true;}}catch{document.getElementById('status').textContent='No hay conexión. Reintentando…';}}const timer=setInterval(update,5000);update();</script></body></html>`);
 }));
}
export function visibleOperations(ops,p,rides){
 const staff=["admin","dispatcher"].includes(p.role),rideIds=new Set(rides.map(r=>r.id));
 if(p.role==="admin")return {...ops,share_secret:undefined};
 return {settings:ops.settings,documents:p.role==="driver"?{[p.id]:ops.documents[p.id]||{}}:{},ledger:p.role==="driver"?ops.ledger.filter(e=>e.driver_id===p.id):[],money_requests:p.role==="driver"?ops.money_requests.filter(e=>e.driver_id===p.id):[],reservations:ops.reservations.filter(r=>staff||r.passenger_id===p.id),incidents:ops.incidents.filter(i=>staff||i.actor_id===p.id).map(i=>staff?i:{...i,contacts:undefined}),audit:staff?ops.audit.filter(e=>!['MONEY_REQUEST','MONEY_REVIEW','WALLET_ADJUST','DOCUMENT','DOCUMENT_REVIEW','STAFF'].includes(e.action)):ops.audit.filter(e=>e.actor_id===p.id||rideIds.has(e.ride_id)),contacts:{[p.id]:ops.contacts[p.id]||[]},profiles:{[p.id]:ops.profiles[p.id]||{}},rejections:{[p.id]:[]}};
}
