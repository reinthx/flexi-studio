# act-flexi

A customizable DPS/HPS overlay for FFXIV with ACT and OverlayPlugin.

## 🚀 Quick Start

### For Users (Download & Use)

1. **Download** the latest release from [Releases](../../releases)
2. **Extract** the ZIP file
3. **Configure ACT** (see setup below)
4. **Load** `dist/overlay/index.html` in OverlayPlugin

### For Developers (Clone & Develop)

```bash
# Clone the repository
git clone https://github.com/yourusername/act-flexi.git
cd act-flexi

# Install dependencies
pnpm install

# Start development servers
pnpm run dev:editor   # Editor UI on http://localhost:5174
pnpm run dev:overlay  # Overlay preview on http://localhost:5175

# Build for production
pnpm run build
```

## 🌐 GitHub Pages Deployment

### Build for GitHub Pages

```bash
# Build both editor and overlay
pnpm run build

# Copy dist/ to your GitHub Pages branch
git checkout gh-pages
cp -r dist/* gh-pages/
git add gh-pages/
git commit -m "Deploy to GitHub Pages"
git push origin gh-pages
```

### Automatic Deployment

Enable GitHub Pages in your repository settings and push to `main` branch. The included GitHub Actions workflow will automatically build and deploy.

### Usage on GitHub Pages

- **Editor**: `https://yourusername.github.io/act-flexi/`
- **Overlay**: `https://yourusername.github.io/act-flexi/?mode=overlay`

### Communication on GitHub Pages

The editor and overlay communicate via `localStorage` events:

1. **Editor** saves changes to `localStorage`
2. **Overlay** listens for `storage` events and updates instantly
3. Click **"Open Overlay"** in editor to open overlay in new tab
4. Click **"Apply to Live Overlay"** to sync changes immediately

### Environment Configuration

For custom deployment URLs, create `.env` files:

```bash
# Copy example env files
cp .env.example .env
cp editor/.env.example editor/.env
cp overlay/.env.example overlay/.env

# Edit for your deployment
# MODE=production (for deployment)
# VITE_WS_URL=ws://your-server:5176 (optional, only for dev)
```

## 📋 ACT Setup

### Prerequisites

- [ACT (Advanced Combat Tracker)](https://ravahn.github.io/)
- [OverlayPlugin](https://github.com/OverlayPlugin/OverlayPlugin) for ACT
- FFXIV ACT Plugin for combat parsing

### Overlay Configuration

1. In ACT: **Plugins → OverlayPlugin.dll**
2. Click **New** to create overlay:
   ```
   Name: act-flexi
   Type: Mini Parse
   URL: file:///C:/path/to/act-flexi/dist/overlay/index.html
   Width: 400
   Height: 600
   ```
3. Position and configure as needed

### Alternative: Web Server (Recommended)

For better compatibility, serve via HTTP to avoid ACT's CSP restrictions:

**Option 1: Simple HTTP Server**
```bash
cd dist/overlay
npx http-server -p 8080
# ACT Plugin → URL: http://localhost:8080
```

**Option 2: Local OverlayPlugin Library (Best for ACT)**

If you encounter "script is not accessible" errors in ACT:

1. Run the local server:
   ```bash
   cd public
   node server.cjs
   ```
   
2. Configure ACT Plugin URL:
   ```
   file:///C:/path/to/act-flexi/dist/overlay/index.html
   ```

The local server at `public/server.cjs` serves the OverlayPlugin library locally, bypassing ACT's browser CSP restrictions.

## 🎨 Customization

### Editor Interface

- Run `pnpm run dev:editor`
- Open http://localhost:5174
- Configure bars, colors, layouts, and styles
- Changes sync live to the overlay

### Available Features

- **Role-based colors**: Tank, Healer, Melee, Ranged, Caster
- **Job-specific overrides**: Individual job colors
- **Self highlighting**: Special styling for your character
- **Texture fills**: Custom patterns and images
- **Flexible layouts**: Vertical/horizontal, auto-scaling
- **Animation**: Smooth transitions and effects

## 🏗️ Project Structure

```
act-flexi/
├── editor/          # Vue.js editor interface
├── overlay/         # Vue.js overlay display
├── shared/          # Common types and utilities
├── dist/            # Built output (generated)
├── scripts/         # Build utilities
├── .env.example     # Environment template
└── README.md
```

## 🛠️ Development

### Tech Stack

- **Frontend**: Vue 3 + TypeScript + Pinia
- **Build**: Vite + pnpm workspaces
- **Styling**: CSS Variables + Custom Properties
- **ACT Integration**: OverlayPlugin WebSocket API

### Scripts

```bash
pnpm run dev:editor    # Start editor dev server
pnpm run dev:overlay   # Start overlay dev server
pnpm run build         # Build all for production
pnpm run build:editor  # Build only editor
pnpm run build:overlay # Build only overlay
```

### Architecture

- **Editor**: Configuration UI with live preview
- **Overlay**: Real-time display receiving ACT data
- **Shared**: Type definitions and business logic
- **Bridge**: Handles ACT ↔ Overlay communication

## 📦 Distribution

Built files are in `dist/`:

- `dist/editor/index.html` - Configuration interface
- `dist/overlay/index.html` - ACT overlay

Host these on any static web server or use file:// protocol with OverlayPlugin.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test with ACT
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.
