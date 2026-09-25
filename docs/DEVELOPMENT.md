# Development

This project uses pnpm workspaces. Use pnpm for all local development and release checks.

## Commands

- `pnpm dev` starts the editor and overlay dev servers.
- `pnpm dev:editor` starts only the editor dev server.
- `pnpm dev:overlay` starts only the overlay dev server.
- `pnpm test` runs the test suite.
- `pnpm test:e2e` builds editor/overlay production artifacts and runs browser smoke tests.
- `pnpm test:coverage` runs the test suite with coverage.
- `pnpm typecheck` runs Vue/TypeScript checks.
- `pnpm build` is the single canonical build for local preview and deploys: `dist/editor/` (overlay + editor + breakdown routes with `lite/` nested), plus standalone `dist/overlay/` and `dist/overlay-lite/`. Serving `dist/editor/` locally is exactly what GitHub Pages serves.
- `pnpm preview` serves `dist/editor/` on port 3000; `pnpm preview:overlay` and `pnpm preview:lite` serve the standalone folders on 3001/3002.
- `pnpm serve` builds everything and serves it on port 3000 (overlay at `/`, editor at `/#/editor`, breakdown at `/#/breakdown`, lite at `/lite/`).
- `pnpm release:check` runs the local pre-release gate: typecheck, unit tests, browser smoke tests, and GitHub Pages build.

## Deployment

GitHub Pages deployment is handled by `.github/workflows/deploy.yml` on pushes to `main`.

The workflow:

1. Installs dependencies with pnpm.
2. Runs `pnpm run typecheck`.
3. Runs `pnpm test`.
4. Builds with `pnpm run build`.
5. Uploads `dist/editor/` as the Pages artifact.

Do not use a `docs/` branch/folder deployment flow for this repo.

## Browser Smoke Tests

Playwright tests live in `e2e/` and run against built production artifacts:

- `dist/editor` on port 4173.
- `dist/overlay` on port 4174.

The smoke suite verifies that the editor preview renders, the standalone overlay shell renders, and the breakdown popout can load a saved encounter snapshot.

Local runs use Microsoft Edge when available. CI installs Playwright Chromium with `pnpm exec playwright install --with-deps chromium`.
