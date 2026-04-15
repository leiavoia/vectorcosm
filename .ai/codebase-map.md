# Codebase Map

Quick reference for every significant file. Grouped by role.

---

## Simulation Classes (`src/classes/`)

### Orchestration

| File | Class(es) | Description |
|------|-----------|-------------|
| `class.Vectorcosm.js` | `Vectorcosm` | Top-level orchestrator. Owns the Tank and simulation queue. Drives lifecycle (start/stop/reset). |
| `class.Simulation.js` | `Simulation`, `SimulationFactory()` | Base simulation type with scoring, round management. `SimulationFactory` constructs specialized sim variants. |
| `class.GameLoop.js` | `GameLoop` | Frame timing, delta time, FPS tracking. Coordinates worker update → draw sequence. |
| `SimulationLibrary.js` | — | Registry of pre-configured simulation definitions (race, food chase, combat, etc.). |

### Environment

| File | Class(es) | Description |
|------|-----------|-------------|
| `class.Tank.js` | `Tank` | Container for all game objects. Manages spatial grid, background rendering, theme. |
| `class.SpaceGrid.js` | `SpaceGrid` | Spatial hash (300px cells) for collision broadphase. Tracks AABB/radius per object. |
| `class.DataGrid.js` | `DataGrid` | Per-cell environmental data (light, heat, matter). Supports interpolated sensor reads. |
| `class.TankMaker.js` | `TankMaker` | Procedural level generation: rock placement using Voronoi masking strategies. |
| `class.Camera.js` | `Camera` | Viewport management: zoom, pan, follow tracking, cinema-mode transitions. |

### Biological Agents (Boids)

| File | Class(es) | Description |
|------|-----------|-------------|
| `class.Boids.js` | `Boid` | Main agent. Extends `PhysicsObject`. Owns brain, sensors, endocrine system, metabolism, reproduction. |
| `class.Brain.js` | `Brain` | Neural network wrapper. Handles EPANN/RNN/SNN selection, I/O mapping, activation. |
| `class.EPANN.js` | `EPANN` | Evolving Plastic Artificial Neural Network (default). Multi-layer feed-forward with configurable activations. |
| `class.SpikingNeuralNetwork.js` | `SNN` | Tick-based spiking neuron alternative. |
| `class.RecurrentNeuralNetwork.js` | `RNN` | RNN with hidden states, self-connections, and decay-time dynamics. |
| `class.Sensor.js` | `Sensor` | Whiskers (touch), sense organs (vision/smell/audio/proprioception). Maps readings to brain inputs. |
| `class.Endocrine.js` | `Endocrine` | 4-channel hormone system. Inputs from sensors/hunger/health; modulates motor sensitivity and perception. |
| `class.BodyPlan.js` | `BodyPlan` | Morphology derived from DNA: body geometry, colors, gradients. |
| `class.DNA.js` | `DNA` | Hex genetic string. Read/write gene segments, mutation, crossover. |

### Physics

| File | Class(es) | Description |
|------|-----------|-------------|
| `class.PhysicsObject.js` | `PhysicsObject` | Base for all moving objects. Position, velocity, acceleration, drag; modified Euler integration; boundary constraints. |

### Environmental Objects

| File | Class(es) | Description |
|------|-----------|-------------|
| `class.Food.js` | `Food` | Consumable items. Flavor, complexity, sensory properties for boid detection. |
| `class.Plant.js` | `Plant` | Sessile producers. Grow, fruit, die; configurable life credits, fruiting speed, environmental preferences. |
| `class.Rock.js` | `Rock` | Static collision obstacles. Procedural geometry via Delaunay; multiple color schemes. |
| `class.Mark.js` | `Mark` | Temporary debug markers. Visualize sensor detections and brain outputs. |

### Persistence & Stats

| File | Class(es) | Description |
|------|-----------|-------------|
| `class.BoidLibrary.js` | `BoidLibrary` | Population database (Dexie/IndexedDB). Save/load/search boid specimens. |
| `class.TankLibrary.js` | `TankLibrary` | Tank scene database. Save/load full tank states. |
| `db.js` | — | Dexie schema (v3). Defines `population_index`, `population_data`, `tank_index`, `tank_data` tables. |
| `class.StatTracker.js` | `StatTracker` | Multi-layer stats with exponential bucketing for long-term trend tracking. |
| `class.VectorcosmAPI.js` | `VectorcosmAPI` | Worker IPC bridge. Registers callbacks; dispatches postMessages to/from simulation worker. |

---

## UI Components (`src/ui/`)

| File | Purpose |
|------|---------|
| `VectorcosmDrawingContext.svelte` | Two.js canvas init; render layer setup; theme switching |
| `SimulatorControlsPanel.svelte` | Play/pause, fast-forward, mutation rate, population controls |
| `SimulationLauncherPanel.svelte` | Select and launch simulation type with configurable settings |
| `FocusObjectDetails.svelte` | Detailed stats for the tracked boid; save options |
| `BrainGraph.svelte` | Neural network topology visualization (weights, activation patterns) |
| `FocusObjectChart.svelte` | Time-series graphs for individual boid stats |
| `TankStatsPanel.svelte` | Per-frame tank stats (boid count, food, plants, species diversity) |
| `SimStatsPanel.svelte` | Simulation progress: best/avg scores, round tracking |
| `PerfStatsPanel.svelte` | Performance: FPS, sim time, draw time, wait time |
| `RecordsPanel.svelte` | Historical stats with layered stat-tracker visualization |
| `BoidLibraryPanel.svelte` | Saved population management: search, import/export, favorites |
| `TankLibraryPanel.svelte` | Saved tank scene management |
| `CameraSettingsPanel.svelte` | Zoom, pan, follow modes, animation toggles |

---

## Utilities (`src/util/`)

| File | Exports | Description |
|------|---------|-------------|
| `utils.js` | `clamp`, `random`, color conversions | General math and color utilities |
| `svg.js` | SVG helpers | Two.js SVG manipulation: gradient rehydration, property updates, cleanup |
| `utils.delaunay.js` | Voronoi helpers | Voronoi cell iteration, polygon trimming for rock generation |

---

## Workers (`src/workers/`)

| File | Description |
|------|-------------|
| `vectorcosm.worker.js` | Web Worker entry point. Message handler registry. Runs the full simulation loop off the main thread. Handles `update`, `pickObject`, `saveTank`, `loadTank`. Returns `renderObjects` to main thread each frame. |

---

## Entry Points

| File | Description |
|------|-------------|
| `src/main.js` | Mounts `App.svelte` to `#app`. Imports PicoCSS and `global.css`. Uses Svelte 5 `mount()` API. |
| `src/App.svelte` | Root component. Initializes GameLoop, Camera, VectorcosmAPI. Provides all shared context. Renders VectorcosmDrawingContext + UI panels. |
| `index.html` | HTML shell. Single `<div id="app">` target. |
