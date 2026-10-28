import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Button } from '../../components/Button';
import type { CoatId } from '../appearance.ts';
import { emotesFor } from '../couple/emotes.ts';
import { biasForPanel } from '../memories/photoFraming.ts';
import { FILTERS, composePhoto, type PhotoFilter, type PhotoFrame } from '../memories/photoCompose.ts';
import { photoStorageKind, savePhoto } from '../memories/photoStore.ts';
import type { EmoteId } from '../net/presenceProtocol.ts';
import { browserCanvasFactory } from '../render/canvasTypes.ts';
import { EmoteIcon } from './EmoteIcon';
import { Segmented } from './GameShell';
import type { CaptureFn, Framing } from './TownCanvas';

export interface PhotoSaved {
  photoId: string;
  caption: string;
}

const FRAMINGS: { id: Framing; label: string }[] = [
  { id: 'portrait', label: 'Booth close-up' }, { id: 'medium', label: 'Medium' }, { id: 'wide', label: 'Wide' }, { id: 'couple', label: 'Couple' }, { id: 'environment', label: 'Scene' },
];

/**
 * Photo mode (Milestone 4 redesign).
 *  - The controls are a side panel (desktop) or a collapsible bottom sheet (small screens); the
 *    town camera is shifted so your cat sits in the middle of the UNCOVERED area (`onBias`).
 *  - A live preview shows the exact photo (framing + filter + frame) and refreshes a few times a
 *    second, so every setting change and every emote frame is visible immediately.
 *  - The photo is rendered offscreen from the game scene; the controls can never be in it.
 */
export function PhotoMode({ open, capture, place, coat, sharedPose, onPose, onBias, onClose, onSaved }: {
  open: boolean; capture: MutableRefObject<CaptureFn | null>; place: string; coat: CoatId;
  /** A shared emote that is currently running with the partner's consent (couple poses). */
  sharedPose: EmoteId | null;
  onPose: (e: EmoteId | null) => void; onBias: (b: { x: number; y: number } | null) => void; onClose: () => void; onSaved: (p: PhotoSaved) => void;
}) {
  const [framing, setFraming] = useState<Framing>('medium');
  const [filter, setFilter] = useState<PhotoFilter>('warm');
  const [frame, setFrame] = useState<PhotoFrame>('polaroid');
  const [tags, setTags] = useState(true);
  const [vignette, setVignette] = useState(true);
  const [blur, setBlur] = useState(false);
  const [showDate, setShowDate] = useState(true);
  const [caption, setCaption] = useState('');
  const [pose, setPose] = useState<EmoteId | null>(null);
  const [delay, setDelay] = useState<'0' | '1' | '3'>('0');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [shot, setShot] = useState<{ url: string; canvas: HTMLCanvasElement } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const [storage, setStorage] = useState<'indexeddb' | 'session' | null>(null);
  const urlRef = useRef<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const timers = useRef<number[]>([]);

  const magic = pose === 'mini-starpaw-serenade';
  const subline = [place, showDate ? new Date().toLocaleDateString() : ''].filter(Boolean).join(' · ');
  const finalCaption = caption.trim() || (magic ? 'Magic Moment' : place);

  const compose = useCallback((): HTMLCanvasElement | null => {
    const res = capture.current?.({ framing, hideTags: !tags, blurBackground: blur });
    if (!res) return null;
    setWarn(res.partnerMissing ? 'Couple framing needs your partner nearby and connected — framing just you for now.' : null);
    return composePhoto(res.canvas, { filter, frame, vignette, caption: finalCaption, subline }, browserCanvasFactory) as HTMLCanvasElement | null;
  }, [capture, framing, tags, blur, filter, frame, vignette, finalCaption, subline]);

  // Live preview: refresh on every change, and a few times a second so animated poses show.
  useEffect(() => {
    if (!open || shot) return;
    let alive = true;
    const draw = () => {
      if (!alive) return;
      const c = compose();
      const view = previewRef.current;
      const vctx = view?.getContext('2d');
      if (!c || !view || !vctx) return;
      const k = Math.min(1, 480 / c.width);
      view.width = Math.round(c.width * k);
      view.height = Math.round(c.height * k);
      vctx.imageSmoothingEnabled = false;
      vctx.drawImage(c, 0, 0, view.width, view.height);
    };
    draw();
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const id = window.setInterval(draw, reduce ? 800 : 250);
    return () => { alive = false; window.clearInterval(id); };
  }, [open, shot, compose]);

  // Keep the subject in the uncovered part of the screen (side panel on wide screens, sheet below on small).
  useLayoutEffect(() => {
    if (!open) return;
    const el = panelRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      onBias(biasForPanel({ left: r.left, top: r.top, width: r.width, height: r.height }, window.innerWidth || 1, window.innerHeight || 1));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => { ro.disconnect(); window.removeEventListener('resize', update); };
  }, [open, collapsed, shot, onBias]);

  useEffect(() => {
    if (!open) return;
    void photoStorageKind().then(setStorage);
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    };
  }, [open]);
  useEffect(() => {
    if (open) return;
    setShot(null);
    setStatus(null);
    setPose(null);
    setCountdown(null);
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    onPose(null);
    onBias(null);
  }, [open, onPose, onBias]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const poses = useMemo(() => emotesFor(coat).filter((e) => !e.shared), [coat]);
  if (!open) return null;

  const choosePose = (id: EmoteId | null) => {
    setPose(id);
    onPose(id);
  };

  const take = () => {
    const c = compose();
    if (!c) {
      setStatus('Couldn’t capture the scene — try again.');
      return;
    }
    try {
      c.toBlob((b) => {
        if (!b) return setStatus('Your browser couldn’t encode the photo.');
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = URL.createObjectURL(b);
        setShot({ url: urlRef.current, canvas: c });
        setStatus(null);
      }, 'image/jpeg', 0.9);
    } catch {
      setStatus('This photo couldn’t be exported by your browser.');
    }
  };
  const shoot = () => {
    const n = Number(delay);
    if (n === 0) return take();
    setCountdown(n);
    for (let i = 1; i <= n; i++) timers.current.push(window.setTimeout(() => setCountdown(n - i > 0 ? n - i : null), i * 1000));
    timers.current.push(window.setTimeout(take, n * 1000));
  };

  const keep = async () => {
    if (!shot) return;
    setStatus('Saving…');
    try {
      const rec = await savePhoto(shot.canvas);
      onSaved({ photoId: rec.id, caption: caption.trim() || (magic ? 'Magic Moment' : '') });
      setStatus(null);
      onClose();
    } catch {
      setStatus('Saving failed — your browser storage may be full. The photo is still here: try again, or delete old photos in the scrapbook.');
    }
  };

  return (
    <div className={`pv-photo ${collapsed ? 'is-collapsed' : ''}`} role="dialog" aria-label="Photo mode">
      <div className="pv-photo__frame" aria-hidden="true" />
      {countdown !== null && <div className="pv-photo__count" aria-live="assertive">{countdown}</div>}
      <div ref={panelRef} className="pv-photo__panel">
        <div className="pv-photo__head">
          <h2 className="pv-photo__title">Photo mode</h2>
          <button type="button" className="pv-photo__toggle" onClick={() => setCollapsed((v) => !v)} aria-expanded={!collapsed}>
            {collapsed ? 'Show controls' : 'Hide controls'}
          </button>
        </div>
        {shot ? (
          <>
            <img className="pv-photo__preview" src={shot.url} alt={`Your photo: ${finalCaption}`} />
            <div className="pv-game-card__actions">
              <Button variant="primary" onClick={() => void keep()}>Save to scrapbook</Button>
              <Button variant="ghost" onClick={() => setShot(null)}>Retake</Button>
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
            </div>
          </>
        ) : (
          <>
            <canvas ref={previewRef} className="pv-photo__live" role="img" aria-label="Live preview of the photo" />
            {!collapsed && (
              <div className="pv-photo__controls">
                <Segmented label="Framing" value={framing} options={FRAMINGS} onChange={setFraming} />
                {warn && <p className="pv-note">{warn}</p>}
                <Segmented label="Filter" value={filter} options={FILTERS.map((f) => ({ id: f.id, label: f.label }))} onChange={setFilter} />
                <Segmented label="Frame" value={frame} options={[{ id: 'polaroid', label: 'Polaroid' }, { id: 'plain', label: 'Plain' }, { id: 'stars', label: 'Starry' }, { id: 'booth', label: 'Photo booth' }]} onChange={setFrame} />
                <div className="pv-photo__poses" role="group" aria-label="Pose">
                  <button type="button" className={`pv-pose ${pose === null ? 'is-selected' : ''}`} onClick={() => choosePose(null)}>Natural</button>
                  {poses.map((e) => (
                    <button key={e.id} type="button" className={`pv-pose ${pose === e.id ? 'is-selected' : ''} ${e.exclusive ? 'is-exclusive' : ''}`} onClick={() => choosePose(e.id)} title={e.tip}>
                      <EmoteIcon id={e.id} size={18} /> {e.label}
                    </button>
                  ))}
                </div>
                <p className="pv-note">
                  {sharedPose ? `Couple pose: ${sharedPose.replace('-', ' ')} (your partner said yes).` : 'Couple poses (hug, boop…) start from the Emotes menu — your partner has to say yes first.'}
                </p>
                <div className="pv-photo__checks">
                  <label className="pv-check"><input type="checkbox" checked={tags} onChange={(e) => setTags(e.target.checked)} /> Name tags</label>
                  <label className="pv-check"><input type="checkbox" checked={vignette} onChange={(e) => setVignette(e.target.checked)} /> Soft vignette</label>
                  <label className="pv-check"><input type="checkbox" checked={blur} onChange={(e) => setBlur(e.target.checked)} /> Blur background</label>
                  <label className="pv-check"><input type="checkbox" checked={showDate} onChange={(e) => setShowDate(e.target.checked)} /> Date on frame</label>
                </div>
                <label className="field">
                  <span className="field__label">Caption</span>
                  <input className="field__input" value={caption} maxLength={60} onChange={(e) => setCaption(e.target.value)} placeholder={magic ? 'Magic Moment' : place} />
                </label>
                <Segmented label="Timer" value={delay} options={[{ id: '0', label: 'Now' }, { id: '1', label: '1 s' }, { id: '3', label: '3 s' }]} onChange={setDelay} />
              </div>
            )}
            <div className="pv-game-card__actions">
              <Button variant="primary" onClick={shoot} disabled={countdown !== null}>{countdown !== null ? `Capturing in ${countdown}…` : 'Capture'}</Button>
              <Button variant="ghost" onClick={onClose}>Close</Button>
            </div>
          </>
        )}
        {storage === 'session' && <p className="pv-note">This browser can’t store photos permanently (private mode?). Photos stay until you close the tab.</p>}
        {status && <p className="pv-note" role="status">{status}</p>}
      </div>
    </div>
  );
}
