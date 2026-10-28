import { useEffect, useState } from 'react';
import { canNativeShare, copyText, nativeShare, roomUrl } from '../lib/share';
import { Button } from './Button';
import { CatCharacter } from './CatCharacter';
import { PawPrint } from './PawPrint';

interface InvitePanelProps {
  roomId: string;
  accessory: 'none' | 'crown' | 'bow' | 'wizard' | 'bell';
  onCancel: () => void;
  onNotify: (text: string, tone?: 'info' | 'warn' | 'success') => void;
}

export function InvitePanel({ roomId, accessory, onCancel, onNotify }: InvitePanelProps) {
  const url = roomUrl(roomId);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const shareSupported = canNativeShare();

  useEffect(() => {
    let alive = true;
    // Loaded lazily so the QR library never slows down the first paint; failure just hides the QR.
    import('qrcode')
      .then((mod) => {
        const lib = (mod as unknown as { default?: typeof mod }).default ?? mod;
        return lib.toDataURL(url, { margin: 1, width: 360, errorCorrectionLevel: 'M', color: { dark: '#17131E', light: '#FFF3E6' } });
      })
      .then((data) => { if (alive) setQr(data); })
      .catch(() => { if (alive) setQr(null); });
    return () => { alive = false; };
  }, [url]);

  const copy = async () => {
    const ok = await copyText(url);
    setCopied(ok);
    onNotify(ok ? 'Invite link copied! Send it to a friend.' : "Couldn't copy automatically — select the link and copy it.", ok ? 'success' : 'warn');
    if (ok) window.setTimeout(() => setCopied(false), 2000);
  };

  const share = async () => {
    const r = await nativeShare(url);
    if (r === 'unsupported') void copy();
  };

  return (
    <div className="invite">
      <div className="invite__hero">
        <div className="invite__cat" aria-hidden="true">
          <CatCharacter cat="T" mood="playful" accessory={accessory} size="100%" />
          <span className="invite__trail">
            <PawPrint size={16} /><PawPrint size={16} /><PawPrint size={16} />
          </span>
        </div>
        <div>
          <h2 className="invite__title">Waiting for your opponent to pounce...</h2>
          <p className="invite__sub">You are <strong className="text-orange">Tangerine</strong>. Send this link — whoever opens it plays <strong className="text-lavender">Midnight</strong>.</p>
        </div>
      </div>

      <div className="invite__link-row">
        <label className="sr-only" htmlFor="invite-link">Invite link</label>
        <input id="invite-link" className="invite__link" value={url} readOnly onFocus={(e) => e.currentTarget.select()} />
      </div>
      <div className="invite__actions">
        <Button variant="primary" onClick={copy} icon={<PawPrint size={18} />}>{copied ? 'Copied!' : 'Copy invite link'}</Button>
        {shareSupported && <Button variant="secondary" onClick={share}>Share…</Button>}
      </div>

      {qr && (
        <figure className="invite__qr">
          <img src={qr} width={180} height={180} alt="QR code for the invite link" />
          <figcaption>Or scan to join on another device</figcaption>
        </figure>
      )}

      <p className="invite__tip">Testing alone? Open the link in a different browser or a private window — the same browser shares your cat.</p>
      <button type="button" className="link-btn" onClick={onCancel}>Cancel and close room</button>
    </div>
  );
}
