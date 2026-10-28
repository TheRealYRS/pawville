import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { DURATION, lookToward } from '../game/animations';
import { CAT_NAMES, otherSeat } from '../game/gameRules';
import { THINKING, errorText, resultCopy } from '../game/messages';
import { activeRematchVotes, declinedThisRound } from '../game/matchEngine';
import type { Accessory, CatMood, Seat } from '../game/types';
import { useGameFeedback } from '../hooks/useGameFeedback';
import { useOnlineRoom, type RoomErrorReason } from '../hooks/useOnlineRoom';
import { useToast } from '../hooks/useToast';
import { copyText, roomUrl } from '../lib/share';
import { sfx } from '../lib/soundService';
import { Button } from '../components/Button';
import { CustomizeModal } from '../components/CustomizeModal';
import { GameBoard } from '../components/GameBoard';
import { GameHud } from '../components/GameHud';
import { GameStatus, type StatusTone } from '../components/GameStatus';
import { InvitePanel } from '../components/InvitePanel';
import { MoveHistory } from '../components/MoveHistory';
import { PlayerCard, type Connection } from '../components/PlayerCard';
import { ReactionBar } from '../components/ReactionBar';
import { REACTION_MOOD } from '../components/ReactionIcon';
import { StateScreen } from '../components/StateScreen';
import { Starfield } from '../components/Starfield';
import { Toast } from '../components/Toast';
import { TopBar } from '../components/TopBar';
import { VictoryOverlay } from '../components/VictoryOverlay';
import { BackToPawville } from '../pawville/components/BackToPawville';
import { PATHS } from '../pawville/destinations.ts';
import { goTo } from '../pawville/navigation';
const ERROR_SCREENS: Record<RoomErrorReason, { title: string; message: string; mood: CatMood; cat: Seat }> = {
  not_found: { title: "This room doesn't exist", message: 'The link may be mistyped, or the room was cleaned up after a long nap.', mood: 'surprised', cat: 'M' },
  expired: { title: 'This room has expired', message: 'Rooms close after a couple of hours without moves. Start a fresh one — it only takes a second.', mood: 'sad', cat: 'T' },
  full: { title: 'This arena is full', message: 'Two cats are already playing in this room. Start your own room and invite a friend!', mood: 'thinking', cat: 'M' },
  backend: { title: "Can't reach the game server", message: 'Check your internet connection. If it keeps happening, the server may be down for a moment.', mood: 'sad', cat: 'M' },
  anonymous_disabled: { title: 'Guest play is switched off', message: 'The server needs "Anonymous Sign-ins" enabled in Supabase Authentication settings.', mood: 'thinking', cat: 'T' },
  not_configured: { title: 'Online play is not set up', message: 'This copy of Paw vs Paw has no Supabase project configured. Offline modes still work!', mood: 'thinking', cat: 'T' },
};
export function GameRoomPage({ roomId }: { roomId: string }) {
  const { toast, show } = useToast();
  const room = useOnlineRoom(roomId, (code) => { sfx.nope(); show(errorText(code), 'warn'); });
  const { phase, players, mySeat, link, restoredAt, presence, reactions, pendingCell, busy } = room;
  const match = room.room?.match ?? null;
  const feedback = useGameFeedback(match, mySeat);
  const [shake, setShake] = useState<{ cell: number; nonce: number } | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [showRestored, setShowRestored] = useState(false);
  // Victory-overlay fix: VictoryOverlay renders whenever `open` is true. Leaving now sets
  // `exiting` synchronously, so the overlay closes before the URL changes and stays closed even if
  // the leave request is slow or fails.
  const [exiting, setExiting] = useState(false);
  const opp: Seat | null = mySeat ? otherSeat(mySeat) : null;
  const oppPlayer = opp ? players[opp] : undefined;
  const oppLeft = !!oppPlayer?.leftAt;
  useEffect(() => {
    if (!restoredAt) return;
    setShowRestored(true);
    const t = window.setTimeout(() => setShowRestored(false), DURATION.restoredBanner);
    return () => window.clearTimeout(t);
  }, [restoredAt]);
  const oppSeen = useRef<'unknown' | 'absent' | 'present' | 'left'>('unknown');
  useEffect(() => {
    if (phase.kind !== 'ready' || !opp) return;
    const now = !oppPlayer ? 'absent' : oppPlayer.leftAt ? 'left' : 'present';
    const before = oppSeen.current;
    oppSeen.current = now;
    if (before === 'unknown' || before === now) return;
    if (now === 'present' && before === 'absent') {
      sfx.join();
      show(`${CAT_NAMES[opp]} has entered the arena!`, 'success', 3200);
    } else if (now === 'present' && before === 'left') {
      sfx.join();
      show(`${CAT_NAMES[opp]} is back!`, 'success');
    } else if (now === 'left') {
      show(`${CAT_NAMES[opp]} left the room.`, 'warn', 3500);
    }
  }, [phase.kind, opp, oppPlayer, show]);
  useEffect(() => { setMinimized(false); }, [match?.round]);
  const accessories = useMemo<Record<Seat, Accessory>>(
    () => ({ T: players.T?.accessory ?? 'none', M: players.M?.accessory ?? 'none' }),
    [players],
  );
  const exitTo = (path: string) => {
    flushSync(() => setExiting(true));
    goTo(path);
  };
  const leaveRoomTo = async (path: string) => {
    flushSync(() => setExiting(true));
    try {
      await room.leave();
    } catch {
      // The room still expires on its own; never trap the player on the result screen.
    } finally {
      goTo(path);
    }
  };
  if (phase.kind === 'connecting' || (phase.kind === 'ready' && (!match || !mySeat))) {
    return (
      <StateScreen loading mood="thinking" title="Sniffing out your room..."
        slowActions={<><Button variant="primary" onClick={room.retry}>Try again</Button><Button variant="ghost" onClick={() => exitTo(PATHS.arcade)}>Back to lobby</Button></>} />
    );
  }
  if (phase.kind === 'error') {
    const s = ERROR_SCREENS[phase.reason];
    return (
      <StateScreen cat={s.cat} mood={s.mood} title={s.title} message={s.message}
        actions={
          <>
            {phase.reason === 'backend' && <Button variant="primary" onClick={room.retry}>Try again</Button>}
            {phase.reason !== 'backend' && phase.reason !== 'not_configured' && phase.reason !== 'anonymous_disabled' && (
              <Button variant="primary" onClick={() => exitTo(PATHS.arcade)}>Create a new room</Button>
            )}
            {phase.reason === 'not_configured' && <Button variant="primary" onClick={() => exitTo('/play/computer')}>Play vs Computer</Button>}
            <Button variant="ghost" onClick={() => exitTo(PATHS.arcade)}>Back to lobby</Button>
            <Button variant="ghost" onClick={() => exitTo(PATHS.town)}>Back to Pawville</Button>
          </>
        } />
    );
  }
  const m = match!;
  const me = mySeat!;
  const them = opp!;
  const myTurn = m.status === 'playing' && m.turn === me && !oppLeft;
  const canPlay = myTurn && pendingCell === null && link !== 'reconnecting';
  const connection = (seat: Seat): Connection => {
    const p = players[seat];
    if (!p) return 'waiting';
    if (p.leftAt) return 'left';
    if (seat === me) return link === 'live' ? 'online' : link === 'connecting' ? 'unknown' : 'reconnecting';
    if (presence === null) return 'unknown';
    return presence.has(seat) ? 'online' : 'away';
  };
  const latestReaction = (seat: Seat) => [...reactions].reverse().find((r) => r.seat === seat);
  const moodFor = (seat: Seat): CatMood => {
    const r = latestReaction(seat);
    if (r) return REACTION_MOOD[r.kind];
    if (m.status === 'finished') return m.winner === 'D' ? 'thinking' : m.winner === seat ? 'victorious' : 'sad';
    if (m.status === 'waiting') return 'playful';
    if (players[seat]?.leftAt) return 'sad';
    if (m.turn === seat) return 'thinking';
    return m.lastMoveSeat === seat ? 'happy' : 'idle';
  };
  let status: { text: string; tone: StatusTone };
  if (link === 'reconnecting') status = { text: 'Reconnecting...', tone: 'warn' };
  else if (showRestored) status = { text: 'Connection restored!', tone: 'good' };
  else if (feedback.roundBanner) status = { text: 'Both cats are ready! New round starting...', tone: 'good' };
  else if (m.status === 'waiting') status = { text: 'Waiting for your opponent...', tone: 'neutral' };
  else if (oppLeft && m.status === 'playing') status = { text: `${CAT_NAMES[them]} left the room. Waiting to see if they come back...`, tone: 'warn' };
  else if (m.status === 'finished') status = { text: resultCopy(m.winner, m.round, me).title, tone: m.winner === me ? 'good' : 'neutral' };
  else if (myTurn) status = { text: 'Your turn!', tone: 'mine' };
  else status = { text: THINKING[m.turn], tone: m.turn };
  const onSelect = async (cell: number) => {
    if (!myTurn || m.board[cell] !== null || pendingCell !== null) {
      sfx.nope();
      setShake({ cell, nonce: Date.now() });
      if (m.status === 'playing' && !myTurn && !oppLeft) show(`Paws off! It's ${CAT_NAMES[m.turn]}'s turn.`, 'info', 1800);
      return;
    }
    sfx.tap();
    const res = await room.move(cell);
    if (!res.ok) setShake({ cell, nonce: Date.now() });
  };
  const copyRoomLink = async () => {
    const ok = await copyText(roomUrl(roomId));
    show(ok ? 'Room link copied!' : "Couldn't copy — copy it from the address bar.", ok ? 'success' : 'warn');
  };
  const look = lookToward(m.lastMoveCell);
  const card = (seat: Seat) => (
    <PlayerCard seat={seat} nickname={players[seat]?.nickname ?? null} accessory={accessories[seat]} isYou={seat === me}
      isActive={m.status === 'playing' && m.turn === seat} mood={moodFor(seat)} look={m.lastMoveSeat && m.lastMoveSeat !== seat ? look : undefined}
      connection={connection(seat)} wins={seat === 'T' ? m.score.T : m.score.M} reactions={reactions.filter((r) => r.seat === seat)} />
  );
  const votes = activeRematchVotes(m);
  const declined = declinedThisRound(m);
  let note: string | null = null;
  if (oppLeft) note = `${CAT_NAMES[them]} left the room. Start a new room to keep playing.`;
  else if (declined === them) note = `${CAT_NAMES[them]} declined a rematch.`;
  else if (declined === me) note = 'You declined the rematch.';
  else if (votes[me] && votes[them]) note = 'Both cats are ready!';
  else if (votes[me]) note = `Waiting for ${CAT_NAMES[them]} to agree...`;
  else if (votes[them]) note = `${CAT_NAMES[them]} wants a rematch!`;
  return (
    <main className="game-page">
      <Starfield density={28} paws={3} />
      <TopBar onBack={() => exitTo(PATHS.arcade)}
        badge={<><span className="dot-live" aria-hidden="true" /> Online · You are <strong className={me === 'T' ? 'text-orange' : 'text-lavender'}>{CAT_NAMES[me]}</strong></>}
        extra={<BackToPawville onBeforeLeave={() => flushSync(() => setExiting(true))} />} />
      {m.status === 'waiting' ? (
        <InvitePanel roomId={roomId} accessory={accessories.T} onCancel={() => void leaveRoomTo(PATHS.arcade)} onNotify={show} />
      ) : (
        <div className="game-layout">
          <GameHud left={card('T')} right={card('M')} score={m.score} round={m.round} />
          <GameStatus text={status.text} tone={status.tone} />
          <GameBoard match={m} activeSeat={m.status === 'playing' ? m.turn : null} canPlay={canPlay} pendingCell={pendingCell} accessories={accessories} onSelect={onSelect} shake={shake} />
          <div className="game-footer">
            <ReactionBar seat={me} onReact={room.react} disabled={oppLeft} />
            <MoveHistory match={m} />
          </div>
        </div>
      )}
      <VictoryOverlay open={!exiting && feedback.showResult && m.status === 'finished'} winner={m.winner} round={m.round} mySeat={me}
        accessories={accessories} minimized={minimized} onToggleMinimize={() => setMinimized((v) => !v)} note={note}>
        <Button variant="primary" size="lg" onClick={room.rematch} loading={busy === 'rematch'} disabled={votes[me] || oppLeft}>
          {votes[me] ? 'Rematch requested' : votes[them] ? 'Accept rematch' : 'Play again'}
        </Button>
        <div className="result-card__row">
          {!oppLeft && declined !== me && <Button variant="ghost" size="sm" onClick={room.decline} loading={busy === 'decline'}>Not this time</Button>}
          <Button variant="ghost" size="sm" onClick={copyRoomLink}>Copy room link</Button>
          <Button variant="ghost" size="sm" onClick={() => setAppearanceOpen(true)}>Change appearance</Button>
          <Button variant="secondary" size="sm" onClick={() => void leaveRoomTo(PATHS.arcade)} loading={busy === 'leave'}>Back to lobby</Button>
          <Button variant="ghost" size="sm" onClick={() => exitTo(PATHS.town)}>Back to Pawville</Button>
        </div>
      </VictoryOverlay>
      <CustomizeModal open={appearanceOpen} onClose={() => setAppearanceOpen(false)} inRoomSeat={me} onSaved={({ accessory }) => { void room.changeAccessory(accessory); }} />
      <Toast toast={toast} />
    </main>
  );
}
