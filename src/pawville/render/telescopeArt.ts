/** Milestone 8.1: the telescope eyepiece renderer (pure Canvas2D; used by TelescopeView and the preview script). */
import { atSite, dAz, fov, reticle, shootingStar, type ScopeSite, type ScopeView, type SkyContext } from '../adventure/telescope.ts';

// deterministic star field (az, alt, brightness)
export const FIELD: [number, number, number][] = (() => {
  const out: [number, number, number][] = [];
  let s = 0x5eed;
  const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
  for (let i = 0; i < 1400; i++) out.push([r() * 360, 2 + Math.asin(r()) * (80 / (Math.PI / 2)), r() ** 3]);
  return out;
})();

export function horizon(site: ScopeSite, az: number): number {
  // skyline height (degrees) — rooftops see chimneys, the boardwalk sees sea + far shore, the park sees hills
  const a = (az * Math.PI) / 180;
  if (site === 'city') return 1.2 + Math.max(0, Math.sin(a * 3 + 1)) * 0.8;
  if (site === 'rooftops') { const b = Math.floor(az / 6); return 1.5 + ((b * 7919) % 5) * 0.7 + (b % 4 === 0 ? 1.2 : 0); }
  return 1.5 + Math.sin(a * 2) * 1.2 + Math.sin(a * 5 + 2) * 0.6 + 1.2;
}

// ------------------------------------------------------------------------------------------------ drawing
export function drawTelescope(ctx: CanvasRenderingContext2D, W: number, H: number, v: ScopeView, c: SkyContext, dpr = 1) {
  const R = Math.min(W, H) * 0.46, cx = W / 2, cy = H / 2;
  const ppd = (R * 2) / fov(v.zoom); // pixels per degree
  const toXY = (az: number, alt: number) => ({ x: cx + dAz(az, v.az) * ppd * Math.cos((alt * Math.PI) / 180), y: cy - (alt - v.alt) * ppd });
  const px = Math.max(1, Math.round(ppd * 0.08)); // pixel-art "dot" size, grows with zoom
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#07060c';
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();

  // sky colour: day blue → dusk plum → night ink
  const d = c.darkness;
  const mix = (a: number[], b: number[], k: number) => a.map((x, i) => Math.round(x + (b[i] - x) * k));
  const top = d < 0.5 ? mix([104, 170, 232], [74, 52, 112], d * 2) : mix([74, 52, 112], [14, 12, 34], (d - 0.5) * 2);
  const low = d < 0.5 ? mix([190, 222, 250], [210, 120, 120], d * 2) : mix([210, 120, 120], [42, 32, 74], (d - 0.5) * 2);
  const g = ctx.createLinearGradient(0, toXY(v.az, 60).y, 0, toXY(v.az, 0).y);
  g.addColorStop(0, `rgb(${top})`); g.addColorStop(1, `rgb(${low})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  const starA = c.clear ? Math.max(0, (d - 0.35) / 0.65) : 0;
  if (starA > 0) {
    // fainter stars appear as you zoom in
    const limit = 0.25 + v.zoom * 0.18;
    for (const [az, alt, b] of FIELD) {
      if (b > limit) continue;
      const p = toXY(az, alt);
      if (p.x < cx - R || p.x > cx + R || p.y < cy - R || p.y > cy + R) continue;
      ctx.globalAlpha = starA * (1 - b / limit) * 0.9 + 0.1 * starA;
      ctx.fillStyle = b < 0.02 ? '#fff3e6' : '#c9bfe8';
      ctx.fillRect(Math.round(p.x), Math.round(p.y), b < 0.03 ? px + 1 : px, b < 0.03 ? px + 1 : px);
    }
    ctx.globalAlpha = 1;
  }

  for (const o of atSite(c)) {
    if (o.kind === 'landmark' || o.id === 'shooting-star' || !o.visible(c)) continue;
    const p = toXY(o.az, o.alt);
    const faint = v.zoom < o.minZoom;
    if (o.kind === 'constellation' && o.stars) {
      const pts = o.stars.map(([dx, dy]) => toXY(o.az + dx, o.alt + dy));
      ctx.strokeStyle = 'rgba(201,191,232,0.35)'; ctx.lineWidth = Math.max(1, px * 0.6);
      for (const [a, b] of o.lines ?? []) { ctx.beginPath(); ctx.moveTo(pts[a].x, pts[a].y); ctx.lineTo(pts[b].x, pts[b].y); ctx.stroke(); }
      ctx.fillStyle = o.id === 'lumi-stars' ? '#ffd27a' : '#fff3e6';
      for (const q of pts) ctx.fillRect(Math.round(q.x - px), Math.round(q.y - px), px * 2 + 1, px * 2 + 1);
    } else if (o.kind === 'moon') {
      const r = o.size * ppd;
      ctx.fillStyle = '#f3ecd8'; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(160,150,140,0.55)';
      for (const [dx, dy, s] of [[-0.3, -0.2, 0.18], [0.25, 0.1, 0.12], [-0.05, 0.35, 0.1], [0.35, -0.35, 0.08]] as const) { ctx.beginPath(); ctx.arc(p.x + dx * r, p.y + dy * r, s * r, 0, Math.PI * 2); ctx.fill(); }
      // phase shadow: offset dark disc (waxing = lit on the right)
      const ph = c.moonPhase, lit = 1 - Math.abs(ph - 0.5) * 2; // 0 new … 1 full
      if (lit < 0.98) {
        ctx.save(); ctx.beginPath(); ctx.arc(p.x, p.y, r + 0.5, 0, Math.PI * 2); ctx.clip();
        ctx.fillStyle = `rgb(${top})`;
        const off = (ph < 0.5 ? -1 : 1) * r * 2 * lit;
        ctx.beginPath(); ctx.arc(p.x + off, p.y, r * 1.02, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
    } else if (o.kind === 'planet') {
      const r = Math.max(px, o.size * ppd * 0.18);
      ctx.fillStyle = '#e0715a'; ctx.fillRect(Math.round(p.x - r), Math.round(p.y - r), Math.round(r * 2), Math.round(r * 2));
    } else if (o.kind === 'deep' && !faint && starA > 0) {
      const r = o.size * ppd;
      if (o.id === 'whisker-comet') {
        ctx.strokeStyle = 'rgba(190,230,255,0.45)'; ctx.lineWidth = Math.max(1, r * 0.25);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + r * 5, p.y - r * 2.5); ctx.stroke();
        ctx.fillStyle = '#dff4ff'; ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.45, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.strokeStyle = 'rgba(126,224,160,0.8)'; ctx.lineWidth = Math.max(1, r * 0.3);
        ctx.beginPath(); ctx.ellipse(p.x, p.y, r, r * 0.75, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#0c1a12'; ctx.fillRect(p.x - r * 0.08, p.y - r * 0.55, r * 0.16, r * 1.1);
      }
    } else if (o.kind === 'star') {
      ctx.fillStyle = '#fffbe8'; ctx.fillRect(Math.round(p.x - px), Math.round(p.y - px), px * 2 + 2, px * 2 + 2);
    }
  }
  const s = shootingStar(c);
  if (s) {
    const a = toXY(s.az + s.k * 14, s.alt - s.k * 7), b = toXY(s.az + s.k * 14 - 5, s.alt - s.k * 7 + 2.5);
    const sg = ctx.createLinearGradient(a.x, a.y, b.x, b.y); sg.addColorStop(0, 'rgba(255,255,255,0.95)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.strokeStyle = sg; ctx.lineWidth = Math.max(1.5, px); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }

  // clouds (weather) drift over the sky but not the horizon
  if (!c.clear) {
    ctx.fillStyle = d > 0.5 ? 'rgba(60,54,84,0.82)' : 'rgba(236,240,248,0.82)';
    for (let i = 0; i < 26; i++) { const p = toXY(i * 14 + (c.time * 0.6) % 14, 14 + (i % 5) * 9); ctx.beginPath(); ctx.ellipse(p.x, p.y, 9 * ppd, 3 * ppd, 0, 0, Math.PI * 2); ctx.fill(); }
  }

  // horizon silhouette + landmarks
  const dark = d > 0.5 ? '#151124' : d > 0.25 ? '#3a2d48' : '#4d6b4f';
  const ground = c.site === 'city' ? (d > 0.5 ? '#0e1a2e' : '#3f74b5') : dark;
  const step = Math.max(0.5, 1.5 / v.zoom);
  ctx.fillStyle = dark;
  ctx.beginPath(); ctx.moveTo(cx - R, cy + R);
  for (let a = -fov(v.zoom) / 2 - 2; a <= fov(v.zoom) / 2 + 2; a += step) { const p = toXY(v.az + a, horizon(c.site, v.az + a)); ctx.lineTo(p.x, p.y); }
  ctx.lineTo(cx + R, cy + R); ctx.closePath(); ctx.fill();
  if (c.site === 'city') { const p = toXY(v.az, 0.8); ctx.fillStyle = ground; ctx.fillRect(0, p.y, W, H); }
  for (const o of atSite(c)) {
    if (o.kind !== 'landmark' || !o.visible(c)) continue;
    const p = toXY(o.az, 0), r = o.size * ppd;
    if (Math.abs(dAz(o.az, v.az)) > fov(v.zoom)) continue;
    const win = d > 0.4 ? '#ffd27a' : '#9cc3ff';
    if (o.id === 'pawport-light') {
      ctx.fillStyle = dark; ctx.fillRect(p.x - r * 0.25, p.y - r * 2.4, r * 0.5, r * 2.4);
      ctx.fillStyle = '#e0475c'; for (let i = 0; i < 3; i++) ctx.fillRect(p.x - r * 0.25, p.y - r * (0.6 + i * 0.6), r * 0.5, r * 0.2);
      if (c.flags.has('lighthouse-lit')) {
        ctx.fillStyle = '#fff3c4'; ctx.fillRect(p.x - r * 0.2, p.y - r * 2.7, r * 0.4, r * 0.3);
        const ang = c.time * 1.4; ctx.fillStyle = 'rgba(255,240,180,0.25)';
        ctx.beginPath(); ctx.moveTo(p.x, p.y - r * 2.55); ctx.lineTo(p.x + Math.cos(ang) * r * 8, p.y - r * 2.55 - r * 0.8); ctx.lineTo(p.x + Math.cos(ang) * r * 8, p.y - r * 2.55 + r * 0.8); ctx.fill();
      }
    } else if (o.id === 'clock-tower') {
      ctx.fillStyle = dark; ctx.fillRect(p.x - r * 0.35, p.y - r * 2.6, r * 0.7, r * 2.6);
      ctx.beginPath(); ctx.moveTo(p.x - r * 0.45, p.y - r * 2.6); ctx.lineTo(p.x, p.y - r * 3.3); ctx.lineTo(p.x + r * 0.45, p.y - r * 2.6); ctx.fill();
      ctx.fillStyle = '#fff3e6'; ctx.beginPath(); ctx.arc(p.x, p.y - r * 2.1, r * 0.25, 0, Math.PI * 2); ctx.fill();
      const hr = c.flags.has('clock-fixed') ? (new Date().getHours() % 12) / 12 : 11 / 12;
      ctx.strokeStyle = '#2a1d2f'; ctx.lineWidth = Math.max(1, r * 0.04);
      ctx.beginPath(); ctx.moveTo(p.x, p.y - r * 2.1); ctx.lineTo(p.x + Math.sin(hr * Math.PI * 2) * r * 0.14, p.y - r * 2.1 - Math.cos(hr * Math.PI * 2) * r * 0.14); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p.x, p.y - r * 2.1); ctx.lineTo(p.x, p.y - r * 2.32); ctx.stroke();
    } else if (o.id === 'ferris-wheel') {
      ctx.strokeStyle = d > 0.5 ? '#6b5a8f' : '#3b2b3f'; ctx.lineWidth = Math.max(1, r * 0.05);
      ctx.beginPath(); ctx.arc(p.x, p.y - r * 1.1, r, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + c.time * 0.15;
        ctx.beginPath(); ctx.moveTo(p.x, p.y - r * 1.1); ctx.lineTo(p.x + Math.cos(a) * r, p.y - r * 1.1 + Math.sin(a) * r); ctx.stroke();
        ctx.fillStyle = d > 0.4 ? ['#ff8fb1', '#ffd27a', '#7ee0d2'][i % 3] : '#e0475c';
        ctx.fillRect(p.x + Math.cos(a) * r - r * 0.08, p.y - r * 1.1 + Math.sin(a) * r, r * 0.16, r * 0.14);
      }
    } else if (o.id === 'isles-glimmer') {
      const q = toXY(o.az, o.alt);
      for (let i = 0; i < 7; i++) { ctx.fillStyle = i % 2 ? '#c9bfe8' : '#ffd27a'; ctx.fillRect(q.x + (i - 3) * r * 0.5, q.y + Math.sin(i * 1.7) * r * 0.2 + Math.sin(c.time * 2 + i) * 0.5, Math.max(1, r * 0.12), Math.max(1, r * 0.12)); }
    } else if (o.id === 'city-skyline') {
      for (let i = -4; i <= 4; i++) {
        const h = r * (0.5 + ((i * 7 + 20) % 5) * 0.18);
        ctx.fillStyle = dark; ctx.fillRect(p.x + i * r * 0.22, p.y - h - 2.5 * ppd, r * 0.2, h + 2.5 * ppd);
        if (d > 0.4) { ctx.fillStyle = win; ctx.fillRect(p.x + i * r * 0.22 + r * 0.07, p.y - h * 0.8 - 2.5 * ppd, Math.max(1, r * 0.04), Math.max(1, r * 0.04)); }
      }
    }
  }
  ctx.restore();

  // eyepiece: ring, vignette edge and reticle
  const vg = ctx.createRadialGradient(cx, cy, R * 0.7, cx, cy, R);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vg; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#3b2b3f'; ctx.lineWidth = Math.max(6, R * 0.04); ctx.beginPath(); ctx.arc(cx, cy, R + ctx.lineWidth / 2, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = '#b5835a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, R + 1, 0, Math.PI * 2); ctx.stroke();
  const rr = reticle(v.zoom) * ppd;
  ctx.strokeStyle = 'rgba(255,210,122,0.55)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke();
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.beginPath(); ctx.moveTo(cx + dx * rr * 1.25, cy + dy * rr * 1.25); ctx.lineTo(cx + dx * rr * 1.9, cy + dy * rr * 1.9); ctx.stroke(); }
  // compass heading
  ctx.fillStyle = '#c9bfe8'; ctx.font = `${Math.round(12 * dpr)}px system-ui, sans-serif`; ctx.textAlign = 'center';
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  ctx.fillText(`${dirs[Math.round(v.az / 45) % 8]} ${Math.round(v.az)}° · alt ${Math.round(v.alt)}°`, cx, cy + R - 14);
}
