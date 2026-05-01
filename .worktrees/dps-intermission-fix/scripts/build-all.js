#!/usr/bin/env node
/**
 * build-all.js — builds editor and overlay into dist/
 */
import { execSync } from 'child_process'

const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'inherit' })

console.log('\n── Building editor ──')
run('pnpm exec vite build', 'editor')

console.log('\n── Building overlay ──')
run('pnpm exec vite build', 'overlay')

// Job icons are inlined in shared/src/jobIcons.ts — no asset copy needed

console.log('\n✓ Build complete → dist/editor/  dist/overlay/')
