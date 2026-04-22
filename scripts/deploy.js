#!/usr/bin/env node
/**
 * deploy.js — Deploy to GitHub Pages
 * Usage: node scripts/deploy.js
 */

import { execSync } from 'child_process'
import { existsSync, mkdirSync, cpSync, writeFileSync } from 'fs'
import { join } from 'path'

const run = (cmd) => execSync(cmd, { stdio: 'inherit' })

console.log('🚀 Building for production...')
run('npm run build')

console.log('📦 Preparing deployment...')
const deployDir = 'docs'

// Create docs directory for GitHub Pages
if (!existsSync(deployDir)) {
  mkdirSync(deployDir)
}

// Copy built files
cpSync('dist/editor', join(deployDir, 'editor'), { recursive: true })
cpSync('dist/overlay', join(deployDir, 'overlay'), { recursive: true })

// Create index.html redirect to overlay
writeFileSync(join(deployDir, 'index.html'), `<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="refresh" content="0; url=overlay/">
  <title>act-flexi</title>
</head>
<body>
  <p>Redirecting to <a href="overlay/">overlay</a>...</p>
</body>
</html>`)

console.log('✅ Ready for GitHub Pages deployment!')
console.log('📋 Next steps:')
console.log('  1. Commit and push the docs/ folder')
console.log('  2. Enable GitHub Pages in repository settings')
console.log('  3. Set source to "Deploy from a branch" → main/docs')
