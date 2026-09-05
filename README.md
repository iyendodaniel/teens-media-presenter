# Teens Media Presenter

A live-presentation control app for church/youth service screens - two synced browser windows, one for the operator, one for the projector.

- **Control Panel** (`/`) - where you search, browse, and click "go live"
- **Output Display** (`/output`) - chrome-free, fullscreen, black background, the thing the congregation actually sees

Right now it's Scripture-only. Lyrics, Media, Timer, and YouTube are next - deliberately left out for now so this ships and gets used instead of sitting half-built.

## Why

Most "presentation software" for small teams is either bloated ProPresenter-style overkill or a shared Google Slides someone's fat-fingering mid-service. This is the version I actually wanted: type a reference, hit go, it's on the screen - no lag, no fumbling for the right slide.

## What it does

**Control Panel**
- Full 66-book Bible, WEB / KJV / ASV (public-domain-safe translations) - books load on demand so nothing downloads until you open it
- Type a reference straight up (`John 3:16`, `Romans 8:28-31`) and it resolves instantly, or browse book → chapter → verse
- Click any verse (or range) and it goes live on Output immediately
- Live preview panel shows exactly what's on the projector right now, no guessing
- "Blank Output" button to black the screen out mid-service
- Keyboard shortcuts: ↑ / ↓ to step through verses, Esc to blank/unblank
- A connection indicator up top tells you if an Output window is even listening

**Output Display**
- Fullscreen, black, zero UI - just the verse
- Big display type that scales itself based on verse length, so a one-liner and a whole paragraph both read fine at the back of the room
- Content cross-fades on change instead of hard-cutting
- A newly opened Output window catches up to whatever's already live - you're not stuck re-clicking the verse because someone plugged in a second monitor late

## How the sync works

Two windows, same origin, no backend. Control Panel and Output talk over `BroadcastChannel`, with a `localStorage` events fallback for anything that doesn't support it. Every state change gets persisted, so a fresh Output tab pulls the current live state on load instead of showing blank until the next click.

No auth, no server, no database - it's a static app. Open two tabs (or throw one on a second monitor) and go.

## Stack

- React 19 + TanStack Start (file-based routing, SSR-capable, but this app doesn't need the backend bits - everything here runs client-side)
- Tailwind v4 for styling
- Vite under the hood
- Bible data as static JSON, chunked per book (`src/data/bible/books/`), loaded lazily

Design-wise: near-black stage background, one amber accent color, Barlow for verse text, Bebas Neue for the reference - built to be fast and readable from a distance since this is getting projected, not read on a laptop.

## Running it locally

```sh
git clone <this-repository-url>
cd teens-media-presenter
npm install
npm run dev
```

Then open the Control Panel in one tab and `/output` in another (or on a second monitor pointed at the projector).

```sh
npm run build      # production build
npm run preview    # preview the build
```

## What's next

Lyrics, Media (images/video), a Timer, and YouTube embedding - same Control Panel / Output pattern, just more content types feeding the same sync bus. Scripture first because it's the one that gets used every single week.