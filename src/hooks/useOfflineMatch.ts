import { useCallback, useEffect, useState } from 'react';
import { DURATION, randomBetween } from '../game/animations';
import { applyMove, newMatch, requestRematch } from '../game/matchEngine';
import { chooseMove } from '../game/minimaxAI';
import type { Difficulty, MatchState, Seat } from '../game/types';

/** Offline modes run the same match engine locally. Nothing here touches the network. */
export function useOfflineMatch(mode: 'computer' | 'local', difficulty: Difficulty) {
  const [match, setMatch] = useState<MatchState>(() => newMatch({ startingSeat: 'T' }));
  const humanSeat: Seat | null = mode === 'computer' ? 'T' : null;
  const aiSeat: Seat = 'M';
  const aiTurn = mode === 'computer' && match.status === 'playing' && match.turn === aiSeat;

  useEffect(() => {
    if (!aiTurn) return;
    const t = window.setTimeout(() => {
      setMatch((s) => {
        if (s.status !== 'playing' || s.turn !== aiSeat) return s;
        const r = applyMove(s, aiSeat, chooseMove(s.board, aiSeat, difficulty));
        return r.ok ? r.state : s;
      });
    }, randomBetween(DURATION.aiThinkMin, DURATION.aiThinkMax));
    return () => window.clearTimeout(t);
  }, [aiTurn, match.version, difficulty]);

  const move = useCallback((cell: number): { ok: boolean; error?: string } => {
    const seat = humanSeat ?? match.turn;
    const r = applyMove(match, seat, cell);
    if (!r.ok) return { ok: false, error: r.error };
    setMatch(r.state);
    return { ok: true };
  }, [match, humanSeat]);

  const rematch = useCallback(() => {
    setMatch((s) => {
      const a = requestRematch(s, 'T', s.round);
      if (!a.ok) return s;
      const b = requestRematch(a.state, 'M', s.round);
      return b.ok ? b.state : s;
    });
  }, []);

  const resetScores = useCallback(() => setMatch(newMatch({ startingSeat: 'T' })), []);

  return { match, move, rematch, resetScores, humanSeat, aiSeat, aiThinking: aiTurn };
}
