/**
 * Photo storage. Photos are JPEG blobs in IndexedDB (never in localStorage), resized so the
 * longest side is at most MAX_SIDE and capped at MAX_PHOTOS (oldest non-favourite removed first).
 * If IndexedDB is unavailable (some private modes), photos live in memory for this session only
 * and the UI says so.
 */
export const MAX_SIDE = 960;
export const MAX_PHOTOS = 60;
export const THUMB_SIDE = 240;

export interface PhotoRecord {
  id: string;
  blob: Blob;
  thumb: Blob;
  createdAt: number;
  favorite: boolean;
}

const DB_NAME = 'pawville-photos';
const STORE = 'photos';
const memory = new Map<string, PhotoRecord>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

export async function photoStorageKind(): Promise<'indexeddb' | 'session'> {
  return (await openDb()) ? 'indexeddb' : 'session';
}

function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function listPhotos(): Promise<PhotoRecord[]> {
  const db = await openDb();
  const all = db ? await tx<PhotoRecord[]>(db, 'readonly', (s) => s.getAll() as IDBRequest<PhotoRecord[]>) : [...memory.values()];
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getPhoto(id: string): Promise<PhotoRecord | null> {
  const db = await openDb();
  if (!db) return memory.get(id) ?? null;
  return (await tx<PhotoRecord | undefined>(db, 'readonly', (s) => s.get(id) as IDBRequest<PhotoRecord | undefined>)) ?? null;
}

export async function deletePhoto(id: string): Promise<void> {
  const db = await openDb();
  if (!db) {
    memory.delete(id);
    return;
  }
  await tx(db, 'readwrite', (s) => s.delete(id));
}

export async function setFavorite(id: string, favorite: boolean): Promise<void> {
  const rec = await getPhoto(id);
  if (!rec) return;
  const db = await openDb();
  const next = { ...rec, favorite };
  if (!db) memory.set(id, next);
  else await tx(db, 'readwrite', (s) => s.put(next));
}

/** Resizes (keeping aspect ratio) and encodes as JPEG. */
export async function encode(canvas: HTMLCanvasElement, maxSide: number, quality: number): Promise<Blob> {
  const k = Math.min(1, maxSide / Math.max(canvas.width, canvas.height));
  let src = canvas;
  if (k < 1) {
    src = document.createElement('canvas');
    src.width = Math.round(canvas.width * k);
    src.height = Math.round(canvas.height * k);
    const ctx = src.getContext('2d');
    if (ctx) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(canvas, 0, 0, src.width, src.height);
    }
  }
  return new Promise((resolve, reject) => src.toBlob((b) => (b ? resolve(b) : reject(new Error('encode_failed'))), 'image/jpeg', quality));
}

export async function savePhoto(canvas: HTMLCanvasElement): Promise<PhotoRecord> {
  const [blob, thumb] = await Promise.all([encode(canvas, MAX_SIDE, 0.86), encode(canvas, THUMB_SIDE, 0.8)]);
  const rec: PhotoRecord = { id: `p${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`, blob, thumb, createdAt: Date.now(), favorite: false };
  const db = await openDb();
  if (!db) memory.set(rec.id, rec);
  else await tx(db, 'readwrite', (s) => s.put(rec));
  // Keep the album bounded: drop the oldest non-favourites beyond the limit.
  for (const id of photosToPrune(await listPhotos())) await deletePhoto(id);
  return rec;
}

/** Pure: which photos to drop to stay within `max` (favourites are kept first, then the newest). */
export function photosToPrune<T extends { id: string; createdAt: number; favorite: boolean }>(list: readonly T[], max = MAX_PHOTOS): string[] {
  const sorted = [...list].sort((a, b) => b.createdAt - a.createdAt);
  const favs = sorted.filter((p) => p.favorite).length;
  return sorted.filter((p) => !p.favorite).slice(Math.max(0, max - favs)).map((p) => p.id);
}
