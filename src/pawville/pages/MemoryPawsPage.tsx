import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Button } from '../../components/Button';
import { CatCharacter } from '../../components/CatCharacter';
import { ResultPanel } from '../components/ResultPanel';
import { GameShell, Segmented, Stat } from '../components/GameShell';
import { FACES, LEVELS, createMemory, flipCard, isComplete, memoryWinner, pairsFound, resolveMismatch, type CardFace, type MemoryLevel, type MemoryState } from '../games/memory/engine.ts';
import { formatSeconds, readBest, submitBest, type RecordResult } from '../games/shared.ts';
import { loadTownIdentity } from '../identity';
import { cue } from '../sound';

const LEVEL_OPTIONS = (['easy', 'medium', 'hard'] as const).map((id) => ({ id, label: LEVELS[id].label }));
const MISMATCH_MS = 850;

function ItemArt({ item }: { item: 'fish' | 'yarn' | 'paw' }) {
  if (item === 'fish') return (<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M10 32c8-12 26-14 36-4l8-8v24l-8-8c-10 10-28 8-36-4z" fill="#7fb2e6" stroke="#2f4870" strokeWidth="2.5" strokeLinejoin="round" /><circle cx="21" cy="30" r="2.6" fill="#1b1530" /><path d="M30 26c2 4 2 8 0 12" stroke="#2f4870" strokeWidth="2" fill="none" /></svg>);
  if (item === 'yarn') return (<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="30" cy="32" r="18" fill="#ff6fa1" stroke="#7a2448" strokeWidth="2.5" /><path d="M14 26c10 2 22 10 28 22M18 42c4-12 14-20 28-20M22 16c8 6 12 20 10 34" stroke="#ffd0e1" strokeWidth="2.2" fill="none" /><path d="M46 44c6 4 8 8 6 12" stroke="#ff6fa1" strokeWidth="2.5" fill="none" strokeLinecap="round" /></svg>);
  return (<svg viewBox="0 0 64 64" aria-hidden="true"><ellipse cx="32" cy="40" rx="13" ry="11" fill="#ffc94a" stroke="#8a5a0b" strokeWidth="2.5" />{[[16, 25], [25, 16], [39, 16], [48, 25]].map(([x, y]) => <ellipse key={x} cx={x} cy={y} rx="5.5" ry="6.5" fill="#ffc94a" stroke="#8a5a0b" strokeWidth="2.5" />)}</svg>);
}

function FaceArt({ face }: { face: CardFace }) {
  if (face.kind === 'item') return <ItemArt item={face.item} />;
  return <CatCharacter cat={face.cat} pose="head" mood={face.mood} accessory={face.accessory} size="100%" still />;
}

export function MemoryPawsPage() {
  const me = useMemo(() => loadTownIdentity(), []);
  const [level, setLevel] = useState<MemoryLevel>('easy');
  const [players, setPlayers] = useState<'1' | '2'>('1');
  const [game, setGame] = useState<MemoryState>(() => createMemory('easy', Math.random));
  const [started, setStarted] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [pausedTotal, setPausedTotal] = useState(0);
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  const [record, setRecord] = useState<RecordResult | null>(null);
  const mismatchTimer = useRef<number | null>(null);
  const done = isComplete(game);
  const paused = pausedAt !== null;
  const elapsed = startedAt === null ? 0 : ((finishedAt ?? (paused ? pausedAt : now)) - startedAt - pausedTotal) / 1000;

  useEffect(() => {
    if (startedAt === null || done || paused) return;
    const id = window.setInterval(() => setNow(performance.now()), 200);
    return () => window.clearInterval(id);
  }, [startedAt, done, paused]);
  useEffect(() => () => { if (mismatchTimer.current !== null) window.clearTimeout(mismatchTimer.current); }, []);
  useEffect(() => {
    if (!game.locked) return;
    mismatchTimer.current = window.setTimeout(() => { mismatchTimer.current = null; setGame((g) => resolveMismatch(g)); }, MISMATCH_MS);
    return () => { if (mismatchTimer.current !== null) window.clearTimeout(mismatchTimer.current); mismatchTimer.current = null; };
  }, [game.locked]);
  useEffect(() => {
    if (!done || startedAt === null || finishedAt !== null) return;
    const t = performance.now();
    setFinishedAt(t);
    if (game.players === 1) {
      const seconds = Math.round(((t - startedAt - pausedTotal) / 1000) * 10) / 10;
      setRecord(submitBest('memory', `time-${game.level}`, seconds, 'lower'));
      submitBest('memory', `moves-${game.level}`, game.moves, 'lower');
    }
    cue('join');
  }, [done, startedAt, finishedAt, pausedTotal, game.level, game.moves, game.players]);

  const newGame = (lvl: MemoryLevel = level) => {
    if (mismatchTimer.current !== null) window.clearTimeout(mismatchTimer.current);
    setGame(createMemory(lvl, Math.random, players === '2' ? 2 : 1));
    setStarted(true);
    setStartedAt(null);
    setFinishedAt(null);
    setPausedTotal(0);
    setPausedAt(null);
    setRecord(null);
  };
  const flip = (i: number) => {
    if (paused || done) return;
    if (startedAt === null) {
      const t = performance.now();
      setStartedAt(t);
      setNow(t);
    }
    const next = flipCard(game, i);
    if (next === game) return;
    cue(next.lastResult === 'match' ? 'pop' : next.lastResult === 'mismatch' ? 'nope' : 'tap');
    setGame(next);
  };
  const togglePause = () => {
    const t = performance.now();
    if (paused) {
      setPausedTotal((p) => p + (t - pausedAt!));
      setPausedAt(null);
      setNow(t);
    } else if (startedAt !== null && !done) setPausedAt(t);
  };
  const faceById = (id: string) => FACES.find((f) => f.id === id)!;
  const cols = LEVELS[game.level].cols;
  const best = readBest('memory', `time-${level}`);
  const win = memoryWinner(game);
  const pName = (i: 0 | 1) => (i === 0 ? 'Player 1' : 'Player 2');

  return (
    <GameShell game="memory-paws" venue="memory" place="Puzzle Garden · card table" title="Memory Paws" subtitle="Flip the cards, find the pairs."
      help={<><p>Flip two cards per move. Matching cards stay face up; others turn back after a moment.</p><p>Two players: find a pair to score and keep your turn; miss and it passes over.</p></>}
      stats={started ? (game.players === 2 ? (
        <><Stat label={pName(0)} value={game.scores[0]} tone={game.turn === 0 ? 'gold' : undefined} /><Stat label="Turn" value={pName(game.turn)} /><Stat label={pName(1)} value={game.scores[1]} tone={game.turn === 1 ? 'gold' : undefined} /></>
      ) : (
        <><Stat label="Time" value={formatSeconds(elapsed)} /><Stat label="Moves" value={game.moves} /><Stat label="Pairs" value={`${pairsFound(game)}/${LEVELS[game.level].pairs}`} tone="gold" /></>
      )) : undefined}>
      {!started ? (
        <section className="pv-setup mp-setup">
          <div className="mp-setup__art" aria-hidden="true">
            <div className="mp-card mp-card--demo"><div className="mp-card__back" /></div>
            <div className="mp-card mp-card--demo is-up"><div className="mp-card__front"><CatCharacter cat={me.cat} coat={me.coat} pose="head" mood="happy" accessory={me.accessory} size="100%" still /></div></div>
          </div>
          <Segmented label="Board size" value={level} options={LEVEL_OPTIONS} onChange={setLevel} />
          <Segmented label="Players" value={players} options={[{ id: '1', label: 'Solo' }, { id: '2', label: 'Two players, one device' }]} onChange={setPlayers} />
          <p className="pv-note">Best solo time on this board: {best === null ? '—' : formatSeconds(best)}</p>
          <Button variant="primary" size="lg" onClick={() => newGame(level)}>Deal the cards</Button>
        </section>
      ) : (
        <>
          <div className="mp-toolbar">
            {game.players === 1 && <Button variant="ghost" size="sm" onClick={togglePause} disabled={startedAt === null || done}>{paused ? 'Resume' : 'Pause'}</Button>}
            <Button variant="ghost" size="sm" onClick={() => newGame(game.level)}>Restart</Button>
            <Button variant="ghost" size="sm" onClick={() => setStarted(false)}>Change board</Button>
          </div>
          <div className={`mp-grid ${paused ? 'is-paused' : ''}`} style={{ '--mp-cols': cols } as CSSProperties} aria-label="Cards">
            {game.cards.map((card, i) => {
              const up = game.faceUp.includes(i) || game.matched.includes(i);
              const matched = game.matched.includes(i);
              const mismatch = game.locked && game.faceUp.includes(i);
              const face = faceById(card.face);
              return (
                <button key={card.key} type="button" className={`mp-card ${up ? 'is-up' : ''} ${matched ? 'is-matched' : ''} ${mismatch ? 'is-mismatch' : ''}`}
                  onClick={() => flip(i)} disabled={paused} aria-label={up ? `${face.label}${matched ? ' (matched)' : ''}` : `Card ${i + 1}, face down`}>
                  <span className="mp-card__inner">
                    <span className="mp-card__back" aria-hidden="true" />
                    <span className="mp-card__front" aria-hidden="true"><FaceArt face={face} /></span>
                  </span>
                </button>
              );
            })}
            {paused && <div className="mp-paused"><p>Paused</p><Button variant="primary" onClick={togglePause}>Resume</Button></div>}
          </div>
          <p className="sr-only" aria-live="polite">{game.lastResult === 'match' ? 'Match!' : game.lastResult === 'mismatch' ? 'Not a match.' : ''}</p>
        </>
      )}
      <ResultPanel open={started && done && finishedAt !== null}
        heading={game.players === 2 ? (win === 'tie' ? 'A perfect tie!' : `${pName(win === 1 ? 1 : 0)} wins!`) : 'Every pair found!'} sub={LEVELS[game.level].label}
        art={<CatCharacter cat={me.cat} coat={me.coat} accessory={me.accessory} mood="victorious" size={96} />}
        newBest={!!record?.isNewBest} bestLabel={record ? formatSeconds(record.best) : undefined}
        stats={game.players === 2 ? [
          { label: pName(0), value: game.scores[0], highlight: win === 0 }, { label: pName(1), value: game.scores[1], highlight: win === 1 }, { label: 'Moves', value: game.moves },
        ] : [
          { label: 'Time', value: formatSeconds(elapsed), highlight: true }, { label: 'Moves', value: game.moves }, { label: 'Pairs', value: LEVELS[game.level].pairs },
          { label: 'Difficulty', value: game.level[0].toUpperCase() + game.level.slice(1) },
        ]}
        primaryLabel="Play again" onPrimary={() => newGame(game.level)} secondary={<Button variant="ghost" size="sm" onClick={() => setStarted(false)}>Change board</Button>} />
    </GameShell>
  );
}
