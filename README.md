# Marginalia — Your Daily Reading Desk

A calm, personal RSS reading desk. Marginalia turns your RSS/Atom feeds into a clean, focused stream of stories worth your time.

## What it does

- **Feeds your sources** — sensible defaults to start, plus your own feed URLs.
- **Categories** — group stories into categories, created from the add-source dialog or picked via the sidebar dropdown.
- **Reading desk** — newest stories first with source badges, category labels, timestamps, and an orange dot for stories under 24 hours old.
- **Full in-app reader** — click a story to read it in-app; the original article stays one click away via "Read story".
- **Auto-refresh** — enabled feeds refresh every 30 minutes; a manual refresh button is always available.
- **Themes** — light/dark that follow the system until you choose.
- **OPML in and out** — export your library as OPML for any other reader, and import an OPML file from one. Invalid or insecure feed addresses are dropped, and importing never duplicates a feed you already follow.
- **Update check** — the Manage feeds dialog shows the running version and asks GitHub whether a newer release exists.

## Download

Grab the latest portable Windows build from [Releases](../../releases/latest): unzip it anywhere and run `Marginalia.exe`. Nothing is installed on the machine, and your feeds live in `%APPDATA%\Marginalia`.

## Run from source

You need [Node.js](https://nodejs.org) (v20 or newer) and npm. No other software required.

```sh
git clone <this-repository-url>
cd rss-feeder
npm install
npm run dev
```

Then open the URL printed in the terminal (the dev server defaults to `http://localhost:5173`, or whatever port you started it on — for example, `http://localhost:8080`).

## Scripts

| Command           | Purpose                     |
| ----------------- | --------------------------- |
| `npm run dev`     | Start the dev server.       |
| `npm run build`   | Production build.           |
| `npm run preview` | Serve the production build. |
| `npm run lint`    | Run ESLint.                 |
| `npm run typecheck` | Type-check with TypeScript. |
| `npm run format`  | Format with Prettier.       |
| `npm run test`    | Run the test suite.         |
| `npm run desktop` | Run the desktop app with hot reload. |
| `npm run desktop:build` | Build the portable desktop folder. |

## Desktop app

The desktop build uses [Electron](https://www.electronjs.org). The UI stays React/TypeScript; Electron hosts it in a native window.

### Running

```sh
npm run desktop        # dev window with hot reload
npm run desktop:build  # portable build
```

`desktop:build` produces a copyable folder at `release\win-unpacked\` — run `Marginalia.exe` from there, or copy the whole folder anywhere. Nothing is installed on the machine.

### How it works

- `electron/main.cjs` — creates the window, serves the built SPA from a loopback HTTP origin (`127.0.0.1`), and opens article links in the system browser.
- `scripts/desktop.mjs` — starts Vite and Electron together in dev, and runs the SPA build plus packaging for the portable output.
- `electron-builder.yml` — packaging config (`dir` target, no installer).
- The desktop build uses TanStack Start's SPA mode (`MARGINALIA_DESKTOP=1`): no Nitro server bundle, and `src/lib/feed-server.desktop.ts` replaces the server function with a direct fetch. Electron allows cross-origin responses for the local app window, so feed requests hit the source normally.

### Releasing

`.github/workflows/ci.yml` type-checks, lints, tests, and packages the portable build on every push to `main` and on pull requests, so a broken build shows up before it can ship.

To cut a release:

1. Set the new version in `package.json`.
2. Commit, then tag it to match: `git tag v1.2.3 && git push origin main v1.2.3`.
3. `.github/workflows/release.yml` runs the same checks first. Only if they pass does it build the portable folder on `windows-latest`, zip it, write `SHA256SUMS.txt`, and publish the GitHub Release with both files attached.

A tag that does not match `package.json` fails the run before anything is built.

## How feed fetching works

- `src/lib/rss-reader.ts` — feed types, saved-settings merge, RSS/Atom parsing, article fetching.
- `src/lib/feed-server.ts` — server-side fetch used as a fallback when the feed service is unavailable. The desktop build swaps this for `feed-server.desktop.ts`, which fetches directly.

## Project structure

| Path                          | Description                                              |
| ----------------------------- | -------------------------------------------------------- |
| `README.md`                   | This file.                                               |
| `LICENSE`                     | GNU GPL v3 license.                                      |
| `public/feeds.json`           | Default feed list served to the app.                     |
| `src/routes/index.tsx`        | The reading desk UI, settings dialog, and in-app reader. |
| `src/routes/__root.tsx`       | App shell.                                               |
| `src/routes/routeTree.gen.ts` | Generated route tree.                                    |
| `src/router.tsx`              | Router setup.                                            |
| `src/lib/rss-reader.ts`       | Feed types, settings, parsing, fetching.                 |
| `src/lib/opml.ts`             | OPML export and import used by Manage feeds.             |
| `src/lib/update-check.ts`     | Version comparison against the latest GitHub release.    |
| `src/lib/feed-server.ts`      | Server-side feed fetching.                               |
| `src/lib/feed-server.desktop.ts` | Direct feed fetching used by the desktop build.       |
| `electron/main.cjs`           | Electron window, static app server, external links.      |
| `scripts/desktop.mjs`         | Desktop dev and build runner.                            |
| `electron-builder.yml`        | Portable packaging config.                               |
| `build/`                      | App icons used when packaging.                           |
| `src/lib/utils.ts`            | Utility helpers.                                         |
| `src/components/ui/*`         | Reusable UI primitives.                                  |
| `src/styles.css`              | App styles.                                              |
| `src/test/*`                  | Tests.                                                   |
| `src/start.ts`                | App entry.                                               |
| `src/server.ts`               | Server entry.                                            |

## License

Released under the [GNU General Public License v3](LICENSE).
