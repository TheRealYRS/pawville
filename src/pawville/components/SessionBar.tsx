import { useEffect, useState } from 'react';
import { Button } from '../../components/Button';
import { ACTIVITY_LABEL, GRACE_MS, canStart, type ActivityKind } from '../couple/activitySession.ts';
import { dispatch, usePairHub } from '../couple/pairHub.ts';
import { catName } from '../identity';

const REASON: Record<string, string> = {
  declined: 'Your partner said “not now”.',
  'declined-by-me': 'You declined.',
  'cancelled-by-me': 'Cancelled.',
  'cancelled-by-partner': 'Your partner cancelled.',
  'partner-left': 'Your partner disconnected, so the activity ended.',
  'partner-offline': 'Your partner is not connected right now.',
};

/**
 * The one shared-activity bar: invitations, ready-checks, start, waiting, cancel and
 * disconnect states. `kinds` limits which sessions this screen handles; `onAccepted` lets a
 * screen jump to the right place (e.g. town → PawType) when you accept.
 */
export function SessionBar({ kinds, onAccepted, autoReady = false }: { kinds?: readonly ActivityKind[]; onAccepted?: (kind: ActivityKind) => void; autoReady?: boolean }) {
  const hub = usePairHub();
  const s = hub.session;
  const me = hub.pair?.myRole ?? 'T';
  const them = me === 'T' ? 'M' : 'T';
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (s.phase === 'idle') return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [s.phase]);
  // Simple interactions (emotes, paw-holding) don't need a separate ready step.
  useEffect(() => {
    if (s.phase === 'lobby' && (autoReady || s.kind === 'emote' || s.kind === 'pawhold') && !s.ready[me]) dispatch({ type: 'ready', ready: true });
    if (s.phase === 'lobby' && (s.kind === 'emote' || s.kind === 'pawhold') && canStart(s, me)) dispatch({ type: 'start', now: Date.now() - 2800 });
  }, [s, me, autoReady]);
  if (s.phase === 'idle' || s.phase === 'running' || s.phase === 'ended') {
    if (s.phase === 'running' && s.awaySince !== null) {
      const left = Math.max(0, Math.ceil((GRACE_MS - (now - s.awaySince)) / 1000));
      return <div className="pv-session pv-session--warn" role="status">Your partner lost connection — waiting {left}s for them to come back… <Button size="sm" variant="ghost" onClick={() => dispatch({ type: 'cancel' })}>Stop</Button></div>;
    }
    return null;
  }
  if (!s.kind || (kinds && !kinds.includes(s.kind))) {
    if (s.phase === 'invited' && s.kind) {
      return (
        <div className="pv-session" role="alertdialog" aria-label="Invitation">
          <span>{catName(them)} invites you to {ACTIVITY_LABEL[s.kind]}.</span>
          <Button size="sm" variant="primary" onClick={() => { dispatch({ type: 'accept' }); onAccepted?.(s.kind!); }}>Join</Button>
          <Button size="sm" variant="ghost" onClick={() => dispatch({ type: 'decline' })}>Not now</Button>
        </div>
      );
    }
    return null;
  }
  const label = ACTIVITY_LABEL[s.kind];
  switch (s.phase) {
    case 'inviting':
      return <div className="pv-session" role="status"><span>Asked {catName(them)} to {label}…</span><Button size="sm" variant="ghost" onClick={() => dispatch({ type: 'cancel' })}>Cancel</Button></div>;
    case 'invited':
      return (
        <div className="pv-session" role="alertdialog" aria-label="Invitation">
          <span>{catName(them)} invites you to {label}.</span>
          <Button size="sm" variant="primary" onClick={() => { dispatch({ type: 'accept' }); onAccepted?.(s.kind!); }}>Join</Button>
          <Button size="sm" variant="ghost" onClick={() => dispatch({ type: 'decline' })}>Not now</Button>
        </div>
      );
    case 'lobby':
      return (
        <div className="pv-session" role="status">
          <span className="pv-session__ready">
            <span className={s.ready[me] ? 'is-ready' : ''}>You: {s.ready[me] ? 'ready ✓' : 'not ready'}</span>
            <span className={s.ready[them] ? 'is-ready' : ''}>{catName(them)}: {s.partnerPresent ? (s.ready[them] ? 'ready ✓' : 'not ready') : 'away'}</span>
          </span>
          <Button size="sm" variant={s.ready[me] ? 'ghost' : 'secondary'} onClick={() => dispatch({ type: 'ready', ready: !s.ready[me] })}>{s.ready[me] ? 'Not ready' : "I'm ready"}</Button>
          {s.host === me && <Button size="sm" variant="primary" disabled={!canStart(s, me)} onClick={() => dispatch({ type: 'start', now: Date.now() })}>Start</Button>}
          {s.host !== me && <span className="pv-note">{catName(them)} starts when you’re both ready.</span>}
          <Button size="sm" variant="ghost" onClick={() => dispatch({ type: 'cancel' })}>Leave</Button>
        </div>
      );
    case 'starting': {
      const secs = s.startAt ? Math.max(0, Math.ceil((s.startAt - now) / 1000)) : 0;
      return <div className="pv-session pv-session--go" role="status">Starting together in {secs}…</div>;
    }
    case 'cancelled':
      return <div className="pv-session pv-session--warn" role="status"><span>{REASON[s.reason ?? ''] ?? 'The activity ended.'}</span><Button size="sm" variant="ghost" onClick={() => dispatch({ type: 'reset' })}>OK</Button></div>;
  }
  return null;
}
