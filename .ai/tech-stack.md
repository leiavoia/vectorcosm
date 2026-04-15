# Tech Stack

## Runtime & Build

| Tool | Version | Purpose |
|------|---------|---------|
| [Svelte](https://svelte.dev/) | 5.15.0 | UI framework (components, context, reactivity) |
| [Vite](https://vitejs.dev/) | 6.0.5 | Build tool & dev server |
| Node/NPM | any LTS | Package management |

**Build config:** `vite.config.js` — Svelte plugin, relative base path (`./`) for portable deployment.

## Key Runtime Libraries

| Library | Version | Purpose |
|---------|---------|---------|
| [two.js](https://two.js.org/) | 0.8.19 | 2D SVG/Canvas rendering |
| [collisions](https://www.npmjs.com/package/collisions) | 2.0.13 | 2D collision detection (polygons, circles) |
| [delaunator](https://github.com/mapbox/delaunator) | 5.0.0 | Delaunay triangulation (procedural rock shapes) |
| [dexie](https://dexie.org/) | 3.2.4 | IndexedDB ORM (boid/tank persistence) |
| [pubsub-js](https://github.com/mroderick/PubSubJS) | 1.9.4 | Publish/subscribe messaging |
| [@tweenjs/tween.js](https://github.com/tweenjs/tween.js) | 21.0.0 | Animation tweening (camera, UI) |
| [chart.js](https://www.chartjs.org/) | 4.3.0 | Stats graphs in UI panels |
| [@picocss/pico](https://picocss.com/) | 2.0.6 | Base CSS framework |
| [file-saver](https://github.com/eligrey/FileSaver.js) | 2.0.5 | Browser file download |

## Dev Scripts

```bash
npm install        # Install dependencies
npm run dev        # Dev server (Vite HMR)
npm run build      # Production build → dist/
npm run preview    # Preview production build locally
```

## Browser Requirements

- ES2020+ (Web Workers, IndexedDB, SVG, Web Animations)
- No server-side component; fully static after build

## File Organization

```
src/
├── App.svelte          # Root component
├── main.js             # Entry point (svelte.mount)
├── global.css          # Layout, themes, fonts
├── classes/            # All simulation classes (worker + main)
├── ui/                 # Svelte UI panel components
├── util/               # Math, SVG, geometry utilities
├── workers/            # Web worker entry point
└── assets/             # Fonts, images
```
