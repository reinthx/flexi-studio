# Connecting ACT-Flexi Overlay Locally

This guide explains how to connect the overlay app to ACT locally.

## Prerequisites

1. ACT must be running
2. OverlayPlugin must be installed in ACT (from ACT Plugin Manager)

## Steps

### 1. Ensure Environment Variables Are Set

Create `.env` in the root directory:

```bash
cp .env.example .env
```

The `.env` file should have:

```env
MODE=development
WS_URL=ws://localhost:5176
EDITOR_URL=http://localhost:5174
GITHUB_SYNC_KEY=act-flexi-github-sync
```

### 2. Start the Overlay WebSocket Server

In a **separate terminal**, run:

```bash
cd overlay
npm run server
```

This starts the WebSocket server on `ws://127.0.0.1:5176`.

### 3. Start the Editor

In another terminal:

```bash
cd editor
npm run dev
```

This starts the editor on `http://localhost:5174`.

### 4. Launch ACT with OverlayPlugin

1. Open ACT
2. Go to Window → Plugin Manager
3. Install/enable OverlayPlugin if not already installed
4. Click the OverlayPlugin icon to inject into ACT
5. The overlay should now appear in your combat encounter

### 5. How It Works

- **Editor** runs on `http://localhost:5174` - lets you configure meter styles
- **Overlay Server** runs on `ws://localhost:5176` - bridges ACT's OverlayPlugin API to the overlay
- **Overlay** renders directly in ACT's combat encounter (no separate tab/window)

### 6. Troubleshooting

#### Overlay doesn't appear in combat

- Make sure the overlay server is running (`npm run server` in overlay directory)
- Check browser console for errors
- Ensure ACT's OverlayPlugin is enabled and injecting

#### Can't connect to WebSocket

- The overlay server must run on port 5176
- Make sure no other process is using that port
- Check firewall settings (allow local connections on 5176)

#### Editor config not applying

- Editor and overlay must both be in development mode
- Check `.env` file in both root and overlay directories

### 7. Production Deployment

For production (no local server needed):

```env
MODE=production
```

In production, the overlay uses localStorage for sync instead of WebSocket.

### 8. GitHub Pages

For GitHub Pages deployment:

```env
MODE=github
GITHUB_PAGES_URL=https://yourusername.github.io/act-flexi/
```

## File Structure

```
act-flexi/
├── .env                    # Root environment
├── editor/
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── stores/
│       │   └── liveData.ts  # Editor's live data store
│       └── ...
├── overlay/
│   ├── package.json
│   ├── vite.config.ts
│   ├── server.ts           # WebSocket server
│   └── src/
│       ├── stores/
│       │   └── liveData.ts  # Overlay's live data store
│       └── ...
└── shared/
    └── assets/
        ├── index.html      # Entry point for overlay
        └── jobs/
            └── *.png       # Job icons
```

## Architecture

```
┌─────────────┐
│    ACT      │
│  (Overlay   │
│   Plugin)   │
└──────┬──────┘
       │ callOverlayHandler
       │ addOverlayListener
       ▼
┌──────────────────┐
│ Overlay Server   │ (ws://localhost:5176)
│  (server.ts)     │
└────────┬─────────┘
         │ WebSocket broadcast
         ▼
┌──────────────────┐
│   Overlay UI     │ (rendered in ACT window)
│   (App.vue)      │
└──────────────────┘
```

## Quick Start

```bash
# Terminal 1: Editor
cd editor
npm run dev

# Terminal 2: Overlay Server
cd overlay
npm run server

# Terminal 3: ACT with OverlayPlugin
# - Start ACT
# - Enable OverlayPlugin
# - Inject into combat
```

That's it! The overlay should now display in your ACT combat encounters.
