import { useRef, type MutableRefObject, type PointerEvent as ReactPointerEvent } from 'react';
import type { TownControls } from './TownCanvas';

const RADIUS = 46;

/** Touch joystick: drag inside the pad; pushing to the edge makes the cat run. */
export function VirtualJoystick({ controls, disabled }: { controls: MutableRefObject<TownControls>; disabled: boolean }) {
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const pointerId = useRef<number | null>(null);
  const setVector = (x: number, y: number) => {
    controls.current.joy = { x, y };
    if (knobRef.current) knobRef.current.style.transform = `translate(${x * RADIUS}px, ${y * RADIUS}px)`;
  };
  const update = (e: ReactPointerEvent<HTMLDivElement>) => {
    const base = baseRef.current;
    if (!base) return;
    const r = base.getBoundingClientRect();
    let dx = (e.clientX - (r.left + r.width / 2)) / RADIUS;
    let dy = (e.clientY - (r.top + r.height / 2)) / RADIUS;
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    setVector(dx, dy);
  };
  const end = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerId.current !== e.pointerId) return;
    pointerId.current = null;
    setVector(0, 0);
  };
  return (
    <div ref={baseRef} className={`pv-joystick ${disabled ? 'is-disabled' : ''}`} aria-hidden="true"
      onPointerDown={(e) => {
        if (disabled || pointerId.current !== null) return;
        pointerId.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e);
      }}
      onPointerMove={(e) => { if (pointerId.current === e.pointerId) update(e); }}
      onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}>
      <div ref={knobRef} className="pv-joystick__knob" />
    </div>
  );
}
