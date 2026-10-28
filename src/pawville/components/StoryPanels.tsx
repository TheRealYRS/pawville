/**
 * "The Song Beneath the Stars" UI: the Story So Far (a journal tab) and the "listen" sheet used by the Wind Steps
 * (stand still until the wind arrives). Uses the existing Pawville design language and tokens.
 */
import { useEffect, useRef, useState } from 'react';
import type { AdventureState } from '../adventure/state.ts';
import { viewOf } from '../adventure/state.ts';
import { storyObjective } from '../story/engine.ts';
import { BOND_WORDS, COMPANION_NAMES, pairedRecap, unlockedEntries } from '../story/journal.ts';
import { peopleEntries, nameOf } from '../story/residents.ts';
import { COMPANIONS, PLACES, PLACE_NAMES, TONES, toneSummary } from '../story/model.ts';

// ---- The Story So Far ---------------------------------------------------------------------------------------------------------
export function StoryJournal({ state, partnerOnline = false, onHear }: { state: AdventureState; partnerOnline?: boolean; onHear?: (cue: string) => void }) {
  const v = viewOf(state);
  const s = state.story;
  const obj = storyObjective(v);
  const entries = unlockedEntries(s);
  const recap = pairedRecap(s);
  const hasPartnerNotes = Object.keys(s.partner).length > 0;
  const met = COMPANIONS.filter((c) => (c === 'lumi' ? s.done.includes('a1-chime') : c === 'biscuit' ? s.done.includes('a1-biscuit') : c === 'velvet' ? s.done.includes('a1-gate') : s.done.includes('ep-evening')));
  const mood = toneSummary(s);
  const tonesUsed = TONES.filter((t) => s.tones[t] > 0);
  return (
    <div className="pv-journal__list pv-story" aria-label="The Story So Far">
      <article className="pv-quest pv-quest--main pv-story__now">
        <header><span className="pv-quest__layer">{obj.title}</span><h3>{v.story.act() === 0 ? 'Something curious is waiting' : v.story.act() === 4 ? 'The town keeps singing' : 'What now'}</h3></header>
        <p className="pv-quest__summary">{obj.text}</p>
        <p className="pv-quest__hint">Hint: {obj.hint}</p>
      </article>

      {entries.length === 0 && <p className="pv-note">When the old street chime starts to ring, this is where Lumi’s notes about it will be kept — written as memories, not a log.</p>}
      {entries.map((e) => (
        <article key={e.id} className="pv-entry pv-story__entry">
          <span className="pv-entry__kind">{e.act === 4 ? 'Epilogue' : `Act ${['', 'I', 'II', 'III'][e.act]}`}</span>
          <h3>{e.title}</h3>
          <p>{e.text(s)}</p>
        </article>
      ))}

      {s.phrases.length > 0 && (
        <section className="pv-entry" aria-label="Musical phrases">
          <span className="pv-entry__kind">Places on the old trail & phrases collected</span>
          <ul className="pv-story__places">
            {PLACES.filter((p) => s.phrases.includes(p)).map((p) => (
              <li key={p}>♪ {PLACE_NAMES[p]}{onHear && <button type="button" className="pill-btn pv-story__hear" onClick={() => onHear(`phrase-${p}`)} aria-label={`Hear the phrase from ${PLACE_NAMES[p]}`}>Hear</button>}</li>
            ))}
            {s.phrases.includes('biscuit') && <li>♪ Biscuit’s melody</li>}
            {s.phrases.includes('temple') && <li>♪ The missing phrase</li>}
            {s.phrases.includes('crumpet') && <li>♪ Crumpet’s harmony</li>}
          </ul>
          <p className="pv-note">{PLACES.filter((p) => s.phrases.includes(p)).length} of 5 places found.</p>
        </section>
      )}

      {met.length > 0 && (
        <section className="pv-entry" aria-label="Characters">
          <span className="pv-entry__kind">Friends along the way</span>
          <ul className="pv-story__places">
            {met.map((c) => <li key={c}><strong>{COMPANION_NAMES[c]}</strong> — {BOND_WORDS[s.bonds[c]]}</li>)}
          </ul>
        </section>
      )}

      {tonesUsed.length > 0 && (
        <section className="pv-entry" aria-label="How you tend to listen">
          <span className="pv-entry__kind">How you tend to listen</span>
          <p>{mood}</p>
          <p className="pv-note">There is no right way, and no score: every tone belongs in the song.</p>
        </section>
      )}

      {(partnerOnline || hasPartnerNotes) && (
        <section className="pv-entry" aria-label="Together">
          <span className="pv-entry__kind">Together</span>
          <p>{recap.shared} {recap.shared === 1 ? 'choice' : 'choices'} made the same way. {recap.different.length ? `${recap.different.length} where you each heard the song differently — and the story followed one, and kept both.` : 'No differences so far: or none that you have found out about yet.'}</p>
        </section>
      )}
    </div>
  );
}

// ---- Listen (stand still) --------------------------------------------------------------------------------------------------------
/**
 * "Hold still and listen": the Wind Steps' chimes only ring when you stop being in a hurry. The player simply doesn't move
 * for `ms`; moving resets the wait. There is always a way to skip (accessibility, and a bad-connection fallback).
 */
export function ListenSheet({ title, ms, pos, onDone, onCancel }: { title: string; ms: number; pos: () => { x: number; y: number }; onDone: (patient: boolean) => void; onCancel: () => void }) {
  const [progress, setProgress] = useState(0);
  const [slips, setSlips] = useState(0);
  const start = useRef(pos());
  const since = useRef(performance.now());
  const done = useRef(false);
  // the parent re-renders often; keep the latest callbacks in refs so the timer is never restarted
  const posRef = useRef(pos); posRef.current = pos;
  const doneRef = useRef(onDone); doneRef.current = onDone;
  useEffect(() => {
    const id = window.setInterval(() => {
      const p = posRef.current();
      if (Math.hypot(p.x - start.current.x, p.y - start.current.y) > 4) {
        start.current = p; since.current = performance.now(); setProgress(0); setSlips((n) => n + 1);
        return;
      }
      const k = Math.min(1, (performance.now() - since.current) / ms);
      setProgress(k);
      if (k >= 1 && !done.current) { done.current = true; window.clearInterval(id); doneRef.current(true); }
    }, 100);
    return () => window.clearInterval(id);
  }, [ms]);
  return (
    <section className="pv-dialogue pv-listen" role="dialog" aria-modal="false" aria-label={title} onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}>
      <div className="pv-dialogue__body">
        <h2 className="pv-dialogue__name">{title}</h2>
        <p className="pv-dialogue__text" aria-live="polite">{slips === 0 ? 'The slate chimes hang quite still. Stand still, too, and let the wind find you…' : 'The wind slipped away when you moved. Stand still and try again…'}</p>
        <div className="pv-karaoke__meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label="Listening"><span style={{ width: `${progress * 100}%` }} /></div>
        <div className="pv-dialogue__actions">
          <button type="button" className="pill-btn" onClick={() => { if (!done.current) { done.current = true; doneRef.current(false); } }}>Skip the waiting</button>
          <button type="button" className="pill-btn" onClick={onCancel}>Not now</button>
        </div>
      </div>
    </section>
  );
}

// ---- People: what you have learned about each character ----------------------------------------------------------------------------
export function PeopleJournal({ state }: { state: AdventureState }) {
  const list = peopleEntries(viewOf(state), nameOf);
  return (
    <div className="pv-journal__list" aria-label="People">
      {list.length === 0 && <p className="pv-note">Talk with the cats of Pawville: what you learn about them is kept here.</p>}
      {list.map((p) => (
        <article key={p.id} className="pv-entry"><span className="pv-entry__kind">Friendship {state.friends[p.id] ?? 0}/10</span><h3>{p.name}</h3>
          <p>Cares about {p.cares}. Worries about {p.worry}.</p>
          {p.memory && <p>{p.memory}</p>}{p.follow ? <p>{p.follow}</p> : p.locked && <p className="pv-note">{p.locked}</p>}</article>
      ))}
      {list.length > 0 && <p className="pv-note">{list.length} of 63 characters met properly.</p>}
    </div>
  );
}
