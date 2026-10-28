import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import '@fontsource/nunito/400.css';
import '@fontsource/nunito/600.css';
import '@fontsource/nunito/800.css';
import './styles/designTokens.css';
import './styles/globalStyles.css';
import './styles/components.css';
import './pawville/styles/pawville-tokens.css';
import './pawville/styles/pawville.css';
import './pawville/styles/games.css';
import './pawville/styles/world.css';
import './pawville/styles/adventure.css';
import './pawville/styles/city.css';
import { App } from './App';
import { registerPawvilleSW } from './pwa';
import { configureVoices } from './pawville/city/voices.ts';
import { isSoundEnabled, sharedAudioContext } from './lib/soundService';

// Milestone 10: character voices share the game's one AudioContext on every page (not just the town)
configureVoices({ isEnabled: isSoundEnabled, context: sharedAudioContext });
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Milestone 6: installable web app. An update waits until the player accepts it.
registerPawvilleSW((apply) => {
  const bar = document.createElement('button');
  bar.type = 'button';
  bar.className = 'pv-update-ready';
  bar.textContent = 'A new version of Pawville is ready — tap to update';
  bar.onclick = apply;
  document.body.appendChild(bar);
});
