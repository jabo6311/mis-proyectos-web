import rules from "../../shared/operations.cjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/app.js";
import { createLocalStore } from "../src/local-store.js";
function memoryRepo() {
  const profiles = [
    { id: "p", auth0_sub: "passenger", role: "passenger", full_name: "Pasajero", driver_status: "pending" },
    { id: "d", auth0_sub: "driver", role: "driver", full_name: "Conductor", driver_status: "approved" },
    { id: "d2", auth0_sub: "driver2", role: "driver", full_name: "Conductor 2", driver_status: "approved" },
    { id: "a", auth0_sub: "admin", role: "admin", full_name: "Admin", driver_status: "pending" }
  ], rides = [], ratings = [];
  return { profiles, rides,
    getProfile: async sub => profiles.find(p => p.auth0_sub === sub),
    getProfileById: async id => profiles.find(p => p.id === id),
    updateProfile: async (id, patch) => Object.assign(profiles.find(p => p.id === id), patch),
    listProfiles: async () => profiles,
    listRides: async (p, available) => rides.filter(r => p.role === "admin" || r.passenger_id === p.id || r.driver_id === p.id || available && r.status === "searching").slice().reverse(),
    getRide: async id => rides.find(r => r.id === id),
    insertRide: async data => { const r = { id: `r${rides.length + 1}`, driver_id: null, ...data, created_at: new Date().toISOString() }; rides.push(r); return r; },
    updateRide: async (id, patch, expected) => { const r = rides.find(r => r.id === id); if (!r || expected?.status && !expected.status.includes(r.status) || expected?.unassigned && r.driver_id) return null; return Object.assign(r, patch); },
    addRating: async data => { if (ratings.some(r => r.ride_id === data.ride_id)) throw Object.assign(new Error("duplicate"), { code: "23505" }); ratings.push(data); return data; }
  };
}
const draft = { pickup_address: "Origen", destination_address: "Destino", pickup_lat: 18.4723, pickup_lng: -69.8843, destination_lat: 18.4837, destination_lng: -69.9397, payment_method: "cash" };
async function setup(t) {
  const repo = memoryRepo(), store = { state: { drivers: {}, rides: {} }, save: async () => {} };
  store.state.operations=rules.initialOperations();
  for(const d of ["d","d2","p"]){store.state.operations.documents[d]=Object.fromEntries(rules.DOCUMENT_TYPES.map(type=>[type,{reference:"TEST",expires:"2027-12-31",status:"approved"}]));store.state.operations.ledger.push({id:`test:${d}`,driver_id:d,amount_cents:100000,kind:"test"});}
  const server = createApp({ repository: repo, store, verifyToken: async token => { if (!repo.profiles.some(p => p.auth0_sub === token)) throw new Error("invalid"); return { sub: token }; }, routePlanner: async () => ({ distance_km: 10, duration_minutes: 20, route_geometry: [] }) }).listen(0, "127.0.0.1");
  await once(server, "listening"); t.after(() => new Promise(resolve => server.close(resolve)));
  async function request(token, method, path, body) { const res = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) }); return { status: res.status, body: await res.json() }; }
  return { repo, store, request, app:server };
}
test("real passenger → approved online driver → complete → rate → admin metrics", async t => {
  const { request: q } = await setup(t);
  const created = await q("passenger", "POST", "/api/rides", draft); assert.equal(created.status, 201); assert.equal(created.body.ride.estimated_fare, 590);
  const id = created.body.ride.id;
  assert.equal((await q("driver", "POST", `/api/rides/${id}/accept`)).status, 409);
  await q("driver", "POST", "/api/driver/availability", { online: true });
  assert.equal((await q("driver", "POST", `/api/rides/${id}/accept`)).status, 200);
  assert.equal((await q("passenger", "PATCH", `/api/rides/${id}/status`, { status: "completed" })).status, 403);
  assert.equal((await q("driver", "PATCH", `/api/rides/${id}/status`, { status: "completed" })).status, 409);
  await q("driver", "POST", "/api/driver/location", { latitude: 4.68, longitude: -74.06 });
  assert.equal((await q("passenger", "GET", "/api/workspace")).body.driverLocation.latitude, 4.68);
  const pin=(await q("passenger","GET","/api/workspace")).body.rides[0].pin;
  assert.equal((await q("driver","GET","/api/workspace")).body.rides[0].pin,undefined);
  assert.equal((await q("driver","PATCH",`/api/rides/${id}/status`,{status:"arrived"})).status,200);
  assert.equal((await q("driver", "PATCH", `/api/rides/${id}/status`, { status: "in_progress",pin })).status, 200);
  assert.equal((await q("driver", "PATCH", `/api/rides/${id}/status`, { status: "completed" })).status, 200);
  assert.equal((await q("passenger", "POST", `/api/rides/${id}/rating`, { score: 5 })).status, 201);
  assert.equal((await q("passenger", "POST", `/api/rides/${id}/rating`, { score: 5 })).status, 409);
  const admin = (await q("admin", "GET", "/api/workspace")).body; assert.equal(admin.rides[0].rating, 5); assert.equal(admin.users.length, 4);
});
test("authorization prevents self-admin, data leakage and unauthorized driver review", async t => {
  const { request: q } = await setup(t);
  assert.equal((await q(null, "GET", "/api/workspace")).status, 401);
  assert.equal((await q("invalid", "GET", "/api/workspace")).status, 401);
  assert.equal((await q("passenger", "POST", "/api/me/mode", { role: "admin" })).status, 403);
  assert.equal((await q("passenger", "PATCH", "/api/admin/drivers/d/approval", { approved: true })).status, 403);
  const r = await q("passenger", "POST", "/api/rides", draft);
  assert.equal((await q("driver2", "GET", `/api/rides/${r.body.ride.id}`)).status, 404);
  assert.deepEqual((await q("passenger", "GET", "/api/workspace")).body.users, []);
});
test("duplicate passenger requests and simultaneous driver acceptance have one winner", async t => {
  const { request: q } = await setup(t);
  const results = await Promise.all([q("passenger", "POST", "/api/rides", draft), q("passenger", "POST", "/api/rides", draft)]);
  assert.deepEqual(results.map(r => r.status).sort(), [201, 409]); const id = results.find(r => r.status === 201).body.ride.id;
  await q("driver", "POST", "/api/driver/availability", { online: true }); await q("driver2", "POST", "/api/driver/availability", { online: true });
  const accept = await Promise.all([q("driver", "POST", `/api/rides/${id}/accept`), q("driver2", "POST", `/api/rides/${id}/accept`)]);
  assert.deepEqual(accept.map(r => r.status).sort(), [200, 409]);
});
test("searching rides can be cancelled; invalid coordinates and card payments cannot be submitted", async t => {
  const { request: q } = await setup(t);
  assert.equal((await q("passenger", "POST", "/api/rides", { ...draft, pickup_lat: 200 })).status, 400);
  assert.equal((await q("passenger", "POST", "/api/rides", { ...draft, payment_method: "card" })).status, 400);
  const r = await q("passenger", "POST", "/api/rides", draft);
  assert.equal((await q("passenger", "PATCH", `/api/rides/${r.body.ride.id}/status`, { status: "cancelled",reason:"Cambio de planes" })).status, 200);
  assert.equal((await q("passenger", "POST", "/api/rides", draft)).status, 201);
});
test("driver application is reviewed by admin before accepting rides", async t => {
  const { request: q } = await setup(t);
  assert.equal((await q("passenger", "POST", "/api/drivers/application", { full_name: "Alex", vehicle: "Auto blanco", plate: "TEST 1" })).status, 200);
  assert.equal((await q("passenger", "POST", "/api/driver/availability", { online: true })).status, 403);
  await q("admin", "PATCH", "/api/admin/drivers/p/approval", { approved: true });
  assert.equal((await q("passenger", "POST", "/api/driver/availability", { online: true })).status, 200);
});
test("operations metadata persists across restarts and concurrent writes", async t => {
  const dir = await mkdtemp(join(tmpdir(), "vaialesk-")); t.after(() => rm(dir, { recursive: true, force: true })); const file = join(dir, "operations.json");
  const store = await createLocalStore(file); store.state.drivers.d = { vehicle: "Blanco", online: false }; await store.save(); store.state.rides.r = { rating: 5 }; await Promise.all([store.save(), store.save()]);
  assert.equal((await createLocalStore(file)).state.rides.r.rating, 5);
  assert.equal((await createLocalStore(new URL(`file://${file}`))).state.drivers.d.vehicle, "Blanco");
});
test('expired documents and insufficient balance block even approved drivers',async t=>{
 const {request:q,store}=await setup(t);store.state.operations.documents.d.license.expires='2020-01-01';assert.equal((await q('driver','POST','/api/driver/availability',{online:true})).status,409);store.state.operations.documents.d.license.expires='2027-12-31';store.state.operations.ledger=[];assert.equal((await q('driver','POST','/api/driver/availability',{online:true})).status,409);
});
test('arrival and private PIN mandatory; concurrent completion charges commission once',async t=>{
 const {request:q,store}=await setup(t),r=(await q('passenger','POST','/api/rides',draft)).body.ride,id=r.id;await q('driver','POST','/api/driver/availability',{online:true});await q('driver','POST',`/api/rides/${id}/accept`);
 assert.equal((await q('driver','GET',`/api/rides/${id}`)).body.ride.pin,undefined);assert.equal((await q('driver','PATCH',`/api/rides/${id}/status`,{status:'in_progress',pin:r.pin})).status,409);await q('driver','PATCH',`/api/rides/${id}/status`,{status:'arrived'});assert.equal((await q('driver','PATCH',`/api/rides/${id}/status`,{status:'in_progress',pin:'wrong'})).status,409);await q('driver','PATCH',`/api/rides/${id}/status`,{status:'in_progress',pin:r.pin});const results=await Promise.all([q('driver','PATCH',`/api/rides/${id}/status`,{status:'completed'}),q('driver','PATCH',`/api/rides/${id}/status`,{status:'completed'})]);assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);assert.equal(store.state.operations.ledger.filter(l=>l.ride_id===id).length,1);assert.equal(rules.balance(store.state.operations,'d'),88200);
});
test('PIN is blocked temporarily after five incorrect attempts',async t=>{
 const {request:q}=await setup(t),r=(await q('passenger','POST','/api/rides',draft)).body.ride;await q('driver','POST','/api/driver/availability',{online:true});await q('driver','POST',`/api/rides/${r.id}/accept`);await q('driver','PATCH',`/api/rides/${r.id}/status`,{status:'arrived'});for(let i=0;i<5;i++)assert.equal((await q('driver','PATCH',`/api/rides/${r.id}/status`,{status:'in_progress',pin:'wrong'})).status,409);assert.equal((await q('driver','PATCH',`/api/rides/${r.id}/status`,{status:'in_progress',pin:r.pin})).status,429);
});
test('simultaneous wallet approval cannot credit twice and passengers see no ledger',async t=>{
 const {request:q,store}=await setup(t);await q('driver','POST','/api/operations',{operation:'MONEY_REQUEST',payload:{kind:'topup',amount:500,reference:'TEST'}});const id=store.state.operations.money_requests[0].id;assert.equal((await q('driver','POST','/api/operations',{operation:'MONEY_REVIEW',payload:{id,approved:true}})).status,400);const results=await Promise.all([q('admin','POST','/api/operations',{operation:'MONEY_REVIEW',payload:{id,approved:true}}),q('admin','POST','/api/operations',{operation:'MONEY_REVIEW',payload:{id,approved:true}})]);assert.deepEqual(results.map(x=>x.status).sort(),[200,400]);assert.equal(rules.balance(store.state.operations,'d'),150000);assert.equal((await q('passenger','GET','/api/workspace')).body.operations.ledger.length,0);
});
test('dispatcher can book and assign but cannot grant money or approve drivers',async t=>{
 const {request:q,store}=await setup(t);assert.equal((await q('admin','POST','/api/operations',{operation:'STAFF',payload:{user_id:'p',role:'dispatcher'}})).status,200);assert.equal((await q('passenger','GET','/api/workspace')).body.profile.role,'dispatcher');await q('passenger','POST','/api/operations',{operation:'BOOK',payload:{customer:'Test customer',pickup:{latitude:18.47,longitude:-69.9,address:'A'},destination:{latitude:18.49,longitude:-69.94,address:'B'},scheduled_at:new Date(Date.now()+3600000).toISOString()}});const id=store.state.operations.reservations[0].id;assert.equal((await q('passenger','POST','/api/operations',{operation:'RELEASE_BOOKING',payload:{id}})).status,200);const ride=store.state.operations.reservations[0].ride_id;await q('driver','POST','/api/driver/availability',{online:true});assert.equal((await q('passenger','POST','/api/operations',{operation:'ASSIGN',payload:{id:ride,driver_id:'d'}})).status,200);assert.equal((await q('passenger','POST','/api/operations',{operation:'WALLET_ADJUST',payload:{driver_id:'d',amount:100,reason:'Forbidden'}})).status,400);assert.equal((await q('passenger','PATCH','/api/admin/drivers/d/approval',{approved:false})).status,403);
});
test('signed sharing omits PIN, rejects tampering and expires on cancellation',async t=>{
 const before=process.env.PUBLIC_API_URL;process.env.PUBLIC_API_URL='https://vai.example';t.after(()=>{if(before===undefined)delete process.env.PUBLIC_API_URL;else process.env.PUBLIC_API_URL=before;});const {request:q}=await setup(t),r=(await q('passenger','POST','/api/rides',draft)).body.ride;assert.equal((await q('driver2','POST',`/api/rides/${r.id}/share`)).status,403);const response=await q('passenger','POST',`/api/rides/${r.id}/share`);const path=new URL(response.body.url).pathname;const data=await q(null,'GET',path+'/data');assert.equal(data.status,200);assert.equal(data.body.pin,undefined);assert.equal(data.body.passenger_id,undefined);assert.equal((await q(null,'GET',path+'tamper/data')).status,404);await q('passenger','PATCH',`/api/rides/${r.id}/status`,{status:'cancelled',reason:'Test'});assert.equal((await q(null,'GET',path+'/data')).status,410);
});
test('SOS needs an active own ride; control center receives context and acknowledges',async t=>{
 const {request:q}=await setup(t),r=(await q('passenger','POST','/api/rides',draft)).body.ride;const payload={id:r.id,location:{latitude:18.47,longitude:-69.9}};assert.equal((await q('driver2','POST','/api/operations',{operation:'SOS',payload})).status,400);assert.equal((await q('passenger','POST','/api/operations',{operation:'SOS',payload})).status,200);const incidents=(await q('admin','GET','/api/workspace')).body.operations.incidents;assert.equal(incidents.length,1);assert.equal((await q('driver2','GET','/api/workspace')).body.operations.incidents.length,0);assert.equal((await q('admin','POST','/api/operations',{operation:'INCIDENT_ACK',payload:{id:incidents[0].id}})).status,200);
});
test('automatic dispatch selects eligible nearby drivers and records the assignment',async t=>{
 const {request:q,store,repo,app}=await setup(t);store.state.operations.settings.auto_dispatch=true;await q('driver','POST','/api/driver/availability',{online:true});await q('driver','POST','/api/driver/location',{latitude:draft.pickup_lat,longitude:draft.pickup_lng});const r=(await q('passenger','POST','/api/rides',draft)).body.ride;await app.listeners('request')[0].locals.tick();assert.equal(repo.rides.find(x=>x.id===r.id).driver_id,'d');assert.equal(store.state.operations.audit.at(-1).action,'AUTO_DISPATCH');
});
test('due reservations are released once by scheduler',async t=>{
 const {request:q,store,repo,app}=await setup(t);await q('passenger','POST','/api/operations',{operation:'BOOK',payload:{customer:'Test',pickup:{latitude:18.47,longitude:-69.9,address:'A'},destination:{latitude:18.49,longitude:-69.94,address:'B'},scheduled_at:new Date(Date.now()+3600000).toISOString()}});store.state.operations.reservations[0].scheduled_at=new Date(Date.now()-1000).toISOString();await app.listeners('request')[0].locals.tick();await app.listeners('request')[0].locals.tick();assert.equal(repo.rides.length,1);assert.equal(store.state.operations.reservations[0].status,'dispatched');
});
test('document photos stay private; only owner/admin can obtain a short-lived view',async t=>{
 const {request:q,repo,store}=await setup(t);const uploaded=[];repo.uploadDocument=async(path,data)=>uploaded.push({path,length:data.length});repo.signDocument=async path=>`https://storage.example/signed/${path}?expires=60`;
 assert.equal((await q('driver','POST','/api/documents/upload',{base64:Buffer.from('not an image').toString('base64')})).status,400);
 const bytes=Buffer.alloc(150);bytes[0]=255;bytes[1]=216;bytes[2]=255;const upload=await q('driver','POST','/api/documents/upload',{base64:bytes.toString('base64')});assert.equal(upload.status,201);const id=upload.body.file_id;assert.equal(uploaded.length,1);
 assert.equal((await q('driver','POST','/api/operations',{operation:'DOCUMENT',payload:{document_type:'insurance',reference:'SYNTHETIC TEST',expires:'2027-12-31',file_id:id}})).status,200);
 assert.equal(store.state.operations.documents.d.insurance.status,'pending');assert.equal(store.state.operations.documents.d.insurance.file_id,id);
 assert.equal((await q('driver2','GET',`/api/documents/${id}`)).status,404);assert.equal((await q('passenger','GET',`/api/documents/${id}`)).status,404);assert.equal((await q('admin','GET',`/api/documents/${id}`)).status,200);
 assert.equal((await q('driver2','POST','/api/operations',{operation:'DOCUMENT',payload:{document_type:'license',reference:'FORBIDDEN',expires:'2027-12-31',file_id:id}})).status,403);
});
test('legacy trips retain COP, get a private PIN and never debit the new DOP wallet',async t=>{
 const {request:q,repo,store,app}=await setup(t);repo.rides.push({id:'legacy',...draft,passenger_id:'p',driver_id:'d',estimated_fare:22500,status:'accepted',created_at:new Date().toISOString()});store.state.rides.legacy={distance_km:10};await app.listeners('request')[0].locals.migrateLegacy();const r=(await q('passenger','GET','/api/workspace')).body.rides[0];assert.equal(r.currency,'COP');assert.equal(r.estimated_fare,22500);assert.match(r.pin,/^\d{4}$/);assert.equal((await q('driver','GET','/api/workspace')).body.rides[0].pin,undefined);await q('driver','PATCH','/api/rides/legacy/status',{status:'arrived'});await q('driver','PATCH','/api/rides/legacy/status',{status:'in_progress',pin:r.pin});assert.equal((await q('driver','PATCH','/api/rides/legacy/status',{status:'completed'})).status,200);assert.equal(rules.balance(store.state.operations,'d'),100000);assert.equal(store.state.rides.legacy.receipt.currency,'COP');
});

test('pickup notes/preferences persist privately until the assigned driver accepts',async t=>{
 const {request:q}=await setup(t);
 const details={pickup_note:'Puerta azul, chaqueta roja',preferences:['quiet','cool']};
 const made=await q('passenger','POST','/api/rides',{...draft,...details});assert.equal(made.status,201);
 const id=made.body.ride.id;assert.equal(made.body.ride.pickup_note,details.pickup_note);
 await q('driver','POST','/api/driver/availability',{online:true});
 const available=await q('driver','GET','/api/rides/available');assert.equal(available.body.rides[0].pickup_note,undefined);assert.equal(available.body.rides[0].preferences,undefined);
 const before=await q('driver','GET','/api/workspace');assert.equal(before.body.rides[0].pickup_note,undefined);
 assert.equal((await q('driver','POST',`/api/rides/${id}/accept`)).status,200);
 const own=(await q('driver','GET','/api/workspace')).body.rides[0];assert.equal(own.pickup_note,details.pickup_note);assert.deepEqual(own.preferences,details.preferences);assert.equal(own.pin,undefined);
 assert.equal((await q('driver2','GET',`/api/rides/${id}`)).status,404);
 assert.equal((await q('admin','GET','/api/workspace')).body.rides[0].pickup_note,details.pickup_note);
});
test('invalid rider details are rejected before a trip is inserted',async t=>{
 const {request:q,repo}=await setup(t);
 for(const details of [{pickup_note:'a'.repeat(161)},{preferences:['unknown']},{pickup_note:'line\nbreak'},{preferences:'quiet'}]) assert.equal((await q('passenger','POST','/api/rides',{...draft,...details})).status,400);
 assert.equal(repo.rides.length,0);
});
