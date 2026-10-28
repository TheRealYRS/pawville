import type { EmoteId } from '../net/presenceProtocol.ts';

/**
 * One consistent icon set for emotes (small inline SVGs in the Pawville palette — no emoji, so
 * they look the same on every device). Unknown ids fall back to a paw.
 */
export function EmoteIcon({ id, size = 22 }: { id: EmoteId; size?: number }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': true as const, className: `pv-emote-icon pv-emote-icon--${id}` };
  const paw = (c: string, x = 12, y = 13, s = 1) => (
    <g fill={c} transform={`translate(${x} ${y}) scale(${s}) translate(-12 -13)`}>
      <ellipse cx="12" cy="15" rx="4.2" ry="3.6" /><circle cx="7.4" cy="10" r="1.8" /><circle cx="10.4" cy="7.4" r="1.8" /><circle cx="13.6" cy="7.4" r="1.8" /><circle cx="16.6" cy="10" r="1.8" />
    </g>
  );
  const heart = (c: string, x = 12, y = 12, s = 1) => <path transform={`translate(${x} ${y}) scale(${s})`} d="M0 6 C-7 1 -6 -5 -2.5 -5 C-1 -5 0 -4 0 -2.8 C0 -4 1 -5 2.5 -5 C6 -5 7 1 0 6Z" fill={c} />;
  const star = (c: string, x = 12, y = 12, r = 6) => {
    const pts = Array.from({ length: 10 }, (_, i) => { const a = (i / 10) * Math.PI * 2 - Math.PI / 2; const rr = i % 2 ? r * 0.45 : r; return `${(x + Math.cos(a) * rr).toFixed(1)},${(y + Math.sin(a) * rr).toFixed(1)}`; }).join(' ');
    return <polygon points={pts} fill={c} />;
  };
  switch (id) {
    case 'wave': return <svg {...p}>{paw('#FF8A35', 11, 14)}<path d="M18 5c1.5 1 2 2.5 1.6 4M20 3c2 1.6 2.6 4 2 6" stroke="#FFC94A" strokeWidth="1.6" fill="none" strokeLinecap="round" /></svg>;
    case 'heart': return <svg {...p}>{heart('#FF6FA1', 12, 13, 1.4)}</svg>;
    case 'dance': return <svg {...p}><path d="M9 17V6l9-2v11" stroke="#C9BFE8" strokeWidth="2" fill="none" /><circle cx="7" cy="17" r="2.6" fill="#C9BFE8" /><circle cx="16" cy="15" r="2.6" fill="#FFC94A" /></svg>;
    case 'celebrate': return <svg {...p}>{star('#FFC94A', 12, 12, 8)}<circle cx="4" cy="5" r="1.4" fill="#FF6FA1" /><circle cx="20" cy="19" r="1.4" fill="#7EE0D2" /></svg>;
    case 'grumble': return <svg {...p}><circle cx="12" cy="13" r="7" fill="#FF8A35" /><circle cx="6" cy="14" r="2.4" fill="#FFB066" /><circle cx="18" cy="14" r="2.4" fill="#FFB066" /><path d="M8 10l3 1M16 10l-3 1" stroke="#5A2A0E" strokeWidth="1.5" strokeLinecap="round" /><path d="M2 8c1-1 2-1 3 0M19 8c1-1 2-1 3 0" stroke="#FFF3E6" strokeWidth="1.4" fill="none" strokeLinecap="round" /></svg>;
    case 'sorry': return <svg {...p}><path d="M5 9l4 3M19 9l-4 3" stroke="#C9BFE8" strokeWidth="2" strokeLinecap="round" /><path d="M8 17c2-2 6-2 8 0" stroke="#C9BFE8" strokeWidth="2" fill="none" strokeLinecap="round" /><path d="M18 14c0 1.5 1.6 2.4 1.6 3.4a1.6 1.6 0 1 1-3.2 0c0-1 1.6-1.9 1.6-3.4z" fill="#9FD3FF" /></svg>;
    case 'purr': return <svg {...p}><path d="M6 13c1-2 3-2 4 0M14 13c1-2 3-2 4 0" stroke="#FFC94A" strokeWidth="2" fill="none" strokeLinecap="round" /><path d="M4 19c2-1.5 4 1.5 6 0s4 1.5 6 0 4 1.5 4 0" stroke="#FFC94A" strokeWidth="1.6" fill="none" strokeLinecap="round" /></svg>;
    case 'surprised': return <svg {...p}><rect x="10.5" y="3" width="3" height="12" rx="1.5" fill="#FFC94A" /><circle cx="12" cy="19.5" r="2" fill="#FFC94A" /></svg>;
    case 'bounce': return <svg {...p}><circle cx="12" cy="8" r="4" fill="#FF8A35" /><path d="M5 20h14" stroke="#E9DCCF" strokeWidth="2" strokeLinecap="round" /><path d="M8 15l-1 2M16 15l1 2M12 15v2" stroke="#E9DCCF" strokeWidth="1.5" strokeLinecap="round" /></svg>;
    case 'sleepy': return <svg {...p}><path d="M4 6h6l-6 7h6" stroke="#C9BFE8" strokeWidth="2" fill="none" strokeLinejoin="round" /><path d="M13 12h5l-5 6h5" stroke="#C9BFE8" strokeWidth="1.6" fill="none" strokeLinejoin="round" /></svg>;
    case 'high-five': return <svg {...p}>{paw('#FF8A35', 8, 12, 0.75)}{paw('#A89BC9', 16, 12, 0.75)}<path d="M12 3v3M9 4l1 2M15 4l-1 2" stroke="#FFC94A" strokeWidth="1.4" strokeLinecap="round" /></svg>;
    case 'paw-bump': return <svg {...p}><circle cx="8" cy="13" r="4.5" fill="#FF8A35" /><circle cx="16" cy="13" r="4.5" fill="#A89BC9" /><path d="M12 6v2" stroke="#FFC94A" strokeWidth="1.6" strokeLinecap="round" /></svg>;
    case 'nose-boop': return <svg {...p}><path d="M3 14c3-4 6-4 8.5-1M21 14c-3-4-6-4-8.5-1" stroke="#FFE9CF" strokeWidth="2" fill="none" strokeLinecap="round" /><path d="M10.5 12.5h3l-1.5 2z" fill="#FF7E9A" />{heart('#FF6FA1', 12, 6, 0.55)}</svg>;
    case 'hug': return <svg {...p}>{heart('#FF6FA1', 9, 12, 1)}{heart('#FF9DBE', 15, 13, 0.85)}</svg>;
    case 'sit-together': return <svg {...p}><path d="M3 18h18" stroke="#B5835A" strokeWidth="2.4" strokeLinecap="round" /><circle cx="8" cy="12" r="3.4" fill="#FF8A35" /><circle cx="16" cy="12" r="3.4" fill="#A89BC9" />{heart('#FF6FA1', 12, 6, 0.45)}</svg>;
    case 'magic-long-stretch': return <svg {...p}><path d="M3 17c3 0 4-1 6-4 2-3 5-5 9-5" stroke="#A8754C" strokeWidth="3" fill="none" strokeLinecap="round" /><path d="M3 19h7" stroke="#FFFAF2" strokeWidth="2" strokeLinecap="round" /><path d="M18 8c2 0 3-2 2-4" stroke="#6B4226" strokeWidth="1.8" fill="none" strokeLinecap="round" /></svg>;
    case 'chutki-belly-nap': return <svg {...p}><ellipse cx="12" cy="16" rx="8" ry="4" fill="#FFF8F0" /><ellipse cx="12" cy="15" rx="5" ry="2" fill="#FFFFFF" /><path d="M7 12v-2M10 11V9M14 11V9M17 12v-2" stroke="#FFF8F0" strokeWidth="2" strokeLinecap="round" />{heart('#FF9A3D', 4.5, 17, 0.35)}<path d="M15 4h4l-4 4h4" stroke="#C9BFE8" strokeWidth="1.4" fill="none" /></svg>;
    case 'puchu-loud-purr': return <svg {...p}><circle cx="12" cy="11" r="6" fill="#FFF8F0" /><circle cx="9" cy="9" r="1" fill="#FF9A3D" /><circle cx="15.5" cy="13" r="1" fill="#FF9A3D" /><path d="M2 20c2-1.5 3 1.5 5 0s3 1.5 5 0 3 1.5 5 0 3 1.5 5 0" stroke="#FFB066" strokeWidth="1.8" fill="none" strokeLinecap="round" /></svg>;
    case 'tangerine-curious-tilt': return <svg {...p}><circle cx="11" cy="13" r="6" fill="#FF8A35" transform="rotate(-15 11 13)" /><path d="M17 4c2 0 3 1 3 2.4 0 1.6-2 1.8-2 3.4" stroke="#FFE9CF" strokeWidth="1.8" fill="none" strokeLinecap="round" /><circle cx="18" cy="12.4" r="1" fill="#FFE9CF" /></svg>;
    case 'midnight-pounce': return <svg {...p}><path d="M3 18c4-9 10-11 18-9" stroke="#463C5A" strokeWidth="1.6" strokeDasharray="2 2" fill="none" /><circle cx="18" cy="9" r="4" fill="#252031" /><circle cx="17" cy="8.5" r="0.9" fill="#FFC23D" /><circle cx="19.5" cy="8.5" r="0.9" fill="#FFC23D" /></svg>;
    case 'racon-fence-dance': return <svg {...p}><circle cx="12" cy="8" r="4.5" fill="#8E8A98" /><rect x="7.6" y="6.6" width="8.8" height="2.6" rx="1.3" fill="#211D27" /><path d="M7 15l10 3M17 15L7 18" stroke="#3A3542" strokeWidth="2.2" strokeLinecap="round" /><path d="M3 4l2 2M21 4l-2 2" stroke="#FFD45E" strokeWidth="1.4" strokeLinecap="round" /></svg>;
    case 'mini-starpaw-serenade': return <svg {...p}>{paw('#2EE86A', 10, 14, 0.95)}{star('#FFD45E', 18.5, 5.5, 4)}<circle cx="5" cy="5" r="1" fill="#FFD45E" /><circle cx="20" cy="15" r="0.9" fill="#57F28A" /></svg>;
    default: return <svg {...p}>{paw('#FF8A35')}</svg>;
  }
}
