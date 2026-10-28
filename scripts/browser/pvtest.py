"""Helpers for real-browser multi-client tests (see devserver.mjs). Each Player is one browser tab = one cat."""
import json, time
from playwright.sync_api import sync_playwright
CHROME = '/opt/pw-browsers/chromium-1228/chrome-linux64/chrome'
import os
BASE = os.environ.get('PV_BASE', 'http://localhost:5199')

class Player:
    def __init__(self, ctx, name, log):
        self.name = name; self.pg = ctx.new_page(); self.errors = []
        self.pg.on('pageerror', lambda e: self.errors.append(str(e)[:300]))
        self.pg.on('console', lambda m: self.errors.append(m.text[:300]) if m.type == 'error' else None)
    def seed(self, where=None, adventure=None, world=None):
        self.pg.add_init_script("""(() => { const _a = EventTarget.prototype.addEventListener, _r = EventTarget.prototype.removeEventListener; window.__lis = {};
          EventTarget.prototype.addEventListener = function (t, f, o) { if (this === window || this === document) { const k = (this === window ? 'w:' : 'd:') + t; const set = (window.__lis[k] ??= new Set()); set.add(f); } return _a.call(this, t, f, o); };
          EventTarget.prototype.removeEventListener = function (t, f, o) { if (this === window || this === document) { window.__lis[(this === window ? 'w:' : 'd:') + t]?.delete(f); } return _r.call(this, t, f, o); };
          const w = %s, a = %s, s = %s;
          if (w && !localStorage.getItem('pawville:where:keep')) localStorage.setItem('pawville:where', JSON.stringify({ v: 1, data: w }));
          if (a && !localStorage.getItem('pawville:adventure')) localStorage.setItem('pawville:adventure', JSON.stringify({ v: 1, data: a }));
          if (s) localStorage.setItem('pawville:world', JSON.stringify({ v: 1, data: s }));
          localStorage.setItem('pawville:sound', '0'); })()""" % (json.dumps(where), json.dumps(adventure), json.dumps(world)))
    def open(self, path='/'):
        self.pg.set_default_timeout(90000); self.pg.goto(BASE + path, wait_until='commit'); self.pg.wait_for_selector('button', timeout=90000); self.pg.wait_for_timeout(400)
        btn = self.pg.get_by_role('button', name='Enter Pawville')
        if btn.count(): btn.first.click()
        self.pg.wait_for_function('window.__pv && window.__pv.self', timeout=90000)
        self.pg.bring_to_front(); self.pg.wait_for_timeout(1200)
        return self
    def st(self): return self.pg.evaluate('window.__pv')
    def pos(self): s = self.st()['self']; return (round(s['x'], 1), round(s['y'], 1))
    def hold(self, code, ms):
        self.pg.bring_to_front(); self.pg.keyboard.down(code); self.pg.wait_for_timeout(ms); self.pg.keyboard.up(code)
    def down(self, code): self.pg.keyboard.down(code)
    def up(self, code): self.pg.keyboard.up(code)
    def tap(self, code): self.pg.keyboard.press(code)
    def cat(self, cid):
        for c in self.st()['cats']:
            if c['id'] == cid: return c
    def others(self): return [c for c in self.st()['cats'] if not c['isSelf'] and not str(c['id']).startswith('npc')]
    def listeners(self): return self.pg.evaluate("Object.fromEntries(Object.entries(window.__lis).map(([k,v]) => [k, v.size]))")
    def shot(self, path): self.pg.screenshot(path=path)
    def prompt(self):
        el = self.pg.query_selector('.pv-prompt span'); return el.inner_text() if el else None

def session(n=2, viewport=(560, 380)):
    """Context manager-like generator: yields players sharing ONE browser context (so BroadcastChannel reaches every tab)."""
    class S:
        def __enter__(s):
            s.p = sync_playwright().start()
            s.b = s.p.chromium.launch(executable_path=CHROME, args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
            s.ctx = s.b.new_context(viewport={'width': viewport[0], 'height': viewport[1]})
            s.players = [Player(s.ctx, chr(65 + i), None) for i in range(n)]
            return s
        def __exit__(s, *a):
            s.b.close(); s.p.stop()
    return S()


class Checks:
    """Collects PASS/FAIL lines; nothing is claimed passed unless the assertion ran."""
    def __init__(self, name): self.name = name; self.rows = []
    def check(self, what, ok, detail=''):
        self.rows.append((bool(ok), what, detail)); line = ('PASS ' if ok else 'FAIL ') + what + (f'  [{detail}]' if detail else ''); print(line, flush=True); return ok
    def summary(self):
        f = [r for r in self.rows if not r[0]]
        print(f'== {self.name}: {len(self.rows) - len(f)}/{len(self.rows)} checks passed' + ('' if not f else '  FAILED: ' + '; '.join(r[1] for r in f)), flush=True)
        return not f

def wait_until(P, fn, timeout=30, step=300):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            v = fn()
            if v: return v
        except Exception: pass
        P.pg.wait_for_timeout(step)
    return None
