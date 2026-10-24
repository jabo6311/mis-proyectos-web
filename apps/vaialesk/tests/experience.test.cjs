const {test}=require('node:test'), assert=require('node:assert/strict');
const x=require('../shared/rider-experience.cjs');
const {pollDelay,createPoller}=require('../shared/polling.cjs');
test('favorites discard invalid coordinates and unknown keys; repeating never reuses a price',()=>{
 const p={latitude:18.4,longitude:-69.9,address:' Casa '};
 assert.deepEqual(x.settings({dataSaver:true,favorites:{Casa:p,Trabajo:{...p,latitude:91},Other:p}}),{dataSaver:true,favorites:{Casa:{...p,address:'Casa'}}});
 const route=x.repeatRoute({pickup_lat:18.4,pickup_lng:-69.9,pickup_address:'A',destination_lat:18.5,destination_lng:-69.8,destination_address:'B',estimated_fare:1});
 assert.equal(route.destination.address,'B');assert.equal(route.estimated_fare,undefined);
 assert.equal(x.repeatRoute({}),null);
});
test('ride details reject unsupported preferences, long notes and control characters',()=>{
 assert.deepEqual(x.rideDetails({preferences:['quiet','quiet','cool'],pickup_note:' Puerta azul '}),{preferences:['quiet','cool'],pickup_note:'Puerta azul'});
 for(const input of [{preferences:['vip']},{preferences:'quiet'},{pickup_note:'x'.repeat(161)},{pickup_note:'dos\nlíneas'},{pickup_note:123}])assert.throws(()=>x.rideDetails(input));
 assert.deepEqual(x.rideDetails(),{preferences:[],pickup_note:''});
});
test('polling differentiates own active trip, online driver, staff and idle with capped backoff',()=>{
 const idle={profile:{id:'p',role:'passenger'},rides:[]};
 assert.equal(pollDelay(idle),30000);assert.equal(pollDelay(idle,true),60000);
 const active={...idle,rides:[{status:'accepted',passenger_id:'p'}]};
 assert.equal(pollDelay(active),3000);assert.equal(pollDelay(active,true),8000);
 assert.equal(pollDelay({...idle,rides:[{status:'accepted',passenger_id:'another'}]}),30000);
 assert.equal(pollDelay({profile:{id:'d',role:'driver'},drivers:[{id:'d',online:true}]}),5000);
 assert.equal(pollDelay({profile:{role:'dispatcher'}},true),10000);
 assert.equal(pollDelay(active,true,20),120000);
});
test('scheduler never overlaps; background stops timers and foreground refreshes immediately',async()=>{
 let pending, calls=0, timers=new Map(),next=0,lastDelay;
 const worker=createPoller({refresh:()=>{calls++;return new Promise(r=>pending=r);},delay:f=>100*(f+1),setTimer:(fn,ms)=>{lastDelay=ms;timers.set(++next,fn);return next;},clearTimer:id=>timers.delete(id)});
 worker.start();worker.start();assert.equal(calls,1);
 worker.stop();pending(true);await new Promise(setImmediate);assert.equal(timers.size,0);
 worker.start();assert.equal(calls,2);pending(false);await new Promise(setImmediate);assert.equal(lastDelay,200);
 const run=timers.values().next().value;timers.clear();run();assert.equal(calls,3);
 worker.stop();worker.start();assert.equal(calls,3);pending(true);await new Promise(setImmediate);assert.equal(lastDelay,100);
 worker.stop();assert.equal(timers.size,0);
});
