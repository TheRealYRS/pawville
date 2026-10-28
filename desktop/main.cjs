/*
 * Pawville desktop (Electron). Serves the built game from a private app:// origin (so routing,
 * localStorage and the Supabase browser client behave exactly like the website), opens external
 * links in the system browser, and keeps Node.js out of the page (contextIsolation, no nodeIntegration).
 */
const { app, BrowserWindow, protocol, net, shell, Menu } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
const WEB = path.join(__dirname, 'web');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 720, minHeight: 480, backgroundColor: '#0d0b12', title: 'Pawville', autoHideMenuBar: true,
    icon: path.join(WEB, 'icons', 'icon-512.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  win.on('enter-full-screen', () => win.setMenuBarVisibility(false));
  win.loadURL('app://pawville/');
}

app.whenReady().then(() => {
  // SPA routing: any path that isn't a real file falls back to index.html
  protocol.handle('app', (req) => {
    const { pathname } = new URL(req.url);
    let file = path.normalize(path.join(WEB, decodeURIComponent(pathname)));
    if (!file.startsWith(WEB)) return new Response('Not found', { status: 404 });
    const fs = require('fs');
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(WEB, 'index.html');
    return net.fetch(pathToFileURL(file).toString());
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'viewMenu', submenu: [{ role: 'reload' }, { role: 'togglefullscreen' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }] }]));
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
