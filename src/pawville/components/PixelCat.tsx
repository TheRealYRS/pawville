import { useEffect, useRef } from 'react';
import type { Accessory } from '../../game/types';
import type { CoatId, ExtraId } from '../appearance.ts';
import { browserCanvasFactory } from '../render/canvasTypes.ts';
import { CatSpriteCache, SPRITE_H, SPRITE_W, type CatPose } from '../render/catSprites.ts';
import type { Facing } from '../world/movement.ts';

let cache: CatSpriteCache | null = null;

/** The same pixel cat you walk around town with, for use inside games and panels. */
export function PixelCat({ coat, accessory = 'none', extra = 'none', facing = 'right', moving = false, pose = 'stand', scale = 3, label }: {
  coat: CoatId; accessory?: Accessory; extra?: ExtraId; facing?: Facing; moving?: boolean; pose?: CatPose; scale?: number; label?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    cache ??= new CatSpriteCache(browserCanvasFactory);
    let frame = 0;
    let raf = 0;
    let last = 0;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const draw = (now: number) => {
      if (now - last > (moving ? 110 : 600)) {
        last = now;
        frame = reduce ? 0 : (frame + 1) % 4;
        ctx.clearRect(0, 0, SPRITE_W, SPRITE_H);
        ctx.drawImage(cache!.get({ coat, accessory, extra, facing, frame, moving, pose }) as unknown as CanvasImageSource, 0, 0);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [coat, accessory, extra, facing, moving, pose]);
  return (
    <canvas ref={ref} width={SPRITE_W} height={SPRITE_H} className="pv-pixelcat" style={{ width: SPRITE_W * scale, height: SPRITE_H * scale }}
      role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} />
  );
}
