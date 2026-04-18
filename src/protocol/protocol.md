# Vectorcosm Wire Protocol v1

Canonical spec for all communication between a client (browser UI, CLI, TUI, AI agent) and a simulation worker (Web Worker, Node.js worker_thread, future C++ process).

This document is the authority. All clients and workers must conform to it.

---

## Transport Layer

The protocol is transport-agnostic. Messages are structured JavaScript objects (or equivalent JSON when serialized over sockets/pipes). Current transports:

| Transport | Environment | Mechanism |
|---|---|---|
| `PostMessageTransport` | Browser | `Worker.postMessage()` / `onmessage` |
| `WorkerThreadTransport` | Node.js | `worker_threads` `postMessage()` / `on('message')` |
| (Future) `SocketTransport` | Any | TCP/Unix socket, newline-delimited JSON |
| (Future) `StdioTransport` | C++ | stdin/stdout, newline-delimited JSON |

All transports implement the same interface:
```
send(message: object): void
onMessage(handler: (message: object) => void): void
```

---

## Message Types

Every message has a `type` field. Four types exist.

### 1. Request (client → worker)

A command invocation expecting a correlated response.

```json
{
    "type": "request",
    "command": "get_status",
    "params": {},
    "id": "cli-42",
    "v": 1
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | `"request"` | yes | Message discriminator |
| `command` | string | yes | Snake_case command name from CommandRegistry |
| `params` | object | yes | Command parameters (may be `{}`) |
| `id` | string | yes | Client-generated correlation ID. Unique per client session. |
| `v` | integer | yes | Protocol version. Currently `1`. |

### 2. Response (worker → client)

Correlated reply to a request.

```json
{
    "type": "response",
    "command": "get_status",
    "id": "cli-42",
    "ok": true,
    "result": { "running": true, "frame_count": 14200 },
    "error": null
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | `"response"` | yes | Message discriminator |
| `command` | string | yes | Echoed command name |
| `id` | string | yes | Echoed correlation ID from the request |
| `ok` | boolean | yes | `true` if handler succeeded, `false` on error |
| `result` | any | if ok=true | Handler return value |
| `error` | string\|null | if ok=false | Error message |

### 3. Event (worker → client)

Unsolicited broadcast — not correlated to any request.

```json
{
    "type": "event",
    "name": "autonomous.stats",
    "data": { "frame_count": 14200, "tps": 1280 }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | `"event"` | yes | Message discriminator |
| `name` | string | yes | Event name (dot.notation for namespacing) |
| `data` | any | yes | Event payload |

### 4. Frame (worker → client)

Render data in response to an `update` tick. Separated from Response because frame data has different performance characteristics (high frequency, large payload, optional Transferable arrays).

A frame message is only produced when the worker is in **interactive mode** (not autonomous). One frame per `update` request, strictly lockstep.

```json
{
    "type": "frame",
    "data": {
        "renderObjects": [...],
        "simStats": {...},
        "tankStats": {...},
        "round_time": 12.5
    }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | `"frame"` | yes | Message discriminator |
| `data` | object | yes | Render payload (see Frame Data section) |

No `id` field — frames are implicitly correlated 1:1 with `update` requests by cadence. The client expects exactly one frame per update request. No request_id overhead.

---

## Frame Data

The `data` object inside a `type: "frame"` message:

| Key | Type | Frequency | Description |
|---|---|---|---|
| `renderObjects` | array | every frame | All drawable objects (tank, boids, plants, foods, marks, obstacles) |
| `simStats` | object | every frame | Simulation state: round_num, scores, name, segments, queue depth. `settings` sub-object only present when dirty. |
| `tankStats` | object | every frame | Population counts: boids, species, foods, plants, rocks, marks, boid_mass, food_mass |
| `round_time` | number | every frame | Current round elapsed time (seconds) |

### renderObjects entries

Each entry is a plain object:

```json
{
    "oid": 42,
    "type": "boid",
    "x": 312.4,
    "y": 198.1,
    "a": 1.57,
    "s": 1.0,
    "geodata": { ... },
    "anim": { ... }
}
```

| Field | Present | Description |
|---|---|---|
| `oid` | always | Unique object ID |
| `type` | always | `"boid"`, `"plant"`, `"food"`, `"mark"`, `"obstacle"`, `"tank"` |
| `x`, `y` | boids, foods, and on first appearance for static types | World position |
| `a` | boids | Angle in radians |
| `s` | boids | Scale |
| `geodata` | first appearance only | Shape descriptor — only sent when new or changed |
| `anim` | when animation is enabled | Motor effects, opacity, age, lifespan depending on type |

Static objects (obstacles, marks, plants) omit position after the first `geodata` payload since they do not move.

> **Note:** A Float64Array-based Transferable layout (stride-5 per boid: oid, x, y, angle, scale) may be adopted in the future for boid position data to reduce GC pressure at high populations. The current approach is a plain JS object array compatible with structured-clone transfer.

---

## Command Categories

Commands are registered in `CommandRegistry` and discoverable via `help` / `describe`.

### App Commands
| Command | Description |
|---|---|
| `init` | Initialize simulation. Params: sim, sim_queue, width, height, num_boids, etc. |
| `update` | Advance simulation, return frame data. Self-post (frame type). |
| `pick_object` | Select boid by ID or proximity. Returns boid description. |
| `get_tank_env_data` | Return environment grid and whirl data. |
| `end_sim` | End current simulation immediately. |
| `save_tank` | Save tank state to storage. |
| `load_tank` | Load tank state from storage by ID. |
| `import_tank` | Import tank from a scene JSON object (no storage). |
| `export_boids` | Export boids as JSON, optionally saving to storage. |
| `load_boids` | Load a population of boids from JSON. |
| `add_saved_boids` | Load saved boids from library into current tank. |
| `smite` | Kill boids by ID. |
| `rand_tank` | Regenerate tank obstacles. |
| `update_sim_settings` | Update simulation settings on the fly. |
| `push_sim_queue` | Add simulations to the queue. |

### Autonomous Loop Commands
| Command | Description |
|---|---|
| `start_autonomous` | Start autonomous tick loop. Params: speed, stats_interval, etc. |
| `stop_autonomous` | Pause autonomous loop. |
| `resume_autonomous` | Resume paused autonomous loop. |
| `set_speed` | Change speed mode without stopping. |
| `terminate` | Stop loop, post final status report. |
| `get_status` | Instant status snapshot. |
| `get_stats` | Full simulation + tank stats. |
| `get_population` | Compact boid list (DNA, fitness, species). |
| `export_tank` | Full scene JSON (no storage write). |

### Library Commands
| Command | Description |
|---|---|
| `boid_library_list` | List boid population index rows. |
| `boid_library_get_row` | Get full row (index + specimens). |
| `boid_library_add_row` | Import a boid population row. |
| `boid_library_update` | Update index fields (label, star). |
| `boid_library_delete` | Delete a saved boid population. |
| `tank_library_list` | List tank index rows. |
| `tank_library_get_row` | Get full row (index + scene). |
| `tank_library_add_row` | Import a tank row. |
| `tank_library_delete` | Delete a saved tank. |

### Built-in Commands
| Command | Description |
|---|---|
| `help` | List all registered commands with metadata. |
| `describe` | Describe a single command in detail. |
| `ping` | Health check. Returns `"pong"`. |

---

## Event Names

Events use dot.notation for namespacing.

| Event | Source | Description |
|---|---|---|
| `sim_new` | Simulation lifecycle | New simulation started |
| `sim_round` | Simulation lifecycle | Training round completed |
| `sim_complete` | Simulation lifecycle | Simulation finished |
| `autonomous.stats` | Autonomous loop | Periodic stats snapshot |
| `records_push` | Stat tracking | Simulation stat records updated |
| `boid_records_push` | Stat tracking | Per-boid stat records updated |
| `save_tank` | Autosave | Tank autosaved |

---

## Metadata Extension

Messages may carry an optional `_meta` object for orchestration and debugging. Workers and simple clients ignore fields they don't use.

```json
{
    "type": "request",
    "command": "get_status",
    "params": {},
    "id": "orch-7",
    "v": 1,
    "_meta": {
        "session": "tank-alpha",
        "ts": 1713454800000,
        "source": "orchestrator"
    }
}
```

| `_meta` Field | Type | Description |
|---|---|---|
| `session` | string | Named session in an orchestrator context |
| `ts` | number | Client-side timestamp (ms since epoch) |
| `source` | string | Client identifier: `"gui"`, `"cli"`, `"lab"`, `"orchestrator"` |

The worker echoes `_meta` back on responses (pass-through, unmodified).

---

## Protocol Version

Current version: **1**.

The `v` field on requests enables future negotiation. If a worker receives a version it doesn't support, it responds with `ok: false, error: "unsupported protocol version"`.

---

## Design Principles

1. **Transport-agnostic.** The envelope spec is independent of postMessage, sockets, or pipes.
2. **Self-describing.** `help` and `describe` commands return full command metadata.
3. **Client controls cadence.** In interactive mode, the client determines frame rate. Worker never sends unsolicited frames.
4. **Explicit message types.** `type` field eliminates ambiguity between responses and events.
5. **Handlers are pure.** Handlers return values; the framework builds envelopes. Exception: `update` (self_post).
6. **C++ portable.** This spec can be implemented in any language. No JS-specific semantics except Transferable (transport optimization, not protocol requirement).
