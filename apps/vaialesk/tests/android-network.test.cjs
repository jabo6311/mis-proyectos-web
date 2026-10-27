const {test}=require('node:test');
const assert=require('node:assert/strict');
const {getTestApiNetworkConfig}=require('../plugins/with-android-test-api');
test('preview supports changing local network addresses while the endpoint policy rejects public HTTP',()=>{
 assert.match(getTestApiNetworkConfig('http://192.168.68.106:3000','preview'),/base-config cleartextTrafficPermitted="true"/);
 assert.equal(getTestApiNetworkConfig('http://20.12.0.165:3000','preview'),null);
});
test('production stays strict while previews support optional LAN configuration',()=>{
 assert.equal(getTestApiNetworkConfig('http://192.168.68.106:3000','production'),null);
 assert.match(getTestApiNetworkConfig('https://api.example.com','preview'),/base-config cleartextTrafficPermitted="true"/);
 assert.equal(getTestApiNetworkConfig('invalid','development'),null);
});
