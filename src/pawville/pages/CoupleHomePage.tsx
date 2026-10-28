/**
 * Our Home — one full-screen scene. The room is the stage; everything else is built into it:
 *  - a slim top bar (back, title, who is home, scrapbook, sound),
 *  - a dock under the room (Decorate · Garden · Mailbox · Treasures) — the sheets open OVER the room, never replace it,
 *  - decorating: drag furniture from the tray into the room, drag pieces to move them, drag one back onto the tray to put
 *    it away, tap a piece for its little toolbar. Everything saves as you go; Undo takes the last change back.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Button } from '../../components/Button';
import { SoundToggle } from '../../components/SoundToggle';
import { Toast } from '../../components/Toast';
import { useToast } from '../../hooks/useToast';
import { BackToPawville } from '../components/BackToPawville';
import { Segmented } from '../components/GameShell';
import { DecorThumb, HomeRoom } from '../components/HomeRoom';
import { Wardrobe } from '../components/Wardrobe';
import { usePairHub } from '../couple/pairHub.ts';
import * as svc from '../couple/pairService.ts';
import { PATHS } from '../destinations.ts';
import {
  DECOR, HOME_IS_SHARED, MAX_PIECES, available, canEdit, decorDef, homeStore, toggleLight, type DecorDef, type DecorId, type HomeAction, type HomeState, type Placed,
} from '../home/decor.ts';
import { cellAt, dropOrigin, isDrag, pushHistory } from '../home/homeDrag.ts';
import { ROOM_PX_H, ROOM_PX_W, footprintPx } from '../home/homeArt.ts';
import { GIFTABLE, NOTE_MAX, cleanNote, localMailStore, validateMail, type Giftable, type LocalMail } from '../home/mailbox.ts';
import { catName, loadTownIdentity } from '../identity';
import { checkPlaceInRoom, type Cell } from '../home/homeWalk.ts';
import { goTo } from '../navigation';
import { cue } from '../sound';
import { useWorldSave } from '../useWorldSave.ts';
import { seasonFor } from '../world/environment.ts';
import { FISH } from '../activities/park.ts';
import { ITEM_NAMES, recordMemory, takeItem, type ItemId, type WorldSave } from '../worldSave.ts';
import { CookPanel, DinePanel, KeepsakePanel } from '../components/HomeLifePanels';
import { harvestHerbs } from '../home/cooking.ts';
import { GardenPanel } from '../components/GardenPanel';
import '../styles/home-ui.css';

type Sheet = 'garden' | 'mail' | 'collection';
type Section = 'furniture' | 'decor' | 'cat' | 'walls';
interface Placing { item: DecorId; rot: 0 | 90; uid: string }
interface DragState { kind: 'new' | 'move'; item: DecorId; rot: 0 | 90; uid: string; x0: number; y0: number; moved: boolean }

const PLACE_TEXT: Record<string, string> = {
  'wall-only': 'That one hangs on the wall.', 'floor-only': 'That one goes on the floor.', blocked: 'Something is already there.',
  'out-of-room': 'That doesn’t fit in the room.', 'blocks-door': 'That would block the front door — keep the doormat clear.',
  'blocks-path': 'That would wall off part of the room — leave a path to walk through.',
  'needs-headroom': 'Cats need headroom — hang that one on the lower row of the wall.',
};
const SECTIONS: { id: Section; label: string }[] = [{ id: 'furniture', label: 'Furniture' }, { id: 'decor', label: 'Cozy decor' }, { id: 'cat', label: 'For cats' }, { id: 'walls', label: 'Walls' }];
const WALLPAPERS: { id: HomeState['wallpaper']; label: string; color: string }[] = [
  { id: 'plum', label: 'Plum', color: '#5b3f9a' }, { id: 'cream', label: 'Cream', color: '#f1e3c8' }, { id: 'mint', label: 'Mint', color: '#8fd9c4' }, { id: 'night', label: 'Night', color: '#27275a' },
];
const SHEET_TITLE: Record<Sheet, string> = { garden: 'Garden', mail: 'Mailbox', collection: 'Treasures' };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const newUid = () => `p${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

/** Why a catalogue piece can't be used right now (short — it is shown under the piece). */
function lockReason(d: DecorDef, save: WorldSave, season: string): string {
  switch (d.source.kind) {
    case 'shop': return (save.furniture?.[d.id] ?? 0) > 0 ? 'All placed' : `Buy at Hearth & Whisker · ${d.source.price}`;
    case 'item': return `Needs ${d.source.count ?? 1} × ${ITEM_NAMES[d.source.item]}`;
    case 'fish': return 'Catch a fish first';
    case 'season': return d.source.season === season ? '' : `Appears in ${d.source.season}`;
    default: return '';
  }
}

const Icon = ({ children }: { children: ReactNode }) => <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{children}</svg>;
const ICONS = {
  decorate: <Icon><path d="M4 20l4-1 11-11-3-3L5 16z" /><path d="M14 7l3 3" /></Icon>,
  garden: <Icon><path d="M12 21v-9" /><path d="M12 12c-4 0-6-2-6-6 4 0 6 2 6 6z" /><path d="M12 14c4 0 6-2 6-6-4 0-6 2-6 6z" /></Icon>,
  mail: <Icon><rect x="3.5" y="5.5" width="17" height="13" rx="2.5" /><path d="M4 7l8 6 8-6" /></Icon>,
  treasure: <Icon><path d="M12 4l2.4 5 5.4.7-4 3.8 1 5.4-4.8-2.7-4.8 2.7 1-5.4-4-3.8 5.4-.7z" /></Icon>,
  undo: <Icon><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></Icon>,
  done: <Icon><path d="M5 12.5l4.5 4.5L19 7.5" /></Icon>,
  rotate: <Icon><path d="M20 12a8 8 0 1 1-2.6-5.9" /><path d="M20 4v5h-5" /></Icon>,
  trash: <Icon><path d="M5 7h14" /><path d="M9 7V4.5h6V7" /><path d="M7 7l1 12h8l1-12" /></Icon>,
  close: <Icon><path d="M6 6l12 12M18 6L6 18" /></Icon>,
};

export function CoupleHomePage() {
  const hub = usePairHub();
  const [lookVersion, setLookVersion] = useState(0);
  const me = useMemo(() => loadTownIdentity(hub.pair?.myRole), [hub.pair?.myRole, lookVersion]);
  const [wardrobeOpen, setWardrobeOpen] = useState(false);
  const role = me.cat;
  const { toast, show } = useToast();
  const { save, update } = useWorldSave();
  const [sheet, setSheet] = useState<Sheet | null>(() => {
    try {
      const t = window.sessionStorage.getItem('pawville:home-tab');
      window.sessionStorage.removeItem('pawville:home-tab');
      return t === 'mail' ? 'mail' : t === 'garden' ? 'garden' : null;
    } catch {
      return null;
    }
  });

  // ---- the room (saved on every change; Undo walks back through the last few) ----
  const [home, setHome] = useState<HomeState>(() => homeStore().load());
  const homeRef = useRef(home);
  homeRef.current = home;
  const historyRef = useRef<HomeState[]>([]);
  const [historyLen, setHistoryLen] = useState(0);
  const [editing, setEditing] = useState(false);
  const [placing, setPlacing] = useState<Placing | null>(null);
  const [hover, setHover] = useState<Cell | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [section, setSection] = useState<Section>('furniture');
  const [drag, setDrag] = useState<{ kind: 'new' | 'move'; overTray: boolean } | null>(null);
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const suppressClick = useRef(false);
  const season = seasonFor(new Date());
  const partnerName = hub.pair ? hub.pair.partnerName || catName(hub.pair.myRole === 'T' ? 'M' : 'T') : null;

  const commit = useCallback((next: HomeState) => {
    historyRef.current = pushHistory(historyRef.current, homeRef.current);
    setHistoryLen(historyRef.current.length);
    homeRef.current = next;
    setHome(next);
    homeStore().save(next);
  }, []);
  const undo = useCallback(() => {
    const prev = historyRef.current[historyRef.current.length - 1];
    if (!prev) return;
    historyRef.current = historyRef.current.slice(0, -1);
    setHistoryLen(historyRef.current.length);
    homeRef.current = prev;
    setHome(prev);
    homeStore().save(prev);
    setSelected(null);
    cue('tap');
  }, []);

  const origin = placing && hover ? dropOrigin(placing.item, placing.rot, hover) : null;
  const ghost = placing && origin ? { item: placing.item, x: origin.x, y: origin.y, rot: placing.rot, ok: checkPlaceInRoom(home.placed, { uid: placing.uid, item: placing.item, x: origin.x, y: origin.y, rot: placing.rot }) === 'ok' } : null;
  const hideUid = placing && home.placed.some((q) => q.uid === placing.uid) ? placing.uid : null;
  const sel = !placing ? home.placed.find((p) => p.uid === selected) ?? null : null;

  const placeAt = useCallback((at: Cell, pl: Placing): boolean => {
    const cur = homeRef.current;
    const existing = cur.placed.find((q) => q.uid === pl.uid);
    const p: Placed = { uid: pl.uid, item: pl.item, x: at.x, y: at.y, rot: pl.rot, placedBy: existing?.placedBy ?? role };
    const check = checkPlaceInRoom(cur.placed, p);
    if (check !== 'ok') { cue('nope'); show(PLACE_TEXT[check] ?? 'It doesn’t fit there.', 'warn'); return false; }
    if (!existing && cur.placed.length >= MAX_PIECES) { show('The room is full!', 'warn'); return false; }
    commit({ ...cur, placed: [...cur.placed.filter((q) => q.uid !== p.uid), p] });
    cue('pop');
    return true;
  }, [commit, role, show]);
  const putAway = useCallback((uid: string) => {
    const cur = homeRef.current;
    if (!cur.placed.some((q) => q.uid === uid)) return;
    commit({ ...cur, placed: cur.placed.filter((q) => q.uid !== uid) });
    setSelected(null);
    cue('tap');
  }, [commit]);
  const rotate = useCallback((uid: string) => {
    const cur = homeRef.current;
    const p = cur.placed.find((q) => q.uid === uid);
    if (!p) return;
    const turned: Placed = { ...p, rot: p.rot === 0 ? 90 : 0 };
    const check = checkPlaceInRoom(cur.placed, turned);
    if (check === 'ok') { commit({ ...cur, placed: cur.placed.map((q) => (q.uid === uid ? turned : q)) }); cue('pop'); }
    else { cue('nope'); show(check === 'blocks-door' || check === 'blocks-path' || check === 'needs-headroom' ? PLACE_TEXT[check] : 'No room to turn it here.', 'warn'); }
  }, [commit, show]);

  const startEdit = () => { setSheet(null); setEditing(true); setSelected(null); };
  const done = useCallback(() => { setEditing(false); setPlacing(null); setSelected(null); setHover(null); setDrag(null); }, []);

  // ---- dragging (new pieces from the tray, existing pieces around the room) ----
  const gridRect = () => sceneRef.current?.querySelector('.hm-scene__grid')?.getBoundingClientRect() ?? null;
  const beginDrag = (e: ReactPointerEvent, d0: Omit<DragState, 'x0' | 'y0' | 'moved'>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const d: DragState = { ...d0, x0: e.clientX, y0: e.clientY, moved: false };
    const move = (ev: PointerEvent) => {
      if (!d.moved) {
        if (!isDrag(ev.clientX - d.x0, ev.clientY - d.y0)) return;
        d.moved = true;
        setPlacing({ item: d.item, rot: d.rot, uid: d.uid });
        setSelected(null);
      }
      const r = gridRect();
      setHover(r ? cellAt(r, ev.clientX, ev.clientY) : null);
      setDrag({ kind: d.kind, overTray: !!document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.hm-tray') });
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      setDrag(null);
    };
    const up = (ev: PointerEvent) => {
      stop();
      if (!d.moved) { // a click, not a drag: tray pieces become "tap a tile to place it"; room pieces are handled by their own click
        if (d.kind === 'new') { setPlacing({ item: d.item, rot: d.rot, uid: d.uid }); setSelected(null); }
        return;
      }
      suppressClick.current = true;
      window.setTimeout(() => { suppressClick.current = false; }, 0);
      const overTray = !!document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.hm-tray');
      const r = gridRect();
      const c = r ? cellAt(r, ev.clientX, ev.clientY) : null;
      if (overTray) { if (d.kind === 'move') putAway(d.uid); }
      else if (c) { const ok = placeAt(dropOrigin(d.item, d.rot, c), { item: d.item, rot: d.rot, uid: d.uid }); if (ok && d.kind === 'move') setSelected(d.uid); }
      setPlacing(null);
      setHover(null);
    };
    const cancel = () => { stop(); setPlacing(null); setHover(null); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  };

  const clickCell = (x: number, y: number) => {
    if (!editing) return;
    if (placing) {
      if (placeAt(dropOrigin(placing.item, placing.rot, { x, y }), placing)) setPlacing(null);
    } else setSelected(null);
  };
  const pick = (p: Placed) => {
    if (suppressClick.current) return;
    if (HOME_IS_SHARED && !canEdit(p, role)) return show(`${partnerName ?? 'Your partner'} placed that — it’s theirs to move.`, 'info');
    setSelected((s) => (s === p.uid ? null : p.uid));
  };

  // ---- keyboard while decorating: Ctrl+Z undo · R rotate · Delete put away · arrows + Enter place · Esc back out ----
  const act = useRef({ undo, done, rotate, putAway, placeAt });
  act.current = { undo, done, rotate, putAway, placeAt };
  const kb = useRef({ placing, selected, hover });
  kb.current = { placing, selected, hover };
  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const k = kb.current;
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); act.current.undo(); return; }
      if (e.code === 'Escape') {
        if (k.placing) { setPlacing(null); setHover(null); } else if (k.selected) setSelected(null); else act.current.done();
        return;
      }
      if (k.placing) {
        const dir: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
        const d = dir[e.code];
        if (d) { e.preventDefault(); const h = k.hover ?? { x: 6, y: 4 }; setHover({ x: clamp(h.x + d[0], 0, 11), y: clamp(h.y + d[1], 0, 7) }); return; }
        if ((e.code === 'Enter' || e.code === 'Space') && k.hover && tag !== 'BUTTON') { e.preventDefault(); if (act.current.placeAt(dropOrigin(k.placing.item, k.placing.rot, k.hover), k.placing)) setPlacing(null); return; }
        if (e.code === 'KeyR') { setPlacing({ ...k.placing, rot: k.placing.rot === 0 ? 90 : 0 }); return; }
      }
      if (k.selected && (e.code === 'Delete' || e.code === 'Backspace')) { e.preventDefault(); act.current.putAway(k.selected); }
      if (k.selected && e.code === 'KeyR') act.current.rotate(k.selected);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing]);
  useEffect(() => {
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => { if (e.code === 'Escape') setSheet(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheet]);

  // ---- living in the room: furniture actions ----
  const [life, setLife] = useState<'cook' | 'dine' | 'keep' | null>(null);
  const onAction = useCallback((action: HomeAction, piece: Placed) => {
    if (action === 'wardrobe') setWardrobeOpen(true);
    if (action === 'cook') setLife('cook');
    if (action === 'dine') setLife('dine');
    if (action === 'display') setLife('keep');
    if (action === 'music') { cue('join'); show('The record crackles, then a soft piano tune fills the room.', 'info'); }
    if (action === 'light') {
      const n = toggleLight(homeRef.current, piece.uid);
      homeRef.current = n;
      setHome(n);
      homeStore().save(n);
      cue('tap');
    }
    if (action === 'harvest') {
      const planters = homeRef.current.placed.filter((p) => p.item === 'herb-planter').length;
      let got = 0;
      update((s) => { const r = harvestHerbs(s, planters, new Date().toISOString().slice(0, 10)); got = r.got; return r.save; });
      show(got ? `You pick ${got} sprigs of fresh herbs.` : 'The herbs are still growing back — come back tomorrow. (They never wilt.)', got ? 'success' : 'info');
    }
    if (action === 'inspect') {
      const d = decorDef(piece.item);
      const n = save.memories.length;
      show(piece.item === 'photo-frame' || piece.item === 'painting'
        ? n ? `You look at your photos — ${n} memor${n === 1 ? 'y' : 'ies'} in the scrapbook.` : 'An empty frame, waiting for your first photo together.'
        : `You take a closer look at the ${d.name.toLowerCase()}.`, 'info');
    }
  }, [save.memories.length, show, update]);
  const onLeave = useCallback(() => setWardrobeOpen(false), []);

  // ---- mail ----
  const [mail, setMail] = useState<LocalMail[]>(() => localMailStore().load());
  const [remote, setRemote] = useState<svc.MailRow[] | null>(null);
  const [mailErr, setMailErr] = useState<string | null>(null);
  const [kind, setKind] = useState<'note' | 'gift'>('note');
  const [body, setBody] = useState('');
  const [gift, setGift] = useState<Giftable>('bouquet');
  const backendMail = hub.pair?.source === 'backend' && hub.pair.partnerJoined;
  const mailOpen = sheet === 'mail';
  useEffect(() => {
    if (!backendMail) { setRemote(null); return; }
    let alive = true;
    svc.fetchMail().then((rows) => { if (alive) setRemote(rows); }).catch((e) => { if (alive) setMailErr(e instanceof svc.PairError ? e.code : 'network'); });
    return () => { alive = false; };
  }, [backendMail, mailOpen]);
  const unread = backendMail ? (remote ?? []).filter((r) => !r.from_me && !r.opened_at).length : 0;
  const send = async () => {
    const err = validateMail(kind, body, kind === 'gift' ? gift : null);
    if (err) return show(err, 'warn');
    if (kind === 'gift') {
      const ok = takeItem(save, gift as ItemId);
      if (!ok) return show(`You don’t have a ${ITEM_NAMES[gift as ItemId].toLowerCase()} in your bag.`, 'warn');
    }
    if (backendMail) {
      try {
        await svc.sendMail(kind, cleanNote(body), kind === 'gift' ? gift : null);
        setRemote(await svc.fetchMail());
      } catch (e) {
        return show(e instanceof svc.PairError ? e.code : 'Could not send — try again.', 'warn');
      }
    } else {
      const m: LocalMail = { id: `l${Date.now()}`, kind, body: cleanNote(body), gift: kind === 'gift' ? gift : null, fromMe: true, at: Date.now(), openedAt: null };
      const next = [m, ...mail].slice(0, 200);
      localMailStore().save(next);
      setMail(next);
    }
    if (kind === 'gift') update((s) => takeItem(s, gift as ItemId) ?? s);
    setBody('');
    cue('pop');
    show(backendMail ? 'Sent! It will be waiting in their mailbox.' : 'Saved in this device’s mailbox.', 'success');
  };
  const openRemote = async (row: svc.MailRow) => {
    if (row.from_me || row.opened_at) return;
    try {
      await svc.openMail(row.id);
      setRemote((r) => r?.map((x) => (x.id === row.id ? { ...x, opened_at: new Date().toISOString() } : x)) ?? r);
      update((s) => recordMemory(s, { kind: 'gift-received', title: row.kind === 'gift' ? `A gift from ${partnerName}` : `A note from ${partnerName}`, detail: row.body || (row.gift ? ITEM_NAMES[row.gift as ItemId] ?? '' : ''), at: Date.now(), place: 'Our Home', withPartner: true }));
    } catch {
      /* try later */
    }
  };

  // ---- the little hint on the room fades on its own ----
  const [hint, setHint] = useState(true);
  useEffect(() => { const id = window.setTimeout(() => setHint(false), 9000); return () => window.clearTimeout(id); }, []);

  // ---- the selected piece's toolbar sits on the piece itself ----
  const pop = sel ? (() => {
    const px = footprintPx(sel);
    const below = px.y < 44;
    return { left: clamp(((px.x + px.w / 2) / ROOM_PX_W) * 100, 14, 86), top: ((below ? px.y + px.h + 4 : px.y - 4) / ROOM_PX_H) * 100, below };
  })() : null;

  const toggleSheet = (s: Sheet) => { setSheet((cur) => (cur === s ? null : s)); setHint(false); };
  const catalogue = DECOR.filter((d) => (d.group ?? 'decor') === section);

  return (
    <main className={`hm-app ${editing ? 'is-editing' : ''}`}>
      <header className="hm-top">
        <BackToPawville />
        <div className="hm-top__title">
          <span className="hm-top__place">Home Lane</span>
          <h1>Our Home</h1>
        </div>
        <div className="hm-top__right">
          {hub.pair
            ? <span className={`hm-chip ${hub.partnerOnline ? 'is-on' : ''}`} title={hub.partnerOnline ? `${partnerName} is online` : `${partnerName} is not connected right now`}><i className="hm-chip__dot" aria-hidden="true" />{partnerName} · {hub.partnerOnline ? 'here now' : 'away'}</span>
            : <span className="hm-chip" title="Pair up with your partner from the ♥ button in town">Just you</span>}
          <Button size="sm" variant="secondary" onClick={() => goTo(PATHS.scrapbook)}>Scrapbook</Button>
          <SoundToggle />
        </div>
      </header>

      <div className="hm-main">
        <div className="hm-stage" onPointerDown={() => setHint(false)}>
          <HomeRoom room={home} editing={editing} placing={!!placing} me={me} selected={selected} hideUid={hideUid} ghost={ghost}
            sceneRef={sceneRef} onCell={clickCell} onHover={setHover} onPiece={pick}
            onPiecePointerDown={(p, e) => { if (!HOME_IS_SHARED || canEdit(p, role)) beginDrag(e, { kind: 'move', item: p.item, rot: p.rot, uid: p.uid }); }}
            onAction={onAction} onLeave={onLeave}>
            {hint && !editing && !sheet && <p className="hm-hint" role="note">Tap the floor to walk · tap furniture to use it</p>}
            {editing && sel && pop && (
              <div className={`hm-pop ${pop.below ? 'is-below' : ''}`} style={{ left: `${pop.left}%`, top: `${pop.top}%` }} role="toolbar" aria-label={`${decorDef(sel.item).name}`}>
                <span className="hm-pop__name">{decorDef(sel.item).name}</span>
                <button type="button" className="hm-pop__btn" onClick={() => rotate(sel.uid)} aria-label="Rotate (R)" title="Rotate (R)">{ICONS.rotate}</button>
                <button type="button" className="hm-pop__btn is-danger" onClick={() => putAway(sel.uid)} aria-label="Put away (Delete)" title="Put away (Delete)">{ICONS.trash}</button>
              </div>
            )}
          </HomeRoom>
        </div>

        {editing && (
          <aside className={`hm-tray ${drag?.kind === 'move' ? 'is-drop-zone' : ''} ${drag?.kind === 'move' && drag.overTray ? 'is-drop-over' : ''}`} aria-label="Decorating tray">
            <div className="hm-tray__head">
              <div className="hm-sections" role="group" aria-label="Catalogue sections">
                {SECTIONS.map((s) => <button key={s.id} type="button" className={`hm-section ${section === s.id ? 'is-on' : ''}`} aria-pressed={section === s.id} onClick={() => setSection(s.id)}>{s.label}</button>)}
              </div>
            </div>
            {section === 'walls' ? (
              <ul className="hm-walls" aria-label="Wallpaper">
                {WALLPAPERS.map((w) => (
                  <li key={w.id}>
                    <button type="button" className={`hm-wall ${home.wallpaper === w.id ? 'is-on' : ''}`} aria-pressed={home.wallpaper === w.id}
                      onClick={() => { if (home.wallpaper !== w.id) { commit({ ...home, wallpaper: w.id }); cue('pop'); } }}>
                      <span className="hm-wall__swatch" style={{ background: w.color }} /><span>{w.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="hm-tray__grid" aria-label={SECTIONS.find((s) => s.id === section)?.label}>
                {catalogue.map((d) => {
                  const ok = available(d, save, season, home.placed, placing?.uid);
                  const why = ok ? '' : lockReason(d, save, season);
                  return (
                    <li key={d.id}>
                      <button type="button" className={`hm-inv ${placing?.item === d.id && !hideUid ? 'is-selected' : ''}`} disabled={!ok}
                        title={ok ? `${d.name} — drag it into the room, or tap it and then tap a tile${d.layer === 'wall' ? ' (hangs on the wall)' : d.layer === 'rug' ? ' (goes under furniture)' : ''}` : why}
                        onPointerDown={(e) => { if (ok) beginDrag(e, { kind: 'new', item: d.id, rot: 0, uid: newUid() }); }}
                        onClick={(e) => { if (e.detail === 0 && ok) { setPlacing({ item: d.id, rot: 0, uid: newUid() }); setSelected(null); setHover((h) => h ?? { x: 6, y: 4 }); window.setTimeout(() => sceneRef.current?.querySelector<HTMLElement>('.hm-scene__grid')?.focus(), 0); } }}>
                        <DecorThumb id={d.id} /><span className="hm-inv__name">{d.name}</span>{why && <span className="hm-inv__why">{why}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="hm-tray__note" role="status">
              {placing
                ? <>Placing <strong>{decorDef(placing.item).name}</strong> — drag it in, tap a tile, or use the arrow keys and Enter. <button type="button" className="hm-link" onClick={() => setPlacing((p) => (p ? { ...p, rot: p.rot === 0 ? 90 : 0 } : p))}>Rotate</button> · <button type="button" className="hm-link" onClick={() => { setPlacing(null); setHover(null); }}>Cancel</button></>
                : <><strong>{home.placed.length}/{MAX_PIECES}</strong> pieces · drag a piece into the room, drag one back here to put it away. Saved on this device{hub.pair ? ' — sharing the room with your partner is coming' : ''}.</>}
            </p>
            {drag?.kind === 'move' && <div className="hm-tray__drop" aria-hidden="true">Drop here to put away</div>}
          </aside>
        )}

        {sheet && (
          <div className="hm-sheetwrap" onPointerDown={(e) => { if (e.target === e.currentTarget) setSheet(null); }}>
            <section className="hm-sheet" role="dialog" aria-label={SHEET_TITLE[sheet]}>
              <header className="hm-sheet__head">
                <h2>{SHEET_TITLE[sheet]}</h2>
                <button type="button" className="hm-iconbtn" onClick={() => setSheet(null)} aria-label={`Close ${SHEET_TITLE[sheet]}`}>{ICONS.close}</button>
              </header>
              <div className="hm-sheet__body">
                {sheet === 'garden' && <GardenPanel role={role} update={update} notify={show} partnerOnline={!!hub.partnerOnline} />}
                {sheet === 'mail' && (
                  <section className="hm-mail">
                    <p className="pv-note">{backendMail ? `Private between you and ${partnerName}. Delivered through your couple, even when they’re offline.` : hub.pair?.source === 'demo' ? 'Demo couple: mail stays on this device.' : 'Not paired with a backend couple — notes are kept on this device only.'}</p>
                    <div className="pv-setup hm-compose">
                      <Segmented label="What to send" value={kind} options={[{ id: 'note', label: 'Note' }, { id: 'gift', label: 'Gift' }]} onChange={setKind} />
                      {kind === 'gift' && (
                        <select className="field__input" value={gift} onChange={(e) => setGift(e.target.value as Giftable)} aria-label="Gift">
                          {GIFTABLE.map((g) => <option key={g} value={g} disabled={(save.inventory[g as ItemId] ?? 0) < 1}>{ITEM_NAMES[g as ItemId]} (you have {save.inventory[g as ItemId] ?? 0})</option>)}
                        </select>
                      )}
                      <label className="field">
                        <span className="field__label">{kind === 'gift' ? 'A few words (optional)' : 'Your note'}</span>
                        <textarea className="field__input hm-note" value={body} maxLength={NOTE_MAX} onChange={(e) => setBody(e.target.value)} rows={3} />
                        <span className="field__hint">{body.length}/{NOTE_MAX}</span>
                      </label>
                      <Button variant="primary" onClick={() => void send()}>Send</Button>
                    </div>
                    {mailErr && <p className="pv-alert">{mailErr === 'missing_migration' ? 'Mail needs the pairing migration on the server.' : 'Could not load mail right now.'}</p>}
                    <ul className="hm-letters">
                      {(backendMail ? (remote ?? []).map((r) => ({ id: String(r.id), kind: r.kind, body: r.body, gift: r.gift, fromMe: r.from_me, at: Date.parse(r.created_at), opened: !!r.opened_at, row: r })) : mail.map((m) => ({ id: m.id, kind: m.kind, body: m.body, gift: m.gift, fromMe: m.fromMe, at: m.at, opened: true, row: null as svc.MailRow | null })))
                        .map((m) => (
                          <li key={m.id} className={`hm-letter ${m.fromMe ? 'is-mine' : ''} ${!m.opened ? 'is-new' : ''}`}>
                            <span className="hm-letter__meta">{m.fromMe ? 'You sent' : `From ${partnerName}`} · {new Date(m.at).toLocaleString()}</span>
                            {!m.opened && m.row ? <Button size="sm" variant="primary" onClick={() => void openRemote(m.row!)}>Open {m.kind}</Button> : (
                              <>{m.kind === 'gift' && m.gift && <strong>Gift: {ITEM_NAMES[m.gift as ItemId] ?? m.gift}</strong>}{m.body && <p>{m.body}</p>}</>
                            )}
                          </li>
                        ))}
                    </ul>
                  </section>
                )}
                {sheet === 'collection' && (
                  <section className="hm-collection">
                    <h3>Fish ({save.fishSeen.length}/{FISH.length})</h3>
                    <ul className="pv-bag">{FISH.map((f) => <li key={f.id} className={save.fishSeen.includes(f.id) ? '' : 'is-unknown'}><span style={{ color: save.fishSeen.includes(f.id) ? f.color : undefined }}>{save.fishSeen.includes(f.id) ? f.name : '???'}</span></li>)}</ul>
                    <h3>Secrets</h3>
                    <p>{save.collected.filter((c) => c.startsWith('shell')).length}/3 shells · {save.collected.filter((c) => c.startsWith('toy')).length}/3 hidden toys</p>
                    <h3>Garden</h3>
                    <p>{save.garden.bloomed} flower{save.garden.bloomed === 1 ? '' : 's'} grown to full bloom.</p>
                  </section>
                )}
              </div>
            </section>
          </div>
        )}
      </div>

      <nav className="hm-dock" aria-label="Home menu">
        {!editing ? (
          <>
            <button type="button" className="hm-dock__btn is-primary" onClick={startEdit}>{ICONS.decorate}<span>Decorate</span></button>
            <button type="button" className={`hm-dock__btn ${sheet === 'garden' ? 'is-on' : ''}`} aria-pressed={sheet === 'garden'} onClick={() => toggleSheet('garden')}>{ICONS.garden}<span>Garden</span></button>
            <button type="button" className={`hm-dock__btn ${sheet === 'mail' ? 'is-on' : ''}`} aria-pressed={sheet === 'mail'} onClick={() => toggleSheet('mail')}>{ICONS.mail}<span>Mailbox</span>{unread > 0 && <b className="hm-dock__badge" aria-label={`${unread} unread`}>{unread}</b>}</button>
            <button type="button" className={`hm-dock__btn ${sheet === 'collection' ? 'is-on' : ''}`} aria-pressed={sheet === 'collection'} onClick={() => toggleSheet('collection')}>{ICONS.treasure}<span>Treasures</span></button>
          </>
        ) : (
          <>
            <span className="hm-dock__label">Decorating</span>
            <button type="button" className="hm-dock__btn" onClick={undo} disabled={historyLen === 0} title="Undo (Ctrl+Z)">{ICONS.undo}<span>Undo</span></button>
            <button type="button" className="hm-dock__btn is-primary" onClick={done}>{ICONS.done}<span>Done</span></button>
          </>
        )}
      </nav>

      <CookPanel open={life === 'cook'} save={save} update={update} onClose={() => setLife(null)} notify={show} />
      <DinePanel open={life === 'dine'} save={save} update={update} onClose={() => setLife(null)} partner={partnerName}
        onEat={(item, shared) => {
          show(shared ? `You share the ${ITEM_NAMES[item].toLowerCase()} with ${partnerName}. Delicious!` : `Mmm, ${ITEM_NAMES[item].toLowerCase()}.`, 'success');
          if (shared) update((s) => recordMemory(s, { kind: 'picnic', title: 'A meal for two', detail: `Shared ${ITEM_NAMES[item].toLowerCase()} at home.`, at: Date.now(), place: 'Our Home', withPartner: true }));
        }} />
      <KeepsakePanel open={life === 'keep'} save={save} onClose={() => setLife(null)} />
      <Wardrobe open={wardrobeOpen} onClose={() => setWardrobeOpen(false)} identity={me} save={save}
        onSaved={() => { setLookVersion((v) => v + 1); show('New look saved for every Pawville game.', 'success'); }} />
      <Toast toast={toast} />
    </main>
  );
}
