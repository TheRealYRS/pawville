import {CITY_DISTRICTS} from '../city/districts.ts';
/**
 * Milestone 6 adventure UI: NPC dialogue, the discovery journal, the world map, the two puzzles
 * (lighthouse lens, Lumi's constellation), fishing, and the small quest tracker in the HUD.
 * Uses the existing Pawville design language (plum panels, orange accents, cream type, rounded).
 */
import { PanelSheet } from './PanelSheet';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { QUESTS, JOURNAL, REGIONS, questById, regionInfo, type JournalKind } from '../adventure/content.ts';
import { currentObjective, questStatus } from '../adventure/engine.ts';
import { LENS_SYMBOLS, SKY_STARS, LUMI_SOLUTION, constellationSolved, lensSolved, rotateRing, toggleStar } from '../adventure/puzzles.ts';
import type { AdventureState, RegionId } from '../adventure/state.ts';
import { viewOf } from '../adventure/state.ts';
import type { CoatId, ExtraId } from '../appearance.ts';
import { PixelCat } from './PixelCat';
import type { DialogueChoice, DialoguePage } from '../adventure/dialogue.ts';
import { CAST } from '../story/cast.ts';
import { PickBox, resolvePick } from '../story/pairing.ts';
import { StoryJournal, PeopleJournal } from './StoryPanels';
import { storyObjective } from '../story/engine.ts';
import { dialogueKeyIntent, moveHighlight } from './dialogueKeys.ts';
import { useDialogueKeys } from './useDialogueKeys.ts';

// ---- dialogue / reading -------------------------------------------------------------------------------------------------------
export interface DialogueOpen {
  title: string;
  lines: string[];
  /** The Song Beneath the Stars: who says each line (keys of story/cast.ts). Narration shows the scene title. */
  who?: string[];
  portrait?: { coat: CoatId; extra?: ExtraId } | 'lumi' | null;
  /** Called whenever the window closes (including Escape) — quest "talk" events fire from here. */
  onDone?: () => void;
  /** Called only when the player read to the end and closed the last line (not on Escape). */
  onFinish?: () => void;
  /** Optional action button on the last line (e.g. "Take a photo"). */
  action?: { label: string; run: () => void };
  /** Milestone 7: replies the player can choose after the last line. */
  choices?: DialogueChoice[];
  /** A "listen" button on the last line of the page (plays a music cue). */
  listen?: { label: string; cue: string };
  onListen?: (cue: string) => void;
  onChoose?: (c: DialogueChoice, meta?: { resolved: DialogueChoice; partnerOpt: string | null }) => void;
  /** Paired play: answers are exchanged with the partner and the scene follows one of them (see story/pairing.ts). */
  pair?: { online: boolean; role: 'T' | 'M'; send: (ask: string, opt: string) => void; box: PickBox };
}

interface Reply { lines: string[]; who?: string[]; then?: DialoguePage }

export function DialogueSheet({ open, onClose }: { open: DialogueOpen | null; onClose: () => void }) {
  const [page, setPage] = useState<DialoguePage | null>(null);
  const [i, setI] = useState(0);
  const [reply, setReply] = useState<Reply | null>(null);
  /** The reply highlighted with the keyboard (−1 = none, so a stray Enter can never pick one). */
  const [hot, setHot] = useState(-1);
  const choicesRef = useRef<HTMLDivElement>(null);
  const [waiting, setWaiting] = useState<{ cancel: () => void } | null>(null);
  const alive = useRef(true);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    setPage(open ? { lines: open.lines, who: open.who, choices: open.choices, listen: open.listen } : null);
    setI(0); setReply(null); setHot(-1);
    setWaiting((w) => { w?.cancel(); return null; });
  }, [open]);
  const lines = reply ? reply.lines : page?.lines ?? [];
  const who = reply ? reply.who : page?.who;
  const last = i >= lines.length - 1;
  const showChoices = !!open && !!page && last && !reply && !!page.choices?.length && !waiting;
  const finish = () => { open?.onFinish?.(); onClose(); };
  const next = () => {
    if (!last) { setI(i + 1); return; }
    if (reply?.then) { setPage(reply.then); setReply(null); setI(0); return; }
    finish();
  };
  const show = (resolved: DialogueChoice, note?: string) => {
    const l = [...(note ? [note] : []), ...resolved.reply];
    const w = resolved.replyWho ? [...(note ? ['narr'] : []), ...resolved.replyWho] : undefined;
    setReply({ lines: l, who: w, then: resolved.then });
    setI(0);
  };
  const choose = (c: DialogueChoice) => {
    if (!open || !page) return;
    setHot(-1);
    const meta = c.story;
    if (meta && open.pair?.online) {
      open.pair.send(meta.ask, meta.opt);
      const w = open.pair.box.wait(meta.ask);
      setWaiting({ cancel: w.cancel });
      void w.promise.then((theirs) => {
        if (!alive.current) return;
        setWaiting(null);
        const res = resolvePick(meta.opt, theirs, open.pair!.role);
        const theirChoice = theirs ? page.choices?.find((x) => x.story?.opt === theirs) : undefined;
        const resolved = res.followed === 'theirs' && theirChoice ? theirChoice : c;
        open.onChoose?.(c, { resolved, partnerOpt: theirs });
        open.pair!.box.forget(meta.ask);
        show(resolved, res.differ && theirChoice ? `Your partner chose differently: “${theirChoice.label}”. The story follows ${res.followed === 'mine' ? 'your answer' : 'theirs'}, and keeps both.` : undefined);
      });
      return;
    }
    open.onChoose?.(c);
    show(c);
  };
  useEffect(() => { if (open) (showChoices ? choicesRef.current : btn.current)?.focus(); }, [open, i, reply, page, waiting, showChoices]);
  // PC keyboard: E / Space / Enter next · 1–9 pick a reply · ↑ ↓ highlight, then E / Enter confirm · Esc close (see dialogueKeys.ts).
  // While waiting for a partner's answer only Esc acts, so nothing can be skipped by accident.
  useDialogueKeys(!!open && !!page, (code) => {
    if (!open || !page) return;
    const n = page.choices?.length ?? 0;
    const it = dialogueKeyIntent(code, { choicesShown: showChoices, choiceCount: n, highlighted: hot });
    if (it.t === 'close') { onClose(); return; }
    if (waiting) return;
    if (it.t === 'advance') next();
    else if (it.t === 'move') setHot((h) => moveHighlight(h, it.delta, n));
    else if (it.t === 'choose') choose(page.choices![it.index]);
    else if (it.t === 'confirm') choose(page.choices![hot]);
  });
  if (!open || !page) return null;
  const w = who?.[i];
  const sp = w ? CAST[w] : undefined;
  const narration = w === 'narr';
  const name = !narration && sp?.name ? sp.name : open.title;
  const portrait = narration ? null : sp ? (sp.lumi ? 'lumi' as const : sp.coat ? { coat: sp.coat, extra: sp.extra } : null) : open.portrait;
  return (
    <section className="pv-dialogue" role="dialog" aria-modal="false" aria-label={open.title} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
      {portrait && (
        <div className="pv-dialogue__portrait" aria-hidden="true">
          {portrait === 'lumi' ? <LumiIcon /> : <PixelCat coat={portrait.coat} extra={portrait.extra} facing="down" scale={3} />}
        </div>
      )}
      <div className="pv-dialogue__body">
        <h2 className="pv-dialogue__name">{name}</h2>
        <p className={`pv-dialogue__text ${narration ? 'is-narration' : ''}`} aria-live="polite">{waiting ? 'Waiting to hear how your partner would answer…' : lines[i]}</p>
        {showChoices && (
          <div ref={choicesRef} tabIndex={-1} className="pv-dialogue__choices" role="group" aria-label="Your reply">
            {page.choices!.map((c, k) => (
              <button key={c.label} type="button" className={`pv-choice pv-choice--${c.tone} ${hot === k ? 'is-hot' : ''}`} aria-keyshortcuts={String(k + 1)} onClick={() => choose(c)}>
                <kbd className="pv-key pv-choice__key" aria-hidden="true">{k + 1}</kbd><span className="pv-choice__tone">{c.tone}</span>{c.label}
              </button>
            ))}
          </div>
        )}
        <div className="pv-dialogue__actions">
          <span className="pv-dialogue__count" aria-hidden="true">{lines.length > 1 && !waiting ? `${i + 1}/${lines.length}` : ''}</span>
          <span className="pv-dialogue__keys pv-hint--desktop" aria-hidden="true">{showChoices ? <><kbd className="pv-key">1</kbd>–<kbd className="pv-key">{page.choices!.length}</kbd> or <kbd className="pv-key">↑</kbd><kbd className="pv-key">↓</kbd> + <kbd className="pv-key">E</kbd></> : <><kbd className="pv-key">E</kbd> / <kbd className="pv-key">Space</kbd> next</>} · <kbd className="pv-key">Esc</kbd> close</span>
          {last && !waiting && !reply && page.listen && <button type="button" className="pill-btn" onClick={() => open.onListen?.(page.listen!.cue)}>♪ {page.listen.label}</button>}
          {last && !waiting && !showChoices && open.action && <button type="button" className="pill-btn" onClick={() => { open.action!.run(); onClose(); }}>{open.action.label}</button>}
          {waiting
            ? <button ref={btn} type="button" className="pill-btn" onClick={() => waiting.cancel()}>Carry on without waiting</button>
            : <button ref={showChoices ? undefined : btn} type="button" className="pill-btn pv-dialogue__next" onClick={showChoices ? () => { onClose(); } : next}>{last ? (showChoices ? 'Say nothing' : 'Close') : 'Next ›'}</button>}
        </div>
      </div>
    </section>
  );
}

export function LumiIcon({ size = 54 }: { size?: number }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
      <circle cx="20" cy="22" r="15" fill="#ffe27a" opacity="0.18" />
      <path d="M8 24l2-3 1 3 3 1-3 1-1 3-1-3-3-1z" fill="#ffe27a" />
      <ellipse cx="22" cy="22" rx="9" ry="8" fill="#fff3c4" />
      <ellipse cx="22" cy="24" rx="7.5" ry="6" fill="#ffe27a" />
      <path d="M15 15l2 4M29 15l-2 4" stroke="#fff3c4" strokeWidth="3" strokeLinecap="round" />
      <circle cx="19" cy="22" r="1.4" fill="#2a1d2f" /><circle cx="25" cy="22" r="1.4" fill="#2a1d2f" />
      <circle cx="22" cy="25" r="0.9" fill="#ff9db0" />
    </svg>
  );
}

// ---- quest tracker (HUD) -----------------------------------------------------------------------
export function QuestTracker({ state, onOpen }: { state: AdventureState; onOpen: () => void }) {
  const active = QUESTS.filter((q) => state.quests[q.id]?.status === 'active');
  const main = active.find((q) => q.layer === 'main') ?? active[0];
  if (!main) {
    // The Song Beneath the Stars: when no quest is running, the tracker shows the story's next step
    const o = storyObjective(viewOf(state));
    if (o.act === 0 || o.act === 4) return null;
    return (
      <button type="button" className="pv-tracker" onClick={onOpen} aria-label={`Story: ${o.title}. ${o.text}. Open the journal`}>
        <span className="pv-tracker__title">{o.title}</span>
        <span className="pv-tracker__obj">{o.text}</span>
      </button>
    );
  }
  const obj = currentObjective(main, state);
  const p = state.quests[main.id];
  const need = obj?.need ?? 1;
  return (
    <button type="button" className="pv-tracker" onClick={onOpen} aria-label={`Current quest: ${main.title}. ${obj?.text ?? ''}. Open the journal`}>
      <span className="pv-tracker__title">{main.title}</span>
      {obj && <span className="pv-tracker__obj">{obj.text}{need > 1 ? ` (${p?.count ?? 0}/${need})` : ''}</span>}
      {active.length > 1 && <span className="pv-tracker__more">+{active.length - 1} more</span>}
      {active.length === 1 && viewOf(state).story.act() >= 1 && viewOf(state).story.act() <= 3 && <span className="pv-tracker__more">+ the story</span>}
    </button>
  );
}

// ---- journal -----------------------------------------------------------------------------------
const KIND_LABEL: Record<JournalKind, string> = { rumor: 'Rumor', letter: 'Letter', clue: 'Clue', symbol: 'Symbol', landmark: 'Landmark', creature: 'Creature', milestone: 'Milestone', mystery: 'Mystery', sky: 'Sky' };

export function JournalModal({ open, onClose, state, partnerOnline = false, onHear }: { open: boolean; onClose: () => void; state: AdventureState; partnerOnline?: boolean; onHear?: (cue: string) => void }) {
  const v = viewOf(state);
  const [tab, setTab] = useState<'story' | 'people' | 'quests' | 'clues' | 'discoveries' | 'items'>(() => (v.story.act() > 0 ? 'story' : 'quests'));
  const statusOf = (id: string) => questStatus(questById(id)!, state, v);
  const visible = QUESTS.filter((q) => !q.hidden || state.quests[q.id]);
  const active = visible.filter((q) => statusOf(q.id) === 'active');
  const avail = visible.filter((q) => statusOf(q.id) === 'available' && q.startOn);
  const done = visible.filter((q) => statusOf(q.id) === 'done');
  const entries = JOURNAL.filter((j) => state.journal.includes(j.id));
  const clueKinds: JournalKind[] = ['rumor', 'letter', 'clue', 'mystery', 'milestone'];
  return (
    <Modal open={open} title="Discovery journal" onClose={onClose} className="pv-modal pv-modal--gold pv-journal">
      <div className="pv-tabs" role="tablist" aria-label="Journal sections">
        {(['story', 'people', 'quests', 'clues', 'discoveries', 'items'] as const).filter((t) => (t !== 'story' || v.story.act() > 0) && (t !== 'people' || Object.keys(state.choices).some((k) => k.endsWith(':topic')))).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={`pv-tab ${tab === t ? 'is-active' : ''}`} onClick={() => setTab(t)}>
            {t === 'story' ? 'The Story So Far' : t === 'people' ? 'People' : t === 'quests' ? 'Quests' : t === 'clues' ? 'Clues & letters' : t === 'discoveries' ? 'Discoveries' : 'Key items'}
          </button>
        ))}
      </div>
      {tab === 'people' && <PeopleJournal state={state} />}
      {tab === 'story' && <StoryJournal state={state} partnerOnline={partnerOnline} onHear={onHear} />}
      {tab === 'quests' && (
        <div className="pv-journal__list">
          {active.length === 0 && <p className="pv-note">No quests in progress. Talk to the cats around town — Mabel by the signpost always has news.</p>}
          {active.map((q) => {
            const p = state.quests[q.id]!;
            return (
              <article key={q.id} className={`pv-quest pv-quest--${q.layer}`}>
                <header><span className="pv-quest__layer">{q.layer === 'main' ? 'Main adventure' : q.layer === 'regional' ? 'Regional story' : q.layer === 'side' ? 'Side story' : 'Discovery'}{q.coop ? ' · two-player (solo option)' : ''}</span><h3>{q.title}</h3></header>
                <p className="pv-quest__summary">{q.summary}</p>
                <ol className="pv-quest__steps">
                  {q.objectives.map((o, i) => (
                    <li key={o.id} className={i < p.step ? 'is-done' : i === p.step ? 'is-current' : 'is-later'}>
                      {i <= p.step ? o.text : '…'}{i === p.step && (o.need ?? 1) > 1 ? ` (${p.count}/${o.need})` : ''}
                      {i === p.step && <span className="pv-quest__hint">Hint: {o.hint}</span>}
                    </li>
                  ))}
                </ol>
              </article>
            );
          })}
          {avail.length > 0 && <h3 className="pv-journal__h">Waiting for you</h3>}
          {avail.map((q) => <p key={q.id} className="pv-journal__avail"><strong>{q.title}</strong> — {q.summary}</p>)}
          {done.length > 0 && <h3 className="pv-journal__h">Completed</h3>}
          {done.map((q) => <p key={q.id} className="pv-journal__done">✓ {q.title}{state.quests[q.id]?.together ? ' (together)' : ''}</p>)}
        </div>
      )}
      {tab === 'clues' && (
        <div className="pv-journal__list">
          {entries.filter((j) => clueKinds.includes(j.kind)).map((j) => (
            <article key={j.id} className="pv-entry"><span className="pv-entry__kind">{KIND_LABEL[j.kind]}{j.kind === 'sky' ? ' · seen through a telescope' : ` · ${regionInfo(j.region).name}`}</span><h3>{j.title}</h3><p>{j.text}</p>
              {j.id === 'lumi-pattern' && <LumiPattern />}
            </article>
          ))}
          {entries.filter((j) => clueKinds.includes(j.kind)).length === 0 && <p className="pv-note">Rumors, letters and clues you find will be kept here.</p>}
        </div>
      )}
      {tab === 'discoveries' && (
        <div className="pv-journal__list">
          {entries.filter((j) => !clueKinds.includes(j.kind)).map((j) => (
            <article key={j.id} className="pv-entry"><span className="pv-entry__kind">{KIND_LABEL[j.kind]}{j.kind === 'sky' ? ' · seen through a telescope' : ` · ${regionInfo(j.region).name}`}</span><h3>{j.title}</h3><p>{j.text}</p></article>
          ))}
          <p className="pv-note">{entries.filter((j) => !clueKinds.includes(j.kind)).length} of {JOURNAL.filter((j) => !clueKinds.includes(j.kind)).length} landmarks, creatures and symbols discovered.</p>
        </div>
      )}
      {tab === 'items' && (
        <ul className="pv-places">
          {Object.entries(state.keyItems).filter(([, n]) => n > 0).map(([id, n]) => <li key={id} className="pv-places__item"><span className="pv-places__name">{KEY_ITEM_NAMES[id] ?? id}</span><span className="pv-places__games">{n > 1 ? `×${n}` : 'Quest item (can’t be lost)'}</span></li>)}
          {Object.values(state.keyItems).every((n) => !n) && <li className="pv-note">Quest items you carry appear here. They can never be dropped or lost.</li>}
        </ul>
      )}
    </Modal>
  );
}

const KEY_ITEM_NAMES: Record<string, string> = {
  'chart-piece': 'Torn chart piece', 'navigation-chart': 'Marlow’s mended chart', driftwood: 'Driftwood', toolbox: 'Marlow’s toolbox', 'star-compass': 'Brass star compass',
  moonstone: 'Moonstone', 'trail-map': 'Old trail map', 'blue-scarf': 'Nana Tulip’s blue scarf', 'clock-key': 'Brass clock key', gear: 'Brass gear', starstone: 'Starstone', 'bottle-note-1': 'Bottle letter (beach)', 'bottle-note-2': 'Bottle letter (sandbar)',
};

/** Lumi's pattern as a small drawing (the shape — not the position on the board). */
export function LumiPattern() {
  const pts = LUMI_SOLUTION.map((id) => SKY_STARS.find((s) => s.id === id)!);
  return (
    <svg className="pv-lumi-pattern" viewBox="0 0 100 70" width="160" height="112" role="img" aria-label="Lumi's pattern: one star on top, two wing stars wide to the sides, two foot stars close together at the bottom">
      <rect x="0" y="0" width="100" height="70" rx="8" fill="#1b1840" />
      <polyline points={[pts[0], pts[1], pts[3], pts[4], pts[2], pts[0]].map((p) => `${p.x * 100},${p.y * 70}`).join(' ')} fill="none" stroke="#bfe4ff" strokeOpacity="0.5" />
      {pts.map((p, i) => <circle key={i} cx={p.x * 100} cy={p.y * 70} r="2.6" fill="#fff3c4" />)}
    </svg>
  );
}

// ---- world map ---------------------------------------------------------------------------------
export function WorldMapModal({ open, onClose, state, here, onTravel, onTownPlaces, onDistrict }: {
  open: boolean; onClose: () => void; state: AdventureState; here: RegionId; onTravel: (r: RegionId) => void; onTownPlaces: () => void; onDistrict?: (d: typeof CITY_DISTRICTS[number]) => void;
}) {
  const v = viewOf(state);
  const unlocked = (r: RegionId) => r === 'town' || v.has(`region:${r}`);
  const visited = (r: RegionId) => r === 'town' || v.seen(`region:${r}`);
  const shown = REGIONS.filter((r) => !r.parent);
  const hereTop = REGIONS.find((r) => r.id === here)?.parent ?? here;
  const [sel, setSel] = useState<RegionId>(hereTop);
  useEffect(() => { if (open) setSel(hereTop); }, [open, hereTop]);
  const info = regionInfo(sel);
  const questsHere = QUESTS.filter((q) => state.quests[q.id]?.status === 'active' && (q.region === sel || REGIONS.find((r) => r.id === q.region)?.parent === sel));
  const routes: [RegionId, RegionId, boolean][] = [['town', 'city', true], ['town', 'harbor', unlocked('harbor')], ['town', 'forest', unlocked('forest')], ['forest', 'highlands', unlocked('highlands')], ['harbor', 'isles', unlocked('isles')], ['highlands', 'town', v.has('cable-car-fixed')]];
  const pos = (r: RegionId) => regionInfo(r).map;
  return (
    <Modal open={open} title="World map" onClose={onClose} className="pv-modal pv-modal--blue pv-worldmap">
      <details><summary>Whiskerwick districts</summary><div className="pv-districts">{CITY_DISTRICTS.map(d=><button key={d.id} type="button" className="pill-btn" onClick={()=>{onDistrict?onDistrict(d):onTravel(d.region);onClose();}}>{d.name}<small style={{display:"block"}}>{d.detail}</small></button>)}</div></details>
      <svg className="pv-worldmap__svg" viewBox="0 0 100 100" role="group" aria-label="Regions of Pawville">
        <defs><radialGradient id="pv-sea" cx="50%" cy="50%" r="70%"><stop offset="0" stopColor="#24406b" /><stop offset="1" stopColor="#141a33" /></radialGradient></defs>
        <rect x="0" y="0" width="100" height="100" rx="6" fill="url(#pv-sea)" />
        {routes.map(([a, b, open2], i) => <line key={i} x1={pos(a).x} y1={pos(a).y} x2={pos(b).x} y2={pos(b).y} stroke={open2 ? '#ffc94a' : '#5a5068'} strokeWidth="0.8" strokeDasharray={open2 ? undefined : '1.6 1.6'} />)}
        {shown.map((r) => {
          const u = unlocked(r.id), seenIt = visited(r.id);
          const hasQuest = QUESTS.some((q) => state.quests[q.id]?.status === 'active' && (q.region === r.id || REGIONS.find((x) => x.id === q.region)?.parent === r.id));
          return (
            <g key={r.id} className="pv-worldmap__node" role="button" tabIndex={0} aria-label={`${u ? r.name : 'Unknown region'}${hereTop === r.id ? ', you are here' : ''}${u ? '' : ', locked'}`}
              onClick={() => setSel(r.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSel(r.id); } }}>
              <circle cx={r.map.x} cy={r.map.y} r={sel === r.id ? 8 : 7} fill={u ? (seenIt ? '#4f9a67' : '#5d93c9') : '#2a2433'} stroke={sel === r.id ? '#ffc94a' : '#fff3e6'} strokeWidth={sel === r.id ? 1.2 : 0.5} />
              <text x={r.map.x} y={r.map.y + 1.6} textAnchor="middle" fontSize="3.2" fill="#fff3e6" fontWeight="700">{u ? r.name.replace(/^The /, '').split(' ')[0] : '?'}</text>
              {hereTop === r.id && <text x={r.map.x} y={r.map.y - 9.5} textAnchor="middle" fontSize="3.6" fill="#ffc94a">● you</text>}
              {hasQuest && <circle cx={r.map.x + 6} cy={r.map.y - 6} r="2" fill="#ffc94a" />}
            </g>
          );
        })}
      </svg>
      <section className="pv-worldmap__info" aria-live="polite">
        <h3>{unlocked(sel) ? info.name : 'Unknown region'}</h3>
        <p>{unlocked(sel) ? info.blurb : 'Rumors only. '}{!unlocked(sel) && <span className="pv-worldmap__req">To open: {info.unlock}</span>}</p>
        {questsHere.length > 0 && <p className="pv-worldmap__q">Quests here: {questsHere.map((q) => q.title).join(', ')}</p>}
        <div className="modal__actions">
          {sel === 'town' && here === 'town' && <Button variant="ghost" onClick={onTownPlaces}>Town places…</Button>}
          {unlocked(sel) && visited(sel) && hereTop !== sel && <Button variant="primary" onClick={() => onTravel(sel)}>Travel to {info.name}</Button>}
          {unlocked(sel) && !visited(sel) && hereTop !== sel && <span className="pv-note">Find the way there once — then you can travel from the map.</span>}
        </div>
      </section>
    </Modal>
  );
}

// ---- puzzles -----------------------------------------------------------------------------------
const SYMBOL_GLYPH: Record<string, string> = { sun: '☀', moon: '☾', star: '★', wave: '≈' };

export function PuzzleModal({ id, onClose, onSolved }: { id: string | null; onClose: () => void; onSolved: (id: string) => void }) {
  const [rings, setRings] = useState<number[]>([3, 3, 3]);
  const [sel, setSel] = useState<number[]>([]);
  const [solved, setSolved] = useState(false);
  useEffect(() => { setRings([3, 0, 3]); setSel([]); setSolved(false); }, [id]);
  if (!id) return null;
  if (id === 'lens') {
    const turn = (i: number, d: number) => {
      if (solved) return;
      const next = rotateRing(rings, i, d);
      setRings(next);
      if (lensSolved(next)) { setSolved(true); onSolved('lens'); }
    };
    return (
      <Modal open title="The lighthouse lens" onClose={onClose} className="pv-modal pv-modal--gold pv-puzzle">
        <p className="pv-note">Three brass rings. Turn each until it shows the right symbol. (Your journal remembers the keeper’s note and the boats.)</p>
        <div className="pv-lens" role="group" aria-label="Lens rings">
          {['Inner ring', 'Middle ring', 'Outer ring'].map((label, i) => (
            <div key={label} className="pv-lens__ring">
              <span className="pv-lens__label">{label}</span>
              <button type="button" className="icon-btn" aria-label={`Turn ${label} back`} onClick={() => turn(i, -1)} disabled={solved}>‹</button>
              <span className={`pv-lens__symbol ${solved ? 'is-solved' : ''}`} aria-live="polite" aria-label={`${label}: ${LENS_SYMBOLS[rings[i]]}`}>{SYMBOL_GLYPH[LENS_SYMBOLS[rings[i]]]}<small>{LENS_SYMBOLS[rings[i]]}</small></span>
              <button type="button" className="icon-btn" aria-label={`Turn ${label} forward`} onClick={() => turn(i, 1)} disabled={solved}>›</button>
            </div>
          ))}
        </div>
        {solved && <p className="pv-puzzle__win">The lens catches the light — the lighthouse blazes to life!</p>}
        <div className="modal__actions"><Button variant={solved ? 'primary' : 'ghost'} onClick={onClose}>{solved ? 'Wonderful' : 'Step away'}</Button></div>
      </Modal>
    );
  }
  if (id === 'constellation') {
    const pick = (s: number) => {
      if (solved) return;
      const next = toggleStar(sel, s);
      setSel(next);
      if (constellationSolved(next)) { setSolved(true); onSolved('constellation'); }
    };
    return (
      <Modal open title="Shine Lumi’s pattern" onClose={onClose} className="pv-modal pv-modal--blue pv-puzzle">
        <p className="pv-note">Light exactly five stars that make Lumi’s shape: one on top, two wide wings, two little feet close together. Tap a lit star to turn it off.</p>
        <div className="pv-sky" role="group" aria-label="Stars to light">
          {SKY_STARS.map((s) => (
            <button key={s.id} type="button" className={`pv-sky__star ${sel.includes(s.id) ? 'is-on' : ''}`} style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%` }}
              aria-pressed={sel.includes(s.id)} aria-label={`Star ${s.id + 1}`} onClick={() => pick(s.id)} disabled={solved}>★</button>
          ))}
        </div>
        <p className="pv-note" aria-live="polite">{solved ? 'The beam paints Lumi’s shape across the sky… far away, something answers.' : `${sel.length} of 5 lit`}</p>
        <div className="modal__actions"><Button variant={solved ? 'primary' : 'ghost'} onClick={onClose}>{solved ? 'Look up!' : 'Step away'}</Button></div>
      </Modal>
    );
  }
  return null;
}

// ---- fishing -----------------------------------------------------------------------------------
export function FishingSheet({ open, onClose, onCatch, label }: { open: boolean; onClose: () => void; onCatch: (perfect: boolean) => void; label: string }) {
  const [phase, setPhase] = useState<'idle' | 'waiting' | 'bite' | 'done' | 'missed'>('idle');
  const timer = useRef<number | null>(null);
  // 8.1: the live phase (state lags one render; two quick taps on "Reel in" used to land two fish)
  const live = useRef(phase);
  live.current = phase;
  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current); }, []);
  useEffect(() => { if (!open) { setPhase('idle'); if (timer.current !== null) window.clearTimeout(timer.current); } }, [open]);
  if (!open) return null;
  const go = (p: typeof phase) => { live.current = p; setPhase(p); };
  const cast = () => {
    if (live.current === 'waiting' || live.current === 'bite') return;
    go('waiting');
    timer.current = window.setTimeout(() => {
      go('bite');
      timer.current = window.setTimeout(() => go('missed'), 1600); // generous window; missing costs nothing
    }, 1200 + Math.random() * 2200);
  };
  const reel = () => {
    if (live.current !== 'bite') return;
    if (timer.current !== null) window.clearTimeout(timer.current);
    go('done');
    onCatch(true);
  };
  return (
    <PanelSheet label={label} title={label} className="pv-fishing" actions={<>
        {(phase === 'idle' || phase === 'done' || phase === 'missed') && <button type="button" className="pill-btn" onClick={cast}>Cast</button>}
        {(phase === 'waiting' || phase === 'bite') && <button type="button" className={`pill-btn ${phase === 'bite' ? 'is-hot' : ''}`} onClick={reel} disabled={phase !== 'bite'}>Reel in</button>}
        <button type="button" className="pill-btn" onClick={onClose}>Done</button>
      </>}>
      <p aria-live="polite">{phase === 'idle' ? 'Cast your line and wait for a bite.' : phase === 'waiting' ? 'The float bobs gently…' : phase === 'bite' ? 'A bite! Reel in now!' : phase === 'done' ? 'Caught one! It’s in your bag.' : 'It got away — no harm done. Try again?'}</p>
    </PanelSheet>
  );
}
