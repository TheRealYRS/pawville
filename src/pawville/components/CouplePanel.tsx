import { useState } from 'react';
import { Button } from '../../components/Button';
import { coupleView } from '../couple/coupleView.ts';
import { CatCharacter } from '../../components/CatCharacter';
import { Modal } from '../../components/Modal';
import { copyText } from '../../lib/share';
import {
  acceptInvite, cancelInvite, clearPairError, createDemoPair, createInvite, joinDemoPair, leavePair, usePairHub,
} from '../couple/pairHub.ts';
import { codeFromInput, pairErrorText, type Role } from '../couple/pairModel.ts';
import { catName, type TownIdentity } from '../identity';
import { ConfirmDialog } from './ConfirmDialog';

/**
 * Couple status, invitations and the clearly-labelled local demo. Never claims the partner is
 * online unless the pair transport actually sees them.
 */
export function CouplePanel({ open, onClose, identity }: { open: boolean; onClose: () => void; identity: TownIdentity }) {
  const hub = usePairHub();
  const [code, setCode] = useState('');
  const [role, setRole] = useState<Role>(identity.cat);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const pair = hub.pair;
  const partnerRole: Role | null = pair ? (pair.myRole === 'T' ? 'M' : 'T') : null;
  const backendReady = hub.backend === 'ready';
  const link = hub.invite ? `${window.location.origin}/pair/${hub.invite.code}` : '';

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} title="Your couple" onClose={onClose} className="pv-modal pv-modal--gold">
      {hub.error && (
        <div className="pv-alert" role="alert">
          <p>{pairErrorText(hub.error)}</p>
          <Button size="sm" variant="ghost" onClick={clearPairError}>Dismiss</Button>
        </div>
      )}
      {pair ? (
        <div className="pv-couple">
          <div className="pv-couple__cats" aria-hidden="true">
            <CatCharacter cat="T" coat={pair.myRole === 'T' ? identity.coat : undefined} mood="happy" size={86} />
            <span className="pv-couple__heart">♥</span>
            <CatCharacter cat="M" coat={pair.myRole === 'M' ? identity.coat : undefined} mood={hub.partnerOnline ? 'happy' : 'idle'} size={86} flip />
          </div>
          <p className="pv-couple__line">
            You are <strong>{catName(pair.myRole)}</strong>. {pair.partnerJoined
              ? <>Your partner{pair.partnerName ? <> <strong>{pair.partnerName}</strong></> : ''} is {catName(partnerRole!)}.</>
              : <>Waiting for someone to accept your invite as {catName(partnerRole!)}.</>}
          </p>
          <p className="pv-couple__status">
            <span className={`pv-dot pv-dot--${coupleView(hub).tone === 'ok' ? 'online' : coupleView(hub).tone === 'wait' ? 'connecting' : 'disabled'}`} aria-hidden="true" />
            {coupleView(hub).detail}{hub.syncing ? ' (checking…)' : ''}
          </p>
          {pair.source === 'demo' && (
            <p className="pv-note pv-badge-demo">Local two-tab demo — this couple only exists in this browser. It is not an online couple.</p>
          )}
          {hub.invite && (hub.invite.demo || hub.invite.status === 'open') && (
            <div className="pv-invite">
              <p>Invite code</p>
              <p className="pv-invite__code">{hub.invite.code}</p>
              {!hub.invite.demo && <p className="pv-note">Expires {hub.invite.expiresAt ? new Date(hub.invite.expiresAt).toLocaleString() : 'in 48 hours'}.</p>}
              {hub.invite.demo
                ? <p className="pv-note">Open Pawville in a second tab, choose “Join a demo couple” and type this code.</p>
                : (
                  <div className="pv-game-card__actions">
                    <Button size="sm" variant="secondary" onClick={async () => setCopied(await copyText(link))}>{copied ? 'Link copied!' : 'Copy invite link'}</Button>
                    <Button size="sm" variant="ghost" onClick={() => void run(cancelInvite)} disabled={busy}>Cancel invite</Button>
                  </div>
                )}
            </div>
          )}
          {pair.source === 'backend' && !pair.partnerJoined && (!hub.invite || hub.invite.status !== 'open') && (
            <Button variant="secondary" onClick={() => void run(() => createInvite(pair.myRole, identity.name))} loading={busy}>Make a new invite code</Button>
          )}
          <div className="modal__actions">
            <Button variant="ghost" onClick={() => setConfirmLeave(true)}>{pair.source === 'demo' ? 'End demo' : 'Leave couple'}</Button>
            <Button variant="primary" onClick={onClose}>Done</Button>
          </div>
        </div>
      ) : (
        <div className="pv-couple">
          <p className="pv-panel__blurb">Pair up with your partner to see each other in town, swing together, hold paws, duel in PawType and Cat Boxing, and send gifts.</p>
          <fieldset className="pv-fieldset">
            <legend>Your signature cat in the couple</legend>
            <div className="pv-cat-pick" role="radiogroup" aria-label="Your role">
              {(['T', 'M'] as const).map((r) => (
                <button key={r} type="button" role="radio" aria-checked={role === r} className={`pv-cat-pick__opt pv-cat-pick__opt--${r} ${role === r ? 'is-selected' : ''}`} onClick={() => setRole(r)}>
                  <CatCharacter cat={r} mood={role === r ? 'happy' : 'idle'} size={64} />
                  <span>{catName(r)}</span>
                </button>
              ))}
            </div>
          </fieldset>
          {backendReady ? (
            <>
              <section className="pv-board__card">
                <h3>Invite your partner</h3>
                <p className="pv-note">Creates a 6-letter code (valid 48 hours). You stay paired across visits on this browser’s guest session.</p>
                <Button variant="primary" onClick={() => void run(() => createInvite(role, identity.name))} loading={busy}>Create invite</Button>
              </section>
              <section className="pv-board__card">
                <h3>Got a code?</h3>
                <form className="join-form" onSubmit={(e) => {
                  e.preventDefault();
                  const c = codeFromInput(code);
                  if (c) void run(() => acceptInvite(c, identity.name));
                }}>
                  <label className="field">
                    <span className="field__label">Invite code or link</span>
                    <input className="field__input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABC234" autoComplete="off" autoCapitalize="characters" />
                  </label>
                  <Button variant="secondary" type="submit" disabled={!codeFromInput(code)} loading={busy}>Accept invite</Button>
                </form>
              </section>
            </>
          ) : (
            <p className="pv-alert">{pairErrorText(hub.backend === 'not-configured' ? 'not_configured' : 'client_missing')}</p>
          )}
          <details className="pv-details">
            <summary>Local two-tab demo (development, no server)</summary>
            <p className="pv-note">Lets two tabs of this browser act as a couple so you can try shared activities without Supabase. Clearly labelled; nothing is online.</p>
            <div className="pv-game-card__actions">
              <Button size="sm" variant="secondary" onClick={() => createDemoPair(role)}>Start a demo couple</Button>
            </div>
            <form className="join-form" onSubmit={(e) => {
              e.preventDefault();
              const c = codeFromInput(code);
              if (c) joinDemoPair(c);
            }}>
              <label className="field">
                <span className="field__label">Join a demo couple (code from the other tab — you get the other cat automatically)</span>
                <input className="field__input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABC234" autoComplete="off" />
              </label>
              <Button size="sm" variant="ghost" type="submit" disabled={!codeFromInput(code)}>Join demo</Button>
            </form>
          </details>
          <div className="modal__actions"><Button variant="ghost" onClick={onClose}>Close</Button></div>
        </div>
      )}
      <ConfirmDialog open={confirmLeave} title={pair?.source === 'demo' ? 'End the demo couple?' : 'Leave your couple?'} confirmLabel={pair?.source === 'demo' ? 'End demo' : 'Leave'} danger
        onCancel={() => setConfirmLeave(false)} onConfirm={() => { setConfirmLeave(false); void run(leavePair); }}>
        {pair?.source === 'demo'
          ? 'This only ends the local demo in this tab.'
          : 'Your seat in the couple is freed. Your own town progress on this device stays. You can pair again later with a new invite.'}
      </ConfirmDialog>
    </Modal>
  );
}
