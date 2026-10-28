import { useEffect, useState } from 'react';
import { Button } from '../../components/Button';
import { CatCharacter } from '../../components/CatCharacter';
import { Modal } from '../../components/Modal';
import type { Accessory } from '../../game/types';
import { NICKNAME_MAX, cleanNickname, loadPreferences, savePreferences } from '../../lib/preferences';
import { CHARACTERS, COATS, COAT_INFO, EXTRAS, EXTRA_LABEL, EXTRA_UNLOCK, ORIGINAL_ACCESSORIES, appearanceStore, characterFor, defaultCoatFor, type CoatId, type ExtraId } from '../appearance.ts';
import type { TownIdentity } from '../identity';
import type { WorldSave } from '../worldSave.ts';
import { PixelCat } from './PixelCat';

const ACCESSORY_LABELS: Record<Accessory, string> = { none: 'Classic', crown: 'Tiny crown', bow: 'Bow', wizard: 'Wizard hat', bell: 'Little bell' };

export function extraUnlocked(id: ExtraId, save: WorldSave): boolean {
  if (id === 'leafcrown') return save.garden.bloomed > 0 || !!save.achievements['green-paws'];
  if (id === 'starclip') return !!save.achievements['star-wisher'];
  if (id === 'captainhat') return !!save.achievements['harbor-hero'];
  if (id === 'starcharm') return !!save.achievements['star-friend'];
  return true;
}

/**
 * Pawville wardrobe — extends the original Paw vs Paw customization (nickname + accessory are the
 * SAME preferences) with coat palettes and Pawville extras. Live preview, reset, save/cancel.
 * Cosmetics are purely visual and never affect any game.
 */
export function Wardrobe({ open, onClose, identity, save, onSaved }: { open: boolean; onClose: () => void; identity: TownIdentity; save: WorldSave; onSaved: () => void }) {
  const [nickname, setNickname] = useState('');
  const [accessory, setAccessory] = useState<Accessory>('none');
  const [coat, setCoat] = useState<CoatId>('tangerine');
  const [extra, setExtra] = useState<ExtraId>('none');
  useEffect(() => {
    if (!open) return;
    const p = loadPreferences();
    const a = appearanceStore().load();
    setNickname(p.nickname);
    setAccessory(p.accessory);
    setCoat(a.coat);
    setExtra(extraUnlocked(a.extra, save) ? a.extra : 'none');
  }, [open, save]);
  const commit = () => {
    savePreferences({ nickname: cleanNickname(nickname), accessory });
    appearanceStore().save({ coat, extra: extraUnlocked(extra, save) ? extra : 'none' });
    onSaved();
    onClose();
  };
  const reset = () => {
    setCoat(defaultCoatFor(identity.cat));
    setExtra('none');
    setAccessory('none');
  };
  const base = COAT_INFO[coat].base;
  const character = characterFor(coat);
  return (
    <Modal open={open} title="Wardrobe" onClose={onClose} className="pv-modal pv-wardrobe">
      <div className="pv-wardrobe__preview" aria-label="Preview">
        <CatCharacter cat={base} coat={coat} accessory={accessory} mood="happy" size={120} />
        <div className="pv-wardrobe__pixel">
          <PixelCat coat={coat} accessory={accessory} extra={extra} facing="down" scale={4} label={`${COAT_INFO[coat].name} in town`} />
          <PixelCat coat={coat} accessory={accessory} extra={extra} facing="right" moving scale={4} />
          <PixelCat coat={coat} accessory={accessory} extra={extra} facing="down" pose="sit" scale={4} />
        </div>
      </div>
      {character && <p className="pv-char__desc">{character.name}: {character.description}</p>}
      <fieldset className="pv-fieldset">
        <legend className="field__label">Character</legend>
        <div className="pv-chars" role="radiogroup" aria-label="Cat character">
          {CHARACTERS.map((c) => (
            <button key={c.id} type="button" role="radio" aria-checked={coat === c.coat} className={`pv-char ${coat === c.coat ? 'is-selected' : ''}`} onClick={() => setCoat(c.coat)} title={c.description}>
              <PixelCat coat={c.coat} accessory={accessory} extra={extra} facing="down" scale={2} />
              <span className="pv-char__name">{c.name}</span>
              <span className="pv-char__meta">{c.baseCoat} · {c.marking}</span>
              <span className="pv-char__meta"><span className="pv-char__eye" style={{ background: c.eyeColor }} aria-hidden="true" /> {c.eyeColorName} eyes</span>
            </button>
          ))}
        </div>
        <span className="field__hint">Your nickname stays yours — the character is just the cat you play as.</span>
      </fieldset>
      <label className="field">
        <span className="field__label">Nickname</span>
        <input className="field__input" value={nickname} maxLength={NICKNAME_MAX} placeholder="Your nickname (optional)" autoComplete="off"
          onChange={(e) => setNickname(e.target.value.replace(/[^\p{L}\p{N} _.!?'-]/gu, ''))} />
        <span className="field__hint">Shared with Paw vs Paw and shown to other cats.</span>
      </label>
      <fieldset className="pv-fieldset">
        <legend className="field__label">Or a plain coat colour</legend>
        <div className="pv-swatches" role="radiogroup" aria-label="Coat colour">
          {COATS.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={coat === c} className={`pv-swatch ${coat === c ? 'is-selected' : ''}`} onClick={() => setCoat(c)}>
              <span className="pv-swatch__chip" style={{ background: `linear-gradient(135deg, ${COAT_INFO[c].svg.furLight}, ${COAT_INFO[c].svg.fur} 60%, ${COAT_INFO[c].svg.furDark})` }} />
              <span>{COAT_INFO[c].name}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="accessory-picker">
        <legend className="field__label">Hat or collar (also used in Paw vs Paw)</legend>
        <div className="accessory-picker__grid">
          {ORIGINAL_ACCESSORIES.map((a) => (
            <label key={a} className={`accessory-option ${accessory === a ? 'is-selected' : ''}`}>
              <input type="radio" name="pv-accessory" value={a} checked={accessory === a} onChange={() => setAccessory(a)} />
              <CatCharacter cat={base} coat={coat} pose="head" accessory={a} size={44} still />
              <span>{ACCESSORY_LABELS[a]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="pv-fieldset">
        <legend className="field__label">Pawville extras</legend>
        <div className="pv-extras" role="radiogroup" aria-label="Extras">
          {EXTRAS.map((x) => {
            const ok = extraUnlocked(x, save);
            return (
              <button key={x} type="button" role="radio" aria-checked={extra === x} disabled={!ok} className={`pv-extra ${extra === x ? 'is-selected' : ''}`} onClick={() => setExtra(x)}
                title={ok ? EXTRA_LABEL[x] : EXTRA_UNLOCK[x]?.hint}>
                <PixelCat coat={coat} extra={x} facing="down" scale={2} />
                <span>{EXTRA_LABEL[x]}</span>
                {!ok && <span className="pv-extra__lock">{EXTRA_UNLOCK[x]?.hint}</span>}
              </button>
            );
          })}
        </div>
      </fieldset>
      <p className="pv-note">Looks are cosmetic only — they never change any game. Your couple role stays {identity.cat === 'T' ? 'Tangerine' : 'Midnight'} whatever coat you wear.</p>
      <div className="modal__actions">
        <Button variant="ghost" onClick={reset}>Reset to default</Button>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={commit}>Save</Button>
      </div>
    </Modal>
  );
}
