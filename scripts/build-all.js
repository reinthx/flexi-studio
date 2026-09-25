#!/usr/bin/env node
/**
 * build-all.js — the single canonical build for local preview and deploys.
 * Produces dist/editor/ (overlay + editor + breakdown routes, with lite/
 * nested), dist/overlay/, and dist/overlay-lite/. Serving dist/editor/ is
 * exactly what GitHub Pages serves — no separate Pages-only build exists.
 */
import { execSync } from 'child_process'
import { cpSync, rmSync } from 'fs'
import { resolve } from 'path'

const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'inherit' })

console.log('\n── Building editor ──')
run('pnpm exec vite build', 'editor')

console.log('\n── Building overlay ──')
run('pnpm exec vite build', 'overlay')

console.log('\n── Building overlay lite ──')
run('pnpm exec vite build --mode lite', 'overlay')

// Nest a copy under dist/editor/lite/ so a single static server rooted at
// dist/editor/ serves the overlay, editor, breakdown, AND lite routes —
// the same tree GitHub Pages deploys.
const liteTarget = resolve('dist/editor/lite')
rmSync(liteTarget, { recursive: true, force: true })
cpSync(resolve('dist/overlay-lite'), liteTarget, { recursive: true })

// Job icons are inlined in shared/src/jobIcons.ts — no asset copy needed

console.log('\n✓ Build complete → dist/editor/ (incl. lite/)  dist/overlay/  dist/overlay-lite/')
