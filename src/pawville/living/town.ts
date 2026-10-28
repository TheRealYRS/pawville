import {buildTown,WORLD_W,WORLD_H,SPAWN_POINT,TILE} from '../world/townMap.ts';
import type {RegionDef} from '../adventure/regionKit.ts';
import {NEW_RESIDENTS} from './roster.ts';
import {makeLivingWorld} from './engine.ts';
export function makeTownLiving(){const def:RegionDef={id:'town',name:'Pawville',cols:WORLD_W/TILE,rows:WORLD_H/TILE,ground:new Uint8Array(WORLD_W/TILE*WORLD_H/TILE),props:[],spots:[],npcs:[],gates:[],spawn:SPAWN_POINT,areas:[],climate:{}};return makeLivingWorld(def,NEW_RESIDENTS.filter(n=>n.region==='town'),buildTown().solids);}
