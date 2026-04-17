/* <AI>
lab.js — Browser entry point for headless-style simulation runs without the Svelte UI.

OVERVIEW
- Creates the Web Worker, sends `init` + `start_autonomous`, logs all events to console as JSON.
- URL params are parsed via parseSimParams() and fed directly to the worker's `init` command.
- After init, sends `start_autonomous` using the `speed` URL param (default: 'throttled').
- Exposes `window.vectorcosmLab` with `.call()`, `.help()`, `.status()`, `.terminate()`, `.saveTank(filename)`.

URL PARAMS (all optional)
  Same as main GUI: width, height, sim, sim_queue, num_boids, num_foods, num_plants, num_rocks,
  rounds, timeout, max_mutation, cullpct, speed, sim_meta_params.KEY=value
  Extra lab-only:
  stats_interval  — ms between autonomous.stats posts (default 5000)
  throttle_delay  — ms between ticks in 'throttled' mode (default 10)
  natural_fps     — target fps in 'natural' mode (default 30)
  tank_file       — integer DB ID (IndexedDB, no network) OR basename / number for saves/tanks/<name>.json
                    Extension is optional and always .json. Path components are stripped to basename only.

SAVES DIRECTORY
  saves/tanks/  — tank scene JSON files
  saves/boids/  — boid population JSON files
  Browser reads:  fetch from /saves/tanks/<name>.json — same-origin only, basename enforced, no traversal.
  Browser writes: use saveTank(name) to trigger a download. User drops the file into saves/tanks/.
  Node.js CLI (Phase 3): FileAdapter will read/write saves/ directly.

EVENTS LOGGED (console + #log element if present)
  All worker postMessage events are logged as JSON.
  Errors are logged as console.error.

USAGE
  http://localhost:5173/lab.html?sim=peaceful_tank&speed=full&num_boids=50
  http://localhost:5173/lab.html?tank_file=my-tank      (loads /saves/tanks/my-tank.json)
  http://localhost:5173/lab.html?tank_file=42            (loads /saves/tanks/42.json  OR  DB id 42)
  then: window.vectorcosmLab.call('get_status')
        window.vectorcosmLab.saveTank('my-tank.json')
        window.vectorcosmLab.terminate()
</AI> */

import { parseSimParams, PARAM_SCHEMA } from './util/url-params.js';

// ─── Extra lab-only params ────────────────────────────────────────────────────
const LAB_PARAM_SCHEMA = {
	stats_interval: { type: 'int',   default: 5000 },
	throttle_delay: { type: 'int',   default: 10   },
	natural_fps:    { type: 'int',   default: 30   },
};

function coerceLabParam( key, raw ) {
	const schema = LAB_PARAM_SCHEMA[key];
	if ( !schema || raw === null || raw === '' ) { return schema?.default ?? null; }
	if ( schema.type === 'int' ) {
		const n = parseInt(raw, 10);
		return isNaN(n) ? schema.default : n;
	}
	if ( schema.type === 'float' ) {
		const f = parseFloat(raw);
		return isNaN(f) ? schema.default : f;
	}
	return raw;
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

const searchParams = new URLSearchParams(window.location.search);
const simParams = parseSimParams(searchParams);

// pull lab-only params from URL
const stats_interval = coerceLabParam('stats_interval', searchParams.get('stats_interval'));
const throttle_delay = coerceLabParam('throttle_delay', searchParams.get('throttle_delay'));
const natural_fps    = coerceLabParam('natural_fps',    searchParams.get('natural_fps'));
const speed          = simParams.speed || 'throttled';
const tank_file      = searchParams.get('tank_file') || null; // integer DB ID or filename inside saves/
delete simParams.speed; // speed goes to start_autonomous, not init

// ─── Saves directory ─────────────────────────────────────────────────────────
const SAVES_TANKS_DIR = 'saves/tanks/';
const SAVES_BOIDS_DIR = 'saves/boids/';

// Given a user-supplied name (number, bare word, with or without .json), return
// a fully-resolved same-origin URL targeting saves/tanks/<basename>.json.
// Strips all path components to basename — traversal is impossible by construction.
// Returns null if resolution fails or escapes the origin.
function tankSavesUrl( input ) {
	// extract basename, strip any extension, then always append .json
	const basename = input.trim().replace(/\.json$/i, '').split(/[\/\\]/).pop();
	if ( !basename ) { return null; }
	const path = SAVES_TANKS_DIR + basename + '.json';
	let resolved;
	try { resolved = new URL(path, window.location.href); }
	catch (e) { return null; }
	if ( resolved.origin !== window.location.origin ) { return null; }
	return resolved;
}

// ─── Logging ─────────────────────────────────────────────────────────────────

const logEl = document.getElementById('lab-log');
const LOG_MAX_ENTRIES = 20;   // on-screen entries kept before trimming oldest
const CONSOLE_CLEAR_EVERY = 50; // clear console every N log calls to prevent memory bloat
let log_call_count = 0;

function logEvent( label, data ) {
	const line = `[${new Date().toISOString()}] ${label}: ${JSON.stringify(data)}`;

	// periodically clear the console to prevent unbounded memory growth
	log_call_count++;
	if ( log_call_count % CONSOLE_CLEAR_EVERY === 0 ) { console.clear(); }
	console.log(line);

	if ( logEl ) {
		const div = document.createElement('div');
		div.textContent = line;
		logEl.appendChild(div);
		// trim oldest entries beyond the cap
		while ( logEl.childElementCount > LOG_MAX_ENTRIES ) {
			logEl.removeChild(logEl.firstElementChild);
		}
		logEl.scrollTop = logEl.scrollHeight;
	}
}

// ─── Worker Setup ─────────────────────────────────────────────────────────────

const worker = new Worker(
	new URL('./workers/vectorcosm.worker.js', import.meta.url),
	{ type: 'module' }
);

// pending call() Promises keyed by request_id
const pending = new Map();
let nextReqId = 1;

worker.addEventListener('message', (e) => {
	const { functionName, data, request_id } = e.data;

	// resolve pending Promise if this is a reply to a call()
	if ( request_id && pending.has(request_id) ) {
		const { resolve } = pending.get(request_id);
		pending.delete(request_id);
		resolve(data);
		return;
	}

	// log everything else as a structured event
	logEvent(functionName, data);
});

worker.addEventListener('error', (e) => {
	console.error('[lab] Worker error:', e.message, e);
	logEvent('worker_error', { message: e.message });
});

// ─── Public API ───────────────────────────────────────────────────────────────

function call( commandName, data = {} ) {
	return new Promise( (resolve) => {
		const request_id = 'lab-' + (nextReqId++);
		pending.set(request_id, { resolve });
		worker.postMessage( { functionName: commandName, data, request_id } );
	});
}

const api = {
	call,
	help:        ()            => call('help'),
	status:      ()            => call('get_status'),
	stats:       ()            => call('get_stats'),
	terminate:   ()            => call('terminate'),
	stop:        ()            => call('stop_autonomous'),
	resume:      ()            => call('resume_autonomous'),
	setSpeed:    (s, opts={})  => call('set_speed', { speed: s, ...opts }),
	importTank:  (scene)       => call('import_tank', { scene }),
	exportTank:  ()            => call('export_tank'),
	// saveTank(name) — exports the current tank and triggers a browser download.
	// Suggested filename targets saves/tanks/ so the user knows where to drop it.
	// name: bare name or number, no path, no extension needed.
	saveTank: async (name='tank') => {
		const scene = await call('export_tank');
		if (!scene) { return false; }
		const basename = String(name).trim().replace(/\.json$/i, '').split(/[\/\\]/).pop() || 'tank';
		const json = JSON.stringify(scene, null, 2);
		const blob = new Blob([json], { type: 'application/json' });
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = basename + '.json'; // user should drop this into saves/tanks/
		a.click();
		URL.revokeObjectURL(a.href);
		return true;
	},
};
window.vectorcosmLab = api;

// ─── Init + Start ─────────────────────────────────────────────────────────────

async function boot() {
	// compute canvas dimensions — use URL params if given, otherwise body size
	const initParams = Object.assign( {
		width:  window.innerWidth,
		height: window.innerHeight,
	}, simParams );

	logEvent('lab.init', initParams);
	await call('init', initParams);

	// optionally load a saved tank before starting the loop
	if ( tank_file ) {
		const db_id = /^\d+$/.test(tank_file.trim()) ? parseInt(tank_file.trim(), 10) : null;

		// positive integer → load from IndexedDB by ID (no network request)
		if ( db_id !== null ) {
			logEvent('lab.load_tank', { id: db_id });
			const result = await call('load_tank', { id: db_id });
			logEvent('lab.load_tank_result', result);
		}
		// name/number — strip to basename and target saves/tanks/<name>.json
		else {
			const resolved = tankSavesUrl(tank_file);
			if ( !resolved ) {
				logEvent('lab.import_tank_error', { input: tank_file, error: 'invalid name — use a DB integer ID or a bare filename for saves/tanks/' });
			}
			else {
				logEvent('lab.import_tank', { url: resolved.pathname });
				let scene = null;
				try {
					const resp = await fetch(resolved.href);
					if ( !resp.ok ) { throw new Error(`HTTP ${resp.status}`); }
					scene = await resp.json();
				} catch (e) {
					logEvent('lab.import_tank_error', { url: resolved.pathname, error: e.message });
				}
				if ( scene ) {
					const imported = await call('import_tank', { scene });
					logEvent('lab.import_tank_result', imported);
				}
			}
		}
	}

	const autoParams = { speed, stats_interval, throttle_delay, natural_fps };
	logEvent('lab.start_autonomous', autoParams);
	const result = await call('start_autonomous', autoParams);
	logEvent('lab.started', result);
}

boot().catch( e => {
	console.error('[lab] boot failed:', e);
	logEvent('lab.boot_error', { message: e.message });
});
