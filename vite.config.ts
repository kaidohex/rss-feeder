// @lovable.dev/vite-tanstack-config already includes the following - do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { fileURLToPath } from "node:url";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// The Electron build renders entirely on the client, so it skips the Nitro
// server bundle and swaps the server-function feed fetcher for a plain
// browser fetch (Electron relaxes CORS for the local app window).
const desktop = process.env["MARGINALIA_DESKTOP"] === "1";

const desktopFeedFetch = fileURLToPath(
  new URL("./src/lib/feed-server.desktop.ts", import.meta.url),
);

export default defineConfig({
  ...(desktop ? { nitro: false } : {}),
  tanstackStart: desktop
    ? { spa: { enabled: true } }
    : {
        // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
        // nitro/vite builds from this
        server: { entry: "server" },
      },
  ...(desktop
    ? {
        vite: {
          resolve: {
            alias: [{ find: /^\.\/feed-server$/, replacement: desktopFeedFetch }],
          },
        },
      }
    : {}),
});
