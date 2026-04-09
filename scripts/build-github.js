#!/usr/bin/env node
/**
 * build-github.js — builds unified app for GitHub Pages deployment
 */
import { execSync } from 'child_process'

const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'inherit' })

console.log('\n── Building unified GitHub Pages app ──')
run('pnpm exec vite build --mode github', 'editor')

console.log('\n✓ Build complete → dist/editor/ (contains unified app)')