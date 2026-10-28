// Copies the production web build (../dist) into ./web for packaging. Run `npm run build` in the project root first.
const fs = require('fs'), path = require('path');
const src = path.join(__dirname, '..', 'dist'), dst = path.join(__dirname, 'web');
if (!fs.existsSync(path.join(src, 'index.html'))) { console.error('✖ ../dist not found — run `npm run build` in the project root first.'); process.exit(1); }
fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(src, dst, { recursive: true });
fs.copyFileSync(path.join(__dirname, '..', 'public', 'icons', 'icon-1024.png'), path.join(dst, 'icons', 'icon-1024.png'));
console.log('✔ copied web build to desktop/web');
