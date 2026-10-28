import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { COAT_INFO, type CoatId } from '../appearance.ts';
import { EMOTES, emotesFor, type EmoteDef } from '../couple/emotes.ts';
import { EmoteIcon } from './EmoteIcon';
import { GAMES, destinationInfo } from '../destinations.ts';
import type { EmoteId } from '../net/presenceProtocol.ts';
import { PHASE_LABEL, WEATHERS, WEATHER_LABEL, clockLabel, type Environment, type EnvSettings, type Weather } from '../world/environment.ts';
import { INTERACTABLES, type Interactable } from '../world/townMap.ts';
import { ACHIEVEMENTS, ITEM_NAMES, type AchievementId, type ItemId, type WorldSave } from '../worldSave.ts';
import { Segmented } from './GameShell';

const PLACES = INTERACTABLES.filter((i) => i.kind === 'destination' || (i.kind === 'activity' && !i.id.startsWith('bench-')));

export function PlacesPanel({ open, onClose, onTravel }: { open: boolean; onClose: () => void; onTravel: (i: Interactable) => void }) {
  return (
    <Modal open={open} title="Map of Pawville" onClose={onClose} className="pv-modal">
      <ul className="pv-places">
        {PLACES.map((i) => {
          const games = i.kind === 'destination' ? GAMES.filter((g) => g.destination === i.action) : [];
          const name = i.kind === 'destination' ? destinationInfo(i.action as Parameters<typeof destinationInfo>[0]).name : i.label;
          return (
            <li key={i.id} className="pv-places__item">
              <div>
                <p className="pv-places__name">{name}</p>
                <p className="pv-places__games">{games.length ? games.map((g) => g.title).join(' · ') : i.kind === 'activity' ? 'Park activity' : 'Events & challenges'}</p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => onTravel(i)}>Hop there</Button>
            </li>
          );
        })}
      </ul>
      <p className="pv-note">Desktop: W A S D or arrow keys to walk, Shift to run, E to interact. Phone: drag the pad, tap the paw.</p>
    </Modal>
  );
}

export function EmoteMenu({ open, onClose, onEmote, partnerNear, partnerOnline, coat, quick, onToggleQuick, waiting }: {
  open: boolean; onClose: () => void; onEmote: (id: EmoteId, shared: boolean) => void; partnerNear: boolean; partnerOnline: boolean;
  /** Canonical appearance — exclusive emotes are offered only to their character (not by nickname). */
  coat: CoatId;
  quick: readonly EmoteId[];
  onToggleQuick: (id: EmoteId) => void;
  /** A shared emote invitation currently waiting for the partner. */
  waiting: EmoteId | null;
}) {
  const mine = emotesFor(coat);
  const solo = mine.filter((e) => !e.shared && !e.exclusive);
  const signature = mine.filter((e) => e.exclusive);
  const together = mine.filter((e) => e.shared);
  const tile = (e: EmoteDef, disabled = false) => (
    <div key={e.id} className={`pv-emote ${e.exclusive ? 'is-exclusive' : ''} ${waiting === e.id ? 'is-waiting' : ''}`}>
      <button type="button" className="pv-emote__btn" disabled={disabled} title={e.tip} aria-describedby={`emote-tip-${e.id}`}
        onClick={() => { onEmote(e.id, e.shared); onClose(); }}>
        <EmoteIcon id={e.id} size={28} />
        <span className="pv-emote__label">{e.label}</span>
        {e.exclusive && <span className="pv-emote__badge">{(COAT_INFO[e.exclusive]?.name ?? e.exclusive).toUpperCase()} EXCLUSIVE</span>}
        <span id={`emote-tip-${e.id}`} className="pv-emote__tip">{waiting === e.id ? 'Waiting for your partner…' : e.tip}</span>
      </button>
      {!e.shared && (
        <button type="button" className={`pv-emote__fav ${quick.includes(e.id) ? 'is-on' : ''}`} aria-pressed={quick.includes(e.id)}
          aria-label={quick.includes(e.id) ? `Remove ${e.label} from quick emotes` : `Add ${e.label} to quick emotes`} onClick={() => onToggleQuick(e.id)}>★</button>
      )}
    </div>
  );
  return (
    <Modal open={open} title="Emotes" onClose={onClose} className="pv-modal pv-emote-modal">
      <div className="pv-emotes">
        {signature.length > 0 && (<><h3>Signature</h3><div className="pv-emotes__grid">{signature.map((e) => tile(e))}</div></>)}
        <h3>Just you</h3>
        <div className="pv-emotes__grid">{solo.map((e) => tile(e))}</div>
        <h3>Together <span className="pv-note">(your partner must say yes)</span></h3>
        <div className="pv-emotes__grid">{together.map((e) => tile(e, !partnerOnline || !partnerNear || (waiting !== null && waiting !== e.id)))}</div>
        {!partnerOnline ? <p className="pv-note">Shared emotes need your partner to be connected.</p> : !partnerNear && <p className="pv-note">Stand right next to your partner for shared emotes.</p>}
        <p className="pv-note">★ adds an emote to your quick bar.</p>
      </div>
    </Modal>
  );
}

/** Compact always-visible row of favourite emotes. */
export function QuickEmotes({ quick, coat, onEmote, onMore }: { quick: readonly EmoteId[]; coat: CoatId; onEmote: (id: EmoteId) => void; onMore: () => void }) {
  const list = quick.filter((id) => emotesFor(coat).some((e) => e.id === id && !e.shared));
  return (
    <div className="pv-quick" role="toolbar" aria-label="Quick emotes">
      {list.map((id) => {
        const d = EMOTES.find((e) => e.id === id)!;
        return <button key={id} type="button" className="pv-quick__btn" title={`${d.label} — ${d.tip}`} aria-label={d.label} onClick={() => onEmote(id)}><EmoteIcon id={id} size={22} /></button>;
      })}
      <button type="button" className="pv-quick__btn pv-quick__more" onClick={onMore} aria-label="All emotes">⋯</button>
    </div>
  );
}

export function EnvPanel({ open, onClose, env, settings, onChange }: {
  open: boolean; onClose: () => void; env: Environment; settings: EnvSettings & { ambience: boolean; lowPower: boolean; voices?: number }; onChange: (p: Partial<EnvSettings & { ambience: boolean; lowPower: boolean; voices?: number }>) => void;
}) {
  return (
    <Modal open={open} title="Sky & sound" onClose={onClose} className="pv-modal">
      <p>Now: <strong>{WEATHER_LABEL[env.weather]}</strong> · {PHASE_LABEL[env.phase]} · {clockLabel(env.hour)}</p>
      <Segmented label="Clock" value={settings.clock} options={[{ id: 'cozy', label: 'Cozy day (24 min)' }, { id: 'real', label: 'My real clock' }]} onChange={(clock) => onChange({ clock })} />
      <p className="pv-note">Cozy days are shared by everyone. “My real clock” follows the time where you are.</p>
      <label className="field">
        <span className="field__label">Weather (photo override — only you see it)</span>
        <select className="field__input" value={settings.weatherOverride ?? 'live'} onChange={(e) => onChange({ weatherOverride: e.target.value === 'live' ? null : (e.target.value as Weather) })}>
          <option value="live">Live shared weather</option>
          {WEATHERS.map((w) => <option key={w} value={w}>{WEATHER_LABEL[w]}</option>)}
        </select>
      </label>
      <label className="field">
        <span className="field__label">Time of day (photo override — only you see it)</span>
        <select className="field__input" value={settings.hourOverride ?? 'live'} onChange={(e) => onChange({ hourOverride: e.target.value === 'live' ? null : Number(e.target.value) })}>
          <option value="live">Follow the clock</option>
          {[7, 12, 18, 20, 23].map((h) => <option key={h} value={h}>{clockLabel(h)}</option>)}
        </select>
      </label>
      <label className="pv-check"><input type="checkbox" checked={settings.ambience} onChange={(e) => onChange({ ambience: e.target.checked })} /> Ambient sounds (rain, wind, birds, crickets)</label>
      <label className="pv-check"><input type="checkbox" checked={settings.lowPower} onChange={(e) => onChange({ lowPower: e.target.checked })} /> Fewer particles (for slower devices)</label>
      <label className="field"><span className="field__label">Character voices (meows, chirps, Racon’s chitter): {Math.round((settings.voices ?? 0.7) * 100)}%</span>
        <input type="range" min={0} max={100} step={10} value={Math.round((settings.voices ?? 0.7) * 100)} onChange={(e) => onChange({ voices: Number(e.target.value) / 100 })} aria-label="Character voice volume" />
      </label>
      <div className="modal__actions"><Button variant="primary" onClick={onClose}>Done</Button></div>
    </Modal>
  );
}

export function BagPanel({ open, onClose, save }: { open: boolean; onClose: () => void; save: WorldSave }) {
  const items = Object.entries(save.inventory).filter(([, n]) => (n ?? 0) > 0) as [ItemId, number][];
  return (
    <Modal open={open} title="Your bag & achievements" onClose={onClose} className="pv-modal">
      <h3>Bag</h3>
      {items.length === 0 ? <p className="pv-note">Empty for now — shake the apple tree, fish at the pier or look for secrets.</p> : (
        <ul className="pv-bag">{items.map(([id, n]) => <li key={id}><span>{ITEM_NAMES[id]}</span><strong>×{n}</strong></li>)}</ul>
      )}
      <h3>Achievements</h3>
      <ul className="pv-achievements">
        {(Object.keys(ACHIEVEMENTS) as AchievementId[]).map((a) => (
          <li key={a} className={save.achievements[a] ? 'is-done' : ''}>
            <strong>{save.achievements[a] ? '★ ' : '☆ '}{ACHIEVEMENTS[a].name}</strong>
            <span>{ACHIEVEMENTS[a].detail}</span>
          </li>
        ))}
      </ul>
      <p className="pv-note">Fish caught: {save.stats.fishCaught} · Puddle splashes: {save.stats.splashes} · Coins in the fountain: {save.stats.coins}</p>
      <div className="modal__actions"><Button variant="primary" onClick={onClose}>Close</Button></div>
    </Modal>
  );
}
