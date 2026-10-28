import { useState } from 'react';
import { flushSync } from 'react-dom';
import { lookToward } from '../game/animations';
import { CAT_NAMES } from '../game/gameRules';
import { THINKING, resultCopy } from '../game/messages';
import type { Accessory, CatMood, Difficulty, Seat } from '../game/types';
import { useGameFeedback } from '../hooks/useGameFeedback';
import { useOfflineMatch } from '../hooks/useOfflineMatch';
import { useToast } from '../hooks/useToast';
import { loadPreferences, savePreferences } from '../lib/preferences';
import { sfx } from '../lib/soundService';
import { Button } from '../components/Button';
import { CustomizeModal } from '../components/CustomizeModal';
import { GameBoard } from '../components/GameBoard';
import { GameHud } from '../components/GameHud';
import { GameStatus, type StatusTone } from '../components/GameStatus';
import { MoveHistory } from '../components/MoveHistory';
import { PlayerCard } from '../components/PlayerCard';
import { Starfield } from '../components/Starfield';
import { Toast } from '../components/Toast';
import { TopBar } from '../components/TopBar';
import { VictoryOverlay } from '../components/VictoryOverlay';
import { BackToPawville } from '../pawville/components/BackToPawville';
import { PATHS } from '../pawville/destinations.ts';
import { goTo } from '../pawville/navigation';
const LEVELS: { id: Difficulty; label: string }[] = [
  { id: 'easy', label: 'Easy' },
  { id: 'medium', label: 'Medium' },
  { id: 'hard', label: 'Hard' },
];
export function OfflineGamePage({ mode }: { mode: 'computer' | 'local' }) {
  const { toast, show } = useToast();
  const [prefs, setPrefs] = useState(loadPreferences);
  const [difficulty, setDifficulty] = useState<Difficulty>(prefs.difficulty);
  const { match: m, move, rematch, humanSeat, aiThinking } = useOfflineMatch(mode, difficulty);
  const feedback = useGameFeedback(m, humanSeat);
  const [shake, setShake] = useState<{ cell: number; nonce: number } | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [exiting, setExiting] = useState(false); // see GameRoomPage: closes the overlay before navigating
  const exitTo = (path: string) => {
    flushSync(() => setExiting(true));
    goTo(path);
  };
  const accessories: Record<Seat, Accessory> = { T: prefs.accessory, M: mode === 'computer' ? 'wizard' : 'none' };
  const canPlay = m.status === 'playing' && (mode === 'local' || m.turn === humanSeat);
  const onSelect = (cell: number) => {
    const res = canPlay ? move(cell) : { ok: false, error: 'not_your_turn' };
    if (!res.ok) {
      sfx.nope();
      setShake({ cell, nonce: Date.now() });
      if (res.error === 'not_your_turn' && m.status === 'playing') show('Midnight is still thinking — paws off!', 'info', 1500);
    }
  };
  const moodFor = (seat: Seat): CatMood => {
    if (m.status === 'finished') return m.winner === 'D' ? 'thinking' : m.winner === seat ? 'victorious' : 'sad';
    if (m.turn === seat) return 'thinking';
    return m.lastMoveSeat === seat ? 'happy' : 'idle';
  };
  let status: { text: string; tone: StatusTone };
  if (feedback.roundBanner) status = { text: 'New round starting...', tone: 'good' };
  else if (m.status === 'finished') status = { text: resultCopy(m.winner, m.round, humanSeat).title, tone: 'good' };
  else if (mode === 'computer') status = m.turn === humanSeat ? { text: 'Your turn!', tone: 'mine' } : { text: THINKING.M, tone: 'M' };
  else status = { text: `${CAT_NAMES[m.turn]}'s turn — pass the device!`, tone: m.turn };
  const look = lookToward(m.lastMoveCell);
  const card = (seat: Seat) => (
    <PlayerCard seat={seat}
      nickname={seat === 'T' && prefs.nickname ? prefs.nickname : mode === 'computer' && seat === 'M' ? `CPU · ${difficulty[0].toUpperCase()}${difficulty.slice(1)}` : null}
      accessory={accessories[seat]} isYou={mode === 'computer' && seat === humanSeat} isActive={m.status === 'playing' && m.turn === seat}
      mood={moodFor(seat)} look={m.lastMoveSeat && m.lastMoveSeat !== seat ? look : undefined}
      connection={mode === 'computer' && seat === 'M' ? 'computer' : 'local'} wins={seat === 'T' ? m.score.T : m.score.M} reactions={[]} />
  );
  const playAgain = () => {
    setMinimized(false);
    rematch();
  };
  return (
    <main className="game-page">
      <Starfield density={28} paws={3} />
      <TopBar onBack={() => exitTo(PATHS.arcade)} badge={mode === 'computer' ? <>Offline · vs Computer</> : <>Offline · Pass &amp; Play</>}
        extra={<BackToPawville onBeforeLeave={() => flushSync(() => setExiting(true))} />} />
      <div className="game-layout">
        {mode === 'computer' && (
          <div className="segmented" role="radiogroup" aria-label="Computer difficulty">
            {LEVELS.map((l) => (
              <button key={l.id} type="button" role="radio" aria-checked={difficulty === l.id} className={`segmented__opt ${difficulty === l.id ? 'is-selected' : ''}`}
                onClick={() => { setDifficulty(l.id); savePreferences({ difficulty: l.id }); sfx.click(); }}>
                {l.label}
              </button>
            ))}
          </div>
        )}
        <GameHud left={card('T')} right={card('M')} score={m.score} round={m.round} />
        <GameStatus text={status.text} tone={status.tone} />
        <GameBoard match={m} activeSeat={m.status === 'playing' ? m.turn : null} canPlay={canPlay && !aiThinking} pendingCell={null} accessories={accessories} onSelect={onSelect} shake={shake} />
        <div className="game-footer">
          <MoveHistory match={m} />
          <p className="offline-note">This match is played on this device only — no internet needed.</p>
        </div>
      </div>
      <VictoryOverlay open={!exiting && feedback.showResult && m.status === 'finished'} winner={m.winner} round={m.round} mySeat={humanSeat}
        accessories={accessories} minimized={minimized} onToggleMinimize={() => setMinimized((v) => !v)}>
        <Button variant="primary" size="lg" onClick={playAgain}>Play again</Button>
        <div className="result-card__row">
          <Button variant="ghost" size="sm" onClick={() => setAppearanceOpen(true)}>Change appearance</Button>
          <Button variant="secondary" size="sm" onClick={() => exitTo(PATHS.arcade)}>Back to lobby</Button>
          <Button variant="ghost" size="sm" onClick={() => exitTo(PATHS.town)}>Back to Pawville</Button>
        </div>
      </VictoryOverlay>
      <CustomizeModal open={appearanceOpen} onClose={() => setAppearanceOpen(false)} inRoomSeat="T" onSaved={() => setPrefs(loadPreferences())} />
      <Toast toast={toast} />
    </main>
  );
}
