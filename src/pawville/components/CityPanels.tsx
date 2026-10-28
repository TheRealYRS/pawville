/**
 * Milestone 7 Whiskerwick UI: shops, the station ticket machine, vending machines, the claw
 * machine, Meow Melody and the arcade score board. Every purchase goes through city/economy.ts
 * (validated, atomic, never negative); every prize lands in the existing bag (worldSave).
 */
import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { buy, earnArcade, sell, setRecord, shopById, spend, bumpRecord, type ShopId } from '../city/economy.ts';
import { CLAW_COST, CLAW_PLUSHES, PADS, PAD_FREQ, clawDrop, clawPosition, melodyPress, melodyScore, melodyShown, melodyTokens, newMelody, VENDING_PRODUCTS, type ClawOutcome, type MelodyState } from '../city/arcadeGames.ts';
import { padTone } from '../city/voices.ts';
import { addItem, ITEM_NAMES, unlock, type ItemId, type WorldSave } from '../worldSave.ts';
import { cue } from '../sound';
import { regionInfo } from '../adventure/content.ts';
import { PixelCat } from './PixelCat';

function FishPlush() {
  return <svg viewBox="0 0 24 16" width="34" height="22" aria-hidden="true"><path d="M2 8c4-6 12-6 16 0-4 6-12 6-16 0z" fill="#7ed6f6" stroke="#2a5389" /><path d="M18 8l5-4v8z" fill="#7ed6f6" stroke="#2a5389" /><circle cx="7" cy="7" r="1.2" fill="#2a1d2f" /></svg>;
}
import type { RegionId } from '../adventure/state.ts';

type Update = (fn: (s: WorldSave) => WorldSave) => void;
type Notify = (msg: string, tone?: 'info' | 'success' | 'warn') => void;
const today = () => new Date().toISOString().slice(0, 10);

/** A little paw-token coin (SVG, so it renders the same everywhere — no emoji fonts needed). */
export function PawToken({ size = 14 }: { size?: number }) {
  return (
    <svg className="pv-token-icon" viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      <circle cx="8" cy="8" r="7.5" fill="#ffc94a" stroke="#b5831e" />
      <ellipse cx="8" cy="10" rx="2.6" ry="2.1" fill="#b5831e" />
      <circle cx="4.9" cy="6.6" r="1.2" fill="#b5831e" /><circle cx="7" cy="4.8" r="1.2" fill="#b5831e" /><circle cx="9.2" cy="4.8" r="1.2" fill="#b5831e" /><circle cx="11.2" cy="6.6" r="1.2" fill="#b5831e" />
    </svg>
  );
}
export function TokenBadge({ tokens }: { tokens: number }) {
  return <span className="pv-tokens" aria-label={`${tokens} paw tokens`}><PawToken /> {tokens}</span>;
}

// ---- shops -------------------------------------------------------------------------------------
export function ShopPanel({ shop, save, update, onClose }: { shop: ShopId | null; save: WorldSave; update: Update; onClose: () => void }) {
  const def = shop ? shopById(shop) : undefined;
  const [msg, setMsg] = useState('');
  const lockUntil = useRef(0);
  useEffect(() => setMsg(''), [shop]);
  if (!def) return null;
  // Always computed from the LATEST save (update() is synchronous), so double taps can't double-spend.
  const run = (fn: (s: WorldSave) => ReturnType<typeof buy>) => {
    const now = performance.now();
    if (now < lockUntil.current) return; // ignore an accidental double click
    lockUntil.current = now + 500;
    let res: ReturnType<typeof buy> | null = null;
    update((s) => { res = fn(s); return res.ok ? res.save : s; });
    const r = res as ReturnType<typeof buy> | null;
    if (!r) return;
    setMsg(r.text);
    cue(r.ok ? 'pop' : 'nope');
  };
  const sellable = def.buys ? (Object.entries(def.buys) as [ItemId, number][]).filter(([id]) => (save.inventory[id] ?? 0) > 0) : [];
  return (
    <Modal open title={def.name} onClose={onClose} className="pv-modal pv-modal--gold pv-shop">
      <p className="pv-note">{def.keeper}: “{def.blurb}” <TokenBadge tokens={save.tokens} /></p>
      <h3 className="pv-shop__h">For sale</h3>
      <ul className="pv-shop__list">
        {def.sells.map((x) => (
          <li key={x.item} className="pv-shop__row">
            <span>{ITEM_NAMES[x.item]} <small>(you have {save.inventory[x.item] ?? 0})</small></span>
            <button type="button" className="pill-btn" disabled={save.tokens < x.price} onClick={() => run((s) => buy(s, def.id, x.item))}>Buy · {x.price} <PawToken /></button>
          </li>
        ))}
      </ul>
      {def.buys && (
        <>
          <h3 className="pv-shop__h">Sell your finds</h3>
          {sellable.length === 0 && <p className="pv-note">Nothing to sell yet. Fish, shells, sea glass, mushrooms, pine cones, frost crystals and apples are all welcome.</p>}
          <ul className="pv-shop__list">
            {sellable.map(([id, price]) => (
              <li key={id} className="pv-shop__row">
                <span>{ITEM_NAMES[id]} ×{save.inventory[id]}</span>
                <button type="button" className="pill-btn" onClick={() => run((s) => sell(s, def.id, id))}>Sell · +{price} <PawToken /></button>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="pv-note" aria-live="polite">{msg}</p>
      <div className="modal__actions"><Button variant="ghost" onClick={onClose}>Leave the shop</Button></div>
    </Modal>
  );
}

// ---- ticket machine ------------------------------------------------------------------------------
export function TicketPanel({ open, onClose, options, onGo }: { open: boolean; onClose: () => void; options: { region: RegionId; ok: boolean; why: string }[]; onGo: (r: RegionId) => void }) {
  if (!open) return null;
  return (
    <Modal open title="Whiskerwick Station — tickets" onClose={onClose} className="pv-modal pv-modal--blue">
      <p className="pv-note">Tickets are free. The screen flickers, then shows today’s routes:</p>
      <ul className="pv-shop__list">
        {options.map((o) => (
          <li key={o.region} className="pv-shop__row">
            <span>{regionInfo(o.region).name}{!o.ok && <small> — {o.why}</small>}</span>
            <button type="button" className="pill-btn" disabled={!o.ok} onClick={() => onGo(o.region)}>{o.ok ? 'Print ticket' : 'Closed'}</button>
          </li>
        ))}
      </ul>
      <div className="modal__actions"><Button variant="ghost" onClick={onClose}>Not now</Button></div>
    </Modal>
  );
}

// ---- vending -----------------------------------------------------------------------------------
export function VendingPanel({ open, save, update, onClose }: { open: boolean; save: WorldSave; update: Update; onClose: () => void }) {
  const [drop, setDrop] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const busy = useRef(false);
  useEffect(() => { if (!open) { setDrop(null); setMsg(''); busy.current = false; } }, [open]);
  if (!open) return null;
  const choose = (p: (typeof VENDING_PRODUCTS)[number]) => {
    if (busy.current) return; // one purchase at a time (no double-dispense on double taps)
    let fail = '';
    update((s) => { const r = spend(s, p.price, p.label); if (!r.ok) { fail = r.text; return s; } return addItem(r.save, p.item as ItemId, 1); });
    if (fail) { setMsg(fail); cue('nope'); return; }
    busy.current = true;
    setDrop(p.label);
    setMsg('Whirr… clunk!');
    cue('tap');
    window.setTimeout(() => { busy.current = false; setMsg(`${p.label} dropped into the tray — it’s in your bag.`); cue('pop'); }, 700);
  };
  return (
    <Modal open title="Snack machine" onClose={onClose} className="pv-modal pv-vending">
      <p className="pv-note"><TokenBadge tokens={save.tokens} /></p>
      <div className="pv-vending__grid">
        {VENDING_PRODUCTS.map((p) => (
          <button key={p.item} type="button" className="pv-vending__slot" onClick={() => choose(p)} disabled={save.tokens < p.price}>
            <span>{p.label}</span><small>{p.price} <PawToken size={12} /></small>
          </button>
        ))}
      </div>
      <div className={`pv-vending__tray ${drop ? 'is-full' : ''}`} aria-hidden="true">{drop ? <span key={msg} className="pv-vending__drop">▣</span> : null}</div>
      <p className="pv-note" aria-live="polite">{msg}</p>
      <div className="modal__actions"><Button variant="ghost" onClick={onClose}>Done</Button></div>
    </Modal>
  );
}

// ---- claw machine ------------------------------------------------------------------------------
export function ClawPanel({ open, save, update, notify, onClose, onWin }: { open: boolean; save: WorldSave; update: Update; notify: Notify; onClose: () => void; onWin: (item: ItemId) => void }) {
  const [phase, setPhase] = useState<'idle' | 'moving' | 'dropping' | 'done'>('idle');
  const [x, setX] = useState(50);
  const [out, setOut] = useState<ClawOutcome | null>(null);
  const t0 = useRef(0);
  const raf = useRef(0);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  useEffect(() => { if (!open) { cancelAnimationFrame(raf.current); setPhase('idle'); setOut(null); } }, [open]);
  if (!open) return null;
  const insert = () => {
    if (phase === 'moving' || phase === 'dropping') return;
    let fail = '';
    update((s) => { const r = spend(s, CLAW_COST, 'The claw machine'); if (!r.ok) { fail = r.text; return s; } return r.save; });
    if (fail) { notify(fail, 'warn'); cue('nope'); return; }
    cue('tap');
    setOut(null);
    setPhase('moving');
    t0.current = performance.now();
    const tick = (now: number) => { setX(clawPosition(now - t0.current)); raf.current = requestAnimationFrame(tick); };
    raf.current = requestAnimationFrame(tick);
  };
  const drop = () => {
    if (phase !== 'moving') return;
    cancelAnimationFrame(raf.current);
    const at = clawPosition(performance.now() - t0.current);
    setX(at);
    setPhase('dropping');
    const o = clawDrop(at, Math.random);
    window.setTimeout(() => {
      setOut(o);
      setPhase('done');
      if (o.result === 'win') {
        update((s) => { let n = bumpRecord(addItem(s, o.item, 1), 'claw-wins'); n = unlock(n, 'claw-champ', Date.now()).save; return n; });
        onWin(o.item);
        cue('join');
      } else cue('nope');
    }, 900);
  };
  return (
    <Modal open title="Claw machine" onClose={onClose} className="pv-modal pv-claw">
      <p className="pv-note">1 paw token per try. Centre the claw over a plush and drop. Dead centre always wins; near the edge it may wobble loose. <TokenBadge tokens={save.tokens} /></p>
      <div className="pv-claw__box" role="img" aria-label={`Claw at ${Math.round(x)} percent`}>
        <div className={`pv-claw__claw ${phase === 'dropping' ? 'is-dropping' : ''} ${out?.result === 'win' ? 'is-holding' : ''}`} style={{ left: `${x}%` }}>▼</div>
        {CLAW_PLUSHES.map((p) => <span key={p.item} className={`pv-claw__plush pv-claw__plush--${p.item}`} style={{ left: `${p.x}%` }}>{p.item === 'plush-fish' ? <FishPlush /> : <PixelCat coat={p.item === 'plush-tangerine' ? 'tangerine' : 'midnight'} facing="down" scale={2} />}</span>)}
      </div>
      <p className="pv-note" aria-live="polite">
        {phase === 'idle' && 'Insert a token to start.'}
        {phase === 'moving' && 'The claw is sweeping… press Drop!'}
        {phase === 'dropping' && 'Down it goes…'}
        {phase === 'done' && out && (out.result === 'win' ? `Got it! ${ITEM_NAMES[out.item]} is in your bag.` : out.result === 'slip' ? 'It grabbed… wobbled… and slipped. So close!' : 'The claw closes on nothing. Try lining it up!')}
      </p>
      <div className="modal__actions">
        {phase !== 'moving' && phase !== 'dropping' && <Button variant="primary" onClick={insert} disabled={save.tokens < CLAW_COST}>Insert 1 token</Button>}
        {phase === 'moving' && <Button variant="primary" onClick={drop}>Drop!</Button>}
        <Button variant="ghost" onClick={onClose}>Step away</Button>
      </div>
    </Modal>
  );
}

// ---- Meow Melody -------------------------------------------------------------------------------
const PAD_NAMES = ['Tangerine pad', 'Midnight pad', 'Mini pad', 'Magic pad'];
export function MelodyPanel({ open, save, update, notify, onClose, onRound }: { open: boolean; save: WorldSave; update: Update; notify: Notify; onClose: () => void; onRound: (round: number) => void }) {
  const [st, setStState] = useState<MelodyState | null>(null);
  // The ref is the source of truth: fast taps arrive before React re-renders, and must be judged
  // against the LATEST state (otherwise a quick 4th tap could be checked against a stale round).
  const stRef = useRef<MelodyState | null>(null);
  const setSt = (v: MelodyState | null | ((p: MelodyState | null) => MelodyState | null)) => {
    const next = typeof v === 'function' ? v(stRef.current) : v;
    stRef.current = next;
    setStState(next);
  };
  const [lit, setLit] = useState<number | null>(null);
  const timers = useRef<number[]>([]);
  const clear = () => { timers.current.forEach((t) => window.clearTimeout(t)); timers.current = []; };
  useEffect(() => () => clear(), []);
  useEffect(() => { if (!open) { clear(); setSt(null); setLit(null); } }, [open]);
  // play the pattern whenever we enter the 'show' phase
  useEffect(() => {
    if (!st || st.phase !== 'show') return;
    clear();
    const step = Math.max(320, 620 - st.round * 25);
    st.seq.forEach((pad, i) => {
      timers.current.push(window.setTimeout(() => { setLit(pad); padTone(PAD_FREQ[pad], step * 0.6); }, 500 + i * step));
      timers.current.push(window.setTimeout(() => setLit(null), 500 + i * step + step * 0.6));
    });
    timers.current.push(window.setTimeout(() => setSt((s) => (s ? melodyShown(s) : s)), 500 + st.seq.length * step));
  }, [st?.phase, st?.round, st?.secondChance]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return null;
  const start = () => { clear(); setSt(newMelody(Math.random)); cue('tap'); };
  const press = (pad: number) => {
    const st = stRef.current;
    if (!st || st.phase !== 'input') return;
    padTone(PAD_FREQ[pad]);
    setLit(pad);
    timers.current.push(window.setTimeout(() => setLit(null), 160));
    const next = melodyPress(st, pad, Math.random);
    setSt(next);
    if (next.last === 'round') onRound(next.round - 1);
    if (next.phase === 'over') {
      const rounds = melodyScore(next);
      let e = { earned: 0 };
      let r = { isNew: false };
      update((s) => {
        const ea = earnArcade(s, melodyTokens(rounds), today());
        const rr = setRecord(ea.save, 'meow-melody', rounds);
        e = ea; r = rr;
        return rounds >= 6 ? unlock(rr.save, 'melody-maker', Date.now()).save : rr.save;
      });
      notify(`Meow Melody: ${rounds} round${rounds === 1 ? '' : 's'}${r.isNew ? ' — new personal best!' : ''}${e.earned ? ` (+${e.earned} tokens)` : ''}`, 'success');
    }
  };
  const keyPad: Record<string, number> = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3, Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 };
  return (
    <Modal open title="Meow Melody" onClose={onClose} className="pv-modal pv-modal--blue pv-melody">
      <div onKeyDown={(e) => { const p = keyPad[e.code]; if (p !== undefined) { e.preventDefault(); press(p); } }}>
        <p className="pv-note">Watch the paw pads light up, then repeat the pattern. One second chance per game. Keys: 1–4 or arrows. Best: {save.records['meow-melody'] ?? 0} rounds.</p>
        <div className="pv-melody__pads" role="group" aria-label="Paw pads">
          {Array.from({ length: PADS }, (_, i) => (
            <button key={i} type="button" className={`pv-melody__pad pv-melody__pad--${i} ${lit === i ? 'is-lit' : ''}`} aria-label={PAD_NAMES[i]} disabled={!st || st.phase !== 'input'} onClick={() => press(i)}>
              <span aria-hidden="true">{['♪', '♫', '♩', '♬'][i]}</span>
            </button>
          ))}
        </div>
        <p className="pv-note" aria-live="polite">
          {!st && 'Press Start.'}
          {st?.phase === 'show' && (st.last === 'mistake' ? 'Oops! Second chance — watch again…' : `Round ${st.round}: watch…`)}
          {st?.phase === 'input' && `Your turn: ${st.pos}/${st.seq.length}`}
          {st?.phase === 'over' && `Game over — you cleared ${melodyScore(st)} round${melodyScore(st) === 1 ? '' : 's'}.`}
        </p>
        <div className="modal__actions">
          {(!st || st.phase === 'over') && <Button variant="primary" onClick={start}>{st ? 'Play again' : 'Start'}</Button>}
          <Button variant="ghost" onClick={onClose}>Leave the cabinet</Button>
        </div>
      </div>
    </Modal>
  );
}

// ---- score board -------------------------------------------------------------------------------
export function RecordsPanel({ open, save, onClose }: { open: boolean; save: WorldSave; onClose: () => void }) {
  if (!open) return null;
  return (
    <Modal open title="Arcade score board" onClose={onClose} className="pv-modal">
      <ul className="pv-shop__list">
        <li className="pv-shop__row"><span>Meow Melody — best rounds</span><strong>{save.records['meow-melody'] ?? 0}</strong></li>
        <li className="pv-shop__row"><span>Claw machine — plushies won</span><strong>{save.records['claw-wins'] ?? 0}</strong></li>
        <li className="pv-shop__row"><span>Cat Café Rush — most cats served</span><strong>{save.records['cafe-rush'] ?? 0}</strong></li>
        <li className="pv-shop__row"><span>Fish Frenzy — best score</span><strong>{save.records['fish-frenzy'] ?? 0}</strong></li>
        <li className="pv-shop__row"><span>Paw tokens</span><strong>{save.tokens}</strong></li>
      </ul>
      <p className="pv-note">Personal records (this device). Other cabinets keep their own scores inside each game.</p>
      <div className="modal__actions"><Button variant="ghost" onClick={onClose}>Close</Button></div>
    </Modal>
  );
}
