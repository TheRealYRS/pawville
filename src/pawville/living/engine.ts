/** Reusable, bounded living-resident simulation. Pure, deterministic movement, no teleporting. */
import type { Vec2, Rect } from '../world/geometry.ts';
import type { RegionDef } from '../adventure/regionKit.ts';
import { RTILE, groundSolids, regionPropCollider } from '../adventure/regionKit.ts';
import { NEW_RESIDENTS, type Resident } from './roster.ts';
export interface LivingState { id: string; x: number; y: number; goal: 0 | 1; path: Vec2[]; facing: 'up'|'down'|'left'|'right'; moving: boolean; until: number; stuck: number; activity: string; /** consecutive failed recoveries (a resident that keeps failing gives up the leg) */ jam?: number }
export interface LivingWorld { residents: Resident[]; states: Map<string,LivingState>; solids: Rect[]; region: RegionDef }
const hash = (s: string) => { let h=2166136261; for(const ch of s) h=Math.imul(h^ch.charCodeAt(0),16777619); return h>>>0; };
const walkable = (p:Vec2,def:RegionDef,solids:readonly Rect[],others:readonly Vec2[]=[]):boolean => p.x>=9&&p.y>=12&&p.x<def.cols*RTILE-9&&p.y<def.rows*RTILE-9 && !solids.some(r=>p.x>=r.x-4&&p.x<r.x+r.w+4&&p.y>=r.y-3&&p.y<r.y+r.h+3) && !others.some(o=>Math.hypot(o.x-p.x,o.y-p.y)<11);

// ---------------------------------------------------------------------------------------------
// Conversations: a resident you are talking to stops walking and turns to face you.
// residentDialogue() starts the pause automatically; the pause ends when you walk away
// (more than TALK_LEAVE px) or after TALK_MAX_MS, so nobody can get stuck frozen.
// ---------------------------------------------------------------------------------------------
const TALK_MAX_MS = 20_000;
const TALK_LEAVE = 56;
const talking = new Map<string, number>(); // resident id -> Date.now() deadline
/** Pause a resident for a conversation (called automatically when you talk to them). */
export function startResidentTalk(id: string, ms = TALK_MAX_MS): void { talking.set(id, Date.now() + ms); }
/** End a conversation early, e.g. when the dialogue panel closes. Safe to call at any time. */
export function endResidentTalk(id?: string): void { if (id) talking.delete(id); else talking.clear(); }
export function isResidentTalking(id: string): boolean { const t = talking.get(id); return t !== undefined && t > Date.now(); }
const faceTowards = (from: Vec2, to: Vec2): LivingState['facing'] => {
  const dx = to.x - from.x, dy = to.y - from.y;
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
};

/** Accessible waypoint grid; A* with expansion cap to bound mobile cost. */
export function findPath(def:RegionDef,solids:readonly Rect[],start:Vec2,end:Vec2,others:readonly Vec2[]=[]):Vec2[] {
 const step=RTILE, cols=def.cols,rows=def.rows;
 const cell=(p:Vec2)=>({x:Math.max(0,Math.min(cols-1,Math.floor(p.x/step))),y:Math.max(0,Math.min(rows-1,Math.floor(p.y/step)))});
 const a=cell(start),b=cell(end),key=(x:number,y:number)=>y*cols+x;
 const origin=key(a.x,a.y),target=key(b.x,b.y), open=[origin],cost=new Map([[origin,0]]),parent=new Map<number,number>(),done=new Set<number>();
 const ok=(x:number,y:number)=>walkable({x:x*step+8,y:y*step+8},def,solids,others);
 // A route is only real if the STRAIGHT walk between two tile centres is clear too: a crystal or a lamp standing between two
 // open tiles used to leave a resident walking into it forever (the planner thought the way was open).
 const edgeOk=(x0:number,y0:number,x1:number,y1:number)=>{for(let q=1;q<4;q++){const f=q/4;if(!walkable({x:(x0+(x1-x0)*f)*step+8,y:(y0+(y1-y0)*f)*step+8},def,solids,others))return false;}return true;};
 let expanded=0;
 while(open.length&&expanded++<3000){
  let best=0,score=Infinity;
  for(let i=0;i<open.length;i++){const k=open[i],x=k%cols,y=Math.floor(k/cols),g=(cost.get(k)??Infinity)+Math.abs(x-b.x)+Math.abs(y-b.y);if(g<score){score=g;best=i;}}
  const k=open.splice(best,1)[0]; if(k===target){const result:Vec2[]=[];let n=k;while(n!==origin){result.push({x:(n%cols)*step+8,y:Math.floor(n/cols)*step+8});n=parent.get(n)!;}result.reverse(); const c0={x:a.x*step+8,y:a.y*step+8}; if(Math.hypot(start.x-c0.x,start.y-c0.y)>1.5&&[1,2,3].every(q=>walkable({x:start.x+(c0.x-start.x)*q/4,y:start.y+(c0.y-start.y)*q/4},def,solids,others)))result.unshift(c0); if(walkable(end,def,solids,others))result.push(end);return result;}
  if(done.has(k))continue;done.add(k);
  const x=k%cols,y=Math.floor(k/cols);
  for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=cols||yy>=rows||!ok(xx,yy)||!edgeOk(x,y,xx,yy))continue;const nk=key(xx,yy),nc=cost.get(k)!+1;if(nc<(cost.get(nk)??Infinity)){cost.set(nk,nc);parent.set(nk,k);open.push(nk);}}
 }
 return [];
}
/** Resolve a specified landmark onto a nearby reachable tile, never inside scenery. */
export function safeSpot(def:RegionDef,solids:readonly Rect[],p:Vec2):Vec2 {
 // Always the CENTRE of a walkable tile: that is the only kind of place a route can start from or end on, and a landmark on the
 // corner of a counter (or on a tile whose middle is inside a prop's margin) used to leave a resident unable to take a step.
 const cx=Math.floor(p.x/RTILE),cy=Math.floor(p.y/RTILE),at=(x:number,y:number):Vec2=>({x:x*RTILE+8,y:y*RTILE+8});
 if(walkable(at(cx,cy),def,solids))return at(cx,cy);
 for(let r=1;r<=8;r++){
  let best:Vec2|null=null,bd=Infinity;
  for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){if(Math.max(Math.abs(dx),Math.abs(dy))!==r)continue;const v=at(cx+dx,cy+dy);if(!walkable(v,def,solids))continue;const d=Math.hypot(v.x-p.x,v.y-p.y);if(d<bd){bd=d;best=v;}}
  if(best)return best;
 }
 return def.spawn;
}
export function makeLivingWorld(def:RegionDef,residents:readonly Resident[], suppliedSolids?: readonly Rect[]):LivingWorld {
 const solids=suppliedSolids ? [...suppliedSolids] : [...groundSolids(def),...def.props.map(regionPropCollider).filter((x):x is Rect=>!!x)];
 const states=new Map<string,LivingState>();
 for(const person of residents){const s=safeSpot(def,solids,person.stops[0]);states.set(person.id,{id:person.id,x:s.x,y:s.y,goal:1,path:[],facing:'down',moving:false,until:(hash(person.id)%7000)+2500,stuck:0,activity:person.job});}
 return {residents:[...residents],states,solids,region:def};
}
/** Advance simulation by dt milliseconds. No state mutation outside this instance, no remote purchases. */
export function tickLiving(w:LivingWorld,dt:number,now:number,player?:Vec2):void {
 const delta=Math.max(0,Math.min(250,dt)),occupied:Vec2[]=[];
 for(const person of w.residents){const s=w.states.get(person.id)!;
  // ---- in conversation: stand still and look at the player ----
  if(isResidentTalking(person.id)){
   if(player&&Math.hypot(player.x-s.x,player.y-s.y)>TALK_LEAVE){talking.delete(person.id);}
   else{
    s.moving=false;s.stuck=0;s.activity='Chatting';
    if(player)s.facing=faceTowards(s,player);
    s.until=Math.max(s.until,now+1500); // a short pause after you leave before they walk on
    occupied.push({x:s.x,y:s.y});continue;
   }
  } else if(talking.has(person.id)) talking.delete(person.id);
  if(now<s.until){s.moving=false;occupied.push({x:s.x,y:s.y});continue;}
  const end=safeSpot(w.region,w.solids,person.stops[s.goal]);
  if(!s.path.length){s.path=findPath(w.region,w.solids,{x:s.x,y:s.y},end);if(!s.path.length){s.until=now+3000+(hash(person.id)%4000);s.goal=s.goal===0?1:0;s.activity='Looking around';occupied.push({x:s.x,y:s.y});continue;}}
  const next=s.path[0],vx=next.x-s.x,vy=next.y-s.y,dist=Math.hypot(vx,vy);
  if(dist<=1.5){s.path.shift();if(!s.path.length){s.goal=s.goal===0?1:0;s.until=now+3000+(hash(`${person.id}:${s.goal}`)%6000);s.activity=person.idle;s.moving=false;}occupied.push({x:s.x,y:s.y});continue;}
  const speed=Math.min(dist,delta*(0.025+(hash(person.id)%12)*0.001)),p={x:s.x+vx/dist*speed,y:s.y+vy/dist*speed};
  if(!walkable(p,w.region,w.solids,[...occupied,...(player?[player]:[])].filter(o=>Math.hypot(o.x-s.x,o.y-s.y)>0.1))){s.moving=false;s.stuck+=delta;if(s.stuck>1600){s.jam=(s.jam??0)+1;if(s.jam>=3){s.path=[];s.jam=0;s.goal=s.goal===0?1:0;s.until=now+4000+(hash(person.id)%3000);s.activity='Looking around';}else{s.path=findPath(w.region,w.solids,{x:s.x,y:s.y},end,[...occupied,...(player?[player]:[])]);s.until=now+500;}s.stuck=0;}occupied.push({x:s.x,y:s.y});continue;}
  s.x=p.x;s.y=p.y;s.facing=Math.abs(vx)>Math.abs(vy)?vx>0?'right':'left':vy>0?'down':'up';s.moving=true;s.stuck=0;s.jam=0;s.activity='Walking to '+person.job;occupied.push(p);
 }
}

// ---------------------------------------------------------------------------------------------
// Character voices: every resident speaks in the voice of their trait.
// ---------------------------------------------------------------------------------------------
interface Voice { hello: readonly string[]; day: string; night: string; rain: string; friend: string }

const VOICES: Record<string, Voice> = {
  generous: { hello: ['Oh, hello, dear!', 'There you are! I hoped I\u2019d see you.', 'Hello! Have you eaten today?'],
    day: 'Days like this make me want to hand everyone a flower.', night: 'I like to make sure everyone gets home warm.', rain: 'Here, come stand under the awning with me.', friend: 'If you see {friend}, give them a wave from me.' },
  musical: { hello: ['Hey! You\u2019ve got good timing.', 'Ba-dum! Hello!', 'Oh, an audience!'],
    day: 'The square has a great echo at this hour.', night: 'Evenings are for slow songs. Everyone listens softer.', rain: 'Hear that? The gutters are keeping perfect time.', friend: '{friend} hums along when they think I can\u2019t hear.' },
  inquisitive: { hello: ['Ah! Noticed anything odd today?', 'Hello! Quick question \u2014 actually, never mind.', 'Oh good, another explorer.'],
    day: 'Daylight shows the cracks. Cracks are where stories hide.', night: 'Everything looks different after dark. I\u2019m taking notes.', rain: 'Rain uncovers old paint on the walls. Fascinating.', friend: 'I\u2019m comparing notes with {friend} later.' },
  practical: { hello: ['Morning. Well \u2014 hello.', 'Hi. Need anything?', 'Oh, it\u2019s you. Good.'],
    day: 'Plenty to do. Best get on with it.', night: 'The list is mostly done. Tomorrow\u2019s problems can wait.', rain: 'Rain means indoor jobs. I had a list ready.', friend: '{friend} would forget their own tail without a list.' },
  busy: { hello: ['Hi! Can\u2019t stop long!', 'Oh \u2014 hello! Mind the parcel!', 'Hey! Walking and talking, sorry!'],
    day: 'Three more deliveries before lunch.', night: 'Last round of the day. My paws are tired.', rain: 'Wet parcels are my worst nightmare.', friend: '{friend} keeps sneaking treats into my satchel.' },
  shy: { hello: ['Oh! H-hi.', '\u2026Hello.', 'Um. Hi. You startled me.'],
    day: 'It\u2019s nice when it\u2019s quiet like this.', night: 'I like evenings. Fewer cats about.', rain: 'I don\u2019t mind rain. Everyone stays inside.', friend: '{friend} is easy to talk to. Like you, maybe.' },
  relaxed: { hello: ['Hey. No rush, sit a while.', 'Oh, hi. Lovely to see you.', 'Hello, friend.'],
    day: 'Nowhere to be. That\u2019s the best kind of day.', night: 'Warm cup, soft light. Can\u2019t complain.', rain: 'Rain just means a second cup.', friend: 'I\u2019m saving a seat for {friend}.' },
  foodie: { hello: ['Hi! Do you smell cinnamon?', 'Oh, hello! Have you tried the buns today?', 'Hey! I just had the best tart.'],
    day: 'The bakery\u2019s morning batch is gone already. Tragic.', night: 'Evening is for something warm and sweet.', rain: 'Rainy days call for soup. And then dessert.', friend: '{friend} says I review pastries too seriously.' },
  patient: { hello: ['Hello. Take your time.', 'Ah, good to see you.', 'Hello there. Slowly now.'],
    day: 'Good growing weather. You can almost hear the stems stretch.', night: 'Plants rest at night too. So should we.', rain: 'The beds needed this rain.', friend: '{friend} keeps me company while I weed.' },
  observant: { hello: ['Shh \u2014 oh, hello.', 'Hi. Don\u2019t move too fast.', 'Hello. Did you see that bird?'],
    day: 'Three sparrows on the fence this morning. Four now.', night: 'The owls start talking about now.', rain: 'Birds go quiet just before the rain.', friend: '{friend} taught me to sit absolutely still.' },
  playful: { hello: ['Tag! \u2026Kidding. Hi!', 'Race you! Later. Hi!', 'Boo! Did I get you?'],
    day: 'Perfect weather for chasing absolutely nothing.', night: 'Shadows are great for sneaking. Not that I sneak.', rain: 'Puddle jumping is a sport and I\u2019m the champion.', friend: '{friend} says I\u2019m too loud. I say I\u2019m enthusiastic.' },
  adventurous: { hello: ['Ahoy!', 'There\u2019s a traveller!', 'Hello! Been anywhere new?'],
    day: 'Clear skies. Good for spotting far-off sails.', night: 'Stars are the best map there is. Just look up.', rain: 'A little rain never stopped a good trip.', friend: '{friend} always knows when the sunset will be special.' },
  artistic: { hello: ['Oh! Hold still \u2014 no, never mind. Hello!', 'Hi. The light on you is lovely.', 'Hello. Excuse the paint.'],
    day: 'Midday light is flat. I\u2019m waiting for the golden hour.', night: 'The harbour lights are my favourite thing to paint.', rain: 'Rain turns every street into a mirror.', friend: '{friend} brings me shells to grind into paint.' },
  organised: { hello: ['Hello. Right on time.', 'Ah, good day.', 'Hello! I\u2019ve just updated my timetable.'],
    day: 'The 10:15 was two minutes early. Noted.', night: 'Last departures soon. Everything in its place.', rain: 'Rain delays. I\u2019ve allowed for it.', friend: '{friend} knows every departure tune by heart.' },
  chatty: { hello: ['Oh, hello hello! Guess what?', 'Hi! Have you heard the news?', 'There you are! I was just saying\u2026'],
    day: 'Busy platform today! Everyone\u2019s off somewhere.', night: 'Night trains are the cosiest, I always say.', rain: 'Rain always brings the best station gossip.', friend: '{friend} counted every bell in the station. Every one!' },
  helpful: { hello: ['Hello! Can I help with anything?', 'Hi there! Lost?', 'Oh, hello! Need directions?'],
    day: 'I\u2019m keeping an eye on the beds today.', night: 'I\u2019ll check the lanterns before heading home.', rain: 'Careful, the stones get slippery in the rain.', friend: '{friend} and I swap seeds over the fence.' },
  sleepy: { hello: ['Mm? Oh\u2026 hello.', '*yawn* Sorry. Hi.', 'You caught me between naps.'],
    day: 'Sunbeams are basically an invitation to lie down.', night: 'Night already? I\u2019ll be asleep before the lamps are lit.', rain: 'Rain on the roof is the best lullaby there is.', friend: '{friend} lets me nap on the good cushion.' },
  studious: { hello: ['Oh \u2014 hello. One moment, finishing a page.', 'Good day. Mind the books.', 'Ah, hello. Interested in history?'],
    day: 'I\u2019m cataloguing the old street names today.', night: 'The best reading happens by lamplight.', rain: 'Rainy days are reading days. That is the rule.', friend: '{friend} and I are deciphering an old map.' },
  curious: { hello: ['Ooh, hello! Where are you off to?', 'Hi! What did you find today?', 'Oh! You again. Good!'],
    day: 'There\u2019s always something new around the next corner.', night: 'I wonder where everyone goes when the lamps come on.', rain: 'Have you seen how the puddles reflect the signs? Look!', friend: '{friend} says I ask too many questions. Do I?' },
  serious: { hello: ['Evening\u2014 ah. Good day.', 'Hello. Watch your step.', 'Hm. Hello.'],
    day: 'Lanterns don\u2019t need me in daylight. I check the wicks anyway.', night: 'Every lantern lit, every lane safe. That\u2019s the job.', rain: 'Rain gets into the glass. I\u2019ll be busy tonight.', friend: '{friend} sleeps through my rounds. Every time.' },
  outgoing: { hello: ['Hey hey! Welcome back!', 'Oh, I love seeing you!', 'Hi! Come meet everyone!'],
    day: 'Perfect day for a walking tour. Want one?', night: 'The town looks its best with the lamps on.', rain: 'Rain just means we all squeeze under one roof. Cosy!', friend: '{friend} found the best stall at the market, ask them.' },
  weathered: { hello: ['Mornin\u2019, little one.', 'Ahoy there.', 'Mind the planks, they talk back.'],
    day: 'Tide\u2019s kind today. The gulls agree.', night: 'Lanterns on the water. That\u2019s the good hour.', rain: 'A bit of rain never sank a good boat.', friend: '{friend} and I go back further than the pier.' },
  hardy: { hello: ['Brr \u2014 hello! Keep moving, that\u2019s the secret.', 'Ah, a visitor! Warm paws?', 'Frost on your whiskers! Suits you.'],
    day: 'Crisp and bright. The best kind of cold.', night: 'The stars are sharper up here. So is the wind.', rain: 'Rain up here turns to sleet. Wear your scarf.', friend: '{friend} makes the only hot cider worth the climb.' },
  woodsy: { hello: ['Shh \u2014 you\u2019ll scare the mushrooms. Hello!', 'Oh, a visitor! Mind the ferns.', 'Hello, hello. Watch your step.'],
    day: 'Sunbeams in the canopy. Good foraging light.', night: 'The glow-caps come up at night. Pretty, aren\u2019t they?', rain: 'The moss drinks it up. So do I, honestly.', friend: '{friend} knows every mushroom by its first name.' },
  dreamy: { hello: ['Oh\u2026 hello. I was counting stars.', 'Hi. Did you hear the bridge hum?', 'You\u2019re real! I wasn\u2019t sure.'],
    day: 'Daytime is just the stars resting.', night: 'Every star has a name. Some I made up.', rain: 'The isles shimmer in the rain. Look closely.', friend: '{friend} listens to my wild ideas. Politely.' },
  mischievous: { hello: ['Oh! I wasn\u2019t doing anything.', 'Psst. Hello.', 'Heh. Hi.'],
    day: 'Someone left a ball of yarn by the market. Not me.', night: 'Night is when the market cats trade secrets.', rain: 'Rain washes away pawprints. Very convenient.', friend: '{friend} still thinks the yarn thing was an accident.' },
};
/** The personalities that have their own way of talking (anyone else falls back to a friendly default). */
export const VOICE_TRAITS: readonly string[] = Object.keys(VOICES);
const DEFAULT_VOICE: Voice = { hello: ['Oh, hello there.', 'Hi! Nice to bump into you.', 'Hey, good to see you.'],
  day: 'Busy day as the {job}, but I don\u2019t mind.', night: 'Almost time to finish up as the {job}.', rain: 'Rain or not, someone has to be the {job}.', friend: 'Say hello to {friend} for me.' };

const friendName = (id: string): string => NEW_RESIDENTS.find((r) => r.id === id)?.name ?? (id.charAt(0).toUpperCase() + id.slice(1));
/** Remembers the last greeting per resident so the same opener never repeats twice in a row. */
const lastHello = new Map<string, number>();

/** Character-specific dialogue that reacts to time, weather and friendship. Also pauses the resident. */
export function residentDialogue(p:Resident,phase:string,rain:boolean,friendship=0):string[] {
 startResidentTalk(p.id);
 const v=VOICES[p.trait]??DEFAULT_VOICE;
 let i=(hash(p.id)+hash(phase)+friendship)%v.hello.length;
 if(lastHello.get(p.id)===i)i=(i+1)%v.hello.length;
 lastHello.set(p.id,i);
 const remark=(rain?v.rain:phase==='night'||phase==='evening'?v.night:v.day).replace('{job}',p.job);
 const closer=friendship>1?`Always nice when you stop by. ${p.lines[2]}`:v.friend.replace('{friend}',friendName(p.friend));
 return [v.hello[i],p.lines[0],remark,p.lines[1],closer];
}

/** A bounded local scene snapshot, validated again against collision rules when restored. */
export function livingSnapshot(w:LivingWorld){return {version:1,states:[...w.states.values()].map(({id,x,y,goal,facing,moving,activity})=>({id,x,y,goal,facing,moving,activity}))};}
export function restoreLiving(w:LivingWorld,raw:unknown):void{if(!raw||typeof raw!=='object')return;const o=raw as Record<string,unknown>;if(o.version!==1||!Array.isArray(o.states)||o.states.length>40)return;for(const value of o.states){if(!value||typeof value!=='object')continue;const v=value as Record<string,unknown>,s=typeof v.id==='string'?w.states.get(v.id):undefined;if(!s||typeof v.x!=='number'||typeof v.y!=='number'||!Number.isFinite(v.x)||!Number.isFinite(v.y)||!walkable({x:v.x,y:v.y},w.region,w.solids))continue;s.x=v.x;s.y=v.y;s.path=[];s.stuck=0;s.goal=v.goal===0?0:1;s.facing=v.facing==='left'||v.facing==='right'||v.facing==='up'||v.facing==='down'?v.facing:s.facing;s.activity=typeof v.activity==='string'?v.activity.slice(0,80):'watch';}}
