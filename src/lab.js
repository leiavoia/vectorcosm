/* <AI>
lab.js — Browser entry point for headless-style simulation runs without the Svelte UI.

OVERVIEW
- Creates the Web Worker, sends `init` + `start_autonomous`, logs all events to console as JSON.
- URL params are parsed via parseSimParams() and fed directly to the worker's `init` command.
- After init, sends `start_autonomous` using the `speed` URL param (default: 'throttled').
- Exposes `window.vectorcosmLab` with `.call()`, `.help()`, `.status()`, `.terminate()`.

URL PARAMS (all optional)
  Same as main GUI: width, height, sim, sim_queue, num_boids, num_foods, num_plants, num_rocks,
  rounds, timeout, max_mutation, cullpct, speed, sim_meta_params.KEY=value
  Extra lab-only:
    stats_interval  — ms between autonomous.stats posts (default 5000)
    throttle_delay  — ms between ticks in 'throttled' mode (default 10)
    natural_fps     — target fps in 'natural' mode (default 30)

EVENTS LOGGED (console + #log element if present)
  All worker postMessage events are logged as JSON.
  Errors are logged as console.error.

USAGE
  http://localhost:5173/lab.html?sim=peaceful_tank&speed=full&num_boids=50
  then: window.vectorcosmLab.call('get_status')
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
delete simParams.speed; // speed goes to start_autonomous, not init

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
	help:      ()       => call('help'),
	status:    ()       => call('get_status'),
	stats:     ()       => call('get_stats'),
	terminate: ()       => call('terminate'),
	stop:      ()       => call('stop_autonomous'),
	resume:    ()       => call('resume_autonomous'),
	setSpeed:  (s, opts={}) => call('set_speed', { speed: s, ...opts }),
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

	const autoParams = { speed, stats_interval, throttle_delay, natural_fps };
	logEvent('lab.start_autonomous', autoParams);
	const result = await call('start_autonomous', autoParams);
	logEvent('lab.started', result);
}

boot().catch( e => {
	console.error('[lab] boot failed:', e);
	logEvent('lab.boot_error', { message: e.message });
});
