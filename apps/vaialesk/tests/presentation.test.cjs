const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), babel = require("@babel/core");
function load(file, mocks = {}, globals = {}) { const module = { exports: {} }; const code = babel.transformSync(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), { plugins: ["@babel/plugin-transform-modules-commonjs"] }).code; vm.runInNewContext(code, { module, exports: module.exports, require: key => mocks[key], Intl, Date, Math, ...globals }); return module.exports; }
const rules=require("../shared/operations.cjs");
const utils = load("ride-utils.js", {"./shared/operations.cjs":rules}), { demoReducer: reduce, initialDemoState } = load("demo-state.js", { "./ride-utils": utils,"./shared/operations.cjs":rules,"./shared/rider-experience.cjs":require("../shared/rider-experience.cjs") });
const draft = { pickup: utils.DEFAULT_PICKUP, destination: utils.DEFAULT_DESTINATION, route: { coordinates: [utils.DEFAULT_PICKUP, utils.DEFAULT_DESTINATION], distanceKm: 12, minutes: 25 } };
function requested() { return reduce(initialDemoState(), { type: "REQUEST", id: "ride-1", draft }); }
test("the complete solo presentation works across passenger, admin and driver", () => {
  let s = requested();
  s = reduce(s, { type: "ROLE", role: "admin" }); s = reduce(s, { type: "REVIEW", approved: true });
  for(const document_type of rules.DOCUMENT_TYPES)s=reduce(s,{type:"OPERATION",operation:"DOCUMENT_REVIEW",payload:{driver_id:"demo-driver",document_type,approved:true}});
  s = reduce(s, { type: "ROLE", role: "driver" }); s = reduce(s, { type: "ONLINE", online: true });
  s = reduce(s, { type: "ACCEPT", id: "ride-1" }); assert.equal(s.rides[0].driver_id, "demo-driver");
  s=reduce(s,{type:"STATUS",id:"ride-1",status:"arrived"});
  s = reduce(s, { type: "STATUS", id: "ride-1", status: "in_progress",pin:s.rides[0].pin });
  s = reduce(s, { type: "LOCATION", point: utils.DEFAULT_DESTINATION }); assert.equal(s.driverLocation.latitude, draft.destination.latitude);
  s = reduce(s, { type: "STATUS", id: "ride-1", status: "completed" });
  s = reduce(s, { type: "ROLE", role: "passenger" }); s = reduce(s, { type: "RATING", id: "ride-1", score: 5 });
  assert.equal(s.rides[0].status, "completed"); assert.equal(s.rides[0].rating, 5); assert.equal(s.rides[0].estimated_fare, utils.estimateFare(12,25));
  assert.equal(JSON.parse(JSON.stringify(s)).rides[0].rating, 5);
});
test("demo prevents duplicate requests and passengers cancelling a search works", () => {
  let s = requested(); assert.throws(() => reduce(s, { type: "REQUEST", id: "ride-2", draft }), /activo/);
  s = reduce(s, { type: "STATUS", id: "ride-1", status: "cancelled", reason:"Cambio de planes" });
  assert.equal(reduce(s, { type: "REQUEST", id: "ride-2", draft }).rides.length, 2);
});
test("unapproved and offline drivers cannot accept; passenger cannot self-approve or advance", () => {
  let s = requested(); assert.throws(() => reduce(s, { type: "REVIEW", approved: true }), /administración/);
  assert.throws(() => reduce(s, { type: "STATUS", id: "ride-1", status: "completed" }), /transición|cambió/);
  s = reduce(s, { type: "ROLE", role: "driver" }); assert.throws(() => reduce(s, { type: "ONLINE", online: true }), /aprobar/);
  assert.throws(() => reduce(s, { type: "ACCEPT", id: "ride-1" }), /aprobado/);
});
test("reset clears only presentation state, invalid coordinates and same endpoints are rejected", () => {
  assert.equal(reduce(requested(), { type: "RESET" }).rides.length, 0);
  assert.throws(() => utils.makeRide({ pickup: { latitude: 200, longitude: 0 }, destination: draft.destination }, "x"), /Selecciona/);
  assert.throws(() => utils.makeRide({ pickup: draft.pickup, destination: draft.pickup }, "x"), /100 m/);
});
test("map bridge rejects malformed and out-of-range messages", () => {
  const { parseMapMessage } = load("map-html.js");
  assert.equal(parseMapMessage("not json"), null); assert.equal(parseMapMessage({ type: "pick", latitude: 92, longitude: 3 }), null);
  assert.equal(parseMapMessage({ type: "pick", latitude: 10, longitude: -66 }).longitude, -66);
});

test("street routes and address search work with Android's actual AbortSignal polyfill", async () => {
  const native = require("abort-controller");
  assert.equal(native.AbortSignal.timeout, undefined);
  const services = load("map-services.js", { "./ride-utils": utils }, {
    setTimeout, clearTimeout, AbortController: native.AbortController,
    fetch: async url => ({ ok: true, json: async () => url.includes("nominatim") ? [{ lat: "10.4969", lon: "-66.8534", display_name: "Plaza Francia, Caracas" }] : { code: "Ok", routes: [{ distance: 12000, duration: 1200, geometry: { coordinates: [[-74.04, 4.67], [-74.14, 4.70]] } }] } })
  });
  const route = await services.getRoute(draft.pickup, draft.destination);
  assert.equal(route.approximate, false); assert.equal(route.distanceKm, 12); assert.equal(route.coordinates[0].longitude, -74.04);
  assert.equal((await services.searchPlaces("Plaza Francia Caracas"))[0].latitude, 10.4969);
});

test("map requests abort and release their deadline on Android", async () => {
  const native = require("abort-controller"); let signal;
  const services = load("map-services.js", { "./ride-utils": utils }, {
    setTimeout, clearTimeout, AbortController: native.AbortController,
    fetch: (_, options) => new Promise((_, reject) => { signal = options.signal; signal.addEventListener("abort", () => reject(new Error("aborted"))); })
  });
  await assert.rejects(services.fetchMapJson("https://example.com", {}, 10), /aborted/); assert.equal(signal.aborted, true);
});

test('map routes coalesce in flight, expire after five minutes and evict old entries',async()=>{
 let count=0,now=1000000;
 class Clock extends Date { static now(){return now;} }
 const services=load('map-services.js',{'./ride-utils':utils},{Date:Clock,setTimeout,clearTimeout,AbortController,fetch:async()=>{count++;await new Promise(setImmediate);return {ok:true,json:async()=>({code:'Ok',routes:[{distance:1000,duration:60,geometry:{coordinates:[[-69.9,18.4],[-69.8,18.5]]}}]})};}});
 await Promise.all([services.getRoute(draft.pickup,draft.destination),services.getRoute(draft.pickup,draft.destination)]);assert.equal(count,1);
 await services.getRoute(draft.pickup,draft.destination);assert.equal(count,1);
 now+=300001;await services.getRoute(draft.pickup,draft.destination);assert.equal(count,2);
 for(let i=1;i<=64;i++)await services.getRoute({...draft.pickup,latitude:18+i/1000},draft.destination);
 await services.getRoute(draft.pickup,draft.destination);assert.equal(count,67);
});
test('demo preserves pickup reference and preferences when switching to assigned driver',()=>{
 let s=reduce(initialDemoState(),{type:'REQUEST',id:'details',draft:{...draft,pickup_note:'Puerta azul',preferences:['quiet','luggage']}});
 s=reduce(s,{type:'ROLE',role:'admin'});s=reduce(s,{type:'REVIEW',approved:true});
 for(const document_type of rules.DOCUMENT_TYPES)s=reduce(s,{type:'OPERATION',operation:'DOCUMENT_REVIEW',payload:{driver_id:'demo-driver',document_type,approved:true}});
 s=reduce(s,{type:'ROLE',role:'driver'});s=reduce(s,{type:'ONLINE',online:true});s=reduce(s,{type:'ACCEPT',id:'details'});
 assert.equal(s.rides[0].pickup_note,'Puerta azul');assert.deepEqual(Array.from(s.rides[0].preferences),['quiet','luggage']);
});
