import type { GameId } from '../destinations.ts';

/** Small illustrated marks for each destination (inline SVG in the Pawville palette). */
export function GameMark({ game, size = 28 }: { game: GameId; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 32 32', 'aria-hidden': true as const, className: `pv-mark pv-mark--${game}` };
  switch (game) {
    case 'pawtype':
      return (<svg {...common}><rect x="3" y="9" width="26" height="15" rx="4" fill="#1f4a4d" stroke="#7ee0d2" strokeWidth="1.5" />{[6, 11, 16, 21].map((x) => <rect key={x} x={x} y="12" width="4" height="3.5" rx="1" fill="#e9f4f2" />)}<rect x="9" y="18" width="14" height="3.5" rx="1" fill="#ff8a35" /></svg>);
    case 'memory-paws':
      return (<svg {...common}><rect x="4" y="6" width="14" height="20" rx="3" fill="#4b3a78" stroke="#ff8a35" strokeWidth="1.5" transform="rotate(-8 11 16)" /><rect x="14" y="6" width="14" height="20" rx="3" fill="#fff3e6" stroke="#ffc94a" strokeWidth="1.5" transform="rotate(8 21 16)" /><circle cx="21" cy="17" r="2.6" fill="#ff8a35" /></svg>);
    case 'whack-a-cat':
      return (<svg {...common}><ellipse cx="16" cy="25" rx="12" ry="4" fill="#2a1d2f" /><path d="M8 24v-9l3-6 3 5h4l3-5 3 6v9z" fill="#ff8a35" /><circle cx="13" cy="17" r="1.4" fill="#2a1203" /><circle cx="19" cy="17" r="1.4" fill="#2a1203" /></svg>);
    case 'puzzle-garden':
      return (<svg {...common}><path d="M16 28V14" stroke="#4f9a67" strokeWidth="2" /><path d="M16 20c-5 0-7-3-7-6 4 0 7 2 7 6zM16 18c4 0 6-2 6-5-3 0-6 2-6 5z" fill="#7edb8c" /><circle cx="16" cy="9" r="5" fill="#ff8fb1" /><circle cx="16" cy="9" r="2" fill="#ffd36b" /></svg>);
    case 'cat-boxing':
      return (<svg {...common}><path d="M6 14c0-5 4-8 9-8s9 3 9 8v4c0 4-3 7-7 7h-4c-4 0-7-3-7-7z" fill="#ff8a35" stroke="#5a2a0e" strokeWidth="1.4" /><rect x="9" y="22" width="12" height="5" rx="2" fill="#ffe9cf" stroke="#5a2a0e" strokeWidth="1.2" /><circle cx="12" cy="13" r="1.6" fill="#ffd0a8" /><circle cx="17" cy="11" r="1.6" fill="#ffd0a8" /><circle cx="21" cy="14" r="1.6" fill="#ffd0a8" /></svg>);
    case 'paw-snap':
      return (<svg {...common}><path d="M4 22c6-10 14-12 22-4l3-3v12l-3-3c-8 7-16 6-22-2z" fill="#7fb2e6" stroke="#2f4870" strokeWidth="1.4" /><path d="M8 6l3 4M16 3v5M24 6l-3 4" stroke="#ffc94a" strokeWidth="2" strokeLinecap="round" /></svg>);
    default:
      return (<svg {...common}><rect x="4" y="4" width="24" height="24" rx="5" fill="#241b3d" stroke="#ff8a35" strokeWidth="1.5" /><path d="M10 10l12 12M22 10L10 22" stroke="#ff8a35" strokeWidth="2.4" strokeLinecap="round" /></svg>);
  }
}
