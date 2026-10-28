import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { CatCharacter } from '../../components/CatCharacter';
import { ResultPanel } from '../components/ResultPanel';
import { GameShell, Stat } from '../components/GameShell';
import { POINTS_TO_WIN, createSnap, nextRound, press, tickSnap, type SnapState } from '../games/reflex/engine.ts';
import { cue } from '../sound';

/** Paw Snap: two players on one device. Left player: A key / left pad. Right player: L key / right pad. */
export function PawSnapPage() {
  const [game, setGame] = useState<SnapState | null>(null);
  const ref = useRef<SnapState | null>(null);
  ref.current = game;
  useEffect(() => {
    if (!game || game.phase === 'over') return;
    const id = window.setInterval(() => {
      const g = ref.current;
      if (!g) return;
      const t = tickSnap(g, performance.now());
      if (t !== g) {
        setGame(t);
        cue('pop');
      }
    }, 16);
    return () => window.clearInterval(id);
  }, [game?.phase, game?.round]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!game || game.phase !== 'scored') return;
    const t = window.setTimeout(() => setGame((g) => (g ? nextRound(g, performance.now()) : g)), 1400);
    return () => window.clearTimeout(t);
  }, [game]);
  const hit = (player: 0 | 1) => {
    const g = ref.current;
    if (!g) return;
    const next = press(g, player, performance.now());
    if (next !== g) {
      setGame(next);
      cue(next.lastReason === 'foul' ? 'nope' : 'join');
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === 'KeyA') hit(0);
      if (e.code === 'KeyL') hit(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const start = () => setGame(createSnap(Math.floor(Math.random() * 1e9), performance.now()));
  const names = ['Tangerine', 'Midnight'];
  const msg = !game ? '' : game.phase === 'waiting' ? 'Wait for it…' : game.phase === 'signal' ? 'SNAP!' : game.lastReason === 'foul'
    ? `${names[1 - (game.lastWinner ?? 0)]} snapped too early! Point to ${names[game.lastWinner ?? 0]}.`
    : `${names[game.lastWinner ?? 0]} snaps it in ${game.reactionMs} ms!`;
  return (
    <GameShell game="paw-snap" venue="booth" place="Arcade corner" title="Paw Snap" subtitle="Wait for the fish to jump… then snap first!"
      help={<p>Two players, one device. Left cat: <kbd className="pv-key">A</kbd> or the left pad. Right cat: <kbd className="pv-key">L</kbd> or the right pad. Snapping before the fish jumps gives your partner the point. First to {POINTS_TO_WIN}.</p>}
      stats={game ? <><Stat label="Tangerine" value={game.scores[0]} tone="gold" /><Stat label="Round" value={game.round} /><Stat label="Midnight" value={game.scores[1]} tone="gold" /></> : undefined}>
      {!game ? (
        <section className="pv-setup">
          <div className="wc-setup__art" aria-hidden="true"><CatCharacter cat="T" mood="playful" size={84} /><CatCharacter cat="M" mood="playful" size={84} flip /></div>
          <Button variant="primary" size="lg" onClick={start}>Start</Button>
        </section>
      ) : (
        <section className={`ps-stage is-${game.phase}`} aria-live="assertive">
          <button type="button" className="ps-pad ps-pad--T" onPointerDown={(e) => { e.preventDefault(); hit(0); }} aria-label="Tangerine snaps (A)"><CatCharacter cat="T" mood={game.lastWinner === 0 && game.phase !== 'waiting' ? 'victorious' : 'thinking'} size={90} still /><span>A</span></button>
          <div className="ps-pond">
            <span className={`ps-fish ${game.phase === 'signal' ? 'is-up' : ''}`} aria-hidden="true" />
            <p className="ps-msg">{msg}</p>
          </div>
          <button type="button" className="ps-pad ps-pad--M" onPointerDown={(e) => { e.preventDefault(); hit(1); }} aria-label="Midnight snaps (L)"><CatCharacter cat="M" mood={game.lastWinner === 1 && game.phase !== 'waiting' ? 'victorious' : 'thinking'} size={90} flip still /><span>L</span></button>
        </section>
      )}
      <ResultPanel open={game?.phase === 'over'} heading={`${names[game?.lastWinner ?? 0]} wins Paw Snap!`} mood="lively"
        art={<CatCharacter cat={game?.lastWinner === 1 ? 'M' : 'T'} mood="victorious" size={96} />}
        stats={[{ label: 'Score', value: `${game?.scores[0] ?? 0} – ${game?.scores[1] ?? 0}`, highlight: true }, { label: 'Rounds', value: game?.round ?? 0 }]}
        primaryLabel="Play again" onPrimary={start} />
    </GameShell>
  );
}
