import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const data=JSON.parse(readFileSync(new URL('../public/data/network.json',import.meta.url),'utf8'));
test('fictional global dataset contains unique, valid locations',()=>{
 assert.equal(data.fictional,true);assert.equal(data.schemaVersion,2);
 assert.equal(new Set(data.locations.map(l=>l.id)).size,data.locations.length);
 for(const l of data.locations){assert.ok(l.longitude>=-180&&l.longitude<=180);assert.ok(l.latitude>=-90&&l.latitude<=90);assert.ok(l.country&&l.name);assert.ok(l.sites>0&&l.capacityGbps>0&&l.latencyMs>0);}
});
test('network and media routes reference existing hubs; global network is connected',()=>{
 const ids=new Set(data.locations.map(l=>l.id));const routes=[...data.connections,...data.media];
 assert.equal(new Set(routes.map(l=>l.id)).size,routes.length);
 for(const c of routes){assert.ok(ids.has(c.from)&&ids.has(c.to));assert.notEqual(c.from,c.to);}
 const visited=new Set([data.locations[0].id]);let changed=true;
 while(changed){changed=false;for(const {from,to} of data.connections){if(visited.has(from)!==visited.has(to)){visited.add(from);visited.add(to);changed=true;}}}
 assert.equal(visited.size,ids.size);
});
test('route coordinates match endpoints and cross the dateline without long wraparound lines',()=>{
 for(const c of data.connections){
  const a=data.locations.find(l=>l.id===c.from),b=data.locations.find(l=>l.id===c.to);
  assert.deepEqual(c.coordinates[0],[a.longitude,a.latitude]);
  const last=c.coordinates.at(-1);assert.ok(Math.abs(((last[0]-b.longitude)%360))<1e-8);assert.equal(last[1],b.latitude);
  for(let i=1;i<c.coordinates.length;i++)assert.ok(Math.abs(c.coordinates[i][0]-c.coordinates[i-1][0])<180);
  assert.match(c.color,/^#[0-9a-f]{6}$/i);
 }
});
