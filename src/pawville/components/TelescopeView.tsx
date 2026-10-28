/**
 * Milestone 8.1 — the telescope eyepiece. A full-screen view rendered from the sky model (adventure/telescope.ts):
 * a procedural star field, constellations, the moon at its real phase, the site's horizon with real landmarks,
 * weather cloud cover and day/night colour. Aim by dragging, arrow keys / WASD or the on-screen pad; zoom with the
 * wheel, +/− or the buttons; Esc / Exit leaves. Discoveries are reported through `onDiscover` (the caller saves them).
 */
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent, type WheelEvent as RWheelEvent } from 'react';
import { SITE_NAME, SITE_START, aim, atSite, createDwell, fov, inSight, zoomTo, type ScopeSite, type ScopeView, type SkyContext, type SkyObject } from '../adventure/telescope.ts';
import { drawTelescope } from '../render/telescopeArt.ts';

export interface TelescopeProps {
  site: ScopeSite;
  context: () => Omit<SkyContext, 'time' | 'site'>;
  known: ReadonlySet<string>;
  onDiscover: (o: SkyObject, c: SkyContext) => void;
  onClose: () => void;
}

export function TelescopeView({ site, context, known, onDiscover, onClose }: TelescopeProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const view = useRef<ScopeView>({ ...SITE_START[site] });
  const keys = useRef(new Set<string>());
  const pad = useRef({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(view.current.zoom);
  const [found, setFound] = useState<string | null>(null);
  const [inView, setInView] = useState<string | null>(null);
  const knownRef = useRef(known);
  knownRef.current = known;
  const cb = useRef({ onDiscover, onClose, context });
  cb.current = { onDiscover, onClose, context };

  const setZ = (z: number) => { view.current = zoomTo(view.current, z); setZoom(view.current.zoom); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const down = e.type === 'keydown';
      if (down && e.code === 'Escape') { e.preventDefault(); cb.current.onClose(); return; }
      if (down && (e.key === '+' || e.key === '=')) { setZ(view.current.zoom + 0.5); e.preventDefault(); return; }
      if (down && (e.key === '-' || e.key === '_')) { setZ(view.current.zoom - 0.5); e.preventDefault(); return; }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) {
        e.preventDefault(); e.stopPropagation();
        if (down) keys.current.add(e.code); else keys.current.delete(e.code);
      }
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);
    return () => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('keyup', onKey, true); };
  }, []);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const dwell = createDwell(600);
    const t0 = performance.now();
    let last = t0, raf = 0, lastInView = '';
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const k = keys.current;
      const ax = (k.has('ArrowRight') || k.has('KeyD') ? 1 : 0) - (k.has('ArrowLeft') || k.has('KeyA') ? 1 : 0) + pad.current.x;
      const ay = (k.has('ArrowUp') || k.has('KeyW') ? 1 : 0) - (k.has('ArrowDown') || k.has('KeyS') ? 1 : 0) + pad.current.y;
      const speed = fov(view.current.zoom) * 0.6;
      if (ax || ay) view.current = aim(view.current, ax * speed * dt, ay * speed * dt);

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = Math.round(cv.clientWidth * dpr), H = Math.round(cv.clientHeight * dpr);
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      const c: SkyContext = { ...cb.current.context(), site, time: (now - t0) / 1000 + 9 };
      drawTelescope(ctx, W, H, view.current, c, Math.min(2, window.devicePixelRatio || 1));

      const ids = inSight(view.current, c).map((o) => o.id);
      const label = ids.find((id) => !knownRef.current.has(id)) ?? ids[0] ?? '';
      if (label !== lastInView) { lastInView = label; setInView(label || null); }
      for (const id of dwell(now, ids)) {
        if (knownRef.current.has(id)) continue;
        const o = atSite(c).find((x) => x.id === id);
        if (o) { cb.current.onDiscover(o, c); setFound(o.id); }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [site]);

  // drag to aim (mouse + touch through pointer events), wheel to zoom
  const drag = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: RPointerEvent) => { drag.current = { x: e.clientX, y: e.clientY }; (e.target as Element).setPointerCapture?.(e.pointerId); };
  const onPointerMove = (e: RPointerEvent) => {
    if (!drag.current) return;
    const cv = canvasRef.current; if (!cv) return;
    const degPerPx = fov(view.current.zoom) / Math.min(cv.clientWidth, cv.clientHeight * 1.2);
    view.current = aim(view.current, -(e.clientX - drag.current.x) * degPerPx, (e.clientY - drag.current.y) * degPerPx);
    drag.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = () => { drag.current = null; };
  const onWheel = (e: RWheelEvent) => setZ(view.current.zoom + (e.deltaY < 0 ? 0.5 : -0.5));
  const hold = (x: number, y: number) => ({
    onPointerDown: (e: RPointerEvent) => { e.preventDefault(); pad.current = { x, y }; },
    onPointerUp: () => { pad.current = { x: 0, y: 0 }; }, onPointerLeave: () => { pad.current = { x: 0, y: 0 }; }, onPointerCancel: () => { pad.current = { x: 0, y: 0 }; },
  });

  const all = atSite({ site, darkness: 1, clear: true, moonPhase: 0.5, flags: new Set(), time: 0 });
  const seen = all.filter((o) => known.has(o.id)).length;
  const label = inView ? all.find((o) => o.id === inView)?.title : null;
  return (
    <div className="pv-scope" role="dialog" aria-modal="true" aria-label={SITE_NAME[site]}>
      <canvas ref={canvasRef} className="pv-scope__canvas" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onWheel={onWheel} />
      <header className="pv-scope__top">
        <h2>{SITE_NAME[site]}</h2>
        <span className="pv-scope__count">Sky log {seen}/{all.length}</span>
        <button type="button" className="pill-btn" onClick={onClose}>Exit <kbd className="pv-key">Esc</kbd></button>
      </header>
      <p className="pv-scope__status" aria-live="polite">
        {found ? <>✦ Discovered: <strong>{all.find((o) => o.id === found)?.title}</strong></> : label ? <>In sight: {label}{known.has(inView ?? '') ? ' (logged)' : ' — hold steady…'}</> : 'Drag or use the arrows to look around. Zoom in to see fainter things.'}
      </p>
      <div className="pv-scope__controls">
        <div className="pv-scope__pad" aria-label="Aim">
          <button type="button" aria-label="Aim up" className="pv-scope__up" {...hold(0, 1)}>▲</button>
          <button type="button" aria-label="Aim left" className="pv-scope__left" {...hold(-1, 0)}>◀</button>
          <button type="button" aria-label="Aim right" className="pv-scope__right" {...hold(1, 0)}>▶</button>
          <button type="button" aria-label="Aim down" className="pv-scope__down" {...hold(0, -1)}>▼</button>
        </div>
        <div className="pv-scope__zoom" aria-label="Zoom">
          <button type="button" aria-label="Zoom out" onClick={() => setZ(zoom - 0.5)} disabled={zoom <= 1}>−</button>
          <span>×{zoom}</span>
          <button type="button" aria-label="Zoom in" onClick={() => setZ(zoom + 0.5)} disabled={zoom >= 4}>+</button>
        </div>
      </div>
    </div>
  );
}
