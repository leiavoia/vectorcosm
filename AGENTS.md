# Vectorcosm — Agent Guidelines

Vectorcosm is a **client-side artificial life simulation** rendered in SVG. Boids (digital organisms) evolve neural networks, bodies, and behaviors through genetic algorithms inside a browser-based aquarium.

> **Detailed docs** → [`.ai/`](.ai/) folder
> - [Architecture](.ai/architecture.md) — simulation loop, IPC, component tree
> - [Tech Stack](.ai/tech-stack.md) — dependencies, build, scripts
> - [Codebase Map](.ai/codebase-map.md) — every significant file described

---

## Quick Start

```bash
npm install      # install dependencies
npm run dev      # start dev server (Vite HMR)
npm run build    # production build → dist/
```

No server required. Fully static after build.

---

## Tech Stack Summary

- **Svelte 5** + **Vite 6** — UI and build tooling
- **Two.js** — SVG rendering on the main thread
- **Web Worker** — entire simulation loop runs off-thread (`src/workers/vectorcosm.worker.js`)
- **Dexie** — IndexedDB ORM for persistent boid/tank library
- **PubSub-JS** — loose coupling between UI and simulation events

---

## Architecture Summary

All heavy computation (physics, neural nets, collisions, genetics) runs in a **dedicated Web Worker**. The main thread owns rendering (Two.js SVG) and the Svelte UI. They communicate via `postMessage` through `VectorcosmAPI` (IPC bridge in `src/classes/class.VectorcosmAPI.js`). Each frame: GameLoop sends `update` to worker → worker returns render geometry → Camera applies it to Two.js. State is held in the worker; the UI is a projection of what the worker reports. See [architecture.md](.ai/architecture.md).

---

## Critical Conventions

- **Worker is authoritative.** Do not maintain simulation state on the main thread or in Svelte stores. Send commands to the worker; read back render data.
- **DNA string is the genome.** All boid traits are encoded in a hex string (`class.DNA.js`). Add new traits by allocating new gene codes derived from DNA, not by adding constructor parameters.
- **IPC naming.** Worker message functions use lowercase snake_case (e.g., `update`, `pick_object`). Register handlers with `VectorcosmAPI.RegisterResponseCallback(name, fn)`.
- **Object IDs.** Use `globalThis.vc.next_object_id++` to assign object IDs (`oid`) for global consumption. Never generate IDs elsewhere.
- **UI Layers.** Always insert Two.js objects into the correct render group (`background`, `obstacles`, `plants`, `foods`, `boids`, `marks`, `ui`). Do not draw directly to the scene root.
- **No global Svelte store.** Shared objects (api, camera, gameloop) are passed via `setContext`/`getContext`. Follow that pattern for new shared state. *This may change*. 
- **Svelte 5 API.** Project uses `mount()` (not `new Component()`), runes (`$state`, `$derived`, `$effect`) where reactive state is needed.

---

## Coding Conventions

- Use common javascript conventions.
- No typescript.
- Ignore legacy browser support.
- Spaces around curly and round braces for readability.
- Tab indent, 4-space alignment.
- CPU speed is critical for this app. 
- Favor data structures, algorithms, and access patterns optimized for speed (flat arrays, simple for-loops, cache-friendly objects).
- Comment code blocks so that humans can skim code in English.

---

## Agent Personality

- Be direct and functional. 
- The human does not need your commendation or emotional support.
- Solving problems is your metric of success, not word choice. 
- Offer a better solution if you have one. 
- Point out oversights, anti-patterns, and poor code.
- Call out bad ideas. Your criticism is welcomed.

---

## Operations

Keep .ai documentation up to date when: 

- Files are added or removed.
- Major features are updated.
- Tech stack has changed. 
