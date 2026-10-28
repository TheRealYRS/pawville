import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Button } from '../../components/Button';
import { CatCharacter } from '../../components/CatCharacter';
import type { CoatId } from '../appearance.ts';
import { dayKey } from '../destinations.ts';
import { ResultPanel } from '../components/ResultPanel';
import { GameShell, Stat } from '../components/GameShell';
import { PixelCat } from '../components/PixelCat';
import { CATEGORIES, dailyPuzzle, puzzleData, type PuzzleRef } from '../games/puzzle/catalog.ts';
import { FLOWERS, bedConflicts, bedHint, isBedSolved, type BedPuzzle } from '../games/puzzle/flowerbed.ts';
import { NAP_CATS, NAP_CAT_NAMES, NAP_PUZZLES, SPOTS, brokenClues, clueText, isComplete, solveNap, type Assignment, type NapCat } from '../games/puzzle/napspots.ts';
import { PATTERN_PUZZLES, isPatternAnswer, type Glyph, type Token } from '../games/puzzle/patterns.ts';
import { formatSeconds, readBest, readFlag, submitBest, writeFlag, type RecordResult } from '../games/shared.ts';
import { loadTownIdentity } from '../identity';
import { cue } from '../sound';

const NAP_COAT: Record<NapCat, CoatId> = { T: 'tangerine', M: 'midnight', B: 'cocoa', G: 'mochi' };
const GLYPH_COLORS: Record<Glyph, string> = { paw: '#ff8a35', leaf: '#7edb8c', tulip: '#ff6fa1', daisy: '#fff3e6', sun: '#ffc94a', moon: '#c9bfe8', star: '#ffd36b' };

function GlyphArt({ glyph }: { glyph: Glyph }) {
  const c = GLYPH_COLORS[glyph];
  switch (glyph) {
    case 'paw': return <g fill={c}><ellipse cx="12" cy="15.5" rx="5" ry="4.2" /><circle cx="6.3" cy="9.2" r="2.2" /><circle cx="10" cy="5.6" r="2.2" /><circle cx="14" cy="5.6" r="2.2" /><circle cx="17.7" cy="9.2" r="2.2" /></g>;
    case 'leaf': return <g><path d="M5 19C5 9 12 4 20 4c0 9-6 15-15 15z" fill={c} /><path d="M6 18L17 7" stroke="#2d5f45" strokeWidth="1.4" /></g>;
    case 'tulip': return <g><path d="M12 13v8" stroke="#4f9a67" strokeWidth="2" /><path d="M6 6l3 3 3-5 3 5 3-3v4a6 6 0 0 1-12 0z" fill={c} /></g>;
    case 'daisy': return <g>{[0, 45, 90, 135, 180, 225, 270, 315].map((a) => <ellipse key={a} cx="12" cy="6" rx="2.2" ry="4" fill={c} transform={`rotate(${a} 12 12)`} />)}<circle cx="12" cy="12" r="3" fill="#ffc94a" /></g>;
    case 'sun': return <g><circle cx="12" cy="12" r="5" fill={c} />{[0, 45, 90, 135, 180, 225, 270, 315].map((a) => <rect key={a} x="11" y="1.5" width="2" height="4" rx="1" fill={c} transform={`rotate(${a} 12 12)`} />)}</g>;
    case 'moon': return <path d="M15 3a9 9 0 1 0 6 13A7 7 0 0 1 15 3z" fill={c} />;
    case 'star': return <path d="M12 2l3 6.5 7 .8-5.2 4.8 1.4 7L12 17.6 5.8 21l1.4-7L2 9.3l7-.8z" fill={c} />;
  }
}

function TokenArt({ token, size = 44 }: { token: Token; size?: number }) {
  const n = token.count ?? 1;
  return (
    <span className="pg-token" style={{ '--pg-n': Math.min(n, 3) } as CSSProperties}>
      {Array.from({ length: n }, (_, i) => (
        <svg key={i} viewBox="0 0 24 24" width={n > 1 ? size * 0.55 : size} height={n > 1 ? size * 0.55 : size} aria-hidden="true" style={{ transform: `rotate(${token.rot ?? 0}deg)` }}><GlyphArt glyph={token.glyph} /></svg>
      ))}
    </span>
  );
}

const tokenWords = (t: Token) => `${t.count && t.count > 1 ? `${t.count} ` : ''}${t.glyph}${t.count && t.count > 1 ? 's' : ''}${t.rot ? ` turned ${t.rot}°` : ''}`;
const FLOWER_ART: Record<(typeof FLOWERS)[number], { color: string; letter: string }> = {
  tulip: { color: '#ff6fa1', letter: 'T' }, daisy: { color: '#fff3e6', letter: 'D' }, bluebell: { color: '#9cc3ff', letter: 'B' }, sunflower: { color: '#ffc94a', letter: 'S' }, rose: { color: '#e0475c', letter: 'R' },
};

function Flower({ index }: { index: number }) {
  const f = FLOWERS[index];
  const a = FLOWER_ART[f];
  return (
    <span className={`pg-flower pg-flower--${f}`} aria-hidden="true">
      <svg viewBox="0 0 24 24">
        {f === 'tulip' && <path d="M6 7l3 3 3-6 3 6 3-3v5a6 6 0 0 1-12 0z" fill={a.color} />}
        {f === 'daisy' && <>{[0, 60, 120, 180, 240, 300].map((r) => <ellipse key={r} cx="12" cy="6.5" rx="2.6" ry="4.5" fill={a.color} transform={`rotate(${r} 12 12)`} />)}<circle cx="12" cy="12" r="3" fill="#ffc94a" /></>}
        {f === 'bluebell' && <path d="M8 5h8l1 8c1 3-2 5-5 5s-6-2-5-5z" fill={a.color} />}
        {f === 'sunflower' && <>{[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((r) => <ellipse key={r} cx="12" cy="5" rx="1.8" ry="4" fill={a.color} transform={`rotate(${r} 12 12)`} />)}<circle cx="12" cy="12" r="4" fill="#7a512f" /></>}
        {f === 'rose' && <><circle cx="12" cy="12" r="7" fill={a.color} /><path d="M12 7a5 5 0 1 0 5 5M12 9.5a2.5 2.5 0 1 0 2.5 2.5" stroke="#8a1d33" strokeWidth="1.3" fill="none" /></>}
      </svg>
      <span className="pg-flower__letter">{a.letter}</span>
    </span>
  );
}

interface ViewProps {
  onSolved: () => void;
  onHint: () => void;
  onMistake: () => void;
}

export function PatternView({ id, onSolved, onHint, onMistake }: ViewProps & { id: string }) {
  const p = PATTERN_PUZZLES.find((x) => x.id === id)!;
  const [wrong, setWrong] = useState<number[]>([]);
  const [showHint, setShowHint] = useState(false);
  const [solved, setSolved] = useState<number | null>(null);
  return (
    <div className="pg-pattern">
      <p className="pg-prompt">What fills the gap in the garden path?</p>
      <ol className="pg-path" aria-label="Pattern">
        {p.sequence.map((t, i) => (
          <li key={i} className={`pg-stone ${t ? '' : 'is-gap'}`}>
            {t ? <><TokenArt token={t} /><span className="sr-only">{tokenWords(t)}</span></> : solved !== null ? <TokenArt token={p.options[solved]} /> : <span className="pg-stone__q">?</span>}
          </li>
        ))}
      </ol>
      <div className="pg-options" role="group" aria-label="Choose an answer">
        {p.options.map((o, i) => (
          <button key={i} type="button" className={`pg-option ${wrong.includes(i) ? 'is-wrong' : ''} ${solved === i ? 'is-right' : ''}`} disabled={solved !== null || wrong.includes(i)} aria-label={tokenWords(o)}
            onClick={() => { if (isPatternAnswer(p, i)) { setSolved(i); onSolved(); } else { setWrong((w) => [...w, i]); cue('nope'); onMistake(); } }}>
            <TokenArt token={o} />
          </button>
        ))}
      </div>
      <p className="pg-feedback" role="status">{solved !== null ? 'That’s it — the path is complete.' : wrong.length > 0 ? 'Not quite — look at the path again.' : ''}</p>
      <div className="pg-tools">{showHint ? <p className="pg-hint">Hint: {p.hint}</p> : <Button variant="ghost" size="sm" disabled={solved !== null} onClick={() => { setShowHint(true); onHint(); }}>Show a hint</Button>}</div>
    </div>
  );
}

export function BedView({ puzzle, onSolved, onHint }: ViewProps & { puzzle: BedPuzzle }) {
  const [grid, setGrid] = useState<(number | null)[]>(() => puzzle.givens.slice());
  const [brush, setBrush] = useState(0);
  const [solved, setSolved] = useState(false);
  const conflicts = bedConflicts(puzzle.size, grid);
  const n = puzzle.size;
  const set = (i: number, v: number | null) => {
    if (solved || puzzle.givens[i] !== null) return;
    const next = grid.slice();
    next[i] = v;
    setGrid(next);
    cue('tap');
    if (isBedSolved(puzzle, next)) { setSolved(true); onSolved(); }
  };
  return (
    <div className="pg-bed">
      <p className="pg-prompt">Plant every row and every column with one of each flower. Pick a flower, then tap a soil patch.</p>
      <div className="pg-palette" role="radiogroup" aria-label="Flower to plant">
        {Array.from({ length: n }, (_, f) => (
          <button key={f} type="button" role="radio" aria-checked={brush === f} className={`pg-palette__opt ${brush === f ? 'is-selected' : ''}`} onClick={() => setBrush(f)} aria-label={FLOWERS[f]}><Flower index={f} /></button>
        ))}
      </div>
      <div className="pg-bedgrid" style={{ '--pg-size': n } as CSSProperties} role="grid" aria-label={`${n} by ${n} flower bed`}>
        {grid.map((v, i) => {
          const given = puzzle.givens[i] !== null;
          return (
            <button key={i} type="button" role="gridcell" className={`pg-soil ${given ? 'is-given' : ''} ${conflicts.has(i) ? 'is-conflict' : ''} ${solved ? 'is-solved' : ''}`}
              aria-label={`Row ${Math.floor(i / n) + 1}, column ${(i % n) + 1}: ${v === null ? 'empty' : FLOWERS[v]}${given ? ' (planted)' : ''}${conflicts.has(i) ? ', clashes with another' : ''}`}
              onClick={() => set(i, v === brush ? null : brush)} disabled={given || solved}>
              {v !== null && <Flower index={v} />}
            </button>
          );
        })}
      </div>
      <p className="pg-feedback" role="status">{solved ? 'Every bed is in bloom.' : conflicts.size > 0 ? 'Two of the same flower share a row or column (dashed outline).' : ''}</p>
      <div className="pg-tools">
        <Button variant="ghost" size="sm" disabled={solved} onClick={() => { const idx = bedHint(puzzle, grid); if (idx === null) return; onHint(); set(idx, puzzle.solution[idx]); }}>Plant one for me (hint)</Button>
        <Button variant="ghost" size="sm" disabled={solved} onClick={() => setGrid(puzzle.givens.slice())}>Clear my planting</Button>
      </div>
    </div>
  );
}

export function NapView({ id, onSolved, onHint, onMistake }: ViewProps & { id: string }) {
  const p = NAP_PUZZLES.find((x) => x.id === id)!;
  const solution = useMemo(() => solveNap(p.clues)[0], [p]);
  const [a, setA] = useState<Assignment>({});
  const [broken, setBroken] = useState<number[]>([]);
  const [message, setMessage] = useState('');
  const [solved, setSolved] = useState(false);
  const assign = (cat: NapCat, spot: number) => {
    if (solved) return;
    const next: Assignment = { ...a };
    for (const c of NAP_CATS) if (next[c] === spot) delete next[c];
    next[cat] = spot;
    setA(next);
    setBroken([]);
    setMessage('');
    cue('tap');
  };
  const check = () => {
    if (!isComplete(a)) return setMessage('Give every cat its own spot first.');
    const b = brokenClues(p, a);
    setBroken(b);
    if (b.length === 0) { setSolved(true); setMessage('Everyone is tucked in. Purrfect.'); onSolved(); }
    else { cue('nope'); onMistake(); setMessage(`${b.length} ${b.length === 1 ? 'clue is' : 'clues are'} not happy yet (marked below).`); }
  };
  return (
    <div className="pg-nap">
      <ol className="pg-clues" aria-label="Clues">
        {p.clues.map((c, i) => <li key={i} className={broken.includes(i) ? 'is-broken' : ''}>{clueText(c)}{broken.includes(i) && <span className="sr-only"> (not satisfied)</span>}</li>)}
      </ol>
      <div className="pg-spots" aria-hidden="true">
        {SPOTS.map((s, i) => {
          const cat = NAP_CATS.find((c) => a[c] === i);
          return <div key={s} className={`pg-spot pg-spot--${i}`}><div className="pg-spot__seat">{cat && <PixelCat coat={NAP_COAT[cat]} facing="down" pose="sit" scale={2} />}</div><span>{s}</span></div>;
        })}
      </div>
      <div className="pg-assign">
        {NAP_CATS.map((cat) => (
          <div key={cat} className="pg-assign__row" role="radiogroup" aria-label={`${NAP_CAT_NAMES[cat]} naps on…`}>
            <span className="pg-assign__cat"><PixelCat coat={NAP_COAT[cat]} facing="right" scale={1} />{NAP_CAT_NAMES[cat]}</span>
            {SPOTS.map((s, i) => (
              <button key={s} type="button" role="radio" aria-checked={a[cat] === i} className={`pg-assign__opt ${a[cat] === i ? 'is-selected' : ''}`} onClick={() => assign(cat, i)} disabled={solved} aria-label={`${NAP_CAT_NAMES[cat]} on the ${s}`}>{s}</button>
            ))}
          </div>
        ))}
      </div>
      <p className="pg-feedback" role="status">{message}</p>
      <div className="pg-tools">
        <Button variant="primary" onClick={check} disabled={solved}>Check the naps</Button>
        <Button variant="ghost" size="sm" disabled={solved} onClick={() => {
          const wrongCat = NAP_CATS.find((c) => a[c] !== solution[c]);
          if (!wrongCat) return;
          onHint();
          assign(wrongCat, solution[wrongCat]);
          setMessage(`Hint: ${NAP_CAT_NAMES[wrongCat]} naps on the ${SPOTS[solution[wrongCat]].toLowerCase()}.`);
        }}>Tuck one cat in (hint)</Button>
      </div>
    </div>
  );
}

interface Outcome {
  ref: PuzzleRef;
  seconds: number;
  hints: number;
  mistakes: number;
  record: RecordResult;
}
const solvedKey = (key: string) => `garden:solved:${key}`;

export function PuzzleGardenPage() {
  const me = useMemo(() => loadTownIdentity(), []);
  const today = dayKey(new Date());
  const daily = useMemo(() => dailyPuzzle(today), [today]);
  const [active, setActive] = useState<PuzzleRef | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(0);
  const [hints, setHints] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [, setVersion] = useState(0);
  const counted = useRef(false);
  const solveTimer = useRef<number | null>(null);
  useEffect(() => () => { if (solveTimer.current !== null) window.clearTimeout(solveTimer.current); }, []);
  useEffect(() => {
    if (!active || outcome) return;
    const id = window.setInterval(() => setNow(performance.now()), 250);
    return () => window.clearInterval(id);
  }, [active, outcome]);
  const open = (ref: PuzzleRef) => {
    setActive(ref);
    const t = performance.now();
    setStartedAt(t);
    setNow(t);
    setHints(0);
    setMistakes(0);
    setOutcome(null);
    counted.current = false;
    cue('click');
  };
  const solved = () => {
    if (!active || counted.current) return;
    counted.current = true;
    const seconds = Math.round(((performance.now() - startedAt) / 1000) * 10) / 10;
    writeFlag(solvedKey(active.key), '1');
    const record = submitBest('garden', active.key, seconds, 'lower');
    solveTimer.current = window.setTimeout(() => {
      solveTimer.current = null;
      setOutcome({ ref: active, seconds, hints, mistakes, record });
      setVersion((v) => v + 1);
      cue('join');
    }, 700);
  };
  const nextPuzzle = (): PuzzleRef | null => CATEGORIES.flatMap((c) => c.puzzles).find((p) => !readFlag(solvedKey(p.key)) && p.key !== active?.key) ?? null;
  const data = active ? puzzleData(active.key) : null;
  const elapsed = active ? ((outcome ? startedAt + outcome.seconds * 1000 : now) - startedAt) / 1000 : 0;
  const viewProps: ViewProps = { onSolved: solved, onHint: () => setHints((h) => h + 1), onMistake: () => setMistakes((m) => m + 1) };
  return (
    <GameShell game="puzzle-garden" venue="garden" place="The Greenhouse" title="Puzzle Garden" subtitle="Quiet logic puzzles among the flowerbeds."
      help={<><p><strong>Paw Patterns</strong>: find the rule and pick the missing stone.</p><p><strong>Flower Beds</strong>: every row and column holds one of each flower; each bed has exactly one solution.</p><p><strong>Nap Spots</strong>: give each cat a spot so every clue is true. Solve side by side with your partner on one screen if you like.</p><p className="pv-note">The daily puzzle is the same for everyone on the same calendar day. Solved puzzles and best times are remembered on this device.</p></>}
      stats={active ? <><Stat label="Time" value={formatSeconds(elapsed)} /><Stat label="Hints" value={hints} /><Stat label="Difficulty" value={active.difficulty} /></> : undefined}>
      {!active ? (
        <div className="pg-hub">
          <section className={`pg-daily ${readFlag(solvedKey(daily.key)) ? 'is-done' : ''}`}>
            <div>
              <p className="pg-daily__eyebrow">Daily puzzle · {today}</p>
              <h2>{daily.title}</h2>
              <p className="pv-note">{readFlag(solvedKey(daily.key)) ? `Solved today${(() => { const b = readBest('garden', daily.key); return b === null ? '' : ` in ${formatSeconds(b)}`; })()}. A new one grows tomorrow.` : 'Same puzzle for every cat in Pawville today.'}</p>
            </div>
            <Button variant="primary" onClick={() => open(daily)}>{readFlag(solvedKey(daily.key)) ? 'Play again' : 'Play'}</Button>
          </section>
          {CATEGORIES.map((cat) => (
            <section key={cat.kind} className={`pg-cat pg-cat--${cat.kind}`}>
              <header><h2>{cat.title}</h2><p>{cat.blurb}</p></header>
              <ul className="pg-list">
                {cat.puzzles.map((p) => {
                  const done = !!readFlag(solvedKey(p.key));
                  const best = readBest('garden', p.key);
                  return (
                    <li key={p.key}>
                      <button type="button" className={`pg-item ${done ? 'is-done' : ''}`} onClick={() => open(p)}>
                        <span className="pg-item__title">{p.title}</span>
                        <span className={`pg-diff pg-diff--${p.difficulty}`}>{p.difficulty}</span>
                        <span className="pg-item__status">{done ? `✓ Solved${best !== null ? ` · ${formatSeconds(best)}` : ''}` : 'Not yet solved'}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <section className="pg-play">
          <div className="pg-play__head"><Button variant="ghost" size="sm" onClick={() => setActive(null)}>← All puzzles</Button><h2>{active.title}</h2></div>
          {data?.kind === 'pattern' && <PatternView key={active.key} id={data.id} {...viewProps} />}
          {data?.kind === 'bed' && <BedView key={active.key} puzzle={data.puzzle} {...viewProps} />}
          {data?.kind === 'nap' && <NapView key={active.key} id={data.id} {...viewProps} />}
        </section>
      )}
      <ResultPanel open={outcome !== null} mood="calm" heading="Puzzle solved" sub={outcome?.ref.title}
        art={<CatCharacter cat={me.cat} coat={me.coat} accessory={me.accessory} mood="happy" size={88} />}
        newBest={!!outcome?.record.isNewBest && outcome.record.previous !== null} bestLabel={outcome ? formatSeconds(outcome.record.best) : undefined}
        stats={outcome ? [{ label: 'Status', value: 'Solved', highlight: true }, { label: 'Difficulty', value: outcome.ref.difficulty }, { label: 'Time', value: formatSeconds(outcome.seconds) }, { label: 'Hints used', value: outcome.hints }, { label: 'Wrong tries', value: outcome.mistakes }] : []}
        primaryLabel={nextPuzzle() ? 'Another puzzle' : 'Back to the garden'}
        onPrimary={() => { const n = nextPuzzle(); setOutcome(null); if (n) open(n); else setActive(null); }}
        secondary={<Button variant="ghost" size="sm" onClick={() => { setOutcome(null); setActive(null); }}>All puzzles</Button>} />
    </GameShell>
  );
}
