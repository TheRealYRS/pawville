import { useEffect, useRef, useState } from 'react';
import { DURATION } from '../game/animations';
import type { MatchState, Seat } from '../game/types';
import { sfx } from '../lib/soundService';

/**
 * Turns authoritative state transitions into sounds and transient UI effects.
 * Keyed on version/round so duplicate realtime events can never replay them.
 */
export function useGameFeedback(match: MatchState | null, mySeat: Seat | null) {
  const prev = useRef<MatchState | null>(null);
  const timers = useRef<number[]>([]);
  const [roundBanner, setRoundBanner] = useState(false);
  const [showResult, setShowResult] = useState(false);

  useEffect(() => () => { timers.current.forEach((t) => window.clearTimeout(t)); }, []);

  useEffect(() => {
    const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };
    const p = prev.current;
    prev.current = match;
    if (!match) return;

    if (match.status !== 'finished') setShowResult(false);
    if (!p) {
      if (match.status === 'finished') setShowResult(true);
      return;
    }
    if (match.version <= p.version) return;

    if (match.round > p.round) {
      setRoundBanner(true);
      later(() => setRoundBanner(false), DURATION.roundBanner);
      return;
    }

    if (match.history.length > p.history.length) {
      sfx.tap();
      sfx.pop();
    }

    if (match.status === 'finished' && p.status !== 'finished') {
      const w = match.winner;
      const round = match.round;
      later(() => {
        if (w === 'D') sfx.draw();
        else if (mySeat === null || w === mySeat) sfx.victory();
        else sfx.lose();
      }, 180);
      later(() => {
        if (prev.current?.round === round && prev.current.status === 'finished') setShowResult(true);
      }, DURATION.winReveal);
    }
  }, [match, mySeat]);

  return { roundBanner, showResult };
}
