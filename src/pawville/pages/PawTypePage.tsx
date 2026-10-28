import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { CatCharacter } from '../../components/CatCharacter';
import { useMemoryRecorder } from '../components/ActivityDock';
import { CountdownBadge, ResultPanel } from '../components/ResultPanel';
import { GameShell, Segmented, Stat } from '../components/GameShell';
import { PixelCat } from '../components/PixelCat';
import { SessionBar } from '../components/SessionBar';
import { newSid } from '../couple/activitySession.ts';
import { dispatch, onPairMessage, sendPair, usePairHub } from '../couple/pairHub.ts';
import { CATEGORIES, type PhraseCategory } from '../games/pawtype/phrases.ts';
import {
  MODE_SECONDS, botChars, charMarks, compareResults, createType, isOver, pickPhrases, plausibleResult, resultOf, totalChars, typeInput, typeStats,
  type RaceResult, type TypeMode, type TypeState,
} from '../games/pawtype/typing.ts';
import { readBest, submitBest, type RecordResult } from '../games/shared.ts';
import { catName, loadTownIdentity } from '../identity';
import { cue } from '../sound';
import { useWorldSave } from '../useWorldSave.ts';

type Opponent = 'practice' | 'bot' | 'duel';
type Phase = 'setup' | 'countdown' | 'racing' | 'done';
const MODES = [{ id: 'timed15', label: '15 seconds' }, { id: 'timed30', label: '30 seconds' }, { id: 'race', label: 'Finish the phrases' }] as const;
const BOT_SPEEDS = [{ id: '25', label: 'Sleepy · 25' }, { id: '40', label: 'Steady · 40' }, { id: '60', label: 'Zoomy · 60' }] as const;
const PHRASE_COUNT: Record<TypeMode, number> = { race: 3, timed15: 6, timed30: 10 };

export function PawTypePage() {
  const hub = usePairHub();
  const me = useMemo(() => loadTownIdentity(hub.pair?.myRole), [hub.pair?.myRole]);
  const partnerName = hub.pair ? (hub.pair.partnerName || catName(hub.pair.myRole === 'T' ? 'M' : 'T')) : '';
  const { update } = useWorldSave();
  const record = useMemoryRecorder(update, () => undefined);
  const [opponent, setOpponent] = useState<Opponent>('bot');
  const [mode, setMode] = useState<TypeMode>('timed30');
  const [category, setCategory] = useState<PhraseCategory | 'mixed'>('mixed');
  const [botWpm, setBotWpm] = useState<'25' | '40' | '60'>('40');
  const [phase, setPhase] = useState<Phase>('setup');
  const [state, setState] = useState<TypeState>(() => createType(['ready'], Number.MAX_SAFE_INTEGER, 'race'));
  const [now, setNow] = useState(Date.now());
  const [botSeed, setBotSeed] = useState(1);
  const [partnerChars, setPartnerChars] = useState(0);
  const [mine, setMine] = useState<RaceResult | null>(null);
  const [theirs, setTheirs] = useState<RaceResult | null>(null);
  const [suspicious, setSuspicious] = useState(false);
  const [record_, setRecord] = useState<RecordResult | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const inputRef = useRef<HTMLInputElement>(null);
  const sentResult = useRef(false);

  const s = hub.session;
  const duelActive = s.kind === 'pawtype' && s.phase !== 'idle' && s.phase !== 'cancelled';
  const duelParams = s.kind === 'pawtype' ? s.params : null;
  const effMode: TypeMode = duelActive && duelParams && typeof duelParams.mode === 'string' && duelParams.mode in MODE_SECONDS ? (duelParams.mode as TypeMode) : mode;

  const begin = (phrases: string[], startAt: number, m: TypeMode) => {
    setState(createType(phrases, startAt, m));
    setMine(null);
    setTheirs(null);
    setSuspicious(false);
    setRecord(null);
    setPartnerChars(0);
    sentResult.current = false;
    setPhase('countdown');
    setBotSeed(Math.floor(Math.random() * 1e9));
  };

  // Duel: start exactly at the coordinator's shared start time, with phrases from the shared seed.
  useEffect(() => {
    if (s.kind !== 'pawtype' || s.phase !== 'starting' || s.startAt === null) return;
    const seed = Number(s.params.seed ?? 1) + s.round;
    const cat = (typeof s.params.category === 'string' ? s.params.category : 'mixed') as PhraseCategory | 'mixed';
    begin(pickPhrases(seed, cat, PHRASE_COUNT[effMode]), s.startAt, effMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.kind, s.phase, s.startAt, s.round]);

  // Clock + countdown sound + phase changes.
  useEffect(() => {
    if (phase !== 'countdown' && phase !== 'racing') return;
    let lastSec = -1;
    const id = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      const st = stateRef.current;
      const secs = Math.ceil((st.startAt - t) / 1000);
      if (phase === 'countdown' && secs !== lastSec && secs > 0 && secs <= 3) {
        lastSec = secs;
        cue('click');
      }
      if (phase === 'countdown' && t >= st.startAt) {
        setPhase('racing');
        cue('join');
        window.setTimeout(() => inputRef.current?.focus(), 0);
      }
      if (phase === 'racing' && isOver(st, t)) finish(st, t);
    }, 100);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Duel progress & results from the partner (validated).
  useEffect(() => onPairMessage((m) => {
    if (m.t === 'pt:progress' && typeof m.chars === 'number' && m.sid === s.sid) setPartnerChars(Math.max(0, Math.min(10_000, m.chars)));
    if (m.t === 'pt:result' && m.sid === s.sid && m.result && typeof m.result === 'object') {
      const r = m.result as RaceResult;
      const ok = plausibleResult(r, stateRef.current.phrases, effMode);
      setSuspicious(!ok);
      setTheirs(ok ? { ...r, name: partnerName } : null);
    }
  }), [s.sid, effMode, partnerName]);

  const finish = (st: TypeState, t: number) => {
    const r = resultOf(me.name, st, t);
    setMine(r);
    setPhase('done');
    cue('join');
    if (opponent !== 'duel' && !duelActive) setRecord(submitBest('pawtype2', `${effMode}`, r.correctChars, 'higher'));
    if (duelActive && !sentResult.current) {
      sentResult.current = true;
      sendPair({ t: 'pt:result', sid: s.sid, result: r });
      dispatch({ type: 'end', reason: 'finished' });
    }
  };

  const onType = (value: string) => {
    if (phase !== 'racing') return;
    const t = Date.now();
    const prev = stateRef.current;
    const next = typeInput(prev, value, t);
    if (next === prev) return;
    if (next.keystrokes > prev.keystrokes) cue(next.errors > prev.errors ? 'nope' : 'tap');
    stateRef.current = next;
    setState(next);
    setNow(t);
    if (duelActive) sendPair({ t: 'pt:progress', sid: s.sid, chars: typeStats(next, t).correctChars });
    if (isOver(next, t)) finish(next, t);
  };

  const startSolo = () => {
    begin(pickPhrases(Math.floor(Math.random() * 1e9), category, PHRASE_COUNT[mode]), Date.now() + 3000, mode);
  };

  // Winner once both results are in (duel) — accuracy breaks ties.
  const duelWinner = mine && theirs ? (compareResults(mine, theirs, effMode) < 0 ? 'me' : compareResults(mine, theirs, effMode) > 0 ? 'them' : 'tie') : null;
  useEffect(() => {
    if (duelWinner === 'me') record({ kind: 'pawtype-win', title: 'Won a PawType duel', detail: `${mine!.wpm} wpm vs ${theirs!.wpm} wpm`, place: 'Arcade · PawType cabinet', withPartner: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duelWinner]);

  const st = typeStats(state, now);
  const total = totalChars(state.phrases);
  const elapsed = Math.max(0, (now - state.startAt) / 1000);
  const limit = MODE_SECONDS[state.endAt === null ? 'race' : effMode];
  const myProgress = state.endAt === null ? st.correctChars / Math.max(1, total) : Math.min(1, st.correctChars / Math.max(1, total));
  const botProgress = opponent === 'bot' && !duelActive && phase !== 'setup' ? Math.min(1, botChars(Number(botWpm), Math.max(0, elapsed), botSeed) / Math.max(1, total)) : null;
  const partnerProgress = duelActive ? Math.min(1, partnerChars / Math.max(1, total)) : null;
  const marks = charMarks(state);
  const current = state.phrases[state.index] ?? '';
  const countdown = phase === 'countdown' ? Math.max(1, Math.ceil((state.startAt - now) / 1000)) : phase === 'racing' && elapsed < 0.6 ? 0 : null;
  const canDuel = !!hub.pair && hub.partnerOnline;

  const help = (
    <>
      <p>Type the phrase shown on the track. Everything is lowercase, with no punctuation — capitals on your keyboard don’t matter.</p>
      <p>Each correct letter moves your cat forward. A wrong letter turns pink and your cat waits until you fix it with <kbd className="pv-key">Backspace</kbd>.</p>
      <p><strong>15 / 30 seconds</strong>: type as much as you can. <strong>Finish the phrases</strong>: first to the banner wins. In duels both of you get exactly the same phrases and start at the same moment.</p>
      <p className="pv-note">WPM = correct letters ÷ 5 per minute. Accuracy breaks ties, so careful typing beats mashing keys.</p>
    </>
  );

  return (
    <GameShell game="pawtype" venue="arena" place="Arcade · PawType cabinet" title="PawType" subtitle="A friendly typing race — sweet, silly, all lowercase." help={help}
      onBeforeLeave={() => { if (duelActive) dispatch({ type: 'cancel', reason: 'left' }); }}
      stats={phase !== 'setup' ? (
        <>
          <Stat label={limit ? 'Time left' : 'Time'} value={(limit ? Math.max(0, limit - Math.max(0, elapsed)) : Math.max(0, st.elapsed)).toFixed(1)} />
          <Stat label="WPM" value={Math.round(st.wpm)} tone="gold" />
          <Stat label="Accuracy" value={`${Math.round(st.accuracy)}%`} />
          <Stat label="Phrases" value={`${state.index}/${state.phrases.length}`} />
        </>
      ) : undefined}>
      <SessionBar kinds={['pawtype']} />
      <section className="pt-track" aria-label="Race track">
        <div className="pt-track__pennants" aria-hidden="true" />
        <div className="pt-lane">
          <span className="pt-lane__name">{me.name}</span>
          <div className="pt-lane__runner" style={{ left: `calc(${(myProgress * 100).toFixed(2)}% * 0.86)` }}>
            <PixelCat coat={me.coat} accessory={me.accessory} extra={me.extra} facing="right" moving={phase === 'racing' && myProgress < 1} scale={2} label={`You: ${Math.round(myProgress * 100)}%`} />
          </div>
        </div>
        {(botProgress !== null || partnerProgress !== null) && (
          <div className="pt-lane pt-lane--rival">
            <span className="pt-lane__name">{partnerProgress !== null ? partnerName : `Pace cat (computer) · ${botWpm}`}</span>
            <div className="pt-lane__runner" style={{ left: `calc(${(((partnerProgress ?? botProgress) ?? 0) * 100).toFixed(2)}% * 0.86)` }}>
              <PixelCat coat={me.cat === 'T' ? 'midnight' : 'tangerine'} facing="right" moving={phase === 'racing'} scale={2} label={`Opponent: ${Math.round(((partnerProgress ?? botProgress) ?? 0) * 100)}%`} />
            </div>
          </div>
        )}
        <div className="pt-track__finish" aria-hidden="true"><span>FINISH</span></div>
        <CountdownBadge value={countdown} />
      </section>

      {phase === 'setup' && !duelActive && (
        <section className="pv-setup pt-setup">
          <Segmented label="Opponent" value={opponent} options={[{ id: 'practice', label: 'Practice' }, { id: 'bot', label: 'Pace cat' }, { id: 'duel', label: 'Duel partner' }]} onChange={setOpponent} />
          <Segmented label="Race" value={mode} options={MODES} onChange={setMode} />
          <Segmented label="Phrases" value={category} options={[{ id: 'mixed', label: 'Mixed' }, ...CATEGORIES]} onChange={setCategory} />
          {opponent === 'bot' && <Segmented label="Pace cat speed (WPM)" value={botWpm} options={BOT_SPEEDS} onChange={setBotWpm} />}
          {opponent === 'duel' ? (
            canDuel
              ? <Button variant="primary" size="lg" disabled={s.phase !== 'idle'} onClick={() => dispatch({ type: 'invite', sid: newSid(), kind: 'pawtype', params: { mode, category, seed: Math.floor(Math.random() * 1e9) } })}>Invite {partnerName} to a duel</Button>
              : <p className="pv-note">{hub.pair ? `${partnerName} isn’t connected right now.` : 'Pair up with your partner in town (♥ button) to duel.'}</p>
          ) : <Button variant="primary" size="lg" onClick={startSolo}>Start</Button>}
          <p className="pv-note">Best ({MODES.find((m) => m.id === mode)!.label}): {(() => { const b = readBest('pawtype2', mode); return b === null ? '—' : `${b} letters`; })()}</p>
        </section>
      )}

      {(phase === 'countdown' || phase === 'racing') && (
        <section className="pt-typing">
          <div className="pt-passage pt-passage--big" aria-label="Phrase to type">
            {[...current].map((ch, i) => <span key={i} className={`pt-ch is-${marks[i]}${ch === ' ' ? ' is-space' : ''}`}>{ch}</span>)}
          </div>
          {state.phrases[state.index + 1] && <p className="pt-next">next: {state.phrases[state.index + 1]}</p>}
          <label className="pt-input">
            <span className="sr-only">Type the phrase here</span>
            <input ref={inputRef} value={state.typed} onChange={(e) => onType(e.target.value)} onPaste={(e) => e.preventDefault()} readOnly={phase !== 'racing'}
              placeholder={phase === 'countdown' ? 'Get ready…' : 'type here'} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} enterKeyHint="next" />
          </label>
        </section>
      )}

      <ResultPanel
        open={phase === 'done' && mine !== null}
        heading={duelActive || theirs ? (duelWinner === 'me' ? 'You win the duel!' : duelWinner === 'them' ? `${partnerName} wins this one!` : duelWinner === 'tie' ? 'A perfect tie!' : 'Waiting for your partner’s result…') : 'Nice typing!'}
        sub={MODES.find((m) => m.id === effMode)!.label}
        art={<CatCharacter cat={me.cat} coat={me.coat} accessory={me.accessory} mood={duelWinner === 'them' ? 'thinking' : 'victorious'} size={92} />}
        newBest={!!record_?.isNewBest}
        bestLabel={record_ ? `${record_.best} letters` : undefined}
        stats={[
          { label: 'Your WPM', value: mine?.wpm ?? 0, highlight: true },
          { label: 'Accuracy', value: `${mine?.accuracy ?? 0}%` },
          { label: 'Correct letters', value: mine?.correctChars ?? 0 },
          { label: 'Phrases done', value: mine?.phrasesDone ?? 0 },
          ...(theirs ? [{ label: `${partnerName}`, value: `${theirs.wpm} wpm · ${theirs.accuracy}%` }] : []),
          ...(suspicious ? [{ label: 'Note', value: 'Partner result could not be verified' }] : []),
        ]}
        primaryLabel={duelActive ? (s.host === hub.pair?.myRole ? 'Rematch' : 'Ready for a rematch') : 'Race again'}
        onPrimary={() => {
          if (duelActive || s.kind === 'pawtype') {
            if (s.phase === 'ended') dispatch({ type: 'rematch' });
            setPhase('setup');
          } else startSolo();
        }}
        secondary={<Button variant="ghost" size="sm" onClick={() => { if (s.kind === 'pawtype') dispatch({ type: 'reset' }); setPhase('setup'); }}>Change race</Button>}
      />
    </GameShell>
  );
}
