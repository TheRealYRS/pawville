import { useSound } from '../hooks/useSound';

export function SoundToggle() {
  const [on, setOn] = useSound();
  return (
    <button
      type="button"
      className={`icon-btn sound-toggle ${on ? 'is-on' : ''}`}
      onClick={() => setOn(!on)}
      aria-pressed={on}
      aria-label={on ? 'Sound on. Click to mute.' : 'Sound off. Click to turn on.'}
      title={on ? 'Mute sounds' : 'Turn sounds on'}
    >
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
        <path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" fill="currentColor" />
        {on ? (
          <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M15.2 9.2a4 4 0 0 1 0 5.6" />
            <path d="M17.8 6.8a7.4 7.4 0 0 1 0 10.4" />
          </g>
        ) : (
          <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M15.5 9.5l5 5M20.5 9.5l-5 5" />
          </g>
        )}
      </svg>
    </button>
  );
}
