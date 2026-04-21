# Tests

This project uses Vitest for unit and focused integration tests.

## Commands

- `pnpm test` runs the full test suite once.
- `pnpm test:coverage` runs the full test suite with V8 coverage and writes reports to `coverage/`.
- `pnpm typecheck` runs package type checks.

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
- Preview parity expectations for resizable meter height, restored size persistence, and shared bar renderer inputs, including source-level wiring guards until browser component tests are available.

### Overlay

- Overlay config persistence, saved-profile fallback behavior, saving, and font loading.
- Live data store frame creation, self filtering, pull stashing/deduping, and historical pull restoration.
- Ability breakdown transformations for death sorting, death events, event rows, and view-state toggles.
- Meter bar parity expectations with the editor preview: measured bar width for shape-cut geometry, color overrides, Rank 1 options, and text effects, including source-level wiring guards.

## Current Coverage Intent

Coverage is configured for source files in `shared/src`, `editor/src`, and `overlay/src`, while excluding tests, declarations, vendor bundles, entrypoints, and simple shared shim files.

The most valuable covered surfaces are pure logic, stores, parsing helpers, persistence, and cross-runtime adapters. These tests are intentionally more important than blanket line coverage.

## Known Blind Spots

- Most Vue single-file components are not covered by DOM/component tests yet.
- Editor/overlay visual parity is partly protected by shared renderer unit tests and source-level component wiring tests. The current high-risk cases still need browser-level checks: pixel-level shape-cut right-edge completion, Rank 1 top-bar styling, texture tint/fill rendering, and editor preview resize behavior.
- `overlay/src/stores/liveData.ts` still has many untested ACT LogLine parsing paths, including detailed damage/healing lines, DoT/HoT attribution, deaths/raises, rDPS contribution windows, and malformed lines.
- `AbilityBreakdownPopout.vue` is large and mostly untested; it should be covered through extracted helpers or focused component tests before broad UI assertions.
- Editor controls such as `DragNumber`, `BarSlider`, `ColorPicker`, and `PresetPanel` need interaction tests.
- Build/typecheck should still be run before releases because Vitest intentionally mocks browser layout, resize observers, and OverlayPlugin boundaries.

## Recommended Next Tests

1. Extract more pure helpers from overlay live data LogLine parsing and cover them directly.
2. Add component tests for the small editor controls with tricky input behavior.
3. Replace the current source-level `PreviewArea`/`MeterBar` wiring guards with mounted component tests once jsdom/Vue Test Utils or equivalent browser testing is available.
4. Add screenshot/browser checks for a shape-cut preset in both editor preview and overlay, specifically asserting the right edge is filled, texture tints apply to the first/rank-1 bar, and text outlines/shadows are not clipped.
5. Add focused overlay component tests for `MeterHeader`, `MeterView`, and the ability breakdown popout snapshot/load flow.
6. Add a release check that runs `pnpm test`, `pnpm typecheck`, `pnpm build:editor`, and `pnpm build:overlay`.
