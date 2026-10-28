import { useEffect, useState } from 'react';
import { errorText } from '../game/messages';
import type { CatMood } from '../game/types';
import { useToast } from '../hooks/useToast';
import { loadPreferences } from '../lib/preferences';
import { ServerError, createRoom, isValidRoomId } from '../lib/roomService';
import { ensureSession } from '../lib/sessionService';
import { sfx } from '../lib/soundService';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { Button } from '../components/Button';
import { CatCharacter } from '../components/CatCharacter';
import { CustomizeModal } from '../components/CustomizeModal';
import { HowToPlay } from '../components/HowToPlay';
import { Logo } from '../components/Logo';
import { Modal } from '../components/Modal';
import { PawPrint } from '../components/PawPrint';
import { SoundToggle } from '../components/SoundToggle';
import { Starfield } from '../components/Starfield';
import { Toast } from '../components/Toast';
import { BackToPawville } from '../pawville/components/BackToPawville';
import { goTo } from '../pawville/navigation';
const IDLE_MOODS: CatMood[] = ['idle', 'idle', 'playful', 'happy', 'thinking', 'idle'];
/** Accepts a full invite link or a bare room code. */
export function extractRoomId(input: string): string | null {
  const trimmed = input.trim();
  const match = /\/room\/([A-Za-z0-9_-]+)/.exec(trimmed);
  const id = match ? match[1] : trimmed;
  return isValidRoomId(id) ? id : null;
}
export function HomePage() {
  const { toast, show } = useToast();
  const [prefs, setPrefs] = useState(loadPreferences);
  const [creating, setCreating] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinInput, setJoinInput] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [moods, setMoods] = useState<{ T: CatMood; M: CatMood }>({ T: 'playful', M: 'happy' });
  useEffect(() => {
    const t = window.setInterval(() => {
      setMoods({ T: IDLE_MOODS[Math.floor(Math.random() * IDLE_MOODS.length)], M: IDLE_MOODS[Math.floor(Math.random() * IDLE_MOODS.length)] });
    }, 3800);
    return () => window.clearInterval(t);
  }, []);
  const poke = (seat: 'T' | 'M') => {
    sfx.pop();
    setMoods((m) => ({ ...m, [seat]: 'surprised' }));
    window.setTimeout(() => setMoods((m) => ({ ...m, [seat]: 'happy' })), 700);
  };
  const play = async () => {
    if (!isSupabaseConfigured) {
      show("Online play isn't configured on this deployment yet. Try vs Computer or Pass & Play!", 'warn', 4500);
      return;
    }
    setCreating(true);
    try {
      await ensureSession();
      const res = await createRoom(prefs.nickname, prefs.accessory);
      if (res.outcome === 'created' || res.outcome === 'joined' || res.outcome === 'rejoined') {
        goTo(`/room/${res.room.id}`);
        return;
      }
      show(errorText('unknown'), 'warn');
    } catch (e) {
      const code = e instanceof ServerError ? e.code : e instanceof Error && e.message === 'anonymous_disabled' ? 'anon' : 'network';
      show(code === 'anon' ? 'Guest sign-in is disabled on the server (enable Anonymous Sign-ins in Supabase).' : errorText(code), 'warn', 4500);
    } finally {
      setCreating(false);
    }
  };
  const submitJoin = () => {
    const id = extractRoomId(joinInput);
    if (!id) {
      setJoinError("That doesn't look like a Paw vs Paw invite link.");
      return;
    }
    setJoinOpen(false);
    goTo(`/room/${id}`);
  };
  return (
    <main className="home">
      <Starfield />
      <div className="home__top">
        <div className="pv-top-left">
          <BackToPawville />
          <button type="button" className="pill-btn" onClick={() => setCustomOpen(true)}>
            <CatCharacter cat="T" pose="head" size={24} accessory={prefs.accessory} still />
            <span>{prefs.nickname || 'Your cat'}</span>
          </button>
        </div>
        <SoundToggle />
      </div>
      <section className="home__hero">
        <Logo />
        <p className="home__tagline">Two cats. Nine squares. One tiny battlefield.</p>
        <div className="home__arena">
          <button type="button" className="home__cat home__cat--T" onClick={() => poke('T')} aria-label="Boop Tangerine, the orange cat">
            <CatCharacter cat="T" mood={moods.T} accessory={prefs.accessory} look={{ x: 1, y: 0 }} size="100%" />
            <span className="home__cat-name">Tangerine</span>
          </button>
          <span className="home__spark" aria-hidden="true"><PawPrint size={20} /></span>
          <button type="button" className="home__cat home__cat--M" onClick={() => poke('M')} aria-label="Boop Midnight, the black cat">
            <CatCharacter cat="M" mood={moods.M} look={{ x: 1, y: 0 }} size="100%" flip />
            <span className="home__cat-name">Midnight</span>
          </button>
        </div>
        <p className="home__ready">Tangerine and Midnight are ready. Are you?</p>
      </section>
      {prefs.lastRoomId && isSupabaseConfigured && (
        <div className="rejoin-banner">
          <span>You have a match in progress.</span>
          <Button size="sm" variant="secondary" onClick={() => goTo(`/room/${prefs.lastRoomId}`)}>Rejoin</Button>
        </div>
      )}
      <section className="home__actions" aria-label="Game modes">
        <Button variant="primary" size="lg" className="cta" onClick={play} loading={creating} icon={<PawPrint size={22} />}>
          <span className="cta__main">Let&apos;s play</span>
          <span className="cta__sub">Online · invite a friend</span>
        </Button>
        <Button variant="midnight" onClick={() => { setJoinError(null); setJoinOpen(true); }}>Join a friend&apos;s room</Button>
        <div className="home__more">
          <Button variant="ghost" onClick={() => goTo('/play/computer')}>vs Computer</Button>
          <Button variant="ghost" onClick={() => goTo('/play/local')}>Pass &amp; Play</Button>
        </div>
        <button type="button" className="link-btn" onClick={() => setHowOpen(true)}>How to play</button>
      </section>
      <footer className="home__footer">Settle it like cats. <PawPrint size={12} className="inline-paw" /> No account needed.</footer>
      <HowToPlay open={howOpen} onClose={() => setHowOpen(false)} />
      <CustomizeModal open={customOpen} onClose={() => setCustomOpen(false)} onSaved={() => setPrefs(loadPreferences())} />
      <Modal open={joinOpen} title="Join a friend's room" onClose={() => setJoinOpen(false)}>
        <form className="join-form" onSubmit={(e) => { e.preventDefault(); submitJoin(); }}>
          <label className="field">
            <span className="field__label">Paste the invite link or room code</span>
            <input className="field__input" value={joinInput} onChange={(e) => { setJoinInput(e.target.value); setJoinError(null); }}
              placeholder="https://…/room/AbCd…" autoComplete="off" aria-invalid={!!joinError} aria-describedby={joinError ? 'join-error' : undefined} />
          </label>
          {joinError && <p id="join-error" className="field__error">{joinError}</p>}
          <div className="modal__actions">
            <Button variant="ghost" onClick={() => setJoinOpen(false)}>Cancel</Button>
            <Button variant="primary" type="submit">Join</Button>
          </div>
        </form>
      </Modal>
      <Toast toast={toast} />
    </main>
  );
}
