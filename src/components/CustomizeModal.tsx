import { useEffect, useState } from 'react';
import { ACCESSORIES, type Accessory } from '../game/types';
import { NICKNAME_MAX, cleanNickname, loadPreferences, savePreferences } from '../lib/preferences';
import { Button } from './Button';
import { CatCharacter } from './CatCharacter';
import { Modal } from './Modal';

const ACCESSORY_LABELS: Record<Accessory, string> = {
  none: 'Classic', crown: 'Tiny crown', bow: 'Bow', wizard: 'Wizard hat', bell: 'Little bell',
};

interface CustomizeModalProps {
  open: boolean;
  onClose: () => void;
  /** In a room only the look can change (nickname is fixed once joined). */
  inRoomSeat?: 'T' | 'M' | null;
  onSaved?: (prefs: { nickname: string; accessory: Accessory }) => void;
}

export function CustomizeModal({ open, onClose, inRoomSeat = null, onSaved }: CustomizeModalProps) {
  const [nickname, setNickname] = useState('');
  const [accessory, setAccessory] = useState<Accessory>('none');

  useEffect(() => {
    if (!open) return;
    const p = loadPreferences();
    setNickname(p.nickname);
    setAccessory(p.accessory);
  }, [open]);

  const save = () => {
    const clean = cleanNickname(nickname);
    savePreferences({ nickname: clean, accessory });
    onSaved?.({ nickname: clean, accessory });
    onClose();
  };

  return (
    <Modal open={open} title={inRoomSeat ? 'Change appearance' : 'Your cat'} onClose={onClose}>
      <div className="customize">
        <div className="customize__preview" aria-hidden="true">
          {(inRoomSeat ? [inRoomSeat] : (['T', 'M'] as const)).map((seat) => (
            <CatCharacter key={seat} cat={seat} mood="happy" accessory={accessory} size={96} />
          ))}
        </div>
        {!inRoomSeat && (
          <label className="field">
            <span className="field__label">Nickname</span>
            <input
              className="field__input"
              value={nickname}
              maxLength={NICKNAME_MAX}
              placeholder="Your nickname (optional)"
              autoComplete="off"
              onChange={(e) => setNickname(e.target.value.replace(/[^\p{L}\p{N} _.!?'-]/gu, ''))}
            />
            <span className="field__hint">Up to {NICKNAME_MAX} letters, numbers, spaces. Shown to your opponent only.</span>
          </label>
        )}
        <fieldset className="accessory-picker">
          <legend className="field__label">Look (cosmetic only — never affects the rules)</legend>
          <div className="accessory-picker__grid">
            {ACCESSORIES.map((a) => (
              <label key={a} className={`accessory-option ${accessory === a ? 'is-selected' : ''}`}>
                <input type="radio" name="accessory" value={a} checked={accessory === a} onChange={() => setAccessory(a)} />
                <CatCharacter cat={inRoomSeat ?? 'T'} pose="head" accessory={a} size={44} still />
                <span>{ACCESSORY_LABELS[a]}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {!inRoomSeat && (
          <p className="customize__note">Online, the room creator plays Tangerine and the friend who joins plays Midnight.</p>
        )}
        <div className="modal__actions">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>Save</Button>
        </div>
      </div>
    </Modal>
  );
}
