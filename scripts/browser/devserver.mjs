/**
 * A tiny TS-transpiling dev server for REAL-browser tests (no Vite needed):
 *   node scripts/browser/devserver.mjs [port] [--mock-realtime]
 * - transpiles src/**.ts(x) on the fly with the `typescript` package, resolves extension-less imports,
 * - serves react / react-dom from node_modules through a small CJS→ESM wrapper,
 * - serves CSS as style-injecting modules, stubs fonts/qrcode,
 * - with --mock-realtime, `@supabase/supabase-js` is replaced by an in-browser mock whose presence + broadcast channels
 *   run over BroadcastChannel, so several TABS of one browser behave like several players on the shared plaza channel.
 * It exists only for testing; it is not part of the game build.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = path.resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '.');
const port = Number(process.argv.find((a, i) => i > 1 && /^\d+$/.test(a)) ?? 5199);
const mock = process.argv.includes('--mock-realtime');
const NM = process.env.PV_NODE_MODULES ?? '/opt/oai-docgen/node_modules';
const req = createRequire(path.join(NM, 'x.js'));
const ts = req('typescript');

// ---------- CJS → one browser bundle (react, react-dom, scheduler) ----------
function bundleCjs(entries) {
  const files = new Map(); // abs → id
  const out = [];
  const resolveFrom = (from, spec) => req.resolve(spec, { paths: [path.dirname(from)] });
  function add(abs) {
    if (files.has(abs)) return files.get(abs);
    const id = files.size; files.set(abs, id);
    let src = fs.readFileSync(abs, 'utf8');
    const deps = {};
    for (const m of src.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      const spec = m[1];
      if (['util', 'stream', 'crypto', 'fs', 'path', 'async_hooks', 'node:async_hooks', 'worker_threads', 'perf_hooks', 'node:util', 'node:stream', 'react-dom/server', 'next/server'].includes(spec)) continue;
      try { deps[spec] = add(resolveFrom(abs, spec)); } catch { /* optional */ }
    }
    out[id] = { abs, src, deps };
    return id;
  }
  const entryIds = {};
  for (const [name, spec] of Object.entries(entries)) entryIds[name] = add(req.resolve(spec));
  let js = 'window.process = window.process || { env: { NODE_ENV: "development" }, emitWarning(){} };\nconst __mods = [];\nconst __cache = [];\n';
  out.forEach((m, i) => {
    js += `__mods[${i}] = function (module, exports, require) {\n${m.src}\n};\n`;
    js += `__mods[${i}].deps = ${JSON.stringify(m.deps)};\n`;
  });
  js += `function __req(id) { if (__cache[id]) return __cache[id].exports; const m = (__cache[id] = { exports: {} }); const f = __mods[id];
    f.call(m.exports, m, m.exports, (s) => { if (s in f.deps) return __req(f.deps[s]); if (s === 'util') return {}; throw new Error('vendor require ' + s); }); return m.exports; }\n`;
  js += `window.__vendor = (name) => __req(${JSON.stringify(entryIds)}[name]);\n`;
  return js;
}
let vendorJs = null;
const vendorEntries = { react: 'react', 'react/jsx-runtime': 'react/jsx-runtime', 'react-dom': 'react-dom', 'react-dom/client': 'react-dom/client' };
function facade(name) {
  const keys = Object.keys(req(name)).filter((k) => /^[A-Za-z_$][\w$]*$/.test(k) && k !== 'default');
  return `const m = window.__vendor(${JSON.stringify(name)}); export default m;\n${keys.map((k) => `export const ${k} = m.${k};`).join('\n')}\n`;
}

// ---------- the mock realtime client ----------
const MOCK_SUPABASE = `
const reg = new Map();
export function createClient() {
  const channels = [];
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'mock-user' } } } }), signInAnonymously: async () => ({ data: { user: { id: 'mock-user' }, session: {} }, error: null }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    rpc: async () => ({ data: null, error: { message: 'mock: no backend', code: 'mock' } }),
    realtime: { setAuth() {} },
    getChannels: () => channels,
    removeChannel: async (ch) => { const i = channels.indexOf(ch); if (i >= 0) channels.splice(i, 1); ch._close(); },
    channel(topic, opts) {
      const bc = new BroadcastChannel('mock-rt:' + topic);
      const key = opts?.config?.presence?.key ?? ('k' + Math.random().toString(36).slice(2));
      const handlers = { presence: [], broadcast: [] };
      const state = new Map(); // key -> payload
      let myPayload = null, subscribed = false, tick = null;
      const sync = () => handlers.presence.filter((h) => h.event === 'sync').forEach((h) => h.cb({}));
      bc.onmessage = (e) => {
        const d = e.data;
        if (d.t === 'track') { state.set(d.key, d.payload); sync(); if (myPayload) bc.postMessage({ t: 'track', key, payload: myPayload }); }
        else if (d.t === 'bye') { state.delete(d.key); sync(); }
        else if (d.t === 'bcast') handlers.broadcast.filter((h) => h.event === d.event).forEach((h) => h.cb({ payload: d.payload }));
      };
      const ch = {
        topic: 'realtime:' + topic,
        on(type, filter, cb) { (handlers[type] ??= []).push({ event: filter.event, cb }); return ch; },
        subscribe(cb) { subscribed = true; setTimeout(() => { cb?.('SUBSCRIBED'); bc.postMessage({ t: 'track', key, payload: myPayload ?? { hello: true } }); }, 5); return ch; },
        async track(p) { myPayload = p; state.set(key, p); bc.postMessage({ t: 'track', key, payload: p }); sync(); return 'ok'; },
        async send(m) { if (m.type === 'broadcast') bc.postMessage({ t: 'bcast', event: m.event, payload: m.payload }); return 'ok'; },
        presenceState() { const o = {}; for (const [k, v] of state) if (k !== key) o[k] = [v]; return o; },
        async unsubscribe() { ch._close(); },
        _close() { try { bc.postMessage({ t: 'bye', key }); bc.close(); } catch {} },
      };
      window.addEventListener('pagehide', () => { try { bc.postMessage({ t: 'bye', key }); } catch {} });
      channels.push(ch);
      return ch;
    },
  };
  return client;
}
`;

// ---------- transpile ----------
const exts = ['.ts', '.tsx', '.js', '.mjs', '.cjs', '/index.ts', '/index.tsx'];
function resolveRel(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec);
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
  for (const e of exts) if (fs.existsSync(base + e) && fs.statSync(base + e).isFile()) return base + e;
  return null;
}
const cache = new Map();
function transpile(file) {
  const st = fs.statSync(file);
  const hit = cache.get(file);
  if (hit && hit.m === st.mtimeMs) return hit.js;
  let src = fs.readFileSync(file, 'utf8');
  let js = ts.transpileModule(src, { fileName: file, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX, isolatedModules: true, sourceMap: false, esModuleInterop: true } }).outputText;
  js = js.replace(/import\.meta\.env/g, 'window.__PV_ENV__');
  // Test probe (dev server only — never part of the game build): publishes what the first render frame sees.
  if (file.endsWith(path.join('components', 'TownCanvas.tsx'))) {
    js = js.replace('const cats = buildCats(now);', 'const cats = buildCats(now); window.__pv = { t: now, region: scene.id, self: selfState, seat: live.seat, claim: live.claim ?? null, occupied: live.occupied ? [...live.occupied.keys()] : [], partnerSeat: live.partnerSeat, fair: live.fair, paused: p.paused, targetId, selfId: p.identity.id, cat: p.identity.cat, remotes: presence ? [...presence.remotes.values()].map((r) => ({ id: r.id, x: r.pos.x, y: r.pos.y, pose: r.pose, lift: r.lift, region: r.region, claim: r.claim })) : [], cats: cats.map((c) => ({ id: c.id, x: c.x, y: c.y, lift: c.lift, pose: c.pose, isSelf: c.isSelf, facing: c.facing, moving: c.moving, sortY: c.sortY, noShadow: c.noShadow })) };');
  }
  const toUrl = (abs) => '/' + path.relative(root, abs).split(path.sep).join('/');
  const fix = (spec) => {
    if (!spec.startsWith('.') && !spec.startsWith('/')) return spec;
    const abs = resolveRel(file, spec);
    if (!abs) return spec;
    return toUrl(abs) + (abs.endsWith('.css') ? '?css' : '');
  };
  js = js.replace(/(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])([^'"]+)\2/g, (m, pre, q, spec) => `${pre}${q}${fix(spec)}${q}`);
  cache.set(file, { m: st.mtimeMs, js });
  return js;
}

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/json', '.png': 'image/png' };
const server = http.createServer((rq, rs) => {
  const url = new URL(rq.url, 'http://x');
  const p = decodeURIComponent(url.pathname);
  const send = (code, body, type = 'text/plain') => { rs.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' }); rs.end(body); };
  try {
    if (p === '/vendor/bundle.js') return send(200, (vendorJs ??= bundleCjs(vendorEntries)), 'text/javascript');
    if (p.startsWith('/vendor/f-')) return send(200, facade(p.slice(10, -3).replace(/__/g, '/')), 'text/javascript');
    if (p === '/vendor/empty.js') return send(200, 'export default {}; export const toDataURL = async () => ""; export const toString = async () => "";', 'text/javascript');
    if (p === '/vendor/supabase.js') return send(200, mock ? MOCK_SUPABASE : 'export const createClient = () => { throw new Error("no supabase in this harness"); };', 'text/javascript');
    if (p === '/sw.js') return send(200, '/* disabled in tests */', 'text/javascript');
    if (p === '/' || p === '/index.html' || !path.extname(p)) {
      let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
      const env = { PROD: false, DEV: true, MODE: 'test', BASE_URL: '/', ...(mock ? { VITE_SUPABASE_URL: 'http://mock.local', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_mock' } : {}) };
      const map = { imports: { react: '/vendor/f-react.js', 'react/jsx-runtime': '/vendor/f-react__jsx-runtime.js', 'react-dom': '/vendor/f-react-dom.js', 'react-dom/client': '/vendor/f-react-dom__client.js', qrcode: '/vendor/empty.js', '@supabase/supabase-js': '/vendor/supabase.js' } };
      for (const f of ['500', '600', '700']) map.imports[`@fontsource/fredoka/${f}.css`] = '/vendor/empty.js';
      for (const f of ['400', '600', '800']) map.imports[`@fontsource/nunito/${f}.css`] = '/vendor/empty.js';
      html = html.replace('<head>', `<head><script>window.__PV_ENV__=${JSON.stringify(env)}</script><script src="/vendor/bundle.js"></script><script type="importmap">${JSON.stringify(map)}</script>`);
      return send(200, html, 'text/html');
    }
    const file = path.join(root, p.startsWith('/src/') ? p : fs.existsSync(path.join(root, 'public', p)) ? path.join('public', p) : p);
    if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(404, 'not found: ' + p);
    if (/\.(tsx?|jsx?|mjs)$/.test(file)) return send(200, transpile(file), 'text/javascript');
    if (file.endsWith('.css')) {
      if (url.search === '?css') return send(200, `const s=document.createElement('style');s.textContent=${JSON.stringify(fs.readFileSync(file, 'utf8'))};document.head.appendChild(s);export default {};`, 'text/javascript');
      return send(200, fs.readFileSync(file), 'text/css');
    }
    return send(200, fs.readFileSync(file), mime[path.extname(file)] ?? 'application/octet-stream');
  } catch (e) { return send(500, 'server error: ' + (e && e.stack || e)); }
});
server.listen(port, () => console.log(`devserver on http://localhost:${port} (mock realtime: ${mock})`));
