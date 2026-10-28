import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { Button } from '../../components/Button';
import { CatCharacter } from '../../components/CatCharacter';
import type { CatMood } from '../../game/types';
import { useMemoryRecorder } from '../components/ActivityDock';
import { CountdownBadge, ResultPanel } from '../components/ResultPanel';
import { GameShell, Segmented, Stat } from '../components/GameShell';
import { SessionBar } from '../components/SessionBar';
import { newSid } from '../couple/activitySession.ts';
import { dispatch, onPairMessage, sendPair, usePairHub } from '../couple/pairHub.ts';
import {
  ARENA, MAX_HP, METER_MAX, NO_INPUT, ROUND_TICKS, TICK_HZ, aiInput, attackPhase, createAi, createBox, forfeit, sanitizeInput, snapshotBox, stepBox,
  type BoxAiLevel, type BoxState, type Input,
} from '../games/boxing/engine.ts';
import { catName, loadTownIdentity } from '../identity';
import { cue } from '../sound';
import { useWorldSave } from '../useWorldSave.ts';
import type { CoatId } from '../appearance.ts';

type Mode = 'practice' | 'ai' | 'couple';
type Snap = ReturnType<typeof snapshotBox>;
const STEP_MS = 1000 / TICK_HZ;

/** Keyboard + touch → one Input per tick (attacks/dodge are edge-triggered presses). */
function useControls(enabled: boolean) {
  const held = useRef(new Set<string>());
  const pressed = useRef<Partial<Input>>({});
  useEffect(() => {
    if (!enabled) return;
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const k = e.code;
      if (['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight', 'KeyS', 'ArrowDown', 'KeyJ', 'KeyK', 'KeyL', 'Space'].includes(k)) e.preventDefault();
      if (e.repeat) return;
      held.current.add(k);
      if (k === 'KeyJ') pressed.current.jab = true;
      if (k === 'KeyK') pressed.current.heavy = true;
      if (k === 'KeyL') pressed.current.flurry = true;
      if (k === 'Space') pressed.current.dodge = true;
    };
    const up = (e: KeyboardEvent) => held.current.delete(e.code);
    const blur = () => held.current.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [enabled]);
  const read = (): Input => {
    const h = held.current;
    const left = h.has('KeyA') || h.has('ArrowLeft') || h.has('touch-left');
    const right = h.has('KeyD') || h.has('ArrowRight') || h.has('touch-right');
    const inp: Input = { move: left === right ? 0 : left ? -1 : 1, block: h.has('KeyS') || h.has('ArrowDown') || h.has('touch-block'), ...pressed.current };
    pressed.current = {};
    return inp;
  };
  const touch = {
    hold: (k: string) => ({
      onPointerDown: (e: RPointerEvent<HTMLButtonElement>) => { e.preventDefault(); held.current.add(k); },
      onPointerUp: () => held.current.delete(k), onPointerCancel: () => held.current.delete(k), onPointerLeave: () => held.current.delete(k),
    }),
    tap: (k: keyof Input) => ({ onPointerDown: (e: RPointerEvent<HTMLButtonElement>) => { e.preventDefault(); (pressed.current as Record<string, boolean>)[k] = true; } }),
  };
  return { read, touch };
}

function moodFor(f: Snap['f'][number], tick: number, won: boolean | null): CatMood {
  if (won === true) return 'victorious';
  if (won === false) return 'sad';
  if (f.action === 'stun') return 'surprised';
  if (tick - f.lastHitAt < 8) return 'surprised';
  if (f.action === 'jab' || f.action === 'heavy' || f.action === 'flurry') return 'playful';
  if (f.blocking) return 'thinking';
  return 'idle';
}

function Fighter({ f, side, coat, cat, name, tick, won }: { f: Snap['f'][number]; side: 0 | 1; coat: CoatId; cat: 'T' | 'M'; name: string; tick: number; won: boolean | null }) {
  const phase = attackPhase({ ...f, action: f.action, frame: f.frame } as unknown as Parameters<typeof attackPhase>[0]);
  const punch = phase === 'active' ? (f.action === 'heavy' ? 26 : 18) : phase === 'startup' ? -4 : 0;
  const dizzy = f.action === 'stun';
  return (
    <div className={`bx-fighter bx-fighter--${side} ${f.action === 'dodge' ? 'is-dodging' : ''} ${dizzy ? 'is-dizzy' : ''} ${f.blocking ? 'is-blocking' : ''}`}
      style={{ left: `${((f.x - ARENA.min) / (ARENA.max - ARENA.min)) * 100}%` }} aria-label={`${name}: ${f.hp} fluff`}>
      <div className="bx-fighter__body">
        <CatCharacter cat={cat} coat={coat} mood={moodFor(f, tick, won)} size={112} flip={side === 1} still />
        <span className="bx-glove bx-glove--front" style={{ transform: `translateX(${side === 0 ? punch : -punch}px)` }} aria-hidden="true" />
        <span className="bx-glove bx-glove--back" aria-hidden="true" />
        {dizzy && <span className="bx-stars" aria-hidden="true">★ ✦ ★</span>}
      </div>
    </div>
  );
}

export function BoxingPage() {
  const hub = usePairHub();
  const me = useMemo(() => loadTownIdentity(hub.pair?.myRole), [hub.pair?.myRole]);
  const partnerName = hub.pair ? hub.pair.partnerName || catName(hub.pair.myRole === 'T' ? 'M' : 'T') : 'Partner';
  const { update } = useWorldSave();
  const record = useMemoryRecorder(update, () => undefined);
  const [mode, setMode] = useState<Mode>('ai');
  const [level, setLevel] = useState<BoxAiLevel>('medium');
  const [running, setRunning] = useState(false);
  const [snap, setSnap] = useState<Snap>(() => snapshotBox(createBox()));
  const [countdown, setCountdown] = useState<number | null>(null);
  const boxRef = useRef<BoxState>(createBox());
  const aiRef = useRef(createAi(1));
  const remoteInput = useRef<Input>(NO_INPUT);
  const remotePressed = useRef<Partial<Input>>({});
  const s = hub.session;
  const couple = s.kind === 'boxing' && s.phase !== 'idle' && s.phase !== 'cancelled';
  const myRole = hub.pair?.myRole ?? 'T';
  const iAmHost = couple ? s.host === myRole : true;
  const mySide: 0 | 1 = couple ? (myRole === 'T' ? 0 : 1) : 0;
  const controls = useControls(running);
  const recorded = useRef(false);

  const coats: [CoatId, CoatId] = couple
    ? (myRole === 'T' ? [me.coat, 'midnight'] : ['tangerine', me.coat])
    : [me.coat, me.cat === 'T' ? 'midnight' : 'tangerine'];
  const names: [string, string] = couple
    ? (myRole === 'T' ? [me.name, partnerName] : [partnerName, me.name])
    : [me.name, mode === 'practice' ? 'Practice dummy' : `Computer · ${level}`];

  const startLocal = (startAt: number) => {
    boxRef.current = createBox();
    aiRef.current = createAi(Math.floor(Math.random() * 1e9));
    remoteInput.current = NO_INPUT;
    recorded.current = false;
    setSnap(snapshotBox(boxRef.current));
    setRunning(false);
    const tick = () => {
      const left = Math.ceil((startAt - Date.now()) / 1000);
      if (left > 0) {
        setCountdown(left);
        cue('click');
        timer.current = window.setTimeout(tick, Math.min(1000, startAt - Date.now() - (left - 1) * 1000));
      } else {
        setCountdown(0);
        cue('join');
        setRunning(true);
        timer.current = window.setTimeout(() => setCountdown(null), 600);
      }
    };
    tick();
  };
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current); }, []);

  // Couple match: everyone starts at the shared time.
  useEffect(() => {
    if (s.kind === 'boxing' && s.phase === 'starting' && s.startAt !== null) startLocal(s.startAt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.kind, s.phase, s.startAt, s.round]);

  // Partner messages: guest inputs (to host) and authoritative snapshots (to guest).
  useEffect(() => onPairMessage((m) => {
    if (!couple || m.sid !== s.sid) return;
    if (m.t === 'bx:input' && iAmHost) {
      const inp = sanitizeInput(m.input);
      remoteInput.current = { move: inp.move, block: inp.block };
      for (const k of ['jab', 'heavy', 'flurry', 'dodge'] as const) if (inp[k]) remotePressed.current[k] = true;
    }
    if (m.t === 'bx:state' && !iAmHost && m.snap && typeof m.snap === 'object') {
      const sn = m.snap as Snap;
      if (Array.isArray(sn.f) && sn.f.length === 2) setSnap(sn);
    }
  }), [couple, iAmHost, s.sid]);

  // Partner gone for good → host awards the match (forfeit).
  useEffect(() => {
    if (s.kind === 'boxing' && s.phase === 'cancelled' && s.reason === 'partner-left' && running) {
      boxRef.current = forfeit(boxRef.current, (1 - mySide) as 0 | 1);
      setSnap(snapshotBox(boxRef.current));
      setRunning(false);
    }
  }, [s.kind, s.phase, s.reason, running, mySide]);

  // Fixed-step game loop (only the host simulates in couple matches).
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let acc = 0;
    let last = performance.now();
    let lastSend = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      acc += Math.min(250, t - last);
      last = t;
      while (acc >= STEP_MS) {
        acc -= STEP_MS;
        const mine = controls.read();
        if (couple && !iAmHost) {
          if (mine.move !== 0 || mine.block || mine.jab || mine.heavy || mine.flurry || mine.dodge || t - lastSend > 200) {
            lastSend = t;
            sendPair({ t: 'bx:input', sid: s.sid, input: mine });
          }
          continue;
        }
        let other: Input = NO_INPUT;
        if (couple) {
          other = { ...remoteInput.current, ...remotePressed.current };
          remotePressed.current = {};
        } else if (mode === 'ai') other = aiInput(boxRef.current, 1, level, aiRef.current);
        const inputs: [Input, Input] = mySide === 0 ? [mine, other] : [other, mine];
        const next = stepBox(boxRef.current, inputs);
        for (const e of next.events) if (e.type === 'hit') cue(e.blocked ? 'tap' : 'pop'); else if (e.type === 'ko' || e.type === 'round') cue('join');
        boxRef.current = next;
        if (couple && next.tick % 2 === 0) sendPair({ t: 'bx:state', sid: s.sid, snap: snapshotBox(next) });
        if (next.phase === 'match-over') {
          if (couple) sendPair({ t: 'bx:state', sid: s.sid, snap: snapshotBox(next) });
          setRunning(false);
        }
      }
      if (!couple || iAmHost) setSnap(snapshotBox(boxRef.current));
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, couple, iAmHost, mode, level, mySide, s.sid]);

  const over = snap.phase === 'match-over' && snap.matchWinner !== null;
  const iWon = over && snap.matchWinner === mySide;
  useEffect(() => {
    if (!over || recorded.current) return;
    recorded.current = true;
    if (couple && s.phase === 'running') dispatch({ type: 'end', reason: 'match-over' });
    if (iWon) {
      update((sv) => ({ ...sv, achievements: { ...sv.achievements, champ: sv.achievements.champ ?? Date.now() } }));
      if (couple) record({ kind: 'boxing-win', title: 'Won a Cat Boxing match', detail: `Best of three against ${partnerName}. Gloves off, hugs on.`, place: 'The Ring', withPartner: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [over]);

  const roundLeft = Math.max(0, (ROUND_TICKS - snap.roundTick) / TICK_HZ);
  const me0 = snap.f[mySide];
  const help = (
    <>
      <p>Soft gloves only! Knock out your opponent’s <strong>fluff</strong> or have more left when the 45-second round ends. Best of three.</p>
      <ul className="pv-list">
        <li><kbd className="pv-key">A</kbd>/<kbd className="pv-key">D</kbd> or arrows — step</li>
        <li><kbd className="pv-key">J</kbd> quick jab · <kbd className="pv-key">K</kbd> heavy paw (slow, knocks back, makes them dizzy)</li>
        <li><kbd className="pv-key">S</kbd> hold to block (most damage blocked) · <kbd className="pv-key">Space</kbd> dodge (briefly untouchable)</li>
        <li><kbd className="pv-key">L</kbd> paw flurry when your meter is full (it fills as you land and take hits)</li>
      </ul>
      <p className="pv-note">Every move has a short wind-up and recovery, so mashing doesn’t win — timing does. Couple matches run on one player’s device (the host) and are synced to the other; it’s a friendly mode, not an anti-cheat ranked mode.</p>
    </>
  );

  return (
    <GameShell game="cat-boxing" venue="ring" place="The Ring" title="Cat Boxing" subtitle="Soft gloves, wobbly stars, no hard feelings." help={help}
      onBeforeLeave={() => { if (couple) dispatch({ type: 'cancel', reason: 'left' }); }}
      stats={(running || over || snap.tick > 0) ? (
        <>
          <Stat label="Round" value={`${snap.round}`} />
          <Stat label="Time" value={roundLeft.toFixed(0)} tone={roundLeft < 10 ? 'bad' : undefined} />
          <Stat label="Wins" value={`${snap.wins[0]} – ${snap.wins[1]}`} tone="gold" />
          <Stat label="Your meter" value={me0.meter >= METER_MAX ? 'FULL' : `${me0.meter}%`} tone={me0.meter >= METER_MAX ? 'good' : undefined} />
        </>
      ) : undefined}>
      <SessionBar kinds={['boxing']} />
      <section className="bx-ring" aria-label="Boxing ring">
        <div className="bx-bars">
          {[0, 1].map((i) => (
            <div key={i} className={`bx-bar bx-bar--${i}`}>
              <span className="bx-bar__name">{names[i]}</span>
              <span className="bx-bar__track"><span className="bx-bar__fill" style={{ width: `${(snap.f[i].hp / MAX_HP) * 100}%` }} /></span>
              <span className="bx-bar__meter"><span style={{ width: `${(snap.f[i].meter / METER_MAX) * 100}%` }} /></span>
            </div>
          ))}
        </div>
        <div className="bx-mat">
          {[0, 1].map((i) => (
            <Fighter key={i} f={snap.f[i]} side={i as 0 | 1} coat={coats[i]} cat={i === 0 ? 'T' : 'M'} name={names[i]} tick={snap.tick} won={over ? snap.matchWinner === i : null} />
          ))}
          {snap.phase === 'round-over' && <p className="bx-callout" role="status">{snap.roundWinner === 'draw' ? 'Draw round!' : `${names[snap.roundWinner as 0 | 1]} takes round ${snap.round}!`}</p>}
          <CountdownBadge value={countdown} />
        </div>
        {running && (
          <div className="bx-touch" aria-label="Touch controls">
            <div className="bx-touch__group">
              <button type="button" {...controls.touch.hold('touch-left')} aria-label="Step left">◀</button>
              <button type="button" {...controls.touch.hold('touch-right')} aria-label="Step right">▶</button>
            </div>
            <div className="bx-touch__group">
              <button type="button" {...controls.touch.tap('jab')}>Jab</button>
              <button type="button" {...controls.touch.tap('heavy')}>Heavy</button>
              <button type="button" {...controls.touch.hold('touch-block')}>Block</button>
              <button type="button" {...controls.touch.tap('dodge')}>Dodge</button>
              <button type="button" {...controls.touch.tap('flurry')} disabled={me0.meter < METER_MAX}>Flurry</button>
            </div>
          </div>
        )}
      </section>
      {!running && !over && !couple && countdown === null && (
        <section className="pv-setup">
          <Segmented label="Mode" value={mode} options={[{ id: 'practice', label: 'Practice' }, { id: 'ai', label: 'vs Computer' }, { id: 'couple', label: 'Couple match' }]} onChange={setMode} />
          {mode === 'ai' && <Segmented label="Difficulty" value={level} options={[{ id: 'easy', label: 'Easy' }, { id: 'medium', label: 'Medium' }, { id: 'hard', label: 'Hard' }]} onChange={setLevel} />}
          {mode === 'couple' ? (
            hub.pair && hub.partnerOnline
              ? <Button variant="primary" size="lg" disabled={s.phase !== 'idle'} onClick={() => dispatch({ type: 'invite', sid: newSid(), kind: 'boxing' })}>Invite {partnerName}</Button>
              : <p className="pv-note">{hub.pair ? `${partnerName} isn’t connected right now.` : 'Pair up with your partner in town (♥ button) for couple matches.'}</p>
          ) : <Button variant="primary" size="lg" onClick={() => startLocal(Date.now() + 3000)}>Touch gloves</Button>}
          <p className="pv-note">{mode === 'practice' ? 'The practice dummy never hits back — try every move.' : 'Keyboard: A/D move · J jab · K heavy · S block · Space dodge · L flurry.'}</p>
        </section>
      )}
      <ResultPanel
        open={over}
        mood="lively"
        heading={snap.forfeit !== null ? (iWon ? `${names[1 - mySide]} left — you win!` : 'Match over') : iWon ? 'Gentle champion!' : `${names[snap.matchWinner ?? 0]} wins!`}
        sub={couple ? 'Couple match' : mode === 'ai' ? `vs Computer · ${level}` : 'Practice'}
        art={<CatCharacter cat={me.cat} coat={me.coat} accessory={me.accessory} mood={iWon ? 'victorious' : 'happy'} size={96} />}
        stats={[
          { label: 'Rounds', value: `${snap.wins[0]} – ${snap.wins[1]}`, highlight: true },
          { label: 'Paws landed', value: snap.f[mySide].landed },
          { label: 'Paws thrown', value: snap.f[mySide].thrown },
          { label: 'Accuracy', value: `${snap.f[mySide].thrown ? Math.round((snap.f[mySide].landed / snap.f[mySide].thrown) * 100) : 0}%` },
        ]}
        primaryLabel={couple ? 'Rematch' : 'Fight again'}
        onPrimary={() => {
          if (couple || s.kind === 'boxing') {
            if (s.phase === 'ended') dispatch({ type: 'rematch' });
            boxRef.current = createBox();
            setSnap(snapshotBox(boxRef.current));
          } else startLocal(Date.now() + 3000);
        }}
        secondary={<Button variant="ghost" size="sm" onClick={() => { if (s.kind === 'boxing') dispatch({ type: 'reset' }); boxRef.current = createBox(); setSnap(snapshotBox(boxRef.current)); }}>Change mode</Button>}
      />
    </GameShell>
  );
}
