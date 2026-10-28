/**
 * Scenes (Milestone 6): one interface for every walkable place — the original town and every new
 * region — so movement, collision, camera, interaction, presence, emotes and photo mode are shared.
 * The town scene wraps the original town modules unchanged.
 */
import type { AdventureSpot } from '../adventure/regionKit.ts';
import { areaNameIn, groundSolids, regionBounds, regionPropCollider, regionSize } from '../adventure/regionKit.ts';
import { regionDef } from '../adventure/regions.ts';
import type { RegionId } from '../adventure/state.ts';
import { browserCanvasFactory, type CanvasFactory } from '../render/canvasTypes.ts';
import { createRegionArt, drawRegionFrame, regionEnv, type RegionArt } from '../render/regionRenderer.ts';
import { createTownArt, drawTownFrame, type FrameState, type TownArt } from '../render/townRenderer.ts';
import type { Environment } from './environment.ts';
import type { Rect, Vec2 } from './geometry.ts';
import { INTERACTABLES, SPAWN_POINT, TILE, WORLD_BOUNDS, WORLD_H, WORLD_W, areaName, buildTown, groundAt, type Interactable, type TownLayout } from './townMap.ts';
import { surfaceAt, townSurfaceOfTile, type Surface } from './footsteps.ts';

export type SceneSpot = Interactable | AdventureSpot;

export interface Scene {
  id: RegionId;
  name: string;
  size: { w: number; h: number };
  bounds: Rect;
  baseSolids: readonly Rect[];
  spawn: Vec2;
  /** Interactables that always exist in this scene (the town's original ones). */
  baseSpots: readonly SceneSpot[];
  areaName(p: Vec2): string;
  envFor(env: Environment): Environment;
  draw(ctx: CanvasRenderingContext2D, f: FrameState): void;
  /** Snow on the ground all the time (paw prints even without snowfall). */
  snowy: boolean;
  /** Milestone 8.2: what the ground is made of here (footstep sounds). */
  surface(p: Vec2): Surface;
}

let townLayout: TownLayout | null = null;
let townArt: TownArt | null = null;
export function getTownLayout(): TownLayout {
  townLayout ??= buildTown();
  return townLayout;
}

let townScene: Scene | null = null;
export function getTownScene(factory: CanvasFactory = browserCanvasFactory): Scene {
  if (townScene) return townScene;
  const layout = getTownLayout();
  townScene = {
    id: 'town', name: 'Whiskerwood Village', size: { w: WORLD_W, h: WORLD_H }, bounds: WORLD_BOUNDS, baseSolids: layout.solids, spawn: SPAWN_POINT,
    baseSpots: INTERACTABLES, areaName, envFor: (e) => e, snowy: false,
    surface: (p) => townSurfaceOfTile(groundAt(layout.ground, Math.floor(p.x / TILE), Math.floor((p.y - 2) / TILE))),
    draw: (ctx, f) => {
      townArt ??= createTownArt(factory, layout);
      drawTownFrame(ctx, townArt, f);
    },
  };
  return townScene;
}

const regionScenes = new Map<RegionId, Scene>();
export function getScene(id: RegionId, factory: CanvasFactory = browserCanvasFactory): Scene {
  if (id === 'town') return getTownScene(factory);
  const hit = regionScenes.get(id);
  if (hit) return hit;
  const def = regionDef(id);
  let art: RegionArt | null = null;
  const solids = [...groundSolids(def), ...def.props.filter((p) => !p.when).map(regionPropCollider).filter((r): r is Rect => r !== null)];
  const scene: Scene = {
    id, name: def.name, size: regionSize(def), bounds: regionBounds(def), baseSolids: solids, spawn: def.spawn, baseSpots: [],
    areaName: (p) => areaNameIn(def, p), envFor: (e) => regionEnv(def, e), snowy: !!def.climate.snow,
    surface: (p) => (def.climate.snow ? 'snow' : surfaceAt(def, p.x, p.y)),
    draw: (ctx, f) => {
      art ??= createRegionArt(factory, def);
      drawRegionFrame(ctx, art, f);
    },
  };
  regionScenes.set(id, scene);
  return scene;
}

/** The largest scene, used to clamp positions received from the network. */
export const MAX_SCENE_SIZE = { w: 1024, h: 1024 };
