import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { CatCharacter } from '../../components/CatCharacter';
import { CountdownBadge, ResultPanel } from '../components/ResultPanel';
import { GameShell, Segmented, Stat } from '../components/GameShell';
import { HOLES, ROUND_MS, createWhack, tickWhack, whack, whackAccuracy, type WhackLevel, type WhackState } from '../games/whack/engine.ts';
import { readBest, submitBest, type RecordResult } from '../games/shared.ts';
import { loadTownIdentity } from '../identity';
import { cue } from '../sound';

type Phase = 'setup' | 'countdown' | 'playing' | 'done';
const LEVELS = [{ id: 'easy', label: 'Easy' }, { id: 'medium', label: 'Medium' }, { id: 'hard', label: 'Hard' }] as const;
const KEY_TO_HOLE: Record<string, number> = { '7': 0, '8': 1, '9': 2, '4': 3, '5': 4, '6': 5, '1': 6, '2': 7, '3': 8 };
const HOLE_KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3'];

export function WhackACatPage() {
  const me = useMemo(() => loadTownIdentity(), []);
  const [level, setLevel] = useState<WhackLevel>('medium');
  const [phase, setPhase] = useState<Phase>('setup');
  const [count, setCount] = useState<number | null>(null);
  const [game, setGame] = useState<WhackState | null>(null);
  const [now, setNow] = useState(0);
  const [record, setRecord] = useState<RecordResult | null>(null);
  const gameRef = useRef<WhackState | null>(null);
  const timers = useRef<number[]>([]);
  const finishedRef = useRef(false);
  const clearTimers = () => { timers.current.forEach((t) => window.clearTimeout(t)); timers.current = []; };
  useEffect(() => clearTimers, []);
  useEffect(() => {
    if (phase !== 'playing') return;
    let raf = 0;
    const loop = () => {
      const t = performance.now();
      const g = gameRef.current;
      if (g) {
        const next = tickWhack(g, t, Math.random);
        if (next !== g) { gameRef.current = next; setGame(next); }
        if (next.over && !finishedRef.current) {
          finishedRef.current = true;
          setRecord(submitBest('whack', `score-${next.level}`, next.score, 'higher'));
          cue('join');
          setPhase('done');
          return;
        }
      }
      setNow(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase]);
  const boop = (hole: number) => {
    const g = gameRef.current;
    if (phase !== 'playing' || !g) return;
    const next = whack(g, hole, performance.now());
    if (next === g) return;
    cue(next.lastEvent?.kind === 'hit' || next.lastEvent?.kind === 'gold' ? 'pop' : 'nope');
    gameRef.current = next;
    setGame(next);
  };
  useEffect(() => {
    if (phase !== 'playing') return;
    const onKey = (e: KeyboardEvent) => {
      const hole = KEY_TO_HOLE[e.key];
      if (hole === undefined || e.repeat) return;
      e.preventDefault();
      boop(hole);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);
  const start = () => {
    clearTimers();
    finishedRef.current = false;
    gameRef.current = null;
    setGame(null);
    setRecord(null);
    setPhase('countdown');
    const step = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 400 : 650;
    [3, 2, 1].forEach((n, i) => timers.current.push(window.setTimeout(() => { setCount(n); cue('click'); }, i * step)));
    timers.current.push(window.setTimeout(() => {
      const t = performance.now();
      const g = createWhack(level, t);
      gameRef.current = g;
      setGame(g);
      setNow(t);
      setCount(0);
      cue('join');
      setPhase('playing');
    }, 3 * step));
    timers.current.push(window.setTimeout(() => setCount(null), 3 * step + 450));
  };
  const left = game ? Math.max(0, (game.endsAt - (phase === 'playing' ? now : game.endsAt)) / 1000) : ROUND_MS / 1000;
  const ev = game?.lastEvent && now - game.lastEvent.at < 650 ? game.lastEvent : null;
  const best = readBest('whack', `score-${level}`);
  return (
    <GameShell game="whack-a-cat" venue="booth" place="Whack-a-Cat booth" title="Whack-a-Cat" subtitle="Boop the cats before they hide — gently!"
      help={<><p>Cats pop out of the booth boxes — boop them before they duck back down! 30 seconds.</p><ul className="pv-list"><li><strong>Cat</strong>: 10 + combo bonus (2 per combo step, up to +20).</li><li><strong>Golden cat</strong>: 30 + combo bonus.</li><li><strong>Napping kitten</strong> (eyes closed, “zz”): let it sleep! −5 and your combo.</li><li>Empty boxes and escaped cats reset your combo.</li></ul><p>Keyboard: number keys like a numpad (7-8-9 / 4-5-6 / 1-2-3).</p></>}
      stats={phase !== 'setup' ? (<><Stat label="Time" value={left.toFixed(1)} tone={left < 5 ? 'bad' : undefined} /><Stat label="Score" value={game?.score ?? 0} tone="gold" /><Stat label="Combo" value={game?.combo ? `×${game.combo}` : '—'} tone={(game?.combo ?? 0) >= 5 ? 'good' : undefined} /><Stat label="Misses" value={game?.misses ?? 0} /></>) : undefined}>
      {phase === 'setup' ? (
        <section className="pv-setup wc-setup">
          <div className="wc-setup__art" aria-hidden="true"><CatCharacter cat="T" mood="playful" size={84} /><CatCharacter cat="M" mood="surprised" size={84} flip /></div>
          <Segmented label="Difficulty" value={level} options={LEVELS} onChange={setLevel} />
          <p className="pv-note">30-second round · best on {level}: {best === null ? '—' : `${best} points`}. Taking turns? Compare your scores!</p>
          <Button variant="primary" size="lg" onClick={start}>Start the round</Button>
        </section>
      ) : (
        <section className="wc-booth" aria-label="Whack-a-Cat booth">
          <div className="wc-awning" aria-hidden="true" />
          <div className="wc-field">
            {Array.from({ length: HOLES }, (_, hole) => {
              const t = game?.targets.find((x) => x.hole === hole);
              const state = !t ? 'empty' : t.state;
              const label = !t || t.state !== 'up' ? 'empty box' : t.kind === 'kitten' ? 'napping kitten — leave it!' : t.kind === 'gold' ? 'golden cat!' : 'cat — boop it!';
              return (
                <button key={hole} type="button" className={`wc-hole is-${state} ${t ? `kind-${t.kind}` : ''}`} onPointerDown={(e) => { e.preventDefault(); boop(hole); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); boop(hole); } }} aria-label={`Box ${HOLE_KEYS[hole]}: ${label}`} disabled={phase !== 'playing'}>
                  <span className="wc-hole__key" aria-hidden="true">{HOLE_KEYS[hole]}</span>
                  {t && (
                    <span className="wc-hole__cat" aria-hidden="true">
                      {t.kind === 'kitten'
                        ? <span className="wc-kitten"><CatCharacter cat={t.cat} pose="head" mood="idle" size="100%" still /><span className="wc-zz">z z</span></span>
                        : <CatCharacter cat={t.cat} pose="head" mood={t.state === 'hit' ? 'surprised' : t.kind === 'gold' ? 'victorious' : 'playful'} accessory={t.kind === 'gold' ? 'crown' : 'none'} size="100%" still />}
                    </span>
                  )}
                  <span className="wc-hole__front" aria-hidden="true" />
                  {ev && ev.hole === hole && <span key={ev.at} className={`wc-pop is-${ev.kind}`} aria-hidden="true">{ev.kind === 'whiff' ? 'miss' : ev.points > 0 ? `+${ev.points}` : ev.points < 0 ? `${ev.points}` : 'shh!'}</span>}
                </button>
              );
            })}
          </div>
          {(game?.combo ?? 0) >= 3 && phase === 'playing' && <p key={game!.combo} className="wc-combo" aria-live="polite">Combo ×{game!.combo}!</p>}
          <CountdownBadge value={count} />
        </section>
      )}
      <ResultPanel open={phase === 'done' && game !== null} mood="lively" heading={record?.isNewBest ? 'New high score!' : 'Time’s up!'} sub={`Difficulty · ${level}`}
        art={<CatCharacter cat={me.cat} coat={me.coat} accessory={me.accessory} mood={record?.isNewBest ? 'victorious' : 'happy'} size={96} />}
        newBest={!!record?.isNewBest} bestLabel={record ? `${record.best} points` : undefined}
        stats={game ? [{ label: 'Score', value: game.score, highlight: true }, { label: 'Cats booped', value: game.hits }, { label: 'Accuracy', value: `${Math.round(whackAccuracy(game))}%` }, { label: 'Best combo', value: `×${game.maxCombo}` }, { label: 'Escaped', value: game.escaped }] : []}
        primaryLabel="Play again" onPrimary={start} secondary={<Button variant="ghost" size="sm" onClick={() => { clearTimers(); setPhase('setup'); }}>Change difficulty</Button>} />
    </GameShell>
  );
}
