# Minimal RSS Reader

## Build
- Replace the home placeholder with a polished, responsive RSS reading workspace: category navigation, search, refresh status, feed cards, and a manageable feeds panel.
- Load default sources asynchronously from `feeds.json`; fetch article data through RSS2JSON, display loading/errors clearly, and support user-added, edited, enabled, and removed sources persisted in local storage.
- Add an example `feeds.mock.json`, and include a persistent system-aware light/dark appearance control.

## Technical details
- Keep feed configuration in public JSON assets and implement feed parsing, merging, and browser persistence in a small reusable library.
- Use the existing TanStack route and shadcn controls, define the visual system in `src/styles.css`, and add focused tests for saved feed merging.
- Set app-specific page metadata and record the feed architecture in `AGENTS.md`.
