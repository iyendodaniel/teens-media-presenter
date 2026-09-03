# Verse Sync

Build a live-presentation control app called "Teens Media Presenter" - two synced browser windows for live presentation: a Control Panel at / and a chrome-free Output Display at /output.

For now, only build the Scripture feature and the sync mechanism between the two windows. Do not build Lyrics, Media, Timer, or YouTube yet - those come later as separate steps.

Sync between windows:

Use the BroadcastChannel API (with a window.postMessage/localStorage fallback) so the two windows can run on separate monitors and stay in sync

A newly opened Output window should immediately catch up to whatever is currently live, not just future updates

Show a live windows-connected indicator on the Control Panel

Control Panel (/):

A translation switcher (WEB / KJV / ASV - public-domain-safe translations)

A searchable list of Bible verses, grouped by book, with reference and text

Clicking a verse sends it live to the Output Display instantly

A live preview panel showing exactly what's on Output right now

"Blank Output" button to black out the display

Keyboard shortcuts: arrow keys to move between verses, Esc to blank/unblank

Output Display (/output):

Fullscreen, black background, no UI chrome

Renders the live verse in large display type with the reference shown separately

Blank state is pure black

Content cross-fades on change

Data: scriptures.json with ~60-75 popular verses, each with text in WEB, KJV, and ASV translations, grouped by book. Local-only - no backend, no auth. Everything client-side.

Design direction: near-black background, one bold accent color, clean sans-serif for verse text, a distinct display font or style for the verse reference. Fast and readable at a distance - this will be projected on a screen.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/a56ae66a-bafb-4edf-a0c5-445306a49ed0).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
