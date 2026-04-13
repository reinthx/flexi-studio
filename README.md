# Flexi Studio

A customizable DPS meter overlay for Final Fantasy XIV, built for use with [ACT](https://advancedcombattracker.com/) and the OverlayPlugin.

## What it does

Flexi Studio displays a live damage meter during combat. You can customize how it looks — bar styles, colors, gradients, textures, fonts, animations, and more — using the built-in visual editor.

## How to use

### Option 1: GitHub Pages (easiest)

1. In ACT, open the OverlayPlugin tab
2. Add a new overlay, set the URL to the GitHub Pages link `https://reinthx.github.io/flexi-studio/`
3. Open the editor by clicking the settings button on the overlay, or by visiting `https://reinthx.github.io/flexi-studio/#/editor` in a browser

### Option 2: Self-hosted

Download the latest build artifacts from [Actions](../../actions) and host the files yourself. Point ACT to your local URL.

## Editor

The editor lets you configure:

- **Meter bars** — style, size, colors, gradients, textures, animations
- **Player rows** — what stats to show (DPS, HPS, job icons, etc.)
- **Fonts** — pick from built-in fonts or point to a folder of your own
- **Presets** — save and switch between different looks

Changes sync live to the overlay when clicking "Apply changes" — no reload needed.

## Requirements

- [ACT (Advanced Combat Tracker)](https://advancedcombattracker.com/)
- [OverlayPlugin](https://github.com/OverlayPlugin/OverlayPlugin) — install via the ACT plugin manager
- FFXIV with the FFXIV parsing plugin enabled in ACT
