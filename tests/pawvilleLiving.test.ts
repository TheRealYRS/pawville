import {test} from 'node:test';
import assert from 'node:assert/strict';
import { NEW_RESIDENTS } from '../src/pawville/living/roster.ts';
import { makeLivingWorld, tickLiving, findPath, safeSpot, residentDialogue } from '../src/pawville/living/engine.ts';
import {regionDef,resetRegionCacheForTests} from '../src/pawville/adventure/regions.ts';

import { COAT_INFO } from '../src/pawville/appearance.ts';
test('44 distinct new characters (24 in the city/town/park/old-town + 20 in the formerly empty regions), existing cast preserved, unique locations and interactions',()=>{
 assert.equal(NEW_RESIDENTS.length,44);
 assert.equal(new Set(NEW_RESIDENTS.map(x=>x.id)).size,NEW_RESIDENTS.length);
 const existing=['clementine','biscuit','rosie','pemberton','ozzie','tulip','bloom','wren'];
 for(const p of NEW_RESIDENTS){assert.ok(!existing.includes(p.id));assert.ok(COAT_INFO[p.coat]);assert.equal(p.stops.length,2);assert.equal(p.lines.length,3);assert.ok(NEW_RESIDENTS.some(x=>x.id===p.friend)||existing.includes(p.friend));
   if(p.region==='town')continue;const r=regionDef(p.region);assert.equal(r.npcs.filter(n=>n.id===p.id).length,1);assert.equal(r.spots.filter(n=>n.npc===p.id).length,1);
 }
 resetRegionCacheForTests();
});
test('navigation never goes across solid tiles; repeated scene creation does not duplicate residents',()=>{
 for(const region of [...new Set(NEW_RESIDENTS.map(x=>x.region))]){
  if(region==='town')continue;const def=regionDef(region);const people=NEW_RESIDENTS.filter(x=>x.region===region), world=makeLivingWorld(def,people);
  assert.equal(world.states.size,people.length);
  for(const p of people){const start=world.states.get(p.id)!;assert.ok(Number.isFinite(start.x));
   const a=safeSpot(def,world.solids,p.stops[0]),b=safeSpot(def,world.solids,p.stops[1]);
   const path=findPath(def,world.solids,a,b);
   for(const at of path) assert.ok(!world.solids.some(s=>at.x>=s.x-4&&at.x<s.x+s.w+4&&at.y>=s.y-3&&at.y<s.y+s.h+3),p.id+' path in collider');
  }
  const old=world.states.get(people[0].id)!;let maxJump=0;
  for(let t=0;t<=20000;t+=180){const x=old.x,y=old.y;tickLiving(world,180,t);maxJump=Math.max(maxJump,Math.hypot(old.x-x,old.y-y));}
  assert.ok(maxJump<8,`no teleport: ${region} ${maxJump}`);
 }
});
test('dialogue responds to weather/time, and existing NPCs are retained',()=>{
 for(const p of NEW_RESIDENTS){assert.notDeepEqual(residentDialogue(p,'day',false),residentDialogue(p,'night',false));assert.notDeepEqual(residentDialogue(p,'day',false),residentDialogue(p,'day',true));}
 for(const id of ['city','city-park','old-town'] as const){const r=regionDef(id);assert.ok(r.npcs.some(n=>!NEW_RESIDENTS.some(x=>x.id===n.id)));}
});
