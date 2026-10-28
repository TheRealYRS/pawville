/**
 * Milestone 8.2 UI: the two new arcade cabinets (Cat Café Rush, Fish Frenzy), the Bijou cinema
 * (films you actually watch) and karaoke night at The Purring Cup. Game rules live in the pure
 * modules under city/; this file only draws them, plays sounds and records results. Tokens go
 * through the existing economy (earnArcade is capped per day), records into the existing save.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { earnArcade, setRecord, spend } from '../city/economy.ts';
import {
  RUSH_COATS, RUSH_GAME_MS, RUSH_HEARTS, RUSH_ITEM_NAMES, RUSH_MENU, RUSH_SEATS, addToTray, clearTray, newRush, rushTokens, serve, tickRush, type RushItem, type RushState,
} from '../city/cafeRush.ts';
import { FRENZY_LANES, HOOK_X, comboMultiplier, frenzyTokens, moveHook, newFrenzy, setHookLane, snap, tickFrenzy, type FrenzyFish, type FrenzyState } from '../city/fishFrenzy.ts';
import { FILMS, TICKET_PRICE, filmAt, filmLength, sceneFade, type Film } from '../city/cinema.ts';
import { SONGS, accuracy, allWords, beatMs, currentLine, expire, newRun, songLengthMs, songUnlocked, stars, tap, type KaraokeRun, type KaraokeSong } from '../city/karaoke.ts';
import { inBreakAt } from '../city/karaokeBacking.ts';
import { karaokePrefs, startBand, type BandHandle, type KaraokeAudioPrefs } from '../city/karaokeAudio.ts';
import { isSoundEnabled, subscribeSound } from '../../lib/soundService';
import type { AdvView } from '../adventure/state.ts';
import { padTone } from '../city/voices.ts';
import { FILM_H, FILM_W, drawFilmFrame } from '../render/filmArt.ts';
import { pixelEllipse, rect } from '../render/canvasTypes.ts';
import { recordMemory, unlock, type WorldSave } from '../worldSave.ts';
import { cue } from '../sound';
import { PixelCat } from './PixelCat';
import { PawToken } from './CityPanels';

type Update = (fn: (s: WorldSave) => WorldSave) => void;
type Notify = (msg: string, tone?: 'info' | 'success' | 'warn') => void;
const today = () => new Date().toISOString().slice(0, 10);
const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** requestAnimationFrame loop with a clamped dt (ms). Stops when `on` is false. */
function useLoop(on: boolean, fn: (dt: number, now: number) => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!on) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(100, now - last);
      last = now;
      ref.current(dt, now);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [on]);
}

/** Game keys work wherever focus is inside the page while the panel is open (not only on the panel's div). */
function useKeys(on: boolean, fn: (e: KeyboardEvent) => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!on) return;
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'))) return;
      ref.current(e);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [on]);
}

// =================================================================================================
// Cat Café Rush
// =================================================================================================
function RushIcon({ item, size = 22 }: { item: RushItem; size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true" className="pv-rush__icon">
      {item === 'milk' && <><rect x="4" y="3" width="8" height="11" rx="1" fill="#fff3e6" stroke="#3d5a8a" /><rect x="4" y="3" width="8" height="3" fill="#9cc3ff" /></>}
      {item === 'cookie' && <><circle cx="8" cy="8" r="6" fill="#c98436" stroke="#6b4329" /><circle cx="6" cy="6" r="1" fill="#5a3a22" /><circle cx="10" cy="9" r="1" fill="#5a3a22" /><circle cx="7" cy="10.5" r="0.8" fill="#5a3a22" /></>}
      {item === 'fish' && <><path d="M2 8c3-5 9-5 11 0-2 5-8 5-11 0z" fill="#7fb2e6" stroke="#2a5389" /><path d="M13 8l3-3v6z" fill="#7fb2e6" stroke="#2a5389" /><circle cx="5.5" cy="7.2" r="0.9" fill="#2a1d2f" /></>}
      {item === 'cake' && <><path d="M3 13h10V8H3z" fill="#fff3e6" stroke="#b5323e" /><path d="M3 8h10V6H3z" fill="#ff8fb1" /><circle cx="8" cy="4.5" r="1.4" fill="#e0475c" /></>}
    </svg>
  );
}

export function CafeRushPanel({ open, save, update, notify, onClose, onDone }: { open: boolean; save: WorldSave; update: Update; notify: Notify; onClose: () => void; onDone?: (served: number) => void }) {
  const [st, setSt] = useState<RushState | null>(null);
  const ref = useRef<RushState | null>(null);
  const finished = useRef(false);
  const set = (n: RushState | null) => { ref.current = n; setSt(n); };
  useEffect(() => { if (!open) { set(null); finished.current = false; } }, [open]);
  const finish = useCallback((s: RushState) => {
    if (finished.current) return;
    finished.current = true;
    let earned = 0, isNew = false;
    update((sv) => {
      const ea = earnArcade(sv, rushTokens(s.served), today());
      const rr = setRecord(ea.save, 'cafe-rush', s.served);
      earned = ea.earned; isNew = rr.isNew;
      return s.served >= 12 ? unlock(rr.save, 'cafe-star', Date.now()).save : rr.save;
    });
    cue(s.served >= 8 ? 'victory' : 'join');
    notify(`Café Rush: ${s.served} cat${s.served === 1 ? '' : 's'} served${isNew ? ' — new personal best!' : ''}${earned ? ` (+${earned} tokens)` : ''}`, 'success');
    onDone?.(s.served);
  }, [update, notify, onDone]);
  useLoop(open && !!st && !st.over, (dt) => {
    const cur = ref.current;
    if (!cur || cur.over) return;
    const n = tickRush(cur, dt, Math.random);
    if (n.last?.kind === 'arrive') cue('tap');
    if (n.last?.kind === 'left') cue('nope');
    set(n);
    if (n.over) finish(n);
  });
  const act = (fn: (s: RushState) => RushState) => {
    const cur = ref.current;
    if (!cur || cur.over) return;
    const n = fn(cur);
    if (n.last?.kind === 'served') { cue('pop'); padTone(n.last.tip ? 784 : 659, 160); }
    if (n.last?.kind === 'wrong' || n.last?.kind === 'tray-full') cue('nope');
    set(n);
  };
  useKeys(open, (e) => {
    const i = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
    if (i >= 0) { e.preventDefault(); act((s) => addToTray(s, RUSH_MENU[i])); return; }
    const seat = ['KeyQ', 'KeyW', 'KeyE'].indexOf(e.code);
    if (seat >= 0) { e.preventDefault(); act((s) => serve(s, seat)); return; }
    if (e.code === 'Backspace' || e.code === 'KeyX') { e.preventDefault(); act(clearTray); }
  });
  if (!open) return null;
  const left = st ? Math.max(0, Math.ceil((RUSH_GAME_MS - st.t) / 1000)) : 90;
  return (
    <Modal open title="Cat Café Rush" onClose={onClose} className="pv-modal pv-modal--orange pv-rush">
      <div>
        <p className="pv-note">Cats order at the counter. Tap the treats to fill your tray (keys 1–4), then tap the cat to serve (Q / W / E). Serve fast for a tip. Best: {save.records['cafe-rush'] ?? 0} served.</p>
        <div className="pv-rush__hud" aria-live="polite">
          <span>Time {left}s</span>
          <span aria-label={`${st?.hearts ?? RUSH_HEARTS} hearts left`}>{'♥'.repeat(st?.hearts ?? RUSH_HEARTS)}<span className="pv-rush__lost">{'♥'.repeat(RUSH_HEARTS - (st?.hearts ?? RUSH_HEARTS))}</span></span>
          <span>Served {st?.served ?? 0} · {st?.score ?? 0} pts</span>
        </div>
        <div className="pv-rush__counter" role="group" aria-label="Counter seats">
          {Array.from({ length: RUSH_SEATS }, (_, i) => {
            const c = st?.seats[i] ?? null;
            const k = c ? c.patience / c.max : 0;
            const huff = c?.huffAt !== undefined && st && st.t - c.huffAt < 500;
            return (
              <button key={i} type="button" className={`pv-rush__seat ${c ? 'is-busy' : ''} ${huff ? 'is-huff' : ''}`} disabled={!st || st.over}
                aria-label={c ? `Seat ${i + 1}: wants ${c.order.map((o) => RUSH_ITEM_NAMES[o]).join(' and ')}` : `Seat ${i + 1}: empty`}
                onClick={() => act((s) => serve(s, i))}>
                <span className="pv-rush__key">{'QWE'[i]}</span>
                {c ? (
                  <>
                    <span className="pv-rush__bubble">{c.order.map((o, j) => <RushIcon key={j} item={o} />)}</span>
                    <PixelCat coat={RUSH_COATS[c.coat % RUSH_COATS.length]} facing="down" pose="sit" scale={3} />
                    <span className="pv-rush__patience"><span style={{ width: `${Math.round(k * 100)}%`, background: k > 0.5 ? '#7edb8c' : k > 0.25 ? '#ffd36b' : '#e0475c' }} /></span>
                  </>
                ) : <span className="pv-rush__empty">empty stool</span>}
              </button>
            );
          })}
        </div>
        <div className="pv-rush__tray" aria-label="Your tray">
          <strong>Tray:</strong>
          {(st?.tray ?? []).map((t, i) => <RushIcon key={i} item={t} size={26} />)}
          {!st?.tray.length && <span className="pv-note">empty</span>}
          <button type="button" className="pill-btn" disabled={!st?.tray.length} onClick={() => act(clearTray)}>Clear (X)</button>
        </div>
        <div className="pv-rush__menu" role="group" aria-label="Menu">
          {RUSH_MENU.map((m, i) => (
            <button key={m} type="button" className="pv-rush__item" disabled={!st || st.over} onClick={() => act((s) => addToTray(s, m))}>
              <RushIcon item={m} size={30} /><span>{RUSH_ITEM_NAMES[m]}</span><kbd>{i + 1}</kbd>
            </button>
          ))}
        </div>
        <p className="pv-note" aria-live="polite">
          {!st && 'Press Start to open the café.'}
          {st?.last?.kind === 'served' && `Purr! +${st.last.points}${st.last.tip ? ' (with a tip)' : ''}`}
          {st?.last?.kind === 'wrong' && 'Hmph! That’s not what they ordered.'}
          {st?.last?.kind === 'tray-full' && 'Your tray only holds three treats.'}
          {st?.over && `Closing time! ${st.served} served, ${st.tips} tips, ${st.score} points.`}
        </p>
        <div className="modal__actions">
          {(!st || st.over) && <Button variant="primary" onClick={() => { finished.current = false; set(newRush()); cue('tap'); }}>{st ? 'Play again' : 'Start'}</Button>}
          <Button variant="ghost" onClick={onClose}>Leave the cabinet</Button>
        </div>
      </div>
    </Modal>
  );
}

// =================================================================================================
// Fish Frenzy
// =================================================================================================
const FW = 200, FH = 120, LANE_TOP = 40, LANE_H = 18;
const laneY = (lane: number) => LANE_TOP + lane * LANE_H + 9;
function drawFrenzy(ctx: CanvasRenderingContext2D, s: FrenzyState | null, t: number, flash: number) {
  ctx.imageSmoothingEnabled = false;
  // sky, pier and water
  const g = ctx.createLinearGradient(0, 0, 0, 34);
  g.addColorStop(0, '#ffb27a'); g.addColorStop(1, '#ffe3c0');
  ctx.fillStyle = g; ctx.fillRect(0, 0, FW, 34);
  rect(ctx, 0, 26, FW, 8, '#6b4329'); for (let x = 0; x < FW; x += 10) rect(ctx, x, 26, 1, 8, '#5a3a22');
  for (let x = 8; x < FW; x += 40) rect(ctx, x, 34, 3, FH - 34, '#4a2e1c');
  for (let i = 0; i < FRENZY_LANES; i++) rect(ctx, 0, LANE_TOP + i * LANE_H - 6 + (i ? 0 : 0), FW, LANE_H, ['#4a80bb', '#3f72aa', '#356497', '#2b5685'][i]);
  rect(ctx, 0, 34, FW, 6, '#5d93c9');
  for (let i = 0; i < 14; i++) rect(ctx, Math.floor((i * 23 + t * 0.012) % FW), 36 + (i % 3) * 30, 5, 1, 'rgba(216,236,255,0.45)');
  // the line and hook
  const hx = Math.round((HOOK_X / 100) * FW);
  const hy = laneY(s?.lane ?? 1);
  rect(ctx, hx, 20, 1, hy - 20, '#fff3e6');
  rect(ctx, hx - 1, hy - 1, 3, 1, '#cfc6e3'); rect(ctx, hx + 1, hy, 1, 3, '#cfc6e3'); rect(ctx, hx - 1, hy + 3, 3, 1, '#cfc6e3');
  pixelEllipse(ctx, hx, 20, 3, 2, '#e0475c'); // the float
  // the catch window
  ctx.globalAlpha = 0.18; rect(ctx, hx - Math.round(0.07 * FW), hy - 6, Math.round(0.14 * FW), 12, '#fff3c4'); ctx.globalAlpha = 1;
  // the fisher cat on the pier
  rect(ctx, hx - 14, 18, 8, 8, '#ff8a35'); rect(ctx, hx - 12, 13, 6, 5, '#ff8a35'); rect(ctx, hx - 12, 12, 1, 1, '#ff8a35'); rect(ctx, hx - 7, 12, 1, 1, '#ff8a35'); rect(ctx, hx - 8, 15, 1, 1, '#2a1d2f');
  rect(ctx, hx - 6, 14, 7, 1, '#6b4329');
  for (const f of s?.fish ?? []) drawFish(ctx, f, t);
  if (flash > 0) { ctx.globalAlpha = flash; rect(ctx, 0, 0, FW, FH, '#ffffff'); ctx.globalAlpha = 1; }
}
function drawFish(ctx: CanvasRenderingContext2D, f: FrenzyFish, t: number) {
  const x = Math.round((f.x / 100) * FW), y = laneY(f.lane) + Math.round(Math.sin(t / 200 + f.id) * 1);
  const d = f.v > 0 ? 1 : -1;
  if (f.kind === 'boot') { rect(ctx, x - 4, y - 4, 5, 6, '#5a3a22'); rect(ctx, x - 4, y + 1, 9, 3, '#5a3a22'); rect(ctx, x - 3, y - 3, 3, 1, '#7a512f'); return; }
  const [body, fin, len] = f.kind === 'golden' ? ['#ffd36b', '#ff8a35', 7] : f.kind === 'koi' ? ['#fff3e6', '#e0475c', 8] : f.kind === 'sardine' ? ['#cfd8ee', '#8796b8', 6] : ['#9cc3ff', '#5d7fc0', 4];
  pixelEllipse(ctx, x, y, len as number, 2, body as string);
  rect(ctx, x - d * ((len as number) + 2), y - 2, 2, 5, fin as string);
  rect(ctx, x + d * ((len as number) - 2), y - 1, 1, 1, '#2a1d2f');
  if (f.kind === 'koi') rect(ctx, x - 2, y - 1, 3, 2, '#e0475c');
  if (f.kind === 'golden' && Math.floor(t / 150) % 2) rect(ctx, x, y - 4, 1, 1, '#ffffff');
}

export function FishFrenzyPanel({ open, save, update, notify, onClose }: { open: boolean; save: WorldSave; update: Update; notify: Notify; onClose: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const ref = useRef<FrenzyState | null>(null);
  const [st, setSt] = useState<FrenzyState | null>(null);
  const flash = useRef(0);
  const finished = useRef(false);
  const lastHud = useRef(0);
  const set = (n: FrenzyState | null, hud = true) => { ref.current = n; if (hud) setSt(n); };
  useEffect(() => { if (!open) { set(null); finished.current = false; } }, [open]);
  const finish = (s: FrenzyState) => {
    if (finished.current) return;
    finished.current = true;
    let earned = 0, isNew = false;
    update((sv) => {
      const ea = earnArcade(sv, frenzyTokens(s.score), today());
      const rr = setRecord(ea.save, 'fish-frenzy', s.score);
      earned = ea.earned; isNew = rr.isNew;
      return s.score >= 80 ? unlock(rr.save, 'frenzy-fisher', Date.now()).save : rr.save;
    });
    cue(s.score >= 50 ? 'victory' : 'join');
    notify(`Fish Frenzy: ${s.score} points, ${s.caught} fish${isNew ? ' — new personal best!' : ''}${earned ? ` (+${earned} tokens)` : ''}`, 'success');
  };
  const draw = (now: number) => {
    const ctx = canvas.current?.getContext('2d');
    if (ctx) drawFrenzy(ctx, ref.current, reducedMotion() ? 0 : now, flash.current);
  };
  useLoop(open, (dt, now) => {
    const cur = ref.current;
    if (cur && !cur.over) {
      const n = tickFrenzy(cur, dt, Math.random);
      const hud = now - lastHud.current > 200 || n.over;
      if (hud) lastHud.current = now;
      set(n, hud);
      if (n.over) finish(n);
    }
    flash.current = Math.max(0, flash.current - dt / 300);
    draw(now);
  });
  const act = (fn: (s: FrenzyState) => FrenzyState) => {
    const cur = ref.current;
    if (!cur || cur.over) return;
    const n = fn(cur);
    if (n.last?.kind === 'catch') { padTone(n.last.fish === 'golden' ? 1046 : 523 + n.last.combo * 40, 120); if (n.last.fish === 'golden') flash.current = 0.5; }
    if (n.last?.kind === 'boot') cue('nope');
    if (n.last?.kind === 'miss') cue('tap');
    set(n);
    if (n.over) finish(n);
  };
  useKeys(open, (e) => {
    if (e.code === 'ArrowUp' || e.code === 'KeyW') { e.preventDefault(); act((s) => moveHook(s, -1)); }
    if (e.code === 'ArrowDown' || e.code === 'KeyS') { e.preventDefault(); act((s) => moveHook(s, 1)); }
    if (e.code === 'Space') { e.preventDefault(); act(snap); }
  });
  if (!open) return null;
  const left = st ? Math.max(0, Math.ceil((st.limit - st.t) / 1000)) : 60;
  return (
    <Modal open title="Fish Frenzy" onClose={onClose} className="pv-modal pv-modal--blue pv-frenzy">
      <div>
        <p className="pv-note">Move the hook between lanes (↑ ↓ or tap a lane) and SNAP (Space) when a fish swims through the glow. Catches in a row multiply your points. Golden fish are rare; old boots cost 5 seconds. Best: {save.records['fish-frenzy'] ?? 0}.</p>
        <div className="pv-frenzy__hud" aria-live="polite"><span>Time {left}s</span><span>{st?.score ?? 0} pts</span><span>Combo ×{comboMultiplier(st?.combo ?? 0)}</span><span>{st?.caught ?? 0} fish</span></div>
        <canvas ref={canvas} width={FW} height={FH} className="pv-frenzy__canvas" aria-label="The water under the pier"
          onPointerDown={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const y = ((e.clientY - r.top) / r.height) * FH;
            const lane = Math.floor((y - (LANE_TOP - 6)) / LANE_H);
            if (lane >= 0 && lane < FRENZY_LANES) act((s) => setHookLane(s, lane));
          }} />
        <div className="modal__actions">
          {st && !st.over && <><Button variant="ghost" onClick={() => act((s) => moveHook(s, -1))}>▲</Button><Button variant="primary" onClick={() => act(snap)}>Snap!</Button><Button variant="ghost" onClick={() => act((s) => moveHook(s, 1))}>▼</Button></>}
          {(!st || st.over) && <Button variant="primary" onClick={() => { finished.current = false; set(newFrenzy()); cue('tap'); }}>{st ? 'Play again' : 'Start'}</Button>}
          <Button variant="ghost" onClick={onClose}>Leave the cabinet</Button>
        </div>
        {st?.over && <p className="pv-note" aria-live="polite">Time! {st.caught} fish, best combo {st.bestCombo}, {st.golden} golden.</p>}
      </div>
    </Modal>
  );
}

// =================================================================================================
// The Bijou cinema
// =================================================================================================
export function CinemaPanel({ open, save, update, notify, onClose, films, partnerOnline, onWatched }: {
  open: boolean; save: WorldSave; update: Update; notify: Notify; onClose: () => void; films: readonly Film[]; partnerOnline: boolean; onWatched?: (f: Film) => void;
}) {
  const [film, setFilm] = useState<Film | null>(null);
  const [startAt, setStartAt] = useState(0);
  const [caption, setCaption] = useState('');
  const [ended, setEnded] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const credited = useRef(false);
  useEffect(() => { if (!open) { setFilm(null); setEnded(false); } }, [open]);
  const buy = (f: Film) => {
    let ok = false, text = '';
    update((sv) => { const r = spend(sv, TICKET_PRICE, `A ticket for “${f.title}”`); ok = r.ok; text = r.ok ? '' : r.text; return r.ok ? r.save : sv; });
    if (!ok) { cue('nope'); notify(text || 'Not enough paw tokens.', 'warn'); return; }
    cue('pop');
    credited.current = false;
    setFilm(f); setEnded(false); setStartAt(performance.now()); setCaption(f.scenes[0].caption);
  };
  const credit = (f: Film) => {
    if (credited.current) return;
    credited.current = true;
    update((sv) => {
      const key = `film:${f.id}`;
      let n = sv.claims.includes(key) ? sv : { ...sv, claims: [...sv.claims, key] };
      if (!sv.claims.includes(key)) n = recordMemory(n, { id: `film-${f.id}`, kind: 'city', title: `At the Bijou: ${f.title}`, detail: f.blurb, at: Date.now(), place: 'The Bijou', withPartner: partnerOnline });
      const seen = FILMS.filter((x) => n.claims.includes(`film:${x.id}`)).length;
      return seen >= FILMS.length ? unlock(n, 'film-buff', Date.now()).save : n;
    });
    onWatched?.(f);
  };
  useLoop(open && !!film && !ended, (_dt, now) => {
    if (!film) return;
    const ms = now - startAt;
    const at = filmAt(film, ms);
    const ctx = canvas.current?.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | null | undefined;
    if (ctx) drawFilmFrame(ctx, at.scene, at.k, ms / 1000, sceneFade(at.sceneMs, at.scene.ms), reducedMotion());
    if (at.scene.caption !== caption) setCaption(at.scene.caption);
    if (at.done || ms >= filmLength(film)) { setEnded(true); credit(film); }
  });
  if (!open) return null;
  return (
    <Modal open title="The Bijou" onClose={onClose} className="pv-modal pv-modal--gold pv-cinema">
      {!film && (
        <>
          <p className="pv-note">Tonight’s pictures. A ticket is {TICKET_PRICE} paw token{TICKET_PRICE === 1 ? '' : 's'}.{partnerOnline ? ' Your partner can watch from the next seat.' : ''} You have <PawToken /> {save.tokens}.</p>
          <ul className="pv-shop__list">
            {films.map((f) => (
              <li key={f.id} className="pv-shop__row">
                <span><strong>{f.title}</strong>{save.claims.includes(`film:${f.id}`) && <small> · seen</small>}<br /><small>{f.blurb} ({Math.round(filmLength(f) / 1000)}s)</small></span>
                <button type="button" className="pill-btn" disabled={save.tokens < TICKET_PRICE} onClick={() => buy(f)}>Watch · {TICKET_PRICE} <PawToken /></button>
              </li>
            ))}
          </ul>
          {films.length < FILMS.length && <p className="pv-note">More pictures arrive as stories around the world are finished.</p>}
        </>
      )}
      {film && (
        <div className="pv-cinema__hall">
          <div className="pv-cinema__screen"><canvas ref={canvas} width={FILM_W} height={FILM_H} aria-label={`${film.title}: ${caption}`} /></div>
          <p className="pv-cinema__caption" aria-live="polite">{ended ? `“${film.title}” — the end. The audience purrs.` : caption}</p>
        </div>
      )}
      <div className="modal__actions">
        {film && ended && <Button variant="primary" onClick={() => setFilm(null)}>Back to the programme</Button>}
        {film && !ended && <Button variant="ghost" onClick={() => { setEnded(true); credit(film); }}>Skip to the end</Button>}
        <Button variant="ghost" onClick={onClose}>Leave the cinema</Button>
      </div>
    </Modal>
  );
}

// =================================================================================================
// Karaoke
// =================================================================================================
export function KaraokePanel({ open, save, update, notify, onClose, voice, view }: { open: boolean; save: WorldSave; update: Update; notify: Notify; onClose: () => void; voice: (note: number) => void; view?: AdvView }) {
  const [song, setSong] = useState<KaraokeSong | null>(null);
  const [run, setRun] = useState<KaraokeRun | null>(null);
  const [ms, setMs] = useState(0);
  const [done, setDone] = useState(false);
  const startRef = useRef(0);
  const runRef = useRef<KaraokeRun | null>(null);
  const finished = useRef(false);
  const [pop, setPop] = useState<{ grade: string; at: number } | null>(null);
  // the band: backing volume and vocals-only are saved settings; sound itself follows the game's own sound toggle
  const [prefs, setPrefs] = useState<KaraokeAudioPrefs>(() => karaokePrefs().load());
  const [soundOn, setSoundOn] = useState(() => isSoundEnabled());
  const band = useRef<BandHandle | null>(null);
  useEffect(() => subscribeSound((on) => setSoundOn(on)), []);
  const stopBand = useCallback(() => { band.current?.stop(); band.current = null; }, []);
  // stop the band cleanly whenever the panel closes, the song ends, another song is picked or the component goes away
  useEffect(() => { if (!open || !song || done) stopBand(); }, [open, song, done, stopBand]);
  useEffect(() => stopBand, [stopBand]);
  useEffect(() => { if (!open) { setSong(null); setRun(null); setDone(false); } }, [open]);
  const changePrefs = (p: Partial<KaraokeAudioPrefs>) => {
    const next = { ...prefs, ...p };
    setPrefs(next); karaokePrefs().save(next);
    if (p.backing !== undefined) band.current?.setVolume(next.backing);
    if (p.vocalsOnly !== undefined) band.current?.setVocalsOnly(next.vocalsOnly);
  };
  const start = (s: KaraokeSong) => {
    stopBand();
    const r = newRun(s);
    runRef.current = r; setRun(r); setSong(s); setDone(false); finished.current = false;
    const b = startBand(s, prefs);
    band.current = b;
    startRef.current = performance.now() + (b?.leadMs ?? 0); setMs(-(b?.leadMs ?? 0)); cue('tap');
  };
  const finish = (s: KaraokeSong, r: KaraokeRun) => {
    if (finished.current) return;
    finished.current = true;
    const st = stars(r);
    let isNew = false;
    update((sv) => {
      const rr = setRecord(sv, `karaoke:${s.id}`, r.score);
      isNew = rr.isNew;
      return st >= 3 ? unlock(rr.save, 'karaoke-star', Date.now()).save : rr.save;
    });
    cue(st >= 2 ? 'victory' : 'join');
    notify(`“${s.title}”: ${'★'.repeat(st)}${'☆'.repeat(3 - st)} · ${Math.round(accuracy(r) * 100)}% on the beat${isNew ? ' — new best!' : ''}`, 'success');
  };
  useLoop(open && !!song && !done, (_dt, now) => {
    if (!song || !runRef.current) return;
    const t = now - startRef.current;
    const r = expire(song, runRef.current, t);
    if (r !== runRef.current) { runRef.current = r; setRun(r); }
    setMs(t);
    if (t >= songLengthMs(song)) { setDone(true); finish(song, r); }
  });
  const sing = () => {
    if (!song || !runRef.current || done) return;
    const t = performance.now() - startRef.current;
    const res = tap(song, runRef.current, t);
    // a tap with no word nearby, or a missed word, changes nothing: the song never stops or sours
    if (res.word === null) return;
    runRef.current = res.run; setRun(res.run);
    const w = allWords(song)[res.word];
    voice(w.note);
    if (res.grade === 'perfect' || res.grade === 'good') band.current?.accent(res.grade, w.note);
    setPop({ grade: res.grade!, at: performance.now() });
  };
  useKeys(open && !!song && !done, (e) => { if (e.code === 'Space') { e.preventDefault(); sing(); } });
  if (!open) return null;
  const li = song ? currentLine(song, ms) : 0;
  const b = song ? beatMs(song) : 600;
  const controls = (
    <div className="pv-karaoke__band" role="group" aria-label="The band">
      <label className="pv-karaoke__vol">Band volume
        <input type="range" min={0} max={100} step={5} value={Math.round(prefs.backing * 100)} onChange={(e) => changePrefs({ backing: Number(e.target.value) / 100 })} aria-label="Band volume" />
      </label>
      <label className="pv-karaoke__vocals"><input type="checkbox" checked={prefs.vocalsOnly} onChange={(e) => changePrefs({ vocalsOnly: e.target.checked })} /> Vocals only (just the count-in and you)</label>
      {!soundOn && <p className="pv-note" role="status">Sound is off. Turn it on (the speaker button) to hear the band and your cat.</p>}
    </div>
  );
  return (
    <Modal open title="Karaoke at The Purring Cup" onClose={() => { stopBand(); onClose(); }} className="pv-modal pv-modal--lavender pv-karaoke">
      {!song && (
        <>
          <p className="pv-note">Pick a song. The words light up in time — tap Space (or the paw) on each word and your cat sings it. Accurate taps add a little sparkle to the band; missed ones never stop the song.</p>
          {controls}
          <ul className="pv-shop__list">
            {SONGS.map((s) => {
              const ok = songUnlocked(s, view);
              return (
                <li key={s.id} className={`pv-shop__row ${ok ? '' : 'is-locked'}`}>
                  <span><strong>{s.title}</strong>{s.genre && <span className="pv-karaoke__genre"> · {s.genre}</span>}<br />
                    <small>{ok ? `${s.blurb ?? s.by} · ${s.bpm} bpm · best ${save.records[`karaoke:${s.id}`] ?? 0}` : `🔒 ${s.unlock?.text ?? 'Locked'}`}</small></span>
                  <button type="button" className="pill-btn" disabled={!ok} onClick={() => start(s)} aria-label={ok ? `Sing ${s.title}` : `${s.title} is locked`}>{ok ? 'Sing' : 'Locked'}</button>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {song && run && (
        <div className="pv-karaoke__stage">
          <div className="pv-karaoke__lyrics" aria-live="off">
            {song && inBreakAt(song, ms) && <p className="pv-karaoke__break" role="status">♪ instrumental ♪</p>}
            {[li, li + 1].filter((i) => i < song.lines.length).map((i) => {
              let base = 0;
              for (let j = 0; j < i; j++) base += song.lines[j].length;
              const part = song.parts?.[i];
              return (
                <p key={i} className={`pv-karaoke__line ${i === li ? 'is-current' : 'is-next'} ${part ? `is-part-${part}` : ''}`}>
                  {song.duet && part && <small className="pv-karaoke__part">{part === 'both' ? 'together' : `part ${part}`} </small>}
                  {song.lines[i].map((w, j) => {
                    const idx = base + j;
                    const g = run.grades[idx];
                    const lead = w.beat * b - ms;
                    const near = !g && lead < b && lead > -200;
                    return <span key={j} className={`pv-karaoke__word ${w.cont ? 'is-cont' : ''} ${g ? `is-${g}` : ''} ${near ? 'is-now' : ''}`} style={near ? { ['--k' as string]: String(Math.max(0, Math.min(1, 1 - lead / b))) } : undefined}>{w.text}</span>;
                  })}
                </p>
              );
            })}
          </div>
          <div className="pv-karaoke__meter"><span style={{ width: `${Math.max(0, Math.min(100, (ms / songLengthMs(song)) * 100))}%` }} /></div>
          <button type="button" className="pv-karaoke__paw" onClick={sing} disabled={done} aria-label="Sing this word">
            <svg viewBox="0 0 32 32" width="44" height="44" aria-hidden="true"><ellipse cx="16" cy="21" rx="7" ry="6" fill="currentColor" /><circle cx="8" cy="12" r="3" fill="currentColor" /><circle cx="13" cy="8" r="3" fill="currentColor" /><circle cx="19" cy="8" r="3" fill="currentColor" /><circle cx="24" cy="12" r="3" fill="currentColor" /></svg>
          </button>
          <p className="pv-note" aria-live="polite">
            {ms < song.lines[0][0].beat * b ? `Get ready… ${Math.max(1, Math.ceil((song.lines[0][0].beat * b - Math.max(0, ms)) / b))}`
              : pop && performance.now() - pop.at < 500 ? (pop.grade === 'perfect' ? 'Purrfect!' : 'Nice!') : `Streak ${run.streak} · ${run.score} pts`}
            {done && ` — ${'★'.repeat(stars(run))}${'☆'.repeat(3 - stars(run))} ${Math.round(accuracy(run) * 100)}% on the beat`}
          </p>
          {controls}
        </div>
      )}
      <div className="modal__actions">
        {song && done && <Button variant="primary" onClick={() => start(song)}>Sing it again</Button>}
        {song && <Button variant="ghost" onClick={() => { stopBand(); setSong(null); setRun(null); }}>Song list</Button>}
        <Button variant="ghost" onClick={() => { stopBand(); onClose(); }}>Leave the stage</Button>
      </div>
    </Modal>
  );
}
