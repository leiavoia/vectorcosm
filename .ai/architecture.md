# Architecture Overview

Vectorcosm is a client-side browser app that runs a real-time artificial life simulation. The simulation logic runs **off-thread in a Web Worker** to keep the UI responsive; the main thread handles rendering (Two.js SVG) and Svelte UI panels.

---

## High-Level Design

```
Browser Main Thread
├── App.svelte          — root component; sets up contexts, game loop, worker bridge
├── VectorcosmAPI       — IPC bridge (postMessage/callback registry)
├── GameLoop            — frame timing; waits for worker before drawing
├── Camera              — viewport (zoom, pan, follow); calls Two.js render
└── UI Panels (Svelte)  — stats, controls, boid library, sim launcher, etc.

Web Worker (vectorcosm.worker.js)
├── Vectorcosm          — top-level orchestrator (tank + simulation queue)
├── Tank                — spatial container for all game objects
├── Boids               — agents with physics, brain, sensors, metabolism
├── Plants / Food / Rock / Mark  — environmental objects
├── SpaceGrid           — spatial hash broadphase
└── DataGrid            — per-cell environment data (light, heat, matter)
```

---

## Simulation Tick Loop

Each frame the GameLoop:
1. Sends `{ f: 'update', delta, num_frames }` to the worker
2. Worker runs the full update cycle (see below) N times
3. Worker replies with `renderObjects` (geometry + animation data)
4. Main thread passes render data to Camera → Two.js SVG update

**Worker update cycle (per tick):**
1. Physics integration: forces → velocity → position (modified Euler)
2. Collision detection/response (SpaceGrid broadphase + exact-polygon)
3. Boid behavior: sensors → brain activation → motor output → endocrine update
4. Metabolism: energy burn, growth, reproduction, death
5. Plant lifecycle: growth, fruiting
6. Cleanup: remove dead objects, accumulate statistics

---

## Worker ↔ Main Thread IPC

| Direction | Mechanism |
|-----------|-----------|
| Main → Worker | `worker.postMessage({ f: fnName, ...params })` |
| Worker → Main | `worker.postMessage({ functionName: fnName, data: ... })` |
| Response handling | `VectorcosmAPI.RegisterResponseCallback(name, handler)` |

**VectorcosmAPI** wraps the raw worker and exposes `SendMessage(fn, params)` and callback registration. Components use it via Svelte context (`getContext('api')`).

---

## Svelte Component Tree

```
App.svelte [root]
├── VectorcosmDrawingContext   — Two.js canvas init, theme switching
└── UI Panels (one visible at a time, toggled via setPanelMode):
    ├── SimulatorControlsPanel
    ├── SimulationLauncherPanel
    ├── FocusObjectDetails
    │   ├── BrainGraph
    │   └── FocusObjectChart
    ├── TankStatsPanel
    ├── SimStatsPanel
    ├── PerfStatsPanel
    ├── RecordsPanel
    ├── BoidLibraryPanel
    ├── TankLibraryPanel
    └── CameraSettingsPanel
```

**Shared state is provided via Svelte context from App.svelte:**

```javascript
setContext('api', api);              // VectorcosmAPI instance
setContext('gameloop', gameloop);    // GameLoop instance
setContext('camera', camera);        // Camera instance
setContext('renderObjects', map);    // Map<oid, renderData> updated each frame
setContext('setPanelMode', fn);      // toggle which panel is open
```

---

## Rendering Layer Architecture

Two.js groups control Z-ordering. Layers in draw order (back to front):

```
background → obstacles → plants → foods → boids → marks → ui
```

Geometry is computed once in the worker and sent lazily (`AutoIncludeGeoData()`). Subsequent frames send only animation transforms to minimize IPC bandwidth.

---

## Persistence (IndexedDB via Dexie)

Schema version 3; two logical stores each split into an index + data table:

| Table | Contents |
|-------|----------|
| `population_index` | Boid population metadata (label, date, star, count, species) |
| `population_data`  | Full specimen JSON array |
| `tank_index`       | Tank scene metadata (label, date, dimensions, object counts) |
| `tank_data`        | Full tank state JSON |

`BoidLibrary` and `TankLibrary` classes wrap Dexie for all DB access.

---

## Key Architectural Decisions

- **Worker-first simulation**: All heavy simulation logic lives off-thread; the main thread only renders and handles user input.
- **DNA-driven traits**: Every boid property (brain topology, body shape, sensors, metabolism rate) derives from a hex DNA string. Enables mutation/crossover without class rewrites.
- **Pub/Sub decoupling**: `pubsub-js` used for loose component ↔ simulation communication where direct context injection is impractical.
- **No global Svelte store**: State is scoped to `setContext` at the App level. Worker state is authoritative; UI state is a projection.
