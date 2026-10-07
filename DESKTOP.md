# Desktop app (Windows .exe)

This wraps the existing web app (Control Panel at `/`, Output at `/output`) in
Electron, so double-clicking one `.exe` opens both windows as real OS windows
instead of browser tabs — no server to start manually, no URLs to remember.

## What was added

- `electron/main.cjs` — the desktop shell. On launch it:
  1. Starts the app's own web server on a free local port (no internet
     needed — it's the same server `npm run build` produces).
  2. Opens the **Control Panel** window and the **Output** window.
  3. Adds a **Project** menu:
     - **Extend to Second Screen** (`Ctrl+Shift+E`) — moves the Output
       window to whichever monitor isn't your main one and makes it
       fullscreen there. The Control Panel stays exactly where it was.
     - **Return Output to Main Screen** (`Ctrl+Shift+R`) — undoes that.
     - **Show Output Window** / **Show Control Panel** — in case you
       minimize or lose one.
- `vite.config.ts` — when you build with `ELECTRON_TARGET=1`, it targets a
  plain Node server instead of the Cloudflare Workers format Lovable
  normally builds for. Nothing else (Lovable publishing, `npm run dev`)
  changes.
- `package.json` — new scripts and an `electron-builder` config.

## Running it locally (any OS, to try it out)

```sh
npm install
npm run start:electron
```

That builds the web app for the desktop shell and launches Electron. Try
the **Project** menu with a second monitor plugged in.

## Building the actual `.exe`

Windows installers should be built **on a Windows machine** (or Windows CI
runner) — cross-building a proper NSIS installer from Linux/macOS needs Wine
and is unreliable. On Windows:

```sh
npm install
npm run dist:win
```

This produces, in `release/`:
- `Teens Media Presenter Setup <version>.exe` — a normal installer
  (Start Menu shortcut, uninstaller, "install for me" or custom folder).
- `Teens Media Presenter <version>.exe` — a **portable** build: one `.exe`,
  no install step, just double-click it.

Either one satisfies "double-click the `.exe` → two windows open."

## Notes / things you may want to tweak later

- **App icon**: no custom icon is wired up yet, so it'll use Electron's
  default. Drop a `build/icon.ico` (256x256) and add
  `"win": { "icon": "build/icon.ico" }` to the `build` config in
  `package.json` when you have one.
- **Fonts**: the app currently loads Google Fonts over the internet
  (`fonts.googleapis.com`). It'll still work offline, just falling back to
  system fonts — self-hosting them is a follow-up if you want it fully
  offline-proof.
- **More than 2 monitors**: "Extend" picks the first non-primary display it
  finds. If you regularly use 3+ screens and want to choose which one, that's
  a small follow-up (a submenu listing each display).
