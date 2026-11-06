# Marginalia — Your Daily Reading Desk

A calm, personal RSS reading desk. Marginalia turns your RSS/Atom feeds into a clean, focused stream of stories worth your time.

## What it does

- **Feeds your sources** — sensible defaults to start, plus your own feed URLs.
- **Categories** — group stories into categories, created from the add-source dialog or picked via the sidebar dropdown.
- **Reading desk** — newest stories first with source badges, category labels, timestamps, and an orange dot for stories under 24 hours old.
- **Full in-app reader** — click a story to read it in-app; the original article stays one click away via "Read story".
- **Auto-refresh** — enabled feeds refresh every 30 minutes; a manual refresh button is always available.
- **Themes** — light/dark that follow the system until you choose.

## Getting started

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
| `npm run format`  | Format with Prettier.       |
| `npm run test`    | Run the test suite.         |
| `npm run desktop` | Build the desktop bundle.   |
| `npm run desktop:dev` | Run the desktop app with hot reload. |

## Desktop app

The desktop build uses [Tauri](https://tauri.app) v2: the UI stays React/TypeScript, and a small Rust shell hosts it in a native window.

### Prerequisites (Windows)

1. [Rust](https://rustup.rs) (the default `x86_64-pc-windows-msvc` toolchain).
2. Visual Studio **Build Tools for Visual Studio** with:
   - _Desktop development with C++_ (`Microsoft.VisualStudio.Component.VC.Tools.x86.x64`)
   - _Windows 11 SDK_ (`Microsoft.VisualStudio.Component.Windows11SDK.22621`)

The Windows SDK matters: without it the linker cannot find `kernel32.lib`.

### Building

```powershell
.\build.ps1          # production bundle
.\build.ps1 dev      # dev window with hot reload
```

`build.ps1` loads the Visual Studio developer environment (so `link.exe` and the SDK libraries are on `PATH`) and then runs the Tauri CLI. That means you can run it from any plain PowerShell window — no "Developer PowerShell" needed. Extra arguments are forwarded, for example `.\build.ps1 build --debug`.

Installers are written to `src-tauri\target\release\bundle\`. On Windows you get an `.msi` and an NSIS `.exe`.

`npm run src:build` is the same thing without the environment setup, and is what CI uses.

### Releasing

Push a tag such as `v0.1.0`, and `.github/workflows/release.yml` builds Windows, macOS, and Linux bundles and drafts a GitHub Release with the artifacts attached.

## How feed fetching works

- `src/lib/rss-reader.ts` — feed types, saved-settings merge, RSS/Atom parsing, article fetching.
- `src/lib/feed-server.ts` — server-side fetch used as a fallback when the feed service is unavailable.

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
| `src/lib/feed-server.ts`      | Server-side feed fetching.                               |
| `src/lib/utils.ts`            | Utility helpers.                                         |
| `src/components/ui/*`         | Reusable UI primitives.                                  |
| `src/styles.css`              | App styles.                                              |
| `src/test/*`                  | Tests.                                                   |
| `src/start.ts`                | App entry.                                               |
| `src/server.ts`               | Server entry.                                            |

## License

Released under the [GNU General Public License v3](LICENSE).
