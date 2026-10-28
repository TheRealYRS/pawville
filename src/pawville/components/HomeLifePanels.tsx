/**
 * Milestone 8 home-life UI: the Hearth & Whisker furniture catalogue, the stove (cooking),
 * the dining table (eat / share) and the keepsake cabinet. Every action goes through the pure
 * modules (economy.ts, cooking.ts) inside a single synchronous save update, so double taps can't
 * double-spend, double-cook or duplicate anything.
 */
import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { buyFurniture } from '../city/economy.ts';
import { FOODS, RECIPES, canCook, cook, have, needLabel } from '../home/cooking.ts';
import { SHOP_FURNITURE, STYLE_NAMES, type FurnitureStyle } from '../home/decor.ts';
import { ACHIEVEMENTS, ITEM_NAMES, unlock, type ItemId, type WorldSave } from '../worldSave.ts';
import { cue } from '../sound';
import { DecorThumb } from './HomeRoom';
import { PawToken, TokenBadge } from './CityPanels';

type Update = (fn: (s: WorldSave) => WorldSave) => WorldSave | void;

export function FurnitureShopPanel({ open, save, update, onClose, focus }: { open: boolean; save: WorldSave; update: Update; onClose: () => void; focus?: FurnitureStyle | null }) {
  const [msg, setMsg] = useState('');
  const [style, setStyle] = useState<FurnitureStyle | 'all'>('all');
  // a brief lock after each purchase, so a double click / double tap can't buy twice by accident
  const lockUntil = useRef(0);
  useEffect(() => { if (open) { setMsg(''); setStyle(focus ?? 'all'); } }, [open, focus]);
  if (!open) return null;
  const items = SHOP_FURNITURE().filter((d) => style === 'all' || (d.source.kind === 'shop' && d.source.style === style));
  const buy = (id: string, price: number, name: string) => {
    const now = performance.now();
    if (now < lockUntil.current) return;
    lockUntil.current = now + 700;
    let text = '';
    let ok = false;
    update((s) => {
      const r = buyFurniture(s, id, price, name);
      text = r.text; ok = r.ok;
      return r.ok ? unlock(r.save, 'decorator', Date.now()).save : s;
    });
    setMsg(text);
    cue(ok ? 'pop' : 'nope');
  };
  return (
    <Modal open title="Hearth & Whisker — furniture" onClose={onClose} className="pv-modal pv-modal--gold pv-furnshop">
      <p className="pv-note">Hazel: “Everything is delivered to your home storage. Place it from <strong>Decorate</strong> at home — and move it as often as you like.” <TokenBadge tokens={save.tokens} /></p>
      <div className="pv-tabs" role="tablist" aria-label="Furniture styles">
        {(['all', ...Object.keys(STYLE_NAMES)] as (FurnitureStyle | 'all')[]).map((s) => (
          <button key={s} type="button" role="tab" aria-selected={style === s} className={`pv-tab ${style === s ? 'is-active' : ''}`} onClick={() => setStyle(s)}>{s === 'all' ? 'All' : STYLE_NAMES[s]}</button>
        ))}
      </div>
      <ul className="pv-furnshop__grid">
        {items.map((d) => {
          const price = d.source.kind === 'shop' ? d.source.price : 0;
          const owned = save.furniture?.[d.id] ?? 0;
          return (
            <li key={d.id} className="pv-furnshop__item">
              <DecorThumb id={d.id} />
              <strong>{d.name}</strong>
              <small>{d.source.kind === 'shop' ? STYLE_NAMES[d.source.style] : ''}{owned ? ` · you own ${owned}` : ''}</small>
              <button type="button" className="pill-btn" disabled={save.tokens < price} onClick={() => buy(d.id, price, d.name)}>Buy · {price} <PawToken /></button>
            </li>
          );
        })}
      </ul>
      <p className="pv-note" aria-live="polite">{msg}</p>
      <div className="modal__actions"><Button variant="ghost" onClick={onClose}>Leave the showroom</Button></div>
    </Modal>
  );
}

export function CookPanel({ open, save, update, onClose, notify }: { open: boolean; save: WorldSave; update: Update; onClose: () => void; notify: (m: string, t?: 'info' | 'success' | 'warn') => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const timer = useRef(0);
  useEffect(() => () => cancelAnimationFrame(timer.current), []);
  useEffect(() => { if (!open) { cancelAnimationFrame(timer.current); setBusy(null); setProgress(0); } }, [open]);
  if (!open) return null;
  const known = save.recipes ?? [];
  const start = (id: string) => {
    if (busy) return; // one dish at a time
    const r = RECIPES.find((x) => x.id === id)!;
    if (!canCook(save, r)) { cue('nope'); return; }
    setBusy(id);
    const t0 = performance.now();
    cue('tap');
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / r.ms);
      setProgress(k);
      if (k < 1) { timer.current = requestAnimationFrame(tick); return; }
      // ingredients are taken and the dish is added in ONE update, at the end (an interrupted cook uses nothing)
      let res: ReturnType<typeof cook> | null = null;
      update((s) => {
        const out = cook(s, id);
        res = out;
        if (!out.ok) return s;
        const n = out.save.recipes?.length ?? 0;
        return n >= 3 ? unlock(out.save, 'home-chef', Date.now()).save : out.save;
      });
      const done = res as ReturnType<typeof cook> | null;
      setBusy(null);
      setProgress(0);
      if (done?.ok) { cue('join'); notify(`${done.text}${done.first ? ' (new recipe!)' : ''}`, 'success'); } else { cue('nope'); notify(done?.text ?? 'Nothing happened.', 'warn'); }
    };
    timer.current = requestAnimationFrame(tick);
  };
  return (
    <Modal open title="Cottage stove — recipe book" onClose={onClose} className="pv-modal pv-modal--gold pv-cook">
      <p className="pv-note">Ingredients: flour and honey from the bakery, berries from the park, herbs from a herb planter, fish from any pier, apples from the trees. {known.length}/{RECIPES.length} recipes cooked.</p>
      <ul className="pv-shop__list">
        {RECIPES.map((r) => {
          const ok = canCook(save, r);
          return (
            <li key={r.id} className={`pv-shop__row pv-recipe ${busy === r.id ? 'is-cooking' : ''}`}>
              <div>
                <strong>{r.name}</strong>{known.includes(r.id) ? ' ✓' : ''}<br />
                <small>{r.blurb}</small>
                <div className="pv-recipe__needs">{r.needs.map((n, i) => <span key={i} className={have(save, n) >= n.n ? 'is-have' : 'is-missing'}>{needLabel(n)} ({have(save, n)})</span>)}</div>
                {busy === r.id && <div className="pv-recipe__bar" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${progress * 100}%` }} /></div>}
              </div>
              <button type="button" className="pill-btn" disabled={!ok || !!busy} onClick={() => start(r.id)}>{busy === r.id ? 'Cooking…' : 'Cook'}</button>
            </li>
          );
        })}
      </ul>
      <div className="modal__actions"><Button variant="ghost" onClick={onClose} disabled={!!busy}>Done</Button></div>
    </Modal>
  );
}

export function DinePanel({ open, save, update, onClose, partner, onEat }: { open: boolean; save: WorldSave; update: Update; onClose: () => void; partner: string | null; onEat: (item: ItemId, shared: boolean) => void }) {
  if (!open) return null;
  const foods = FOODS.filter((f) => (save.inventory[f] ?? 0) > 0);
  const go = (item: ItemId, shared: boolean) => {
    let ok = false;
    update((s) => { const n = (s.inventory[item] ?? 0); if (n < 1) return s; ok = true; return { ...s, inventory: { ...s.inventory, [item]: n - 1 } }; });
    if (ok) { cue('pop'); onEat(item, shared); }
  };
  return (
    <Modal open title="Set the table" onClose={onClose} className="pv-modal">
      {foods.length === 0 && <p className="pv-note">Nothing to eat yet. Cook something at the stove, or buy treats in Whiskerwick.</p>}
      <ul className="pv-shop__list">
        {foods.map((f) => (
          <li key={f} className="pv-shop__row">
            <span>{ITEM_NAMES[f]} ×{save.inventory[f]}</span>
            <span>
              <button type="button" className="pill-btn" onClick={() => go(f, false)}>Eat</button>{' '}
              {partner && <button type="button" className="pill-btn" onClick={() => go(f, true)}>Share with {partner}</button>}
            </span>
          </li>
        ))}
      </ul>
      <div className="modal__actions"><Button variant="ghost" onClick={onClose}>Done</Button></div>
    </Modal>
  );
}

export function KeepsakePanel({ open, save, onClose }: { open: boolean; save: WorldSave; onClose: () => void }) {
  if (!open) return null;
  const keep: ItemId[] = ['shell', 'sea-glass', 'star-shard', 'moon-pearl', 'frost-crystal', 'plush-tangerine', 'plush-midnight', 'plush-fish', 'old-stamp', 'glow-mushroom'];
  const trophies = (Object.keys(save.achievements) as (keyof typeof ACHIEVEMENTS)[]).filter((k) => ACHIEVEMENTS[k]);
  return (
    <Modal open title="Keepsake cabinet" onClose={onClose} className="pv-modal pv-modal--gold">
      <h3 className="pv-shop__h">On the shelves</h3>
      <ul className="pv-keepsakes">{keep.filter((k) => (save.inventory[k] ?? 0) > 0).map((k) => <li key={k}>{ITEM_NAMES[k]} ×{save.inventory[k]}</li>)}</ul>
      {keep.every((k) => !(save.inventory[k] ?? 0)) && <p className="pv-note">Empty for now — shells, plushies, star shards and stamps you find will be displayed here.</p>}
      <h3 className="pv-shop__h">Trophies ({trophies.length})</h3>
      <ul className="pv-keepsakes">{trophies.map((t) => <li key={t}>★ {ACHIEVEMENTS[t].name}</li>)}</ul>
      <h3 className="pv-shop__h">Recent memories</h3>
      <ul className="pv-keepsakes pv-keepsakes--mem">{save.memories.slice(-5).reverse().map((m) => <li key={m.id}><strong>{m.title}</strong><small>{m.place} · {new Date(m.at).toLocaleDateString()}</small></li>)}</ul>
      <div className="modal__actions"><Button variant="ghost" onClick={onClose}>Close</Button></div>
    </Modal>
  );
}
