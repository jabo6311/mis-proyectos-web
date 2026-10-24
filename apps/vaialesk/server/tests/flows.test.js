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
const draft = { pickup_address: "Origen", destination_address: "Destino", pickup_lat: 4.6767, pickup_lng: -74.0486, destination_lat: 4.7016, destination_lng: -74.1469, payment_method: "cash" };
async function setup(t) {
  const repo = memoryRepo(), store = { state: { drivers: {}, rides: {} }, save: async () => {} };
  const server = createApp({ repository: repo, store, verifyToken: async token => { if (!repo.profiles.some(p => p.auth0_sub === token)) throw new Error("invalid"); return { sub: token }; }, routePlanner: async () => ({ distance_km: 10, duration_minutes: 20, route_geometry: [] }) }).listen(0, "127.0.0.1");
  await once(server, "listening"); t.after(() => new Promise(resolve => server.close(resolve)));
  async function request(token, method, path, body) { const res = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) }); return { status: res.status, body: await res.json() }; }
  return { repo, store, request };
}
test("real passenger → approved online driver → complete → rate → admin metrics", async t => {
  const { request: q } = await setup(t);
  const created = await q("passenger", "POST", "/api/rides", draft); assert.equal(created.status, 201); assert.equal(created.body.ride.estimated_fare, 22500);
  const id = created.body.ride.id;
  assert.equal((await q("driver", "POST", `/api/rides/${id}/accept`)).status, 409);
  await q("driver", "POST", "/api/driver/availability", { online: true });
  assert.equal((await q("driver", "POST", `/api/rides/${id}/accept`)).status, 200);
  assert.equal((await q("passenger", "PATCH", `/api/rides/${id}/status`, { status: "completed" })).status, 403);
  assert.equal((await q("driver", "PATCH", `/api/rides/${id}/status`, { status: "completed" })).status, 409);
  await q("driver", "POST", "/api/driver/location", { latitude: 4.68, longitude: -74.06 });
  assert.equal((await q("passenger", "GET", "/api/workspace")).body.driverLocation.latitude, 4.68);
  assert.equal((await q("driver", "PATCH", `/api/rides/${id}/status`, { status: "in_progress" })).status, 200);
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
  assert.equal((await q("passenger", "PATCH", `/api/rides/${r.body.ride.id}/status`, { status: "cancelled" })).status, 200);
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
