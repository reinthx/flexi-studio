# Tests

This project uses Vitest for unit and focused integration tests.

## Commands

- `pnpm test` runs the full test suite once.
- `pnpm test:e2e` builds production artifacts and runs Playwright browser smoke tests.
- `pnpm test:coverage` runs the full test suite with V8 coverage and writes reports to `coverage/`.
- `pnpm typecheck` runs package type checks.
- `pnpm release:check` runs typecheck, Vitest, browser smoke tests, and the GitHub Pages build.

## What The Suite Covers

### Shared Core

- Profile encoding, decoding, validation, and integration round trips.
- Style resolution and style cascade behavior for default, job, role, self, and rank overrides.
- CSS builder helpers for fills, gradients, textures, borders, outlines, shadows, clipping, and shapes.
- Bar renderer regressions around paginated textures, shape-cut backgrounds/fills, fill outlines with background strokes, fill/background shadows, and label outline/shadow clipping.
- Shape geometry and bar dimension calculations.
- Value formatting, template rendering, job mapping, raid buff metadata, and pet resolution.
- Ability icon metadata resolution, initials, cache behavior, disabled network mode, bad ids, and XIVAPI failures.
- Overlay bridge behavior across modern OverlayPlugin, legacy OverlayPlugin, and mock/dev modes.
- Font source persistence, favorite fonts, custom font loading, directory handle loading, and batched font loading.

### Editor

- Config store persistence through OverlayPlugin/localStorage fallback, malformed profile handling, saving, and dirty state.
- Preset store custom preset CRUD, category management, import/export, conflict handling, applying presets, and badge state.
- Editor live data preview frame construction, filtering, listener lifecycle, and frame throttling.
- Mounted control tests (jsdom + Vue Test Utils, per-file opt-in): DragNumber scrub/typing/clamp, BarSlider click/drag/step/zero-range, ColorPicker hex+rgba parsing/debounce/alpha, PresetPanel save/overwrite/delete/apply with confirm modals.
- Mounted `PreviewArea` wiring: empty state, per-row rank/self/style/width props with real style resolution, persisted height restore, transform fills in the DOM.

### Overlay

- Overlay config persistence, saved-profile fallback behavior, saving, and font loading.
- Live data store frame creation, self filtering, rDPS display/sorting, pull stashing/deduping, and historical pull restoration.
- Ability breakdown transformations for death sorting, death events, event rows, and view-state toggles.
- Lite overlay source wiring that keeps the meter entry separate from Breakout and disables Breakout-only collection.
- Meter bar parity through mounted tests: `MeterBar` prop forwarding into `FlexiBar`, `FlexiBar` transform fills/text refresh/zero-fill in the DOM.

### Browser Smoke

- Built editor artifact renders the editor shell, primary controls, and preview meter.
- Built overlay artifact renders the standalone overlay shell.
- Built lite overlay artifact renders the standalone meter without Breakout actions.
- Built overlay artifact renders the breakdown popout through a direct preview route and loads a seeded encounter snapshot.

## Current Coverage Intent

Coverage is configured for source files in `shared/src`, `editor/src`, and `overlay/src`, while excluding tests, declarations, vendor bundles, entrypoints, and simple shared shim files.

The most valuable covered surfaces are pure logic, stores, parsing helpers, persistence, and cross-runtime adapters. These tests are intentionally more important than blanket line coverage.

## Known Blind Spots

- Most Vue single-file components are still not covered by DOM/component tests; mounted coverage now exists for `DragNumber`, `BarSlider`, `ColorPicker`, `PresetPanel`, `PreviewArea`, `MeterBar`, and `FlexiBar`.
- Editor/overlay visual parity is protected by shared renderer unit tests, mounted component tests, browser smoke tests, and a Playwright shape-cut preset check asserting rank-1 edge completion, rank-1 texture tinting, and unclipped label outline/shadow in both surfaces. Remaining pixel-level risks: Rank 1 top-bar styling variants and editor preview resize behavior.
- `overlay/src/stores/liveData.ts` parsing is covered through extracted pure helpers plus store-level LogLine tests; remaining untested paths are mostly store-state orchestration around already-covered decoders.
- `AbilityBreakdownPopout.vue` load flow is covered through mounted snapshot/init/broadcast tests; its inner views remain helper-unit-tested only.
- Build/typecheck should still be run before releases because Vitest intentionally mocks browser layout, resize observers, and OverlayPlugin boundaries.
- Component tests run under jsdom with a pinned workspace Vue instance (see `vitest.config.ts`); `ResizeObserver`, `element.animate`, and real layout are absent, so observer/animation paths take their fallbacks there by design.

## Recommended Next Tests

1. ~~Extract more pure helpers from overlay live data LogLine parsing and cover them directly.~~ Done (`overlay/src/lib/logLine.ts` + store rewiring).
2. ~~Add component tests for the small editor controls with tricky input behavior.~~ Done (item above).
3. ~~Replace the source-level `PreviewArea`/`MeterBar` wiring guards with mounted component tests.~~ Done (items above; residual resize-CSS guard remains in `previewParity.test.ts`).
4. ~~Expand Playwright checks for a shape-cut preset in both editor preview and overlay.~~ Done (`e2e/meter-parity.spec.ts`: edge completion, rank-1 texture tint, unclipped outline/shadow).
5. ~~Add focused overlay component tests for `MeterHeader`, `MeterView`, and the ability breakdown popout snapshot/load flow.~~ Done (`MeterHeader`/`MeterView`/popout mounts; inner breakdown views stay helper-tested).
6. Add ACT/OverlayPlugin smoke evidence to each launch, because browser tests cannot fully emulate CEF and live ACT event delivery.
