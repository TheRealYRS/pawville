/**
 * Funfair games: Bumper Paws (drive a bumper car — real steering, real collisions, three bots) and Ring Toss
 * (aim, charge, throw — a visible arc, pegs that go inactive once they wear a ring). Both are full-screen
 * canvas panels on top of the park, driven by the pure models in city/bumperPaws.ts and city/ringToss.ts, with
 * clear controls, touch buttons, sound on the shared audio context and small capped token rewards through the
 * existing economy (never twice for the same round).
 */
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { COAT_INFO, type CoatId } from '../appearance.ts';
import { canStart, newSid } from '../couple/activitySession.ts';
import { dispatch, onPairMessage, sendPair, usePairHub } from '../couple/pairHub.ts';
import type { Role } from '../couple/pairModel.ts';
import { catName } from '../identity';
import {
  SNAP_MS, blendCars, extrapolate, freshControls, inputMsg, parseBumpInput, parseSnapshot, seedFor, shouldSendInput, snapshotBumper, stateFromSnapshot, stateMsg, verdict,
  type BumperSnap, type Verdict,
} from '../city/bumperNet.ts';
import {
  ARENA, BUMP_SPEED, CAR_R, NO_CONTROLS, ROUND_MS, bumperTokens, newBumper, stepBumper, type BumperEvent, type BumperState, type Controls,
} from '../city/bumperPaws.ts';
import { ARCADE_DAILY_CAP, earnArcade, setRecord } from '../city/economy.ts';
import { fairSfx } from '../city/funfairSound.ts';
import {
  BOARD_W, FLIGHT_MS, PEGS, RINGS_PER_ROUND, RING_R, applyThrow, landing, newToss, pegX, resolveThrow, tossTokens, type ThrowResult, type TossState,
} from '../city/ringToss.ts';
import { pixelEllipse, rect } from '../render/canvasTypes.ts';
import { drawSignText, pixelTextWidth } from '../render/pixelFont.ts';
import { recordMemory, type WorldSave } from '../worldSave.ts';
import '../styles/funfair.css';

type Update = (fn: (s: WorldSave) => WorldSave) => void;
type Notify = (msg: string, tone?: 'info' | 'success' | 'warn') => void;
const today = () => new Date().toISOString().slice(0, 10);

function Shell({ title, hint, onClose, children, label }: { title: string; hint: string; onClose: () => void; children: ReactNode; label: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div className="pv-fair" role="dialog" aria-modal="true" aria-label={label}>
      <div className="pv-fair__card">
        <header className="pv-fair__head">
          <h2>{title}</h2>
          <button type="button" className="pill-btn" onClick={onClose}>Leave (Esc)</button>
        </header>
        <p className="pv-fair__hint">{hint}</p>
        {children}
      </div>
    </div>
  );
}

// =============================================================================================
// Bumper Paws
// =============================================================================================
const CAR_COLORS = ['#ff8a35', '#ff8fb1', '#7ee0d2', '#9cc3ff'];
/** With a partner: car 0 is Tangerine's (orange), car 1 Midnight's (blue); the bots keep pink and teal. */
const CAR_COLORS_COUPLE = ['#ff8a35', '#9cc3ff', '#ff8fb1', '#7ee0d2'];
const BOT_COATS: CoatId[] = ['tangerine', 'midnight', 'cloud', 'mochi'];

/** How to dress the arena: which car is "you", each car's coat (null = a default), a name tag for a partner's car, and the car colours. */
interface ArenaView { me: number; coats: readonly (CoatId | null)[]; tags: readonly (string | null)[]; palette: readonly string[] }

function drawArena(ctx: CanvasRenderingContext2D, st: BumperState, v: ArenaView, now: number, shake: number) {
  const W = ARENA.w, H = ARENA.h, B = ARENA.wall;
  ctx.save();
  if (shake > 0) ctx.translate(Math.round((Math.random() - 0.5) * shake * 4), Math.round((Math.random() - 0.5) * shake * 4));
  rect(ctx, 0, 0, W, H, '#1b1530');
  // floor: checker
  for (let r = 0; r < 25; r++) for (let c = 0; c < 40; c++) rect(ctx, c * 8, r * 8, 8, 8, (r + c) % 2 ? '#6fd1c4' : '#a9efe3');
  // lane marks
  for (let x = 24; x < W - 24; x += 24) rect(ctx, x, H / 2 - 1, 10, 2, 'rgba(255,255,255,0.35)');
  // cushioned wall: red/cream bumper pads, gold corner lights
  const pad = (x: number, y: number, w: number, h: number, i: number) => { rect(ctx, x, y, w, h, '#2a1d2f'); rect(ctx, x + 1, y + 1, w - 2, h - 2, i % 2 ? '#fff3e6' : '#e0475c'); rect(ctx, x + 1, y + 1, w - 2, 1, 'rgba(255,255,255,0.6)'); };
  for (let x = 0; x < W; x += 16) { pad(x, 0, 16, B, x / 16); pad(x, H - B, 16, B, x / 16 + 1); }
  for (let y = B; y < H - B; y += 16) { pad(0, y, B, 16, y / 16); pad(W - B, y, B, 16, y / 16 + 1); }
  for (const [x, y] of [[B, B], [W - B, B], [B, H - B], [W - B, H - B]] as const) { const on = Math.floor(now / 250) % 2 === 0; pixelEllipse(ctx, x, y, 3, 3, '#2a1d2f'); pixelEllipse(ctx, x, y, 2, 2, on ? '#fff3c4' : '#ffd36b'); }
  // sign: the arena's title lights
  drawSignText(ctx, 'BUMPER PAWS', W / 2, 1, '#ffd36b', '#2a1d2f', 1);
  // cars (bottom-most last so overlaps read correctly)
  const order = [...st.cars].sort((a, b) => a.y - b.y);
  for (const c of order) {
    const wob = c.hitAge < 260 ? Math.sin(c.hitAge / 22) * (1 - c.hitAge / 260) * 2 : 0;
    const cx = Math.round(c.x + wob), cy = Math.round(c.y);
    pixelEllipse(ctx, cx, cy + 5, CAR_R, 4, 'rgba(0,0,0,0.28)');
    pixelEllipse(ctx, cx, cy, CAR_R, CAR_R - 1, '#2a1d2f'); // the rubber bumper ring
    pixelEllipse(ctx, cx, cy, CAR_R - 1, CAR_R - 2, '#fff3e6');
    pixelEllipse(ctx, cx, cy, CAR_R - 3, CAR_R - 4, v.palette[c.id % 4]);
    pixelEllipse(ctx, cx - 2, cy - 3, 4, 2, 'rgba(255,255,255,0.45)');
    // headlights at the front
    const fx = Math.cos(c.a), fy = Math.sin(c.a);
    for (const s of [-1, 1]) rect(ctx, Math.round(cx + fx * (CAR_R - 3) - fy * s * 4) - 1, Math.round(cy + fy * (CAR_R - 3) + fx * s * 4) - 1, 2, 2, '#fff3c4');
    // the driver: a cat's head with ears, looking where the car points
    const hx = Math.round(cx - fx * 1), hy = Math.round(cy - fy * 1 - 2);
    const fur = COAT_INFO[v.coats[c.id] ?? BOT_COATS[c.id % 4]]?.pixel.f ?? '#ff8a35';
    rect(ctx, hx - 3, hy - 6, 3, 3, '#2a1d2f'); rect(ctx, hx + 1, hy - 6, 3, 3, '#2a1d2f'); rect(ctx, hx - 2, hy - 5, 1, 2, fur); rect(ctx, hx + 2, hy - 5, 1, 2, fur);
    rect(ctx, hx - 4, hy - 3, 8, 7, '#2a1d2f'); rect(ctx, hx - 3, hy - 2, 6, 5, fur);
    rect(ctx, hx - 2 + Math.round(fx), hy + Math.round(fy * 0.5), 1, 1, '#2a1d2f'); rect(ctx, hx + 1 + Math.round(fx), hy + Math.round(fy * 0.5), 1, 1, '#2a1d2f');
    // pole + spark
    rect(ctx, cx - 1, cy - 12, 1, 6, '#8a7da0');
    if (Math.floor(now / 90 + c.id) % 5 === 0) { rect(ctx, cx - 2, cy - 14, 3, 1, '#fff3c4'); rect(ctx, cx - 1, cy - 15, 1, 3, '#ffd36b'); }
    if (c.id === v.me || v.tags[c.id]) {
      const b = Math.round(Math.sin(now / 160) * 1.5);
      const label = c.id === v.me ? 'YOU' : (v.tags[c.id] as string);
      const ink = c.id === v.me ? '#ffd36b' : '#9cc3ff';
      const w = Math.max(9, pixelTextWidth(label, 1) + 4), x0 = cx - Math.floor(w / 2);
      rect(ctx, x0, cy - 26 + b, w, 7, '#2a1d2f'); rect(ctx, x0 + 1, cy - 25 + b, w - 2, 5, ink);
      drawSignText(ctx, label, cx, cy - 25 + b, '#2a1d2f', ink, 1); rect(ctx, cx - 1, cy - 19 + b, 3, 2, ink);
    }
  }
  // impact flashes
  for (const e of st.events) if (e.kind === 'bump') {
    const r = 6 + e.power * 8;
    ctx.globalAlpha = 0.85; pixelEllipse(ctx, Math.round(e.x), Math.round(e.y), r, Math.round(r * 0.7), '#fff3c4'); ctx.globalAlpha = 1;
    for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4; rect(ctx, Math.round(e.x + Math.cos(a) * (r + 3)), Math.round(e.y + Math.sin(a) * (r + 3)), 2, 2, k % 2 ? '#ffd36b' : '#ff8fb1'); }
  }
  ctx.restore();
}

export function BumperPawsPanel({ open, save, update, notify, coat, onClose }: { open: boolean; save: WorldSave; update: Update; notify: Notify; coat: CoatId; onClose: () => void }) {
  const hub = usePairHub();
  const s = hub.session;
  const myRole: Role = hub.pair?.myRole ?? 'T';
  const meCar: 0 | 1 = myRole === 'T' ? 0 : 1;
  const partnerName = hub.pair ? hub.pair.partnerName || catName(myRole === 'T' ? 'M' : 'T') : 'your partner';
  const tagName = partnerName.split(/[\s·]/)[0].slice(0, 6).toUpperCase() || 'PAL';
  const mine = s.kind === 'bumper';
  const couple = open && mine && (s.phase === 'inviting' || s.phase === 'lobby' || s.phase === 'starting' || s.phase === 'running' || s.phase === 'ended');
  const cancelled = open && mine && s.phase === 'cancelled';
  const iAmHost = couple && s.host === myRole;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<BumperState>(newBumper(1));
  const keys = useRef<Controls>({ ...NO_CONTROLS });
  const held = useRef(new Set<string>());
  const touch = useRef({ steer: 0, throttle: 0 });
  const [phase, setPhase] = useState<'ready' | 'playing' | 'over'>('ready');
  const [hud, setHud] = useState({ t: ROUND_MS, mine: 0, theirs: 0, bumps: 0 });
  const [result, setResult] = useState<{ mine: number; theirs: number | null; earned: number; best: boolean; verdict: Verdict | null } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [clock, setClock] = useState(Date.now());
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const rewarded = useRef(new Set<string>());
  const round = useRef(0);
  const shake = useRef(0);
  // couple-match plumbing (see city/bumperNet.ts)
  const carRef = useRef<0 | 1>(0);
  const hostRef = useRef(false);
  const startedKey = useRef('');
  const remoteIn = useRef<{ c: Controls; at: number } | null>(null);
  const partnerCoat = useRef<CoatId | null>(null);
  const pending = useRef<BumperEvent[]>([]);
  const target = useRef<{ snap: BumperSnap; at: number } | null>(null);
  const visual = useRef<BumperState | null>(null);
  const guestSent = useRef<{ prev: Controls | null; at: number }>({ prev: null, at: -1e9 });
  const autoReadied = useRef('');
  if (couple) { carRef.current = meCar; hostRef.current = iAmHost; }
  else if (phase !== 'playing') carRef.current = 0;
  const latest = useRef({ save, update, notify, coat, s, couple, iAmHost, myRole, tagName, partnerName });
  latest.current = { save, update, notify, coat, s, couple, iAmHost, myRole, tagName, partnerName };

  const begin = useCallback((humans: 1 | 2, seed: number) => {
    stateRef.current = newBumper(seed, humans);
    remoteIn.current = null; pending.current = []; target.current = null; visual.current = null;
    setResult(null); setNote(null); setPhase('playing');
    fairSfx('start');
  }, []);
  const startSolo = useCallback(() => {
    round.current += 1;
    begin(1, round.current * 7 + 1);
  }, [begin]);

  /** The round is over (for this device): reward once, remember it, show the result. */
  const finish = useCallback((st: BumperState) => {
    const L = latest.current;
    const car = carRef.current;
    const cp = L.couple;
    setPhase('over');
    const mineScore = st.cars[car]?.score ?? 0;
    const theirs = cp ? st.cars[1 - car]?.score ?? 0 : null;
    setHud({ t: 0, mine: mineScore, theirs: theirs ?? 0, bumps: st.cars[car]?.dealt ?? 0 });
    const key = cp ? `${L.s.sid}:${L.s.round}` : `solo:${round.current}`;
    if (rewarded.current.has(key)) return; // one reward per round, ever
    rewarded.current.add(key);
    const tokens = bumperTokens(mineScore);
    const v = cp ? verdict(st, car) : null;
    let earned = 0, best = false;
    L.update((sv) => {
      const r = setRecord(sv, 'bumper-paws', mineScore);
      best = r.isNew;
      const e = tokens > 0 ? earnArcade(r.save, tokens, today()) : { save: r.save, earned: 0 };
      earned = e.earned;
      if (!cp) return e.save;
      return recordMemory(e.save, {
        id: `bumper-${L.s.sid}-${L.s.round}`, kind: 'city', title: v === 'win' ? 'Won a Bumper Paws round' : v === 'tie' ? 'Tied at Bumper Paws' : 'Bumper Paws together',
        detail: `${mineScore}–${theirs} against ${L.partnerName}. Bump, giggle, repeat.`, at: Date.now(), place: 'Whiskerwick Funfair', withPartner: true,
      });
    });
    setResult({ mine: mineScore, theirs, earned, best, verdict: v });
    fairSfx('done');
    if (earned) L.notify(`+${earned} paw token${earned === 1 ? '' : 's'} from Bumper Paws!`, 'success');
    else if (tokens && L.save.dailyCounts[`arcade-tokens:${today()}`] >= ARCADE_DAILY_CAP) L.notify('Today’s arcade token limit is reached — the fun is still free!', 'info');
  }, []);

  const close = useCallback(() => {
    const L = latest.current;
    if (L.s.kind === 'bumper' && L.s.phase !== 'idle') {
      if (L.s.phase === 'inviting' || L.s.phase === 'lobby' || L.s.phase === 'starting' || L.s.phase === 'running') dispatch({ type: 'cancel' });
      dispatch({ type: 'reset' });
    }
    onClose();
  }, [onClose]);

  // ---- input ----
  useEffect(() => {
    if (!open) return;
    const recompute = () => {
      const k = held.current;
      const has = (...c: string[]) => c.some((x) => k.has(x));
      keys.current = { steer: (has('ArrowRight', 'KeyD') ? 1 : 0) - (has('ArrowLeft', 'KeyA') ? 1 : 0), throttle: (has('ArrowUp', 'KeyW') ? 1 : 0) - (has('ArrowDown', 'KeyS') ? 1 : 0) };
    };
    const down = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      // Space / Enter starts a SOLO round; with a partner the host presses Start
      if ((e.code === 'Space' || e.code === 'Enter') && phaseRef.current !== 'playing' && !latest.current.couple && !(e.target instanceof HTMLButtonElement)) { startSolo(); return; }
      held.current.add(e.code); recompute();
    };
    const up = (e: KeyboardEvent) => { held.current.delete(e.code); recompute(); };
    const blur = () => { held.current.clear(); keys.current = { ...NO_CONTROLS }; };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); held.current.clear(); keys.current = { ...NO_CONTROLS }; };
  }, [open, startSolo]);

  // ---- the partner's messages: steering (to the host) and the arena (to the guest) ----
  useEffect(() => onPairMessage((m) => {
    const L = latest.current;
    if (!L.couple || m.sid !== L.s.sid) return;
    if (m.t === 'bump:in' && L.iAmHost) {
      const p = parseBumpInput(m);
      if (!p || p.round !== L.s.round) return;
      remoteIn.current = { c: p.controls, at: Date.now() };
      if (p.coat) partnerCoat.current = p.coat;
    } else if (m.t === 'bump:st' && !L.iAmHost) {
      if (m.rd !== L.s.round) return;
      const snap = parseSnapshot(m.snap);
      if (!snap) return;
      target.current = { snap, at: Date.now() };
      const car = carRef.current;
      const pc = snap.co[1 - car];
      if (pc) partnerCoat.current = pc;
      for (const e of snap.e) {
        if (e[0] === 0) { fairSfx('bump', e[3] / 100); shake.current = Math.max(shake.current, e[3] / 100); }
        else if (e[5] === car) { fairSfx('wall', e[3] / 100); shake.current = Math.max(shake.current, (e[3] / 100) * 0.5); }
      }
      if (snap.o && phaseRef.current === 'playing') finish(stateFromSnapshot(snap));
    }
  }), [finish]);

  // ---- the session drives the couple match: lobby → countdown → running → ended ----
  const roundKey = couple ? `${s.sid}:${s.round}` : '';
  useEffect(() => {
    if (!couple) return;
    if (s.phase === 'running' && startedKey.current !== roundKey) {
      startedKey.current = roundKey;
      begin(2, seedFor(s.sid, s.round));
    }
    if (s.phase === 'inviting' || s.phase === 'lobby' || s.phase === 'starting') {
      if (phaseRef.current !== 'ready') { setPhase('ready'); setResult(null); }
      if (startedKey.current !== `lobby:${roundKey}`) { startedKey.current = ''; stateRef.current = newBumper(3, 2); }
    }
    if (s.phase === 'ended' && phaseRef.current === 'playing') finish(visual.current ?? stateRef.current); // the host's "end" reached us before the final snapshot
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [couple, s.phase, roundKey]);
  // everyone who opens the lobby is ready (they came on purpose); the host presses Start, and either can un-ready
  useEffect(() => {
    if (couple && s.phase === 'lobby' && autoReadied.current !== roundKey && !s.ready[myRole]) { autoReadied.current = roundKey; dispatch({ type: 'ready', ready: true }); }
  }, [couple, s.phase, s.ready, myRole, roundKey]);
  // the countdown clock
  useEffect(() => {
    if (!(couple && s.phase === 'starting')) return;
    const id = window.setInterval(() => setClock(Date.now()), 100);
    return () => window.clearInterval(id);
  }, [couple, s.phase]);
  const secsLeft = couple && s.phase === 'starting' && s.startAt ? Math.max(0, Math.ceil((s.startAt - clock) / 1000)) : null;
  useEffect(() => { if (secsLeft !== null && secsLeft > 0) fairSfx('tick'); }, [secsLeft]);

  // the partner left / the session was cancelled
  useEffect(() => {
    if (!open || !(s.kind === 'bumper' && s.phase === 'cancelled')) return;
    if (phaseRef.current === 'playing') {
      if (hostRef.current) {
        // the host keeps driving: the bots take the partner's car
        const gone = 1 - carRef.current;
        stateRef.current = { ...stateRef.current, cars: stateRef.current.cars.map((c) => (c.id === gone ? { ...c, bot: 1 } : c)) };
        latest.current.notify(`${latest.current.partnerName} left — the bots took their car.`, 'info');
        dispatch({ type: 'reset' });
      } else {
        setPhase('over'); setResult(null); setNote(`${latest.current.partnerName} left the arena, so the match ended.`);
      }
    }
  }, [open, s.kind, s.phase]);

  // ---- the loop ----
  useEffect(() => {
    if (!open) return;
    const cv = canvasRef.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    ctx.imageSmoothingEnabled = false;
    let raf = 0, last = performance.now(), lastEngine = 0, hudAt = 0, snapAt = 0;
    const readControls = (): Controls => ({ steer: Math.max(-1, Math.min(1, keys.current.steer + touch.current.steer)), throttle: Math.max(-1, Math.min(1, keys.current.throttle + touch.current.throttle)) });
    const coatsOf = (car: number): (CoatId | null)[] => {
      const L = latest.current;
      const other: CoatId = partnerCoat.current ?? (L.myRole === 'T' ? 'midnight' : 'tangerine');
      const arr: (CoatId | null)[] = [null, null];
      arr[car] = L.coat; arr[1 - car] = other;
      return arr;
    };
    const sendFinal = (st: BumperState, sid: string, rd: number) => {
      const snap = snapshotBumper(st, pending.current.splice(0), coatsOf(carRef.current));
      sendPair(stateMsg(sid, rd, snap));
      // the result must not be lost: repeat it
      for (const ms of [150, 400, 900]) window.setTimeout(() => sendPair(stateMsg(sid, rd, snap)), ms);
    };
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(100, now - last); // the physics runs in 16 ms sub-steps, so a slow frame still advances game time (a 60 s round stays ~60 s on a slow phone)
      last = now;
      const L = latest.current;
      const car = carRef.current;
      const mode: 'solo' | 'host' | 'guest' = !L.couple ? 'solo' : L.iAmHost ? 'host' : 'guest';
      const playing = phaseRef.current === 'playing';
      let view: BumperState = stateRef.current;
      if (playing && mode !== 'guest') {
        const inputs: Controls[] = [NO_CONTROLS, NO_CONTROLS];
        inputs[car] = readControls();
        if (mode === 'host') inputs[1 - car] = freshControls(remoteIn.current, Date.now());
        const next = stepBumper(stateRef.current, inputs, dt);
        stateRef.current = next; view = next;
        for (const e of next.events) {
          if (mode === 'host') pending.current.push(e);
          if (e.kind === 'bump') { fairSfx('bump', e.power); shake.current = Math.max(shake.current, e.power); }
          else if (e.to === car) { fairSfx('wall', e.power); shake.current = Math.max(shake.current, e.power * 0.5); }
        }
        const me = next.cars[car];
        if (inputs[car].throttle !== 0 && now - lastEngine > 160) { lastEngine = now; fairSfx('engine', Math.hypot(me.vx, me.vy) / 120); }
        if (mode === 'host' && now - snapAt >= SNAP_MS && !next.over) { snapAt = now; sendPair(stateMsg(L.s.sid, L.s.round, snapshotBumper(next, pending.current.splice(0), coatsOf(car)))); }
        if (now - hudAt > 120) { hudAt = now; setHud({ t: Math.max(0, ROUND_MS - next.t), mine: me.score, theirs: mode === 'host' ? next.cars[1 - car].score : 0, bumps: me.dealt }); }
        if (next.over) {
          if (mode === 'host') { sendFinal(next, L.s.sid, L.s.round); dispatch({ type: 'end', reason: 'round-over' }); }
          finish(next);
        }
      } else if (playing && mode === 'guest') {
        const c = readControls();
        if (shouldSendInput(guestSent.current.prev, c, now - guestSent.current.at)) {
          guestSent.current = { prev: c, at: now };
          sendPair(inputMsg(L.s.sid, L.s.round, c, L.coat));
        }
        if (c.throttle !== 0 && now - lastEngine > 160) { lastEngine = now; fairSfx('engine', 0.5); }
        const tg = target.current;
        if (tg) {
          const age = Date.now() - tg.at;
          const want = extrapolate(stateFromSnapshot(tg.snap), age);
          visual.current = blendCars(visual.current, want, 1 - Math.exp(-dt / 55));
          view = { ...visual.current, events: age < 90 ? want.events : [] };
          stateRef.current = view;
          if (now - hudAt > 120) { hudAt = now; setHud({ t: Math.max(0, ROUND_MS - tg.snap.t), mine: view.cars[car].score, theirs: view.cars[1 - car].score, bumps: view.cars[car].dealt }); }
        }
      } else if (phaseRef.current === 'ready') {
        // idle demo: the bots bump about so the arena is alive before you start
        stateRef.current = stepBumper(stateRef.current, [NO_CONTROLS, NO_CONTROLS], dt);
        if (stateRef.current.over) stateRef.current = newBumper(3, L.couple ? 2 : 1);
        view = stateRef.current;
      }
      shake.current = Math.max(0, shake.current - dt / 260);
      const other: CoatId = partnerCoat.current ?? (L.myRole === 'T' ? 'midnight' : 'tangerine');
      const coats: (CoatId | null)[] = L.couple ? coatsOf(car) : [L.coat, null, null, null];
      if (L.couple) { coats[car] = L.coat; coats[1 - car] = other; }
      const tags: (string | null)[] = [null, null, null, null];
      if (L.couple) tags[1 - car] = L.tagName;
      drawArena(ctx, view, { me: car, coats, tags, palette: L.couple ? CAR_COLORS_COUPLE : CAR_COLORS }, now, shake.current);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [open, finish]);
  useEffect(() => {
    if (!open) {
      setPhase('ready'); setResult(null); setNote(null); stateRef.current = newBumper(1); touch.current = { steer: 0, throttle: 0 };
      remoteIn.current = null; target.current = null; visual.current = null; startedKey.current = ''; autoReadied.current = ''; guestSent.current = { prev: null, at: -1e9 };
    }
  }, [open]);
  if (!open) return null;

  const hold = (patch: Partial<{ steer: number; throttle: number }>) => ({
    onPointerDown: (e: ReactPointerEvent) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); touch.current = { ...touch.current, ...patch }; },
    onPointerUp: () => { touch.current = { steer: patch.steer !== undefined ? 0 : touch.current.steer, throttle: patch.throttle !== undefined ? 0 : touch.current.throttle }; },
    onPointerCancel: () => { touch.current = { steer: 0, throttle: 0 }; },
    onPointerLeave: () => { touch.current = { steer: patch.steer !== undefined ? 0 : touch.current.steer, throttle: patch.throttle !== undefined ? 0 : touch.current.throttle }; },
  });
  const Btn = ({ onClick, primary = false, disabled = false, children }: { onClick: () => void; primary?: boolean; disabled?: boolean; children: ReactNode }) => (
    <button type="button" className={`btn ${primary ? 'btn--primary' : 'btn--ghost'} btn--md`} onClick={onClick} disabled={disabled}><span className="btn__label">{children}</span></button>
  );
  const REASON: Record<string, string> = {
    declined: `${partnerName} said “not now”.`, 'cancelled-by-partner': `${partnerName} left, so the match ended.`, 'partner-left': `${partnerName} disconnected, so the match ended.`,
    'partner-offline': `${partnerName} isn’t connected right now.`, 'declined-by-me': 'You declined.', 'cancelled-by-me': 'Cancelled.',
  };
  const soloOffer = !couple && !cancelled && hub.pair && s.phase === 'idle';

  let veil: ReactNode = null;
  if (phase !== 'playing') {
    if (cancelled) {
      veil = (<><h3>Match ended</h3><p>{REASON[s.reason ?? ''] ?? 'The match ended.'}</p><div className="pv-fair__row"><Btn primary onClick={() => { dispatch({ type: 'reset' }); setNote(null); setResult(null); setPhase('ready'); }}>OK</Btn></div></>);
    } else if (couple && s.phase === 'inviting') {
      veil = (<><h3>Waiting for {partnerName}…</h3><p>Your invitation is on its way. {partnerName} can join from anywhere in Pawville.</p><div className="pv-fair__row"><Btn onClick={() => dispatch({ type: 'cancel' })}>Cancel</Btn></div></>);
    } else if (couple && s.phase === 'lobby' && phase !== 'over') {
      const them: Role = myRole === 'T' ? 'M' : 'T';
      veil = (
        <>
          <h3>Bumper Paws for two</h3>
          <p className="pv-fair__ready" role="status">
            <span className={s.ready[myRole] ? 'is-ready' : ''}>You: {s.ready[myRole] ? 'ready ✓' : 'not ready'}</span>{' · '}
            <span className={s.ready[them] ? 'is-ready' : ''}>{partnerName}: {s.partnerPresent ? (s.ready[them] ? 'ready ✓' : 'not ready') : 'away'}</span>
          </p>
          <p>You and {partnerName} against two bots. Most points after 60 seconds wins.</p>
          <div className="pv-fair__row">
            <Btn onClick={() => dispatch({ type: 'ready', ready: !s.ready[myRole] })}>{s.ready[myRole] ? 'Not ready' : 'I’m ready'}</Btn>
            {iAmHost ? <Btn primary disabled={!canStart(s, myRole)} onClick={() => dispatch({ type: 'start', now: Date.now() })}>Start</Btn> : <span className="pv-note">{partnerName} starts when you’re both ready.</span>}
            <Btn onClick={close}>Leave</Btn>
          </div>
        </>
      );
    } else if (couple && s.phase === 'starting') {
      veil = (<><h3 aria-live="assertive">{secsLeft ? `Starting in ${secsLeft}…` : 'Go!'}</h3><p>Arrow keys or W A S D. You’re the car marked YOU.</p></>);
    } else if (couple && phase === 'over') {
      const v = result?.verdict;
      veil = (
        <>
          <h3>{v === 'win' ? 'You win!' : v === 'lose' ? `${partnerName} wins!` : v === 'tie' ? 'A tie!' : 'Time’s up!'}</h3>
          <p>{result ? <>You <strong>{result.mine}</strong> · {partnerName} <strong>{result.theirs}</strong>{result.best ? ' — a new personal best!' : ''}{result.earned ? ` · +${result.earned} paw token${result.earned === 1 ? '' : 's'}` : ' · no tokens this time'}</> : 'Counting up the bumps…'}</p>
          <div className="pv-fair__row">
            {iAmHost ? <Btn primary disabled={s.phase !== 'ended'} onClick={() => dispatch({ type: 'rematch' })}>Rematch</Btn> : <span className="pv-note">{s.phase === 'ended' ? `Waiting for ${partnerName} to start a rematch…` : ''}</span>}
            <Btn onClick={close}>Leave</Btn>
          </div>
        </>
      );
    } else if (phase === 'over' && note) {
      veil = (<><h3>Match ended</h3><p>{note}</p><div className="pv-fair__row"><Btn primary onClick={() => { setNote(null); setPhase('ready'); dispatch({ type: 'reset' }); }}>OK</Btn><Btn onClick={close}>Leave</Btn></div></>);
    } else if (phase === 'ready') {
      veil = (
        <>
          <h3>Ready to bump?</h3>
          <p>Hit faster than <strong>{BUMP_SPEED}</strong> speed to count a bump. Don’t stay stuck in a corner — reverse out!</p>
          <div className="pv-fair__row">
            <Btn primary onClick={startSolo}>Start (Space)</Btn>
            {soloOffer && (hub.partnerOnline
              ? <Btn onClick={() => dispatch({ type: 'invite', sid: newSid(), kind: 'bumper', params: { coat } })}>Drive with {partnerName}</Btn>
              : <span className="pv-note">{partnerName} isn’t connected right now.</span>)}
          </div>
        </>
      );
    } else {
      veil = (
        <>
          <h3>Time’s up!</h3>
          <p>You scored <strong>{result?.mine ?? hud.mine}</strong>{result?.best ? ' — a new personal best!' : ''}{result ? (result.earned ? ` · +${result.earned} paw token${result.earned === 1 ? '' : 's'}` : ' · no tokens this time') : ''}</p>
          <div className="pv-fair__row"><Btn primary onClick={startSolo}>Play again</Btn><Btn onClick={close}>Leave</Btn></div>
        </>
      );
    }
  }
  const playingCouple = couple && s.phase !== 'inviting' && s.phase !== 'lobby';
  return (
    <Shell label="Bumper Paws" title="Bumper Paws" onClose={close}
      hint={couple ? `With ${partnerName}: arrow keys or W A S D to drive. Ram the other cat and the bots — the harder the hit, the more points. Most points after 60 seconds wins!` : 'Arrow keys or W A S D to drive: ↑ go, ↓ brake / reverse, ← → steer. Ram the other cats — the harder the hit, the more points. 60 seconds!'}>
      <div className="pv-fair__hud" role="status">
        <span className="chip">⏱ {Math.ceil(hud.t / 1000)} s</span>
        <span className="chip chip--you">{playingCouple ? 'You' : 'Score'} {hud.mine}</span>
        {playingCouple && <span className="chip chip--them">{partnerName.split(/[\s·]/)[0]} {hud.theirs}</span>}
        <span className="chip">Bumps {hud.bumps}</span>
        <span className="chip">Best {save.records['bumper-paws'] ?? 0}</span>
      </div>
      <div className="pv-fair__stage">
        <canvas ref={canvasRef} className="pv-fair__canvas" width={ARENA.w} height={ARENA.h} aria-label="Bumper cars arena: you are the car marked YOU" />
        {phase !== 'playing' && <div className="pv-fair__veil">{veil}</div>}
      </div>
      <div className="pv-fair__pad" aria-label="Touch controls">
        <button type="button" className="pill-btn" aria-label="Steer left" {...hold({ steer: -1 })}>◀</button>
        <button type="button" className="pill-btn" aria-label="Brake or reverse" {...hold({ throttle: -1 })}>▼</button>
        <button type="button" className="pill-btn" aria-label="Accelerate" {...hold({ throttle: 1 })}>▲</button>
        <button type="button" className="pill-btn" aria-label="Steer right" {...hold({ steer: 1 })}>▶</button>
      </div>
    </Shell>
  );
}

// =============================================================================================
// Ring Toss
// =============================================================================================
const W = 320, H = 200;
const NEAR_D = 0.18, FAR_D = 0.9;
const norm = (d: number) => Math.max(0, Math.min(1, (d - NEAR_D) / (FAR_D - NEAR_D)));
const sx = (x: number, d: number) => 160 + (x - BOARD_W / 2) * (1.42 - 0.62 * norm(d));
const sy = (d: number) => 152 - norm(d) * 82;
const sc = (d: number) => 1.15 - 0.55 * norm(d);
const POWER_AT = (d: number) => (d - NEAR_D) / 0.72;

interface Flight { from: { x: number; y: number }; result: ThrowResult; aim: number; power: number; t0: number }

function drawRing(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string, tilt = 0.5) {
  const rx = Math.max(3, Math.round(RING_R * s * 0.95)), ry = Math.max(2, Math.round(rx * (0.35 + tilt * 0.25)));
  ctx.lineWidth = Math.max(2, Math.round(2.6 * s)); ctx.strokeStyle = '#2a1d2f'; ctx.beginPath(); ctx.ellipse(Math.round(x), Math.round(y), rx + 1, ry + 1, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = Math.max(1, Math.round(1.8 * s)); ctx.strokeStyle = color; ctx.beginPath(); ctx.ellipse(Math.round(x), Math.round(y), rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 1;
}
const RING_COLORS = ['#e0475c', '#ffd36b', '#7ee0d2', '#ff8fb1', '#9cc3ff', '#ff8a35'];

function drawBooth(ctx: CanvasRenderingContext2D, o: {
  now: number; ts: TossState; aim: number; power: number; charging: boolean; flight: Flight | null; preview: ThrowResult | null; pops: { x: number; y: number; text: string; t0: number; color: string }[]; ringIdx: number;
}) {
  const { now, ts, aim, power, charging, flight, preview, pops } = o;
  // back wall: deep blue with star specks, scalloped awning, sign
  rect(ctx, 0, 0, W, H, '#241a3d');
  rect(ctx, 0, 0, W, 66, '#2f4870');
  for (let i = 0; i < 40; i++) rect(ctx, (i * 53) % W, 8 + ((i * 29) % 52), 1, 1, i % 3 ? 'rgba(255,255,255,0.25)' : 'rgba(255,211,107,0.5)');
  for (let i = 0; i < 16; i++) rect(ctx, i * 20, 0, 20, 16, i % 2 ? '#fff3e6' : '#e0475c');
  for (let i = 0; i < 16; i++) { pixelEllipse(ctx, i * 20 + 10, 16, 10, 5, '#2a1d2f'); pixelEllipse(ctx, i * 20 + 10, 16, 9, 4, i % 2 ? '#e3d6c2' : '#b5323e'); }
  rect(ctx, 100, 20, 120, 18, '#2a1d2f'); rect(ctx, 101, 21, 118, 16, '#6b4fbf'); rect(ctx, 101, 21, 118, 2, '#8a6fe0');
  drawSignText(ctx, 'RING TOSS', 160, 24, '#ffd36b', '#2a1d2f', 2);
  // the golden peg's rail and the table
  rect(ctx, 0, 66, W, 4, '#5a3a22');
  // table (the landing zone): wood boards in perspective
  for (let y = 70; y < 160; y += 3) { const k = (y - 70) / 90; rect(ctx, 0, y, W, 3, y % 6 ? `rgb(${Math.round(120 + 30 * k)},${Math.round(80 + 24 * k)},${Math.round(52 + 18 * k)})` : `rgb(${Math.round(110 + 30 * k)},${Math.round(72 + 24 * k)},${Math.round(46 + 18 * k)})`); }
  // pegs: back to front so nearer ones overlap
  const pegsSorted = [...PEGS].sort((a, b) => b.d - a.d);
  for (const p of pegsSorted) {
    const x = sx(pegX(p, Date.now()), p.d), y = sy(p.d), s = sc(p.d);
    const taken = ts.taken.includes(p.id);
    const col = taken ? '#6d6285' : p.golden ? '#ffd36b' : p.points === 3 ? '#e0475c' : p.points === 2 ? '#7ee0d2' : '#fff3e6';
    pixelEllipse(ctx, Math.round(x), Math.round(y) + 1, Math.round(7 * s), Math.max(1, Math.round(2.4 * s)), 'rgba(0,0,0,0.35)');
    rect(ctx, x - Math.max(1, 2 * s), y - 14 * s, Math.max(3, 4 * s), 14 * s, '#2a1d2f'); rect(ctx, x - Math.max(0, 1 * s), y - 14 * s, Math.max(2, 2.4 * s), 14 * s, col);
    if (!taken) { // active targets glow and show their value
      ctx.globalAlpha = 0.3 + 0.2 * Math.sin(now / 260 + p.d * 9); pixelEllipse(ctx, Math.round(x), Math.round(y - 7 * s), Math.round(8 * s), Math.round(9 * s), p.golden ? '#fff3c4' : '#ffffff'); ctx.globalAlpha = 1;
      drawSignText(ctx, String(p.points), x + 1, y - 21 * s, p.golden ? '#ffd36b' : '#fff3e6', '#2a1d2f', 1);
    } else drawRing(ctx, x, y - 6 * s, s, '#ffd36b', 0.4); // inactive: wearing a ring
  }
  // preview arc + landing marker
  if (!flight && !ts.over) {
    const land = landing(aim, power);
    const from = { x: 160 + (aim - BOARD_W / 2) * 0.55, y: 188 };
    const lx = sx(land.x, land.d), ly = sy(land.d);
    const hit = preview?.kind === 'peg', rim = preview?.kind === 'rim';
    const col = hit ? '#7edb8c' : rim ? '#ffd36b' : '#ffffff';
    for (let k = 0.08; k < 1; k += 0.07) {
      const px = from.x + (lx - from.x) * k, py = from.y + (ly - from.y) * k - Math.sin(k * Math.PI) * (46 + 40 * norm(land.d));
      rect(ctx, px, py, 2, 2, col);
    }
    ctx.globalAlpha = 0.85; ctx.strokeStyle = col; ctx.beginPath(); ctx.ellipse(Math.round(lx), Math.round(ly), Math.round(RING_R * sc(land.d)), Math.max(2, Math.round(RING_R * sc(land.d) * 0.4)), 0, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
    if (hit) drawSignText(ctx, 'ON TARGET!', lx, ly - 26, '#7edb8c', '#2a1d2f', 1);
  }
  // the ring in flight
  if (flight) {
    const k = Math.min(1, (performance.now() - flight.t0) / FLIGHT_MS);
    const land = landing(flight.aim, flight.power);
    const ex = sx(land.x, land.d), ey = sy(land.d);
    const px = flight.from.x + (ex - flight.from.x) * k, py = flight.from.y + (ey - flight.from.y) * k - Math.sin(k * Math.PI) * (46 + 40 * norm(land.d));
    pixelEllipse(ctx, Math.round(flight.from.x + (ex - flight.from.x) * k), Math.round(flight.from.y + (ey - flight.from.y) * k), 7, 2, 'rgba(0,0,0,0.3)'); // its shadow on the table
    drawRing(ctx, px, py, sc(land.d) * (1.35 - 0.35 * k), RING_COLORS[o.ringIdx % 6], 0.2 + k * 0.6);
  }
  // counter + the ring in hand + the rings left
  rect(ctx, 0, 160, W, 40, '#2a1d2f'); rect(ctx, 0, 162, W, 38, '#8a5a3b'); rect(ctx, 0, 162, W, 3, '#b5835a'); rect(ctx, 0, 196, W, 4, '#5a3a22');
  for (let i = 0; i < ts.rings; i++) drawRing(ctx, 28 + i * 18, 180, 1, RING_COLORS[(RINGS_PER_ROUND - ts.rings + i) % 6], 0.6);
  if (!flight && !ts.over) drawRing(ctx, 160 + (aim - BOARD_W / 2) * 0.55, 186 - (charging ? power * 6 : 0), 1.25, RING_COLORS[o.ringIdx % 6], 0.35);
  // power meter
  rect(ctx, 296, 70, 14, 100, '#2a1d2f'); rect(ctx, 297, 71, 12, 98, '#3a3150');
  for (const [d, pts, col] of [[0.36, '1', '#fff3e6'], [0.58, '2', '#7ee0d2'], [0.69, '5', '#ffd36b'], [0.8, '3', '#e0475c']] as const) {
    const my = 168 - POWER_AT(d) * 96; rect(ctx, 297, my, 12, 2, col); drawSignText(ctx, pts, 290, my - 2, col, '#2a1d2f', 1);
  }
  rect(ctx, 297, 168 - power * 96, 12, 2 + power * 96, charging ? '#ffd36b' : '#7ee0d2');
  rect(ctx, 295, 168 - power * 96, 16, 2, '#ffffff');
  drawSignText(ctx, 'POWER', 303, 60, '#fff3e6', '#2a1d2f', 1);
  // score pops
  for (const p of pops) { const k = (performance.now() - p.t0) / 900; if (k > 1) continue; ctx.globalAlpha = 1 - k; drawSignText(ctx, p.text, p.x, p.y - k * 18, p.color, '#2a1d2f', 2); ctx.globalAlpha = 1; }
}

export function RingTossPanel({ open, save, update, notify, onClose }: { open: boolean; save: WorldSave; update: Update; notify: Notify; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ts, setTs] = useState<TossState>(newToss());
  const tsRef = useRef(ts);
  const setToss = (n: TossState) => { tsRef.current = n; setTs(n); };
  const aim = useRef(BOARD_W / 2);
  const power = useRef(0);
  const charging = useRef(false);
  const chargeAt = useRef(0);
  const flight = useRef<Flight | null>(null);
  const pops = useRef<{ x: number; y: number; text: string; t0: number; color: string }[]>([]);
  const held = useRef(new Set<string>());
  const [msg, setMsg] = useState('Aim with the mouse (or ← →), hold Space or the mouse button to charge, release to throw.');
  const [result, setResult] = useState<{ score: number; earned: number; best: boolean } | null>(null);
  const rewarded = useRef(-1);
  const round = useRef(0);
  const latest = useRef({ save, update, notify });
  latest.current = { save, update, notify };

  const reset = useCallback(() => { round.current += 1; setToss(newToss()); flight.current = null; charging.current = false; power.current = 0; setResult(null); setMsg('Aim, hold to charge, release to throw.'); }, []);

  const release = useCallback(() => {
    if (!charging.current) return;
    charging.current = false;
    const s = tsRef.current;
    if (s.over || flight.current) return;
    const p = power.current;
    const res = resolveThrow(aim.current, p, Date.now(), new Set(s.taken));
    flight.current = { from: { x: 160 + (aim.current - BOARD_W / 2) * 0.55, y: 188 }, result: res, aim: aim.current, power: p, t0: performance.now() };
    fairSfx('throw');
  }, []);
  const press = useCallback(() => { if (tsRef.current.over || flight.current) return; charging.current = true; chargeAt.current = performance.now(); }, []);

  useEffect(() => {
    if (!open) return;
    const down = (e: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (e.code === 'Space' && !e.repeat && !(e.target instanceof HTMLButtonElement)) { if (tsRef.current.over) reset(); else press(); return; }
      held.current.add(e.code);
    };
    const up = (e: KeyboardEvent) => { held.current.delete(e.code); if (e.code === 'Space') release(); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); held.current.clear(); };
  }, [open, press, release, reset]);

  useEffect(() => {
    if (!open) return;
    const cv = canvasRef.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    ctx.imageSmoothingEnabled = false;
    let raf = 0, last = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(50, now - last); last = now;
      if (held.current.has('ArrowLeft') || held.current.has('KeyA')) aim.current = Math.max(10, aim.current - dt * 0.09);
      if (held.current.has('ArrowRight') || held.current.has('KeyD')) aim.current = Math.min(BOARD_W - 10, aim.current + dt * 0.09);
      if (charging.current) { const k = ((now - chargeAt.current) / 1500) % 2; power.current = k < 1 ? k : 2 - k; if (Math.floor(now / 110) !== Math.floor((now - dt) / 110)) fairSfx('tick'); }
      // the throw lands
      const f = flight.current;
      if (f && now - f.t0 >= FLIGHT_MS) {
        flight.current = null;
        const r = f.result;
        const before = tsRef.current;
        const next = applyThrow(before, r);
        setToss(next);
        const x = sx(r.x, r.d), y = sy(r.d);
        if (r.kind === 'peg') {
          fairSfx(r.points >= 5 ? 'jackpot' : 'ring');
          pops.current.push({ x, y: y - 24, text: `+${r.points}`, t0: performance.now(), color: r.points >= 5 ? '#ffd36b' : '#7edb8c' });
          setMsg(r.points >= 5 ? 'THE GOLDEN PEG! Five points!' : `Ringer! +${r.points}`);
        } else if (r.kind === 'rim') { fairSfx('clink'); pops.current.push({ x, y: y - 20, text: 'CLINK', t0: performance.now(), color: '#ffd36b' }); setMsg(before.taken.includes(r.peg) ? 'That peg already has a ring — try another!' : 'So close — it bounced off the rim!'); }
        else { fairSfx('miss'); setMsg('Missed — the ring lands on the table. Line the white circle up with a peg!'); }
        if (next.over && rewarded.current !== round.current) { // exactly one reward per round
          rewarded.current = round.current;
          const tokens = tossTokens(next.score);
          let earned = 0, best = false;
          latest.current.update((sv) => {
            const rec = setRecord(sv, 'ring-toss', next.score);
            best = rec.isNew;
            const e = tokens > 0 ? earnArcade(rec.save, tokens, today()) : { save: rec.save, earned: 0 };
            earned = e.earned;
            return e.save;
          });
          setResult({ score: next.score, earned, best });
          fairSfx('done');
          if (earned) latest.current.notify(`+${earned} paw token${earned === 1 ? '' : 's'} from Ring Toss!`, 'success');
        }
      }
      const s = tsRef.current;
      const prev = !flight.current && !s.over ? resolveThrow(aim.current, power.current, Date.now(), new Set(s.taken)) : null;
      drawBooth(ctx, { now, ts: s, aim: aim.current, power: power.current, charging: charging.current, flight: flight.current, preview: prev, pops: pops.current, ringIdx: RINGS_PER_ROUND - s.rings });
      pops.current = pops.current.filter((p) => performance.now() - p.t0 < 900);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [open]);
  useEffect(() => { if (!open) { setToss(newToss()); flight.current = null; charging.current = false; power.current = 0; setResult(null); } }, [open]);
  if (!open) return null;

  /** The landing circle follows the pointer sideways (inverse of the booth's perspective at the current power depth). */
  const pointerAim = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const d = landing(0, power.current).d;
    aim.current = Math.max(10, Math.min(BOARD_W - 10, BOARD_W / 2 + (px - 160) / (1.42 - 0.62 * norm(d))));
  };
  return (
    <Shell label="Ring Toss" title="Ring Toss" onClose={onClose} hint="Move the mouse (or ← →) to aim, HOLD the mouse button or Space to charge the power bar, release to throw. The dotted arc shows where the ring will land: line the circle up with a peg. Farther pegs and the sliding golden peg are worth more — and a peg can only score once.">
      <div className="pv-fair__hud" role="status">
        <span className="chip chip--you">Score {ts.score}</span>
        <span className="chip">Rings left {ts.rings}</span>
        <span className="chip">Best {save.records['ring-toss'] ?? 0}</span>
      </div>
      <div className="pv-fair__stage">
        <canvas ref={canvasRef} className="pv-fair__canvas" width={W} height={H} aria-label="Ring toss booth" style={{ touchAction: 'none', cursor: 'crosshair' }}
          onPointerMove={pointerAim} onPointerDown={(e) => { pointerAim(e); (e.target as HTMLElement).setPointerCapture?.(e.pointerId); press(); }} onPointerUp={release} onPointerCancel={release} />
        {ts.over && (
          <div className="pv-fair__veil">
            <h3>{ts.score >= 12 ? 'Ring master!' : ts.score >= 6 ? 'Nice tossing!' : 'Good try!'}</h3>
            <p>You scored <strong>{ts.score}</strong>{result?.best ? ' — a new personal best!' : ''}{result ? (result.earned ? ` · +${result.earned} paw token${result.earned === 1 ? '' : 's'}` : ' · no tokens this round') : ''}</p>
            <div className="pv-fair__row">
              <button type="button" className="btn btn--primary btn--md" onClick={reset}><span className="btn__label">Play again</span></button>
              <button type="button" className="btn btn--ghost btn--md" onClick={onClose}><span className="btn__label">Leave</span></button>
            </div>
          </div>
        )}
      </div>
      <p className="pv-fair__msg" role="status" aria-live="polite">{msg}</p>
    </Shell>
  );
}
