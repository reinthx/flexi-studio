# Release Checklist

Use this before tagging or pushing a launch build.

## Automated Gates

Run:

```sh
pnpm release:check
```

This covers:

- Vue/TypeScript checks.
- Vitest unit and focused integration tests.
- Playwright browser smoke tests for editor, overlay, and breakdown.
- GitHub Pages artifact build.

The GitHub Pages workflow also runs typecheck, Vitest, Playwright smoke tests, and `pnpm build:github` before uploading the Pages artifact.

## Manual ACT Smoke

Run this in ACT with OverlayPlugin before calling a build production-ready:

1. Add a new OverlayPlugin overlay.
2. Set the overlay URL to the GitHub Pages URL or the locally hosted build.
3. Confirm the meter shows combat data during a pull.
4. Open the editor from the overlay.
5. Apply a built-in preset and confirm the overlay updates without a reload.
6. Edit a visible bar option, click "Apply changes", and confirm the overlay updates.
7. Open breakdown from a combatant row.
8. Open the Pulls/breakdown view from the header.
9. End combat and confirm pull history/outcome renders sensibly.
10. Reload the overlay and confirm saved settings persist.

## Visual Spot Check

Browser smoke tests prove the app renders, but a human should still inspect:

- Shape-cut bars fill to the right edge.
- Rank 1 styling is visible and not clipping text.
- Texture tint/fill rendering looks correct.
- Text outlines and shadows are not clipped.
- Editor preview resize persists after reload.
- Breakdown tabs switch correctly for Overview, Done, Taken, Timeline, Deaths, Casts, and Events.

## Launch Decision

A launch build is ready when:

- `pnpm release:check` passes locally.
- The GitHub Pages workflow passes on GitHub.
- Manual ACT smoke passes.
- Font licensing notes in `fonts/README.md` have been reviewed for any newly added fonts.
