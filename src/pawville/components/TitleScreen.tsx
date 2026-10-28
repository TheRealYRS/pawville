import { useState } from 'react';
import '../styles/m11-fixes.css';

type View = 'title' | 'help' | 'credits';

/**
 * Pawville title screen with How to Play and Credits.
 * Uses /favicon.svg (the old /icons/icon-512.png is missing, which showed a broken image)
 * and hides the logo gracefully if it ever fails to load.
 */
export function TitleScreen({ onStart }: { onStart: () => void }) {
  const [view, setView] = useState<View>('title');
  const [iconOk, setIconOk] = useState(true);

  return (
    <main className="pv-title">
      <section className="pv-title__card" aria-labelledby="pv-title-heading">
        {iconOk && (
          <img className="pv-title__logo" src="/favicon.svg" width={120} height={120} alt="" aria-hidden="true"
            onError={() => setIconOk(false)} />
        )}
        <h1 id="pv-title-heading">Pawville</h1>
        <p className="pv-title__tagline">A little world. A thousand little moments.</p>

        {view === 'title' && (
          <>
            <p className="pv-title__lead">Explore the town, visit Whiskerwick, and make a little home.</p>
            <div className="pv-title__actions">
              <button type="button" className="btn btn--primary" onClick={onStart}>Enter Pawville</button>
              <button type="button" className="btn btn--ghost" onClick={() => setView('help')}>How to play</button>
              <button type="button" className="btn btn--ghost" onClick={() => setView('credits')}>Credits</button>
            </div>
          </>
        )}

        {view === 'help' && (
          <div className="pv-title__panel">
            <h2>How to play</h2>
            <ul>
              <li><strong>Walk:</strong> WASD or arrow keys · <strong>Run:</strong> Shift</li>
              <li><strong>Interact:</strong> E (or tap the paw button on mobile)</li>
              <li><strong>Map:</strong> M · <strong>Journal:</strong> J · <strong>Close:</strong> Esc</li>
              <li>On a phone, drag the movement pad to walk.</li>
              <li>Pairing with a partner is optional — solo exploration works too.</li>
              <li>Progress, photos and notes are saved on this device.</li>
            </ul>
            <button type="button" className="btn btn--primary" onClick={() => setView('title')}>Back</button>
          </div>
        )}

        {view === 'credits' && (
          <div className="pv-title__panel">
            <h2>Credits</h2>
            <dl className="pv-credits">
              <dt>Created by</dt>
              <dd>Yash Raj Sondhi</dd>
              <dt>Fonts</dt>
              <dd>Fredoka and Nunito, via the @fontsource packages</dd>
              <dt>Built with</dt>
              <dd>React, TypeScript, Vite and Supabase</dd>
            </dl>
            <button type="button" className="btn btn--primary" onClick={() => setView('title')}>Back</button>
          </div>
        )}
      </section>
    </main>
  );
}
