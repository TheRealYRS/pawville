import { useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { Button } from '../../components/Button';
import {
  BLANKETS, CONSTELLATIONS, FISH, SEEDS, SNACKS, applyGardenOp, cast, decaySwing, nextGrowIn, pumpSwing, reel, seesawTiltShared, seesawTiltSolo,
  shootingStarAt, swingAngleShared, swingAngleSolo, tickFishing, type Blanket, type FishingState, type GardenOp, type SeedId, type SwingSolo,
} from '../activities/park.ts';
import { ACTIVITY_LABEL, newSid, type ActivityKind } from '../couple/activitySession.ts';
import { dispatch, onPairMessage, sendPair, usePairHub } from '../couple/pairHub.ts';
import { dayKey } from '../destinations.ts';
import type { TownIdentity } from '../identity';
import { seesawSeatPos, swingSeatPos } from '../render/townRenderer.ts';
import { cue } from '../sound';
import type { Environment } from '../world/environment.ts';
import { seededRandom, hashString } from '../world/geometry.ts';
import { SEATS, benchById, benchFacing, benchSeatLift, benchSeats, type Interactable } from '../world/townMap.ts';
import {
  ACHIEVEMENTS, ITEM_NAMES, addItem, bumpDailyCount, claimDaily, dailyAvailable, dailyCount, hasMemory, recordMemory, unlock,
  type AchievementId, type ItemId, type MemoryEvent, type WorldSave,
} from '../worldSave.ts';
import type { TownLive } from './TownCanvas';
import { useSeatClaim, useSeatIndex } from './useSeatClaim.ts';
import type { Slot } from '../world/seatClaims.ts';

export interface DockProps {
  spot: Interactable;
  identity: TownIdentity;
  env: Environment;
  live: MutableRefObject<TownLive>;
  save: WorldSave;
  update: (fn: (s: WorldSave) => WorldSave) => WorldSave;
  notify: (text: string, tone?: 'info' | 'success' | 'warn') => void;
  onClose: () => void;
  onPhoto: () => void;
  onMailbox: () => void;
  area: string;
}

const SHARED_KIND: Partial<Record<string, ActivityKind>> = { swing: 'swing', seesaw: 'seesaw', stargaze: 'stargaze', picnic: 'picnic', fishing: 'fishing', bench: 'bench' };

/** Helper: record a memory + optional achievement and tell the player. */
export function useMemoryRecorder(update: DockProps['update'], notify: DockProps['notify']) {
  return (m: Omit<MemoryEvent, 'id' | 'at'>, achievement?: AchievementId) => {
    let unlocked: string | null = null;
    update((s) => {
      let next = recordMemory(s, { ...m, at: Date.now() });
      if (achievement) {
        const u = unlock(next, achievement, Date.now());
        next = u.save;
        if (u.isNew) unlocked = ACHIEVEMENTS[achievement].name;
      }
      return next;
    });
    if (unlocked) notify(`Achievement: ${unlocked}`, 'success');
  };
}

export function ActivityDock(props: DockProps) {
  const { spot } = props;
  const hub = usePairHub();
  const kind = SHARED_KIND[spot.action];
  const s = hub.session;
  const sharedRunning = !!kind && s.kind === kind && (s.phase === 'running' || s.phase === 'starting') && s.startAt !== null;
  const canInvite = !!kind && !!hub.pair && hub.partnerOnline && s.phase === 'idle';
  const inviteBtn = kind && hub.pair && (
    <Button size="sm" variant="secondary" disabled={!canInvite} title={hub.partnerOnline ? undefined : 'Your partner is not connected right now'}
      onClick={() => dispatch({ type: 'invite', sid: newSid(), kind, params: { spot: spot.id } })}>
      {hub.partnerOnline ? `Ask to ${ACTIVITY_LABEL[kind]}` : 'Partner not connected'}
    </Button>
  );
  const common = { ...props, sharedStart: sharedRunning ? s.startAt : null, inviteBtn };
  switch (spot.action) {
    case 'swing': return <SwingDock {...common} />;
    case 'seesaw': return <SeesawDock {...common} />;
    case 'bench': return <SitDock {...common} title="A quiet bench" seatsFor="bench" />;
    case 'pond': return <SitDock {...common} title="By the lily pond" seatsFor="pond" />;
    case 'picnic': return <PicnicDock {...common} />;
    case 'stargaze': return <StargazeDock {...common} />;
    case 'fishing': return <FishingDock {...common} />;
    case 'garden': return <GardenDock {...common} />;
    default: return <ObjectDock {...common} />;
  }
}

type Inner = DockProps & { sharedStart: number | null; inviteBtn: ReactNode };

function Dock({ title, children, onClose, extra }: { title: string; children: ReactNode; onClose: () => void; extra?: ReactNode }) {
  return (
    <section className="pv-dock" aria-label={title}>
      <header className="pv-dock__head">
        <h2>{title}</h2>
        <div className="pv-dock__tools">{extra}<Button size="sm" variant="ghost" onClick={onClose}>Get up</Button></div>
      </header>
      <div className="pv-dock__body">{children}</div>
    </section>
  );
}

/** Seat the player for the lifetime of the dock; always restores on exit (cleanup). */
function useSeat(live: MutableRefObject<TownLive>, seat: TownLive['seat']) {
  useEffect(() => {
    live.current.seat = seat;
    return () => {
      live.current.seat = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** The side a cat PREFERS (a couple keeps its familiar sides: Tangerine left, Midnight right). It is only a preference now: the seat
 *  actually taken is the first FREE one (net/occupancy.ts), so two cats of the same role never sit on top of each other. */
function preferredSeat(identity: TownIdentity): 0 | 1 {
  return identity.cat === 'T' ? 0 : 1;
}
/** Which of the two seats of this activity is mine (free, and published to everyone else). If someone else outranks me for it, the dock closes politely. */
function useMySeat(p: DockProps): 0 | 1 {
  const idx = useSeatIndex(p.live, {
    id: `town:${p.spot.id}`, count: 2, prefer: preferredSeat(p.identity),
    onLost: () => { p.notify('Someone else got that seat first — try the other one.', 'info'); p.onClose(); },
  });
  return (idx === 1 ? 1 : 0);
}

function SwingDock(p: Inner) {
  const idx = useMySeat(p);
  const [solo, setSolo] = useState<SwingSolo>({ amp: 0, t0: performance.now() });
  const soloRef = useRef(solo);
  soloRef.current = solo;
  const [feedback, setFeedback] = useState('');
  const sharedRef = useRef(p.sharedStart);
  sharedRef.current = p.sharedStart;
  const record = useMemoryRecorder(p.update, p.notify);
  const seat = swingSeatPos(idx, 0);
  useSeat(p.live, { x: seat.x, y: seat.y + 10, pose: 'sit', facing: 'down', lift: 10 });
  useEffect(() => {
    if (!hasMemory(p.save, 'first-swing')) record({ kind: 'first-swing', title: 'First time on the swing', detail: 'The park swing creaked a little hello.', place: 'Paw Park', withPartner: false }, 'first-steps');
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const shared = sharedRef.current;
      let a: number;
      if (shared !== null) {
        a = swingAngleShared(shared, Date.now());
      } else {
        const next = decaySwing(soloRef.current, now, last);
        soloRef.current = next;
        a = swingAngleSolo(next, now);
      }
      last = now;
      const angles: [number, number] = [...p.live.current.dyn.swingAngles] as [number, number];
      angles[idx] = a;
      if (shared !== null) angles[1 - idx] = a; // both seats in step
      p.live.current.dyn = { ...p.live.current.dyn, swingAngles: angles };
      const pos = swingSeatPos(idx, a);
      p.live.current.seat = { x: pos.x, y: pos.y + 10, pose: 'sit', facing: 'down', lift: 10 };
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      p.live.current.dyn = { ...p.live.current.dyn, swingAngles: [0, 0] };
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (p.sharedStart !== null) record({ kind: 'swing-together', title: 'Swinging side by side', detail: 'Two cats, one rhythm.', place: 'Paw Park', withPartner: true }, 'together-swing');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.sharedStart]);
  const pump = () => {
    const r = pumpSwing(soloRef.current, performance.now());
    soloRef.current = r.swing;
    setSolo(r.swing);
    setFeedback(r.quality === 'great' ? 'Great pump!' : r.quality === 'ok' ? 'Nice' : 'Try pumping at the top of the swing');
    cue(r.quality === 'great' ? 'pop' : 'tap');
    if (r.swing.amp >= 0.74) {
      p.update((s) => unlock(s, 'swing-high', Date.now()).save);
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && p.sharedStart === null && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        pump();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  return (
    <Dock title="The park swing" onClose={p.onClose} extra={p.inviteBtn}>
      {p.sharedStart !== null ? (
        <p>Swinging together — you’re both in step.</p>
      ) : (
        <>
          <p>Press <kbd className="pv-key">Space</kbd> or Pump near the top of each swing to go higher.</p>
          <Button variant="primary" onClick={pump}>Pump</Button>
          <p className="pv-note" aria-live="polite">{feedback}</p>
        </>
      )}
    </Dock>
  );
}

function SeesawDock(p: Inner) {
  const idx = useMySeat(p);
  const side: -1 | 1 = idx === 0 ? -1 : 1;
  const hopRef = useRef<number | null>(null);
  const sharedRef = useRef(p.sharedStart);
  sharedRef.current = p.sharedStart;
  const record = useMemoryRecorder(p.update, p.notify);
  useSeat(p.live, { ...seesawSeatPos(idx, side), pose: 'sit', facing: idx === 0 ? 'right' : 'left', lift: 6 });
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const shared = sharedRef.current;
      const tilt = shared !== null ? seesawTiltShared(shared, Date.now()) : seesawTiltSolo(side, hopRef.current, performance.now());
      p.live.current.dyn = { ...p.live.current.dyn, seesawTilt: tilt };
      const pos = seesawSeatPos(idx, tilt);
      p.live.current.seat = { x: pos.x, y: pos.y + 6, pose: 'sit', facing: idx === 0 ? 'right' : 'left', lift: 6 };
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      p.live.current.dyn = { ...p.live.current.dyn, seesawTilt: 0 };
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (p.sharedStart !== null) record({ kind: 'seesaw-together', title: 'Up and down together', detail: 'Nobody won. Everybody giggled.', place: 'Paw Park', withPartner: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.sharedStart]);
  return (
    <Dock title="The seesaw" onClose={p.onClose} extra={p.inviteBtn}>
      {p.sharedStart !== null ? <p>Up… and down… together. No score, just bounces.</p> : (
        <>
          <p>It’s more fun with two — but you can still hop!</p>
          <Button variant="primary" onClick={() => { hopRef.current = performance.now(); cue('pop'); }}>Hop</Button>
        </>
      )}
    </Dock>
  );
}

function SitDock(p: Inner & { title: string; seatsFor: 'bench' | 'pond' }) {
  const bench = p.seatsFor === 'bench' ? benchById(p.spot.id) : undefined;
  const seats = bench ? benchSeats(bench) : p.seatsFor === 'bench' ? SEATS.bench[0] : [{ x: 192, y: 840 }, { x: 208, y: 840 }];
  // Every seat is its own slot with its own occupancy: a second cat takes the OTHER seat, and standing up frees only yours.
  const slots: Slot[] = seats.map((s, i) => ({ index: i, x: s.x, y: s.y, lift: bench ? benchSeatLift(bench) : p.seatsFor === 'bench' ? 4 : 0, facing: bench ? benchFacing(bench, i === 0 ? 0 : 1) : i === 0 ? 'right' : 'left' }));
  const idx = useSeatClaim(p.live, {
    id: `town:${p.spot.id}`, slots, prefer: preferredSeat(p.identity),
    onFull: () => { p.notify('Both seats are taken right now.', 'info'); p.onClose(); },
  });
  const [loaf, setLoaf] = useState(false);
  useEffect(() => {
    if (p.live.current.seat) p.live.current.seat = { ...p.live.current.seat, pose: loaf ? 'loaf' : 'sit' };
  }, [loaf, idx, p.live]);
  const night = p.env.darkness > 0.5;
  return (
    <Dock title={p.title} onClose={p.onClose} extra={p.inviteBtn}>
      <p>{p.seatsFor === 'pond'
        ? night ? 'Fireflies drift over the water. A frog says something important.' : 'Lily pads bob gently. The reeds whisper.'
        : 'You settle in. Your tail swishes lazily.'}{p.sharedStart !== null ? ' Your partner is right beside you.' : ''}</p>
      <Button variant="ghost" onClick={() => setLoaf((v) => !v)}>{loaf ? 'Sit up' : 'Curl up for a nap'}</Button>
    </Dock>
  );
}

function PicnicDock(p: Inner) {
  const idx = useMySeat(p);
  const [blanket, setBlanket] = useState<Blanket>('gingham');
  const [set, setSet] = useState(false);
  const [eaten, setEaten] = useState<string | null>(null);
  const wet = p.env.wetness > 0.25;
  const record = useMemoryRecorder(p.update, p.notify);
  const seat = SEATS.picnic[idx];
  useSeat(p.live, { x: seat.x, y: seat.y, pose: 'sit', facing: idx === 0 ? 'right' : 'left', lift: 0 });
  useEffect(() => {
    if (!set) return;
    p.live.current.dyn = { ...p.live.current.dyn, picnic: { x: 441, y: 640, blanket } };
    return () => {
      p.live.current.dyn = { ...p.live.current.dyn, picnic: null };
    };
  }, [set, blanket, p.live]);
  useEffect(() => onPairMessage((m) => {
    if (m.t === 'picnic:snack' && typeof m.snack === 'string') {
      const snack = SNACKS.find((x) => x.id === m.snack);
      if (snack) {
        p.notify(`Your partner offers you some ${snack.name.toLowerCase()} ♥`, 'success');
        record({ kind: 'picnic', title: 'A picnic snack from your partner', detail: `${snack.name}, shared on the meadow.`, place: 'Picnic Meadow', withPartner: true }, 'picnic-pals');
      }
    }
  }), [p, record]);
  if (!set) {
    return (
      <Dock title="Picnic meadow" onClose={p.onClose} extra={p.inviteBtn}>
        {wet && <p className="pv-note">It’s wet out — we’ll put up the big umbrella so the blanket stays dry.</p>}
        <div className="pv-swatches" role="radiogroup" aria-label="Blanket">
          {BLANKETS.map((b) => (
            <button key={b} type="button" role="radio" aria-checked={blanket === b} className={`pv-swatch pv-blanket--${b} ${blanket === b ? 'is-selected' : ''}`} onClick={() => setBlanket(b)}>
              <span className="pv-swatch__chip" /><span>{b}</span>
            </button>
          ))}
        </div>
        <Button variant="primary" onClick={() => { setSet(true); cue('pop'); p.update((s) => ({ ...s, stats: { ...s.stats, picnics: s.stats.picnics + 1 } })); }}>Spread the blanket</Button>
      </Dock>
    );
  }
  return (
    <Dock title="Picnic time" onClose={p.onClose} extra={p.inviteBtn}>
      {wet && <p className="pv-note">Pitter-patter on the umbrella. Cozy.</p>}
      <div className="pv-snacks">
        {SNACKS.map((s) => (
          <div key={s.id} className="pv-snack">
            <span>{s.name}</span>
            <Button size="sm" variant="ghost" onClick={() => { setEaten(s.name); cue('tap'); }}>Eat</Button>
            {p.sharedStart !== null && <Button size="sm" variant="secondary" onClick={() => {
              if (sendPair({ t: 'picnic:snack', snack: s.id })) {
                p.notify(`You offered ${s.name.toLowerCase()} to your partner.`, 'success');
                record({ kind: 'picnic', title: 'Shared a picnic', detail: `You offered ${s.name.toLowerCase()}.`, place: 'Picnic Meadow', withPartner: true }, 'picnic-pals');
              }
            }}>Offer</Button>}
          </div>
        ))}
      </div>
      <p className="pv-note" aria-live="polite">{eaten ? `Nom. The ${eaten.toLowerCase()} was perfect.` : 'Pick a snack.'}</p>
      {p.sharedStart === null && !hasMemory(p.save, 'picnic') && (
        <Button size="sm" variant="ghost" onClick={() => record({ kind: 'picnic', title: 'A quiet picnic', detail: 'Blanket, snacks and sunshine.', place: 'Picnic Meadow', withPartner: false })}>Remember this picnic</Button>
      )}
    </Dock>
  );
}

function StargazeDock(p: Inner) {
  const idx = useMySeat(p);
  const seat = SEATS.stargaze[idx];
  const [now, setNow] = useState(Date.now());
  const [wished, setWished] = useState(false);
  const record = useMemoryRecorder(p.update, p.notify);
  useSeat(p.live, { x: seat.x, y: seat.y, pose: 'loaf', facing: 'down', lift: 0 });
  useEffect(() => {
    const id = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      p.live.current.dyn = { ...p.live.current.dyn, shootingStar: shootingStarAt(t) };
    }, 100);
    return () => {
      window.clearInterval(id);
      p.live.current.dyn = { ...p.live.current.dyn, shootingStar: null };
    };
  }, [p.live]);
  const star = shootingStarAt(now);
  const night = p.env.darkness > 0.5;
  const clear = p.env.weather === 'sunny' || p.env.weather === 'windy';
  return (
    <Dock title="Stargazing hill" onClose={p.onClose} extra={p.inviteBtn}>
      {!night ? <p>The sky is still bright. Stars come out after sunset — the hill is cozy in the meantime.</p>
        : !clear ? <p>Clouds tonight. You can still listen to the crickets.</p> : (
          <>
            <svg className="pv-sky" viewBox="0 0 260 130" role="img" aria-label="Constellations: The Big Paw, The Yarn Ball, Twin Tails, The Leaping Fish">
              {CONSTELLATIONS.map((c) => (
                <g key={c.id}>
                  {c.lines.map(([a, b], i) => <line key={i} x1={c.stars[a][0]} y1={c.stars[a][1]} x2={c.stars[b][0]} y2={c.stars[b][1]} />)}
                  {c.stars.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={1.8} />)}
                  <text x={c.stars[0][0]} y={c.stars[0][1] + 12}>{c.name}</text>
                </g>
              ))}
              {star !== null && <line className="pv-sky__shoot" x1={60 + star * 140} y1={10 + star * 30} x2={40 + star * 140} y2={4 + star * 30} />}
            </svg>
            <Button variant="primary" disabled={star === null || wished} onClick={() => {
              setWished(true);
              cue('join');
              record({ kind: 'wish', title: 'A wish on a shooting star', detail: p.sharedStart !== null ? 'Made together on Stargazing Hill.' : 'Made on Stargazing Hill.', place: 'Stargazing Hill', withPartner: p.sharedStart !== null }, 'star-wisher');
              if (p.sharedStart !== null) sendPair({ t: 'emote', id: 'heart' });
            }}>{wished ? 'Wish made ✦' : star !== null ? 'Make a wish!' : 'Watch for a shooting star…'}</Button>
          </>
        )}
    </Dock>
  );
}

function FishingDock(p: Inner) {
  const idx = useMySeat(p);
  const seat = SEATS.fishing[idx];
  const [state, setState] = useState<FishingState>({ phase: 'idle' });
  const stateRef = useRef(state);
  stateRef.current = state;
  const record = useMemoryRecorder(p.update, p.notify);
  useSeat(p.live, { x: seat.x, y: seat.y, pose: 'sit', facing: 'right', lift: 0 });
  useEffect(() => {
    const id = window.setInterval(() => {
      const next = tickFishing(stateRef.current, performance.now());
      if (next !== stateRef.current) {
        setState(next);
        if (next.phase === 'bite') cue('pop');
      }
      const s = stateRef.current;
      p.live.current.dyn = { ...p.live.current.dyn, bobber: s.phase === 'waiting' || s.phase === 'bite' ? { x: seat.x + 34, y: seat.y + 4, bite: s.phase === 'bite' } : null };
    }, 60);
    return () => {
      window.clearInterval(id);
      p.live.current.dyn = { ...p.live.current.dyn, bobber: null };
    };
  }, [p.live, seat.x, seat.y]);
  const doCast = () => {
    setState(cast(performance.now(), Math.floor(Math.random() * 1e9)));
    cue('tap');
  };
  const doReel = () => {
    const r = reel(stateRef.current, performance.now(), p.env);
    setState(r);
    if (r.phase === 'caught') {
      const f = FISH.find((x) => x.id === r.fish)!;
      const item = (f.id === 'old-boot' ? 'old-boot' : `fish-${f.id}`) as ItemId;
      let first = false;
      p.update((s) => {
        first = !s.fishSeen.includes(f.id);
        let next = addItem({ ...s, fishSeen: first ? [...s.fishSeen, f.id] : s.fishSeen, stats: { ...s.stats, fishCaught: s.stats.fishCaught + 1 } }, item);
        if (next.fishSeen.filter((x) => x !== 'old-boot').length >= 5) next = unlock(next, 'angler', Date.now()).save;
        return next;
      });
      cue('join');
      if (first && f.id !== 'old-boot' && f.id !== 'sardine' && f.id !== 'minnow') {
        record({ kind: 'fish', title: `Caught a ${f.name.toLowerCase()}`, detail: p.sharedStart !== null ? 'Fishing side by side on the pier.' : 'A new catch for the collection.', place: 'Harbor Pier', withPartner: p.sharedStart !== null });
      }
    } else cue('nope');
  };
  return (
    <Dock title="Fishing pier" onClose={p.onClose} extra={p.inviteBtn}>
      {state.phase === 'idle' && <><p>Cast your line, wait for the bobber to dip, then reel in quickly.</p><Button variant="primary" onClick={doCast}>Cast</Button></>}
      {state.phase === 'waiting' && <><p>Waiting… the water is calm.</p><Button variant="secondary" onClick={doReel}>Reel in</Button></>}
      {state.phase === 'bite' && <><p className="pv-bite" role="alert">Something’s biting! Reel in!</p><Button variant="primary" onClick={doReel}>Reel in!</Button></>}
      {state.phase === 'caught' && (() => {
        const f = FISH.find((x) => x.id === state.fish)!;
        return <><p>You caught: <strong style={{ color: f.color }}>{f.name}</strong>!</p><Button variant="primary" onClick={doCast}>Cast again</Button></>;
      })()}
      {state.phase === 'missed' && <><p>{state.reason === 'too-soon' ? 'Too soon — the fish swam off.' : 'Too slow — it got away.'}</p><Button variant="primary" onClick={doCast}>Cast again</Button></>}
      <p className="pv-note">Collection: {p.save.fishSeen.length}/{FISH.length}. Some fish only appear at night, in rain or in snow.</p>
    </Dock>
  );
}

function GardenDock(p: Inner) {
  const hub = usePairHub();
  const role = p.identity.cat;
  const [seed, setSeed] = useState<SeedId>('tulip');
  const [now, setNow] = useState(Date.now());
  const record = useMemoryRecorder(p.update, p.notify);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const apply = (op: GardenOp, fromPartner = false) => {
    let res: ReturnType<typeof applyGardenOp> | null = null;
    p.update((s) => {
      res = applyGardenOp(s.garden, op);
      if (!res.ok) return s;
      let next = { ...s, garden: res.garden };
      if (res.garden.bloomed > s.garden.bloomed) next = unlock(next, 'green-paws', Date.now()).save;
      return next;
    });
    const r = res as ReturnType<typeof applyGardenOp> | null;
    if (r && !r.ok && !fromPartner) {
      p.notify(r.reason === 'not-yours' ? "That sprout belongs to your partner — let it grow." : r.reason === 'already-bloomed' ? 'Already in full bloom!' : 'That plot is busy.', 'warn');
      return;
    }
    if (r?.ok && r.reason !== 'duplicate') {
      cue('tap');
      if (!fromPartner) sendPair({ t: 'garden:op', op });
      const plot = r.garden.plots[op.plot];
      if (op.kind === 'water' && plot && plot.growth >= 3) {
        const name = SEEDS.find((x) => x.id === plot.seed)!.name;
        record({ kind: 'garden-bloom', title: `A ${name.toLowerCase()} bloomed`, detail: plot.wateredBy.length > 1 ? 'Watered by both of you.' : 'Grown with care.', place: 'Shared Garden', withPartner: plot.wateredBy.length > 1 }, 'green-paws');
      }
    }
  };
  useEffect(() => onPairMessage((m) => {
    if (m.t !== 'garden:op' || !m.op || typeof m.op !== 'object') return;
    const op = m.op as GardenOp;
    if (op.by !== m.from) return; // partner can only act as themselves
    apply(op, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);
  const plots = p.save.garden.plots;
  useEffect(() => {
    p.live.current.dyn = {
      ...p.live.current.dyn,
      garden: plots.flatMap((pl, i) => (pl ? [{ plot: i, stage: pl.growth, color: SEEDS.find((x) => x.id === pl.seed)!.color }] : [])),
    };
  }, [plots, p.live]);
  const mk = (kind: GardenOp['kind'], plot: number, extra: Partial<GardenOp> = {}): GardenOp => ({ id: `${role}-${Date.now().toString(36)}-${plot}-${kind}`, kind, plot, by: role, at: Date.now(), ...extra });
  return (
    <Dock title="Shared garden" onClose={p.onClose}>
      <div className="pv-swatches" role="radiogroup" aria-label="Seed to plant">
        {SEEDS.map((s) => (
          <button key={s.id} type="button" role="radio" aria-checked={seed === s.id} className={`pv-swatch ${seed === s.id ? 'is-selected' : ''}`} onClick={() => setSeed(s.id)}>
            <span className="pv-swatch__chip" style={{ background: s.color }} /><span>{s.name}</span>
          </button>
        ))}
      </div>
      <ol className="pv-plots">
        {plots.map((pl, i) => (
          <li key={i} className="pv-plot">
            <span className="pv-plot__label">Plot {i + 1}</span>
            {pl ? (
              <>
                <span>{SEEDS.find((x) => x.id === pl.seed)!.name} · {['seed', 'sprout', 'bud', 'bloom'][pl.growth]}{pl.plantedBy !== role ? ' (partner’s)' : ''}</span>
                {pl.growth < 3 && <Button size="sm" variant="secondary" onClick={() => apply(mk('water', i))}>{nextGrowIn(pl, now) > 0 ? `Water (grows in ${Math.ceil(nextGrowIn(pl, now) / 60000)} min)` : 'Water'}</Button>}
                {(pl.growth >= 3 || pl.plantedBy === role) && <Button size="sm" variant="ghost" onClick={() => {
                  if (pl.growth >= 3) p.update((s) => addItem(s, 'bouquet'));
                  apply(mk('pick', i));
                }}>{pl.growth >= 3 ? 'Pick' : 'Dig up'}</Button>}
              </>
            ) : <Button size="sm" variant="primary" onClick={() => apply(mk('plant', i, { seed }))}>Plant {SEEDS.find((x) => x.id === seed)!.name.toLowerCase()}</Button>}
          </li>
        ))}
      </ol>
      <p className="pv-note">
        Plants grow one stage per watering, at most every 10 minutes — no need to grind. Either of you can water; only the planter can dig up a sprout.
        {hub.pair ? hub.partnerOnline ? ' Changes are shared live with your partner.' : ' Your partner sees changes made while you’re both online; this garden is saved on this device.' : ' Saved on this device.'}
      </p>
    </Dock>
  );
}

function ObjectDock(p: Inner) {
  const day = dayKey(new Date());
  const record = useMemoryRecorder(p.update, p.notify);
  const [msg, setMsg] = useState<string>('');
  const [claw, setClaw] = useState<{ x: number; dir: 1 | -1 } | null>(null);
  const clawRef = useRef(claw);
  clawRef.current = claw;
  const rand = useMemo(() => seededRandom(hashString(`${day}:${p.spot.id}`)), [day, p.spot.id]);
  useEffect(() => {
    if (!claw) return;
    const id = window.setInterval(() => {
      const c = clawRef.current;
      if (!c) return;
      let x = c.x + c.dir * 3;
      let dir = c.dir;
      if (x > 100) { x = 100; dir = -1; }
      if (x < 0) { x = 0; dir = 1; }
      setClaw({ x, dir });
    }, 30);
    return () => window.clearInterval(id);
  }, [claw !== null]); // eslint-disable-line react-hooks/exhaustive-deps
  const act = () => {
    switch (p.spot.action) {
      case 'fountain-coin': {
        const first = dailyAvailable(p.save, 'coin', day);
        p.update((s) => claimDaily({ ...s, stats: { ...s.stats, coins: s.stats.coins + 1 } }, 'coin', day));
        cue('pop');
        if (first) record({ kind: 'coin-wish', title: 'A coin in the fountain', detail: 'Plink! A little wish for today.', place: 'Fountain Plaza', withPartner: false });
        setMsg(first ? 'Plink! You made a wish. (The fountain cat looks pleased.)' : 'Plink! Another coin for the fountain cat.');
        return;
      }
      case 'apple-tree': {
        if (!dailyAvailable(p.save, 'apple', day)) return setMsg('The tree has given all its apples for today. Come back tomorrow!');
        const n = 1 + Math.floor(rand() * 3);
        p.update((s) => claimDaily(addItem(s, 'apple', n), 'apple', day));
        cue('pop');
        return setMsg(`Thump! ${n} apple${n > 1 ? 's' : ''} fell into your basket.`);
      }
      case 'flowers': {
        if (!dailyAvailable(p.save, 'flowers', day)) return setMsg('You already picked a bouquet today. Let the flowers rest.');
        p.update((s) => claimDaily(addItem(s, 'bouquet'), 'flowers', day));
        cue('tap');
        return setMsg('You picked a small bouquet. It would make a lovely gift.');
      }
      case 'vending': {
        if (dailyCount(p.save, 'vending', day) >= 3) return setMsg('The machine blinks: “Sold out until tomorrow.”');
        const snacks: ItemId[] = ['snack-milk', 'snack-cookies', 'snack-onigiri'];
        const got = snacks[Math.floor(rand() * snacks.length)];
        p.update((s) => bumpDailyCount(addItem(s, got), 'vending', day));
        cue('pop');
        return setMsg(`Clunk! A ${ITEM_NAMES[got].toLowerCase()} drops out.`);
      }
      case 'claw':
        if (dailyCount(p.save, 'claw', day) >= 3) return setMsg('Out of tries for today.');
        setClaw({ x: 0, dir: 1 });
        return setMsg('Press Drop when the claw is over a plush!');
      case 'puddle':
        p.update((s) => ({ ...s, stats: { ...s.stats, splashes: s.stats.splashes + 1 } }));
        p.live.current.emote = { id: 'celebrate', at: performance.now() };
        cue('pop');
        return setMsg(`Splash! (${p.save.stats.splashes + 1} splashes so far.)`);
      case 'shell':
      case 'toy': {
        if (p.save.collected.includes(p.spot.id)) return setMsg('Nothing else here.');
        const item: ItemId = p.spot.action === 'shell' ? 'shell' : (['toy-mouse', 'plush-fish', 'toy-mouse'][Number(p.spot.id.split('-')[1]) || 0] as ItemId);
        let all = false;
        p.update((s) => {
          let next = addItem({ ...s, collected: [...s.collected, p.spot.id] }, item);
          all = ['shell-0', 'shell-1', 'shell-2', 'toy-0', 'toy-1', 'toy-2'].every((id) => next.collected.includes(id));
          if (all) next = unlock(next, 'collector', Date.now()).save;
          return next;
        });
        p.live.current.dyn = { ...p.live.current.dyn, collected: new Set([...p.live.current.dyn.collected, p.spot.id]) };
        cue('join');
        if (p.spot.action === 'toy') record({ kind: 'secret-found', title: `Found a hidden ${ITEM_NAMES[item].toLowerCase()}`, detail: 'Squeak!', place: p.area, withPartner: false });
        return setMsg(p.spot.action === 'shell' ? 'A pretty seashell! Added to your collection.' : `You found a ${ITEM_NAMES[item].toLowerCase()}!${all ? ' That’s every secret!' : ''}`);
      }
      case 'mailbox':
        return p.onMailbox();
      case 'photo-arch':
        return p.onPhoto();
    }
    return undefined;
  };
  useEffect(() => {
    act();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const drop = () => {
    const c = clawRef.current;
    if (!c) return;
    setClaw(null);
    const prizes: [number, number, ItemId][] = [[12, 26, 'plush-tangerine'], [44, 58, 'plush-fish'], [76, 90, 'plush-midnight']];
    const won = prizes.find(([a, b]) => c.x >= a && c.x <= b);
    p.update((s) => {
      const next = bumpDailyCount(s, 'claw', day);
      return won ? addItem(next, won[2]) : next;
    });
    cue(won ? 'join' : 'nope');
    setMsg(won ? `You won a ${ITEM_NAMES[won[2]].toLowerCase()}!` : 'The claw slips… so close!');
  };
  const titles: Record<string, string> = {
    'fountain-coin': 'Fountain', 'apple-tree': 'Apple tree', flowers: 'Flowerbed', vending: 'Snack machine', claw: 'Claw machine', puddle: 'Puddle', shell: 'Beach', toy: 'A hidden corner', mailbox: 'Mailbox', 'photo-arch': 'Flower arch',
  };
  return (
    <Dock title={titles[p.spot.action] ?? 'Pawville'} onClose={p.onClose}>
      <p aria-live="polite">{msg}</p>
      {claw && (
        <div className="pv-claw" aria-label="Claw machine">
          <div className="pv-claw__rail"><span className="pv-claw__hook" style={{ left: `${claw.x}%` }} /></div>
          <div className="pv-claw__prizes"><span>Tangerine plush</span><span>Fish plush</span><span>Midnight plush</span></div>
          <Button variant="primary" onClick={drop}>Drop</Button>
        </div>
      )}
      {!claw && p.spot.action === 'claw' && dailyCount(p.save, 'claw', day) < 3 && <Button variant="secondary" onClick={act}>Try again ({3 - dailyCount(p.save, 'claw', day)} left today)</Button>}
      {(p.spot.action === 'fountain-coin' || p.spot.action === 'puddle') && <Button variant="secondary" onClick={act}>Again</Button>}
    </Dock>
  );
}
