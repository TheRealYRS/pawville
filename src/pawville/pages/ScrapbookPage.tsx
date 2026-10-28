import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { GameShell, Segmented } from '../components/GameShell';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { deletePhoto, getPhoto, listPhotos, photoStorageKind, setFavorite, type PhotoRecord } from '../memories/photoStore.ts';
import { useWorldSave } from '../useWorldSave.ts';
import { ACHIEVEMENTS, hasMemory, type AchievementId, type MemoryEvent, type MemoryKind } from '../worldSave.ts';

/** Suggestions are clearly labelled as NOT yet happened. */
const SUGGESTIONS: { kind: MemoryKind; text: string }[] = [
  { kind: 'swing-together', text: 'Swing together in Paw Park' },
  { kind: 'wish', text: 'Make a wish on a shooting star (after dark, clear sky)' },
  { kind: 'picnic', text: 'Share a snack at a picnic' },
  { kind: 'garden-bloom', text: 'Grow a flower in the shared garden' },
  { kind: 'paw-hold', text: 'Walk paw-in-paw around town' },
  { kind: 'photo', text: 'Take a photo under the flower arch' },
];

function Thumb({ id, alt }: { id: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let u: string | null = null;
    let alive = true;
    getPhoto(id).then((p) => {
      if (!alive) return;
      if (!p) return setMissing(true);
      u = URL.createObjectURL(p.thumb);
      setUrl(u);
    }).catch(() => setMissing(true));
    return () => { alive = false; if (u) URL.revokeObjectURL(u); };
  }, [id]);
  if (missing) return <span className="sb-thumb is-missing">Photo no longer on this device</span>;
  return url ? <img className="sb-thumb" src={url} alt={alt} /> : <span className="sb-thumb is-loading" aria-hidden="true" />;
}

export function ScrapbookPage() {
  const { save, update } = useWorldSave();
  const [filter, setFilter] = useState<'all' | 'photos' | 'together' | 'favorites'>('all');
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [open, setOpen] = useState<MemoryEvent | null>(null);
  const [bigUrl, setBigUrl] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<MemoryEvent | null>(null);
  const [storage, setStorage] = useState<string>('');
  const bigRef = useRef<string | null>(null);
  const reload = () => { void listPhotos().then(setPhotos); };
  useEffect(() => { reload(); void photoStorageKind().then(setStorage); }, []);
  useEffect(() => {
    if (!open?.photoId) return;
    let alive = true;
    void getPhoto(open.photoId).then((p) => {
      if (!alive || !p) return;
      bigRef.current = URL.createObjectURL(p.blob);
      setBigUrl(bigRef.current);
    });
    return () => { alive = false; if (bigRef.current) URL.revokeObjectURL(bigRef.current); bigRef.current = null; setBigUrl(null); };
  }, [open?.photoId]);
  const favs = useMemo(() => new Set(photos.filter((p) => p.favorite).map((p) => p.id)), [photos]);
  const list = save.memories.filter((m) => filter === 'all' || (filter === 'photos' && m.photoId) || (filter === 'together' && m.withPartner) || (filter === 'favorites' && m.photoId && favs.has(m.photoId)));
  const achievements = (Object.keys(ACHIEVEMENTS) as AchievementId[]).filter((a) => save.achievements[a]);
  const remove = async (m: MemoryEvent) => {
    if (m.photoId) await deletePhoto(m.photoId).catch(() => undefined);
    update((s) => ({ ...s, memories: s.memories.filter((x) => x.id !== m.id) }));
    setConfirm(null);
    setOpen(null);
    reload();
  };
  return (
    <GameShell venue="home" place="Our Home" title="Scrapbook" subtitle="Real moments from your time in Pawville — newest first.">
      <Segmented label="Show" value={filter} options={[{ id: 'all', label: 'Everything' }, { id: 'photos', label: 'Photos' }, { id: 'together', label: 'Together' }, { id: 'favorites', label: 'Favourites' }]} onChange={setFilter} />
      {storage === 'session' && <p className="pv-note">Photos can’t be stored permanently in this browser (private mode?).</p>}
      {list.length === 0 ? (
        <section className="pv-setup sb-empty">
          <h2>Nothing here yet</h2>
          <p>Memories appear when things actually happen. Some ideas:</p>
          <ul className="pv-list">{SUGGESTIONS.filter((s) => !hasMemory(save, s.kind)).map((s) => <li key={s.kind}>{s.text} <em className="pv-note">(suggestion)</em></li>)}</ul>
        </section>
      ) : (
        <ol className="sb-grid">
          {list.map((m) => (
            <li key={m.id}>
              <button type="button" className={`sb-card ${m.withPartner ? 'is-together' : ''}`} onClick={() => setOpen(m)}>
                {m.photoId ? <Thumb id={m.photoId} alt={m.title} /> : <span className={`sb-card__icon sb-icon--${m.kind}`} aria-hidden="true" />}
                <span className="sb-card__title">{m.title}</span>
                <span className="sb-card__meta">{new Date(m.at).toLocaleDateString()} · {m.place}{m.withPartner ? ' · together ♥' : ''}</span>
                {m.photoId && favs.has(m.photoId) && <span className="sb-card__fav" aria-label="Favourite">★</span>}
              </button>
            </li>
          ))}
        </ol>
      )}
      {achievements.length > 0 && (
        <section className="sb-milestones">
          <h2>Milestones</h2>
          <ul className="pv-achievements">{achievements.map((a) => <li key={a} className="is-done"><strong>★ {ACHIEVEMENTS[a].name}</strong><span>{new Date(save.achievements[a]!).toLocaleDateString()}</span></li>)}</ul>
        </section>
      )}
      <Modal open={open !== null} title={open?.title ?? ''} onClose={() => setOpen(null)} className="pv-modal sb-modal">
        {open?.photoId && (bigUrl ? <img className="sb-big" src={bigUrl} alt={open.title} /> : <p className="pv-note">Loading photo… (if it never appears, it’s no longer stored on this device)</p>)}
        <p>{open?.detail}</p>
        <p className="pv-note">{open && new Date(open.at).toLocaleString()} · {open?.place}{open?.withPartner ? ' · with your partner' : ''}</p>
        <div className="modal__actions">
          {open?.photoId && <Button variant="secondary" onClick={async () => { await setFavorite(open.photoId!, !favs.has(open.photoId!)); reload(); }}>{favs.has(open.photoId) ? 'Unfavourite' : 'Favourite'}</Button>}
          {open?.photoId && bigUrl && <a className="btn btn--ghost" href={bigUrl} download={`pawville-${open.id}.jpg`}>Download</a>}
          <Button variant="ghost" onClick={() => setConfirm(open)}>Remove</Button>
          <Button variant="primary" onClick={() => setOpen(null)}>Close</Button>
        </div>
      </Modal>
      <ConfirmDialog open={confirm !== null} title="Remove this memory?" confirmLabel="Remove" danger onCancel={() => setConfirm(null)} onConfirm={() => confirm && void remove(confirm)}>
        {confirm?.photoId ? 'The photo will be deleted from this device.' : 'It will be removed from your scrapbook.'}
      </ConfirmDialog>
    </GameShell>
  );
}
