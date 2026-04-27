# Flexi Studio

A customizable DPS meter overlay for Final Fantasy XIV, built for use with [ACT](https://advancedcombattracker.com/) and the OverlayPlugin.

## What it does

Flexi Studio displays a live damage meter during combat. You can customize how it looks — bar styles, colors, gradients, textures, fonts, animations, and more — using the built-in visual editor.

## How to use

### GitHub Pages

1. In ACT, open the OverlayPlugin tab
2. Add a new overlay
3. Set the overlay URL to `https://reinthx.github.io/flexi-studio/`
4. Open the editor by clicking the settings button on the overlay, or visit `https://reinthx.github.io/flexi-studio/#/editor` in a browser

### Self-hosted

Download the latest build artifacts from [Actions](../../actions) and host the files yourself. Point ACT to your local URL.

## Editor

The editor lets you configure:

- **Meter bars** — style, size, colors, gradients, textures, animations
- **Player rows** — what stats to show, including DPS, HPS, job icons, and more
- **Fonts** — pick from built-in fonts or point to a folder of your own
- **Presets** — save, import, export, and switch between different looks

Changes sync live to the overlay when clicking "Apply changes" — no reload needed.

## Presets

Presets can be selected from the editor and applied to the active overlay. Custom presets are stored locally by ACT/OverlayPlugin or the browser environment you are using.

## Fonts

Flexi Studio includes several built-in fonts. You can also use your own local font folder from the editor when your browser/ACT environment supports directory access.

## Troubleshooting

- If the overlay is blank, confirm ACT, OverlayPlugin, and the FFXIV parsing plugin are enabled.
- If editor changes do not appear, click "Apply changes" and reload the overlay.
- If custom fonts do not appear, confirm the folder contains `.ttf`, `.otf`, `.woff`, or `.woff2` files.

## Requirements

- [ACT (Advanced Combat Tracker)](https://advancedcombattracker.com/)
- [OverlayPlugin](https://github.com/OverlayPlugin/OverlayPlugin) — install via the ACT plugin manager
- FFXIV with the FFXIV parsing plugin enabled in ACT

## Development

Development and deployment notes live in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).
