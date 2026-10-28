/**
 * Milestone 10: the home garden UI. A live garden scene (click a bed to select it) and the actions
 * for the selected bed. All changes go through home/homeGarden.ts operations (idempotent), the
 * harvest goes into the bag, and the first harvest earns Green Thumb and a scrapbook memory.
 */
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { CROPS, DECORS, DECOR_NAMES, DECOR_UNLOCK, GARDEN_BEDS, STAGES, applyOp, cropById, growAll, growsIn, homeGardenStore, needsWater, type CropId, type GardenOp, type GardenOpInput, type HomeGarden } from '../home/homeGarden.ts';
import { GARDEN_H, GARDEN_W, bedRect, drawGarden } from '../render/gardenArt.ts';
import { addItem, ITEM_NAMES, recordMemory, unlock, type WorldSave } from '../worldSave.ts';
import { cue } from '../sound';

type Update = (fn: (s: WorldSave) => WorldSave) => void;
type Notify = (msg: string, tone?: 'info' | 'success' | 'warn') => void;
const STAGE_NAMES = ['Seeds', 'Sprouting', 'Growing', 'Ripe!'];
const mins = (ms: number) => (ms < 60_000 ? `${Math.max(1, Math.ceil(ms / 1000))}s` : `${Math.ceil(ms / 60_000)} min`);

export function GardenPanel({ role, update, notify, partnerOnline }: { role: 'T' | 'M'; update: Update; notify: Notify; partnerOnline: boolean }) {
  const store = useRef(homeGardenStore());
  const [g, setG] = useState<HomeGarden>(() => growAll(store.current.load(), Date.now()));
  const gRef = useRef(g);
  gRef.current = g;
  const [sel, setSel] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [crop, setCrop] = useState<CropId>('herbs');
  const [now, setNow] = useState(Date.now());
  const canvas = useRef<HTMLCanvasElement>(null);
  const night = (() => { const h = new Date(now).getHours(); return h >= 20 || h < 6; })();

  // tick: bring growth up to date and refresh timers
  useEffect(() => {
    const id = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      const n = growAll(gRef.current, t);
      if (n !== gRef.current) { store.current.save(n); setG(n); cue('pop'); }
    }, 1000);
    return () => window.clearInterval(id);
  }, []);
  // scene
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    const reduce = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    const draw = (t: number) => { drawGarden(ctx, gRef.current, t / 1000, night, reduce, hover); raf = requestAnimationFrame(draw); };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [night, hover]);

  const run = (op: GardenOpInput) => {
    const full = { ...op, id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, by: role, at: Date.now() } as GardenOp;
    const r = applyOp(gRef.current, full);
    if (!r.ok) {
      cue('nope');
      notify(r.reason === 'already-watered' ? 'Already watered — it’s soaking it up.' : r.reason === 'not-yours' ? 'Your partner planted that — let it grow!' : r.reason === 'locked' ? 'Harvest a few more crops to unlock that.' : r.reason === 'not-ripe' ? 'Not ripe yet.' : 'That doesn’t work here.', 'info');
      return;
    }
    gRef.current = r.garden;
    store.current.save(r.garden);
    setG(r.garden);
    if (op.kind === 'water') cue('tap');
    else cue('pop');
    if (r.harvested) {
      const h = r.harvested;
      update((s) => {
        let n = addItem(s, h.item, h.n);
        if (r.first) {
          n = unlock(n, 'green-thumb', Date.now()).save;
          n = n.memories.some((m) => m.id === 'garden-first-harvest') ? n
            : recordMemory(n, { id: 'garden-first-harvest', kind: 'garden-bloom', title: 'Our first harvest', detail: `${ITEM_NAMES[h.item]} from our very own garden.`, at: Date.now(), place: 'Home garden', withPartner: partnerOnline });
        }
        return n;
      });
      notify(`You harvest ${h.n} × ${ITEM_NAMES[h.item]}.${r.first ? ' Achievement: Green thumb!' : ''}`, 'success');
    }
  };

  const b = g.beds[sel];
  const pick = (e: PointerEvent<HTMLCanvasElement>, click: boolean) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * GARDEN_W, y = ((e.clientY - r.top) / r.height) * GARDEN_H;
    let hit: number | null = null;
    for (let i = 0; i < GARDEN_BEDS; i++) { const q = bedRect(i); if (x >= q.x - 3 && x <= q.x + q.w + 3 && y >= q.y - 3 && y <= q.y + q.h + 3) hit = i; }
    if (click) { if (hit !== null) setSel(hit); } else setHover(hit);
  };
  return (
    <section className="pv-garden" aria-label="Home garden">
      <canvas ref={canvas} width={GARDEN_W} height={GARDEN_H} className="pv-garden__scene" aria-label="Your garden: six raised beds"
        onPointerDown={(e) => pick(e, true)} onPointerMove={(e) => pick(e, false)} onPointerLeave={() => setHover(null)} />
      <div className="pv-garden__beds" role="radiogroup" aria-label="Garden beds">
        {g.beds.map((bed, i) => (
          <button key={i} type="button" role="radio" aria-checked={sel === i} className={`pv-garden__bed ${sel === i ? 'is-selected' : ''}`} onClick={() => setSel(i)}>
            <strong>Bed {i + 1}</strong>
            <span>{bed ? `${cropById(bed.crop).name} · ${STAGE_NAMES[bed.stage]}` : 'Empty'}</span>
            {bed && needsWater(bed) && <span className="pv-garden__need">needs water</span>}
          </button>
        ))}
      </div>
      <div className="pv-garden__actions" aria-live="polite">
        {!b && (
          <>
            <div className="pv-swatches" role="radiogroup" aria-label="Crop to plant">
              {CROPS.map((c) => (
                <button key={c.id} type="button" role="radio" aria-checked={crop === c.id} className={`pv-swatch ${crop === c.id ? 'is-selected' : ''}`} onClick={() => setCrop(c.id)} title={c.blurb}>
                  <span className="pv-swatch__chip" style={{ background: c.color }} /><span>{c.name}</span>
                </button>
              ))}
            </div>
            <p className="pv-note">{cropById(crop).blurb} Each stage takes {mins(cropById(crop).stageMs)} after watering. Seeds are free from the seed box.</p>
            <button type="button" className="pill-btn" onClick={() => run({ kind: 'plant', bed: sel, crop })}>Plant {cropById(crop).name.toLowerCase()} in bed {sel + 1}</button>
          </>
        )}
        {b && (
          <>
            <p className="pv-note">
              <strong>{cropById(b.crop).name}</strong> — {STAGE_NAMES[b.stage]} ({b.stage}/{STAGES}).{' '}
              {b.stage >= STAGES ? 'Ready to harvest!' : needsWater(b) ? 'Thirsty: water it to help it grow.' : `Growing… next stage in ${mins(growsIn(b, now))}.`}
              {' '}Plants never wilt, even while you’re away.
            </p>
            <div className="pv-garden__row">
              <button type="button" className="pill-btn" disabled={!needsWater(b)} onClick={() => run({ kind: 'water', bed: sel })}>Water</button>
              <button type="button" className="pill-btn" disabled={b.stage < STAGES} onClick={() => run({ kind: 'harvest', bed: sel })}>Harvest</button>
              <button type="button" className="pill-btn" onClick={() => run({ kind: 'dig', bed: sel })}>Dig up</button>
            </div>
          </>
        )}
      </div>
      <details className="pv-garden__decor">
        <summary>Garden decorations ({g.harvests} harvest{g.harvests === 1 ? '' : 's'} so far)</summary>
        <div className="pv-garden__row">
          {DECORS.map((d) => {
            const unlocked = g.harvests >= DECOR_UNLOCK[d];
            const on = g.decor.includes(d);
            return (
              <button key={d} type="button" className={`pill-btn ${on ? 'is-hot' : ''}`} disabled={!unlocked} aria-pressed={on} onClick={() => run({ kind: 'decor', decor: d, on: !on })}>
                {DECOR_NAMES[d]}{unlocked ? (on ? ' ✓' : '') : ` (after ${DECOR_UNLOCK[d]} harvests)`}
              </button>
            );
          })}
        </div>
      </details>
    </section>
  );
}
