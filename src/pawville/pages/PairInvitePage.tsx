import { useEffect, useMemo, useState } from 'react';
import { Button } from '../../components/Button';
import { CatCharacter } from '../../components/CatCharacter';
import { GameShell } from '../components/GameShell';
import { acceptInvite, declineInvite, usePairHub } from '../couple/pairHub.ts';
import { pairErrorText } from '../couple/pairModel.ts';
import { PATHS } from '../destinations.ts';
import { catName, loadTownIdentity } from '../identity';
import { goTo } from '../navigation';

/** /pair/:code — accept or decline an invitation link. */
export function PairInvitePage({ code }: { code: string }) {
  const hub = usePairHub();
  const me = useMemo(() => loadTownIdentity(), []);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<'accepted' | 'declined' | null>(null);
  useEffect(() => { if (done === 'accepted') { const t = window.setTimeout(() => goTo(PATHS.town), 1600); return () => window.clearTimeout(t); } return undefined; }, [done]);
  const alreadyPaired = hub.pair && hub.pair.source === 'backend' && hub.pair.partnerJoined;
  return (
    <GameShell venue="home" place="Pawville" title="A couple invitation" subtitle="Someone wants to share Pawville with you.">
      <section className="pv-setup">
        <div className="pv-couple__cats" aria-hidden="true"><CatCharacter cat="T" mood="happy" size={80} /><span className="pv-couple__heart">♥</span><CatCharacter cat="M" mood="happy" size={80} flip /></div>
        <p>Invite code <strong className="pv-invite__code">{code}</strong></p>
        {hub.backend !== 'ready' && <p className="pv-alert">{pairErrorText(hub.backend === 'not-configured' ? 'not_configured' : 'client_missing')}</p>}
        {alreadyPaired && <p className="pv-alert">You’re already in a couple as {catName(hub.pair!.myRole)}. Leave it first (♥ button in town) to accept a different invite.</p>}
        {hub.error && <p className="pv-alert" role="alert">{pairErrorText(hub.error)}</p>}
        {done === 'accepted' ? <p role="status">You’re paired! Taking you to town…</p> : done === 'declined' ? <p role="status">Invite declined.</p> : (
          <div className="pv-game-card__actions">
            <Button variant="primary" disabled={hub.backend !== 'ready' || !!alreadyPaired} loading={busy}
              onClick={async () => { setBusy(true); const ok = await acceptInvite(code, me.name); setBusy(false); if (ok) setDone('accepted'); }}>Accept as {me.name}</Button>
            <Button variant="ghost" disabled={hub.backend !== 'ready'} onClick={async () => { await declineInvite(code); setDone('declined'); }}>Decline</Button>
          </div>
        )}
        <Button variant="ghost" onClick={() => goTo(PATHS.town)}>Go to town</Button>
      </section>
    </GameShell>
  );
}
