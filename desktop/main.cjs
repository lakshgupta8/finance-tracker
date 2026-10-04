// =============================================================================
// MONEY TABS - WINDOWS DESKTOP SHELL (Electron)
// Hosts the shared React build (../client/dist, copied to ./dist at build time)
// in a frameless-menu window. All data access happens in the renderer, straight
// against the hosted Turso database, so this file stays deliberately tiny.
// =============================================================================

const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

// Groups taskbar entries / notifications under one identity on Windows.
app.setAppUserModelId('com.lakshya.moneytabs');

// On this machine Chromium's sandboxed child processes (GPU, renderer) fail to
// start when the app is installed under %LOCALAPPDATA% (Programs / Temp), which
// makes Electron abort with "GPU process isn't usable. Goodbye." before any
// window appears. The renderer only ever runs our own bundled code (context
// isolation on, node integration off), so running without the OS-level sandbox
// is an acceptable trade-off for a single-user desktop app.
app.commandLine.appendSwitch('no-sandbox');

function createWindow() {
    const win = new BrowserWindow({
        width: 1240,
        height: 860,
        minWidth: 420,
        minHeight: 600,
        title: 'Money Tabs',
        backgroundColor: '#0a0a0a',
        autoHideMenuBar: true,
        icon: path.join(__dirname, 'build', 'icon.ico'),
        show: false,
        webPreferences: {
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false,
        },
    });

    win.once('ready-to-show', () => win.show());

    // Keep the document title fixed instead of letting the page override it.
    win.on('page-title-updated', (e) => e.preventDefault());

    // Any external link opens in the default browser, never inside the app.
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (/^https?:\/\//i.test(url)) shell.openExternal(url);
        return { action: 'deny' };
    });

    win.loadFile(path.join(__dirname, 'dist', 'index.html'));
}

app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => app.quit());
