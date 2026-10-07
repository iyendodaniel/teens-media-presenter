// Electron main process for "Teens Media Presenter" desktop app.
//
// What this does, end to end:
//   1. On launch, spawns the app's own built web server (the same one
//      `npm run build` + `node .output/server/index.mjs` produces) on a
//      free local port. We spawn it with Electron's binary running in
//      "plain Node" mode (ELECTRON_RUN_AS_NODE=1) so we don't need a
//      separate Node.js install on the user's machine.
//   2. Opens two windows once the server responds: the Control Panel
//      (route "/") and the Output display (route "/output") - exactly the
//      two synced windows the web app already implements.
//   3. Adds a "Project" menu with "Extend to Second Screen", which moves
//      the Output window onto whichever monitor isn't the primary one and
//      makes it fullscreen there, while the Control Panel stays put on the
//      primary screen.
"use strict";

const { app, BrowserWindow, Menu, screen, dialog, shell } = require("electron");
const path = require("node:path");

// In dev, .env sits at the project root next to package.json. In a packaged
// app there's no project root - .env ships as an extra resource instead
// (see package.json "build.extraResources"), so it has to be pointed at
// process.resourcesPath. This must run before startServer(), since that's
// what forwards API_BIBLE_KEY into the spawned server's env.
require("dotenv").config({
  path: app.isPackaged
    ? path.join(process.resourcesPath, ".env")
    : path.join(__dirname, "..", ".env"),
});

const fs = require("node:fs");
const net = require("node:net");
const http = require("node:http");
const { spawn } = require("node:child_process");

/** @type {import('node:child_process').ChildProcess | null} */
let serverProcess = null;
let serverPort = null;
let controlWindow = null;
let outputWindow = null;
let quitting = false;

function serverEntryPath() {
  // Packaged app: the built .output folder is copied next to the app as an
  // unpacked extra resource (see electron-builder config in package.json).
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "app-output", "server", "index.mjs");
  }
  // Dev: use the build sitting in the project root (`npm run build:electron`).
  return path.join(__dirname, "..", ".output", "server", "index.mjs");
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const address = srv.address();
      const port = typeof address === "object" && address ? address.port : null;
      srv.close(() => (port ? resolve(port) : reject(new Error("Could not allocate a port"))));
    });
  });
}

function waitForServer(port, timeoutMs = 20000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get({ host: "127.0.0.1", port, path: "/", timeout: 1500 }, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error("The presenter server did not start in time."));
        } else {
          setTimeout(attempt, 200);
        }
      });
      req.on("timeout", () => req.destroy());
    };
    attempt();
  });
}

async function startServer() {
  const entry = serverEntryPath();
  if (!fs.existsSync(entry)) {
    throw new Error(
      `Could not find the built server at:\n${entry}\n\n` +
        'Run "npm run build:electron" first (this builds the web app for the desktop shell).',
    );
  }

  serverPort = await getFreePort();

  serverProcess = spawn(process.execPath, [entry], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: String(serverPort),
    },
    stdio: "inherit",
    windowsHide: true,
  });

  serverProcess.on("exit", (code) => {
    serverProcess = null;
    if (!quitting && code !== 0 && code !== null) {
      dialog.showErrorBox(
        "Teens Media Presenter",
        `The background server stopped unexpectedly (exit code ${code}).`,
      );
    }
  });

  await waitForServer(serverPort);
}

function windowIcon() {
  // .ico works for BrowserWindow icons cross-platform in practice, and is
  // the one file we know exists both in dev (project root) and packaged
  // (bundled via the "files" list in the electron-builder config).
  return path.join(__dirname, "..", "build", "icon.ico");
}

function primaryDisplay() {
  return screen.getPrimaryDisplay();
}

function secondaryDisplay() {
  const primary = primaryDisplay();
  return screen.getAllDisplays().find((d) => d.id !== primary.id) || null;
}

function createWindows() {
  const primary = primaryDisplay();

  controlWindow = new BrowserWindow({
    title: "Teens Media Presenter — Control Panel",
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    x: primary.bounds.x + 60,
    y: primary.bounds.y + 60,
    backgroundColor: "#0b0b0f",
    icon: windowIcon(),
    show: false,
  });
  controlWindow.loadURL(`http://localhost:${serverPort}/`);
  controlWindow.once("ready-to-show", () => controlWindow?.show());
  controlWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  controlWindow.on("closed", () => {
    controlWindow = null;
    // Closing the control panel ends the presentation session.
    app.quit();
  });

  outputWindow = new BrowserWindow({
    title: "Teens Media Presenter — Output",
    width: 960,
    height: 540,
    x: primary.bounds.x + 120,
    y: primary.bounds.y + 120,
    backgroundColor: "#000000",
    icon: windowIcon(),
    show: false,
  });
  outputWindow.loadURL(`http://localhost:${serverPort}/output`);
  outputWindow.once("ready-to-show", () => outputWindow?.show());
  outputWindow.on("closed", () => {
    outputWindow = null;
  });
}

function extendToSecondScreen() {
  if (!outputWindow) return;
  const secondary = secondaryDisplay();
  if (!secondary) {
    dialog.showMessageBox({
      type: "info",
      title: "No second screen found",
      message:
        "Connect a second monitor or projector, then try Project → Extend to Second Screen again.",
    });
    return;
  }
  // Leaving fullscreen before moving avoids the OS clamping the window back
  // onto the display it was already fullscreen on.
  outputWindow.setFullScreen(false);
  outputWindow.setBounds(secondary.bounds);
  outputWindow.setFullScreen(true);
  outputWindow.focus();
}

function returnOutputToMainScreen() {
  if (!outputWindow) return;
  outputWindow.setFullScreen(false);
  const primary = primaryDisplay();
  outputWindow.setBounds({
    x: primary.bounds.x + 120,
    y: primary.bounds.y + 120,
    width: 960,
    height: 540,
  });
  controlWindow?.focus();
}

function buildMenu() {
  const template = [
    {
      label: "Project",
      submenu: [
        {
          label: "Extend to Second Screen",
          accelerator: "CmdOrCtrl+Shift+E",
          click: extendToSecondScreen,
        },
        {
          label: "Return Output to Main Screen",
          accelerator: "CmdOrCtrl+Shift+R",
          click: returnOutputToMainScreen,
        },
        { type: "separator" },
        {
          label: "Show Output Window",
          click: () => {
            if (outputWindow) {
              outputWindow.show();
              outputWindow.focus();
            }
          },
        },
        {
          label: "Show Control Panel",
          click: () => {
            if (controlWindow) {
              controlWindow.show();
              controlWindow.focus();
            }
          },
        },
        { type: "separator" },
        { role: "quit", label: "Quit" },
      ],
    },
    {
      label: "View",
      submenu: [{ role: "reload" }, { role: "forceReload" }, { role: "toggleDevTools" }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (controlWindow) {
      if (controlWindow.isMinimized()) controlWindow.restore();
      controlWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    buildMenu();
    try {
      await startServer();
    } catch (err) {
      dialog.showErrorBox(
        "Teens Media Presenter — Startup Error",
        String(err instanceof Error ? err.message : err),
      );
      app.quit();
      return;
    }
    createWindows();
  });
}

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", () => {
  quitting = true;
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});
