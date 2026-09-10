#!/usr/bin/env node
/**
 * build-github.js — builds unified app for GitHub Pages deployment
 */
import { execSync } from 'child_process'
import { cpSync, rmSync } from 'fs'
import { resolve } from 'path'

const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'inherit' })

console.log('\n── Building unified GitHub Pages app ──')
run('pnpm exec vite build --mode github', 'editor')

console.log('\n── Building lite overlay for GitHub Pages ──')
run('pnpm exec vite build --mode lite', 'overlay')

const liteTarget = resolve('dist/editor/lite')
rmSync(liteTarget, { recursive: true, force: true })
cpSync(resolve('dist/overlay-lite'), liteTarget, { recursive: true })

console.log('\n✓ Build complete → dist/editor/ (contains unified app and /lite/)') 
