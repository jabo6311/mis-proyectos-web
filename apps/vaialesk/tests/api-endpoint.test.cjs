const {test}=require('node:test');
const assert=require('node:assert/strict');
const {normalizeApiUrl,createEndpointStore}=require('../api-endpoint-store.cjs');
test('server settings allow HTTPS and local IPv4, reject public HTTP and credential-bearing URLs',()=>{
 for(const url of ['http://192.168.68.106:3000','http://10.0.0.2:3000','http://172.16.0.5:3000','https://api.example.com'])assert.equal(normalizeApiUrl(url+'/'),url);
 for(const url of ['http://20.12.0.165:3000','http://example.com','http://172.32.0.1','https://user:password@example.com','https://example.com/path','https://example.com?token=x','https://example.com#x','file:///tmp/test','http://localhost:3000','https://127.0.0.1'])assert.throws(()=>normalizeApiUrl(url));
 assert.equal(normalizeApiUrl('http://127.0.0.1:3000',{allowLocalhost:true}),'http://127.0.0.1:3000');
});
test('a failed health check never persists or publishes a replacement server',async()=>{
 const writes=[],events=[];const store=createEndpointStore({defaultUrl:'https://old.example',storage:{getItem:async()=>null,setItem:async(...x)=>writes.push(x)}});store.subscribe(x=>events.push(x));await store.load();
 await assert.rejects(store.save('https://new.example',async()=>{throw Error('unreachable');}));assert.equal(store.snapshot().url,'https://old.example');assert.equal(writes.length,0);assert.equal(events.length,1);
});
test('verified replacement persists and is restored before requests are enabled',async()=>{
 const values=new Map();const storage={getItem:async k=>values.get(k),setItem:async(k,v)=>values.set(k,v)};const first=createEndpointStore({storage,defaultUrl:'https://old.example'});const seen=[];first.subscribe(x=>seen.push(x));let checked;
 await first.save('http://192.168.68.106:3000/',async url=>{checked=url;});assert.equal(checked,'http://192.168.68.106:3000');assert.equal(first.snapshot().url,checked);
 const next=createEndpointStore({storage,defaultUrl:'https://old.example'});assert.equal(next.snapshot().ready,false);await next.load();assert.deepEqual(next.snapshot(),{url:checked,ready:true});
});
test('storage errors leave the previous server unchanged',async()=>{
 const store=createEndpointStore({defaultUrl:'https://old.example',storage:{getItem:async()=>null,setItem:async()=>{throw Error('disk full');}}});await store.load();await assert.rejects(store.save('https://new.example',async()=>{}));assert.equal(store.snapshot().url,'https://old.example');
});
