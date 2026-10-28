// Exposes only a marker so the web app knows it is running in the desktop shell (no Node APIs).
const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('pawvilleDesktop', { platform: process.platform });
