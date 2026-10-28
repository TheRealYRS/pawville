"""Milestone 8.1 browser layout check (real Chromium, the project's real CSS).
Renders the exact markup PanelSheet / the old sitting dock produce, with short/long/multi-line text and long
labels, at phone→desktop viewports, and measures every rendered text line against the panel's content box.
usage: python scripts/browser/ui_layout.py [project_dir] [--chromium PATH]
"""
import sys, pathlib, json
from playwright.sync_api import sync_playwright

root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('--') else '.').resolve()
chrome = sys.argv[sys.argv.index('--chromium') + 1] if '--chromium' in sys.argv else None
CSS = ['src/styles/designTokens.css', 'src/styles/globalStyles.css', 'src/styles/components.css', 'src/pawville/styles/pawville-tokens.css',
       'src/pawville/styles/pawville.css', 'src/pawville/styles/world.css', 'src/pawville/styles/adventure.css', 'src/pawville/styles/city.css']
css = '\n'.join((root / c).read_text() for c in CSS if (root / c).exists())

TEXTS = {
  'short': 'You’re sitting comfortably. Watch the world go by.',
  'partner': 'You’re sitting comfortably — your partner can sit beside you. Watch the world go by.',
  'long': ' '.join(['The ducks paddle past the gazebo while the fountain hums and a gull argues with the ice-cream cart about whose turn it is.'] * 4),
  'unbroken': 'Supercalifragilisticexpialidociouscatnipwhiskerwickboardwalktelescopeobservatory' * 2,
}
def sheet(text, title=None):
  t = f'<h2 class="pv-sheet__title">{title}</h2>' if title else ''
  return f'''<section class="pv-sheet pv-sitbar" data-ui="sheet"><div class="pv-sheet__content" data-ui="content">{t}<p data-ui="text">{text}</p></div>
  <div class="pv-sheet__actions"><button type="button" class="pill-btn" data-ui="btn">Stand up</button><button type="button" class="pill-btn" data-ui="btn">Cast</button></div></section>'''
def old_dock(text):  # Milestone 8 markup (the reported bug)
  return f'''<section class="pv-dock pv-sitbar" data-ui="sheet"><p data-ui="text">{text}</p><div class="modal__actions"><button type="button" class="pill-btn" data-ui="btn">Stand up</button></div></section>'''

MEASURE = '''() => {
  const s = document.querySelector('[data-ui=sheet]'); const sr = s.getBoundingClientRect(); const cs = getComputedStyle(s);
  const rad = parseFloat(cs.borderTopLeftRadius) || 0, pl = parseFloat(cs.paddingLeft), pr = parseFloat(cs.paddingRight);
  const out = { sheet: [sr.left, sr.top, sr.right, sr.bottom], vw: innerWidth, vh: innerHeight, rad, pl, pr, lines: [], btns: [], issues: [] };
  for (const el of document.querySelectorAll('[data-ui=text], .pv-sheet__title')) {
    const r = document.createRange(); r.selectNodeContents(el);
    for (const q of r.getClientRects()) out.lines.push([q.left, q.top, q.right, q.bottom]);
  }
  for (const b of document.querySelectorAll('[data-ui=btn]')) { const q = b.getBoundingClientRect(); out.btns.push([q.left, q.top, q.right, q.bottom]); }
  const sc = document.querySelector('[data-ui=content]') || s; out.scrolls = sc.scrollHeight > sc.clientHeight + 1;
  // a text pixel inside the rounded-corner zone of the border box is clipped/overlapping the curve
  const inCorner = (x, y) => {
    const corners = [[sr.left + rad, sr.top + rad, x < sr.left + rad && y < sr.top + rad], [sr.right - rad, sr.top + rad, x > sr.right - rad && y < sr.top + rad],
      [sr.left + rad, sr.bottom - rad, x < sr.left + rad && y > sr.bottom - rad], [sr.right - rad, sr.bottom - rad, x > sr.right - rad && y > sr.bottom - rad]];
    return corners.some(([cx, cy, inside]) => inside && Math.hypot(x - cx, y - cy) > rad - 2);
  };
  const visTop = sc.getBoundingClientRect().top, visBot = sc.getBoundingClientRect().bottom;
  for (const [l, t, r, b] of out.lines) {
    if (b < visTop || t > visBot) continue; // scrolled out of view inside the sheet (allowed: it scrolls)
    if (l < sr.left + Math.min(pl, 12) - 0.5) out.issues.push(`text starts ${(l - sr.left).toFixed(1)}px from the left edge`);
    if (r > sr.right - Math.min(pr, 12) + 0.5) out.issues.push(`text ends ${(sr.right - r).toFixed(1)}px from the right edge`);
    if (inCorner(l, t) || inCorner(l, b) || inCorner(r, t) || inCorner(r, b)) out.issues.push('text under a rounded corner');
    const vt = Math.max(t, visTop), vb = Math.min(b, visBot); // what is actually visible (the content box clips the rest)
    for (const [bl, bt, br, bb] of out.btns) if (l < br && r > bl && vt < bb && vb > bt) out.issues.push('text overlaps a button');
  }
  if (sr.left < 0 || sr.right > innerWidth || sr.top < 0 || sr.bottom > innerHeight) out.issues.push('sheet outside the viewport');
  for (const [bl, bt, br, bb] of out.btns) if (br - bl < 40 || bb - bt < 32) out.issues.push('button too small');
  return out;
}'''

VIEWPORTS = [(320, 568), (360, 740), (390, 844), (768, 1024), (1024, 640), (1280, 720), (1920, 1080)]
def run():
  results, fails = [], 0
  with sync_playwright() as p:
    b = p.chromium.launch(executable_path=chrome) if chrome else p.chromium.launch()
    for w, h in VIEWPORTS:
      pg = b.new_page(viewport={'width': w, 'height': h})
      for name, text in TEXTS.items():
        for variant, html in [('8.1', sheet(text, 'Fishing off the pier' if name == 'long' else None)), ('M8-old', old_dock(text))]:
          pg.set_content(f'<!doctype html><html><head><style>{css}</style></head><body><main class="pv-town" style="position:fixed;inset:0">{html}</main></body></html>')
          pg.wait_for_function("document.getAnimations().every(a => a.playState !== 'running')", timeout=3000)
          r = pg.evaluate(MEASURE)
          ok = not r['issues']
          if variant == '8.1' and not ok: fails += 1
          results.append({'viewport': f'{w}x{h}', 'text': name, 'markup': variant, 'ok': ok, 'issues': sorted(set(r['issues']))})
      pg.close()
    b.close()
  for x in results: print(f"{x['markup']:7} {x['viewport']:10} {x['text']:9} {'PASS' if x['ok'] else 'FAIL'} {'; '.join(x['issues'])}")
  new = [x for x in results if x['markup'] == '8.1']
  print(f"\n8.1 sheet: {sum(x['ok'] for x in new)}/{len(new)} pass · old M8 dock: {sum(not x['ok'] for x in results if x['markup'] == 'M8-old')} failing cases reproduced")
  return fails
if __name__ == '__main__': sys.exit(1 if run() else 0)
