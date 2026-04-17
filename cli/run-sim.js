/* <AI>
cli/run-sim.js — CLI entry point for headless simulation runs.

Spawns vectorcosm.worker.js via Node.js worker_threads, sends init + start_autonomous,
and streams JSONL stats to stdout until --duration expires, SIGINT, or SIGTERM.

USAGE
  node cli/run-sim.js [options]
  node cli/run-sim.js --sim=peaceful_tank --speed=full --duration=60
  node cli/run-sim.js --sim_queue=natural_tank,combat --rounds=5 --duration=300
  node cli/run-sim.js --tank_file=./saves/tanks/my-tank.json
  node cli/run-sim.js --help

OPTIONS (forwarded to worker init unless noted)
  --sim=<name>              Simulation preset (e.g. peaceful_tank, natural_tank)
  --sim_queue=<a,b,...>     Comma-separated queue of sim presets
  --speed=<mode>            full | throttled | natural  (default: full)
  --duration=<seconds>      Stop after N seconds; 0 = unlimited  (default: 0)
  --width=<n>               Tank width pixels  (default: 1000)
  --height=<n>              Tank height pixels  (default: 750)
  --num_boids=<n>           Initial boid population
  --num_foods=<n>           Number of food items
  --num_plants=<n>          Number of plants
  --num_rocks=<n>           Number of rocks
  --rounds=<n>              Rounds to run (0 = perpetual)
  --timeout=<f>             Round timeout in seconds
  --max_mutation=<f>        Mutation rate (0..1)
  --cullpct=<f>             Cull fraction per round (0..1)
  --sim_meta_params.KEY=v   Sticky per-session override (e.g. --sim_meta_params.num_boids=50)
  --stats_interval=<ms>     Stats post period ms  (default: 5000)  [CLI only]
  --throttle_delay=<ms>     Tick delay in throttled mode ms  (default: 10)  [CLI only]
  --natural_fps=<n>         Target fps in natural mode  (default: 30)  [CLI only]
  --tank_file=<path>        Path to tank JSON file to import before starting  [CLI only]
  --quiet                   Suppress all but stats/lifecycle events from stdout  [CLI only]
  --help                    Print this message and exit

OUTPUT
  JSONL on stdout — one JSON object per line: { event, data, ts }
    event: worker functionName or 'cli.*' lifecycle event
    data:  payload from worker or CLI state
    ts:    unix timestamp ms
  Errors: stderr

WORKER PATH
  Points to src/workers/vectorcosm.worker.js (source, not built dist).
  The worker self-detects Node.js via `typeof WorkerGlobalScope === 'undefined'`
  and uses MemoryAdapter for storage (no IndexedDB in Node.js).
</AI> */

import { Worker } from 'worker_threads';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// ─── Type coercion ────────────────────────────────────────────────────────────

const INT_KEYS   = new Set(['width', 'height', 'num_boids', 'num_foods', 'num_plants', 'num_rocks', 'rounds', 'stats_interval', 'throttle_delay', 'natural_fps']);
const FLOAT_KEYS = new Set(['timeout', 'max_mutation', 'cullpct', 'duration']);

function coerceValue(key, raw) {
	if ( INT_KEYS.has(key) )   { const n = parseInt(raw, 10);  return isNaN(n) ? null : n; }
	if ( FLOAT_KEYS.has(key) ) { const f = parseFloat(raw);    return isNaN(f) ? null : f; }
	return raw;
}

// ─── CLI arg parser ───────────────────────────────────────────────────────────
// Handles --key=value, --key value (next token), and bare --flag forms.
// Dot-notation: --sim_meta_params.KEY=value → { sim_meta_params: { KEY: value } }.

function parseArgs(argv) {
	const args = {};
	for ( let i = 2; i < argv.length; i++ ) {
		const arg = argv[i];
		if ( !arg.startsWith('--') ) { continue; }
		const eq  = arg.indexOf('=');
		const key = eq >= 0 ? arg.slice(2, eq) : arg.slice(2);
		const raw = eq >= 0
			? arg.slice(eq + 1)
			: ( argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true' );

		// dot-notation sub-key (e.g. sim_meta_params.num_boids)
		const dot = key.indexOf('.');
		if ( dot >= 0 ) {
			const parent = key.slice(0, dot);
			const child  = key.slice(dot + 1);
			if ( !args[parent] || typeof args[parent] !== 'object' ) { args[parent] = {}; }
			args[parent][child] = coerceValue(child, raw);
		}
		else {
			args[key] = coerceValue(key, raw);
		}
	}
	return args;
}

// ─── Help text ────────────────────────────────────────────────────────────────

function printHelp() {
	process.stdout.write([
		'Usage: node cli/run-sim.js [options]',
		'',
		'Simulation init options:',
		'  --sim=<name>              Simulation preset (see list below)',
		'  --sim_queue=<a,b,...>     Comma-separated queue of sim presets',
		'  --width=<n>               Tank width pixels  (default: 1000)',
		'  --height=<n>              Tank height pixels  (default: 750)',
		'  --num_boids=<n>           Initial boid population',
		'  --num_foods=<n>           Number of food items',
		'  --num_plants=<n>          Number of plants',
		'  --num_rocks=<n>           Number of rocks',
		'  --rounds=<n>              Rounds to run (0 = perpetual)',
		'  --timeout=<f>             Round timeout in seconds',
		'  --max_mutation=<f>        Mutation rate (0..1)',
		'  --cullpct=<f>             Cull fraction per round (0..1)',
		'  --sim_meta_params.KEY=v   Sticky session override (e.g. --sim_meta_params.num_boids=50)',
		'',
		'Runner options:',
		'  --speed=<mode>            full | throttled | natural  (default: full)',
		'  --duration=<seconds>      Stop after N seconds; 0 = unlimited  (default: 0)',
		'  --stats_interval=<ms>     Stats post period ms  (default: 5000)',
		'  --throttle_delay=<ms>     Tick delay in throttled mode ms  (default: 10)',
		'  --natural_fps=<n>         Target fps in natural mode  (default: 30)',
		'  --tank_file=<path>        Path to tank JSON file to import before starting',
		'  --quiet                   Suppress all but stats/lifecycle events from stdout',
		'  --help                    Print this message and exit',
		'',
		'Output: JSONL on stdout — { event, data, ts }',
		'Errors: stderr',
		'',
		'Simulation presets:',
		'  turning_training_easy / medium / hard / xhard',
		'  food_training_sim_easy / medium / hard / forever',
		'  edge_training, petri_dish',
		'  treasure_hunt_easy / hard / perpetual',
		'  obstacle_course, race_track',
		'  natural_tank, peaceful_tank, combat',
		'  finishing_school, learning_gym',
		'',
		'Examples:',
		'  node cli/run-sim.js --sim=peaceful_tank --duration=60',
		'  node cli/run-sim.js --sim=natural_tank --speed=full --duration=300 --quiet',
		'  node cli/run-sim.js --sim_queue=natural_tank,combat --rounds=5 --duration=600',
		'  node cli/run-sim.js --tank_file=./saves/tanks/my-tank.json --speed=full',
		'  node cli/run-sim.js --sim=natural_tank --sim_meta_params.num_boids=100 --duration=120',
		'',
	].join('\n'));
}

// ─── JSONL output ─────────────────────────────────────────────────────────────

// In --quiet mode only these events pass through to stdout.
const ALWAYS_EMIT = new Set([
	'autonomous.stats', 'sim_round', 'sim_complete', 'sim_new',
	'terminate', 'error',
	'cli.init', 'cli.start_autonomous', 'cli.terminate', 'cli.error',
	'cli.import_tank_result', 'cli.final_status',
]);

function emit(eventName, data, quiet = false) {
	if ( quiet && !ALWAYS_EMIT.has(eventName) ) { return; }
	process.stdout.write(JSON.stringify({ event: eventName, data, ts: Date.now() }) + '\n');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
	const args = parseArgs(process.argv);

	if ( args.help === 'true' || args.h === 'true' ) {
		printHelp();
		process.exit(0);
	}

	const quiet    = args.quiet === 'true' || args.quiet === true;
	const duration = typeof args.duration === 'number' ? args.duration : 0;
	const speed    = typeof args.speed    === 'string' ? args.speed    : 'full';

	// autonomous params — not forwarded to init
	const autoParams = {
		speed,
		stats_interval: typeof args.stats_interval === 'number' ? args.stats_interval : 5000,
		throttle_delay: typeof args.throttle_delay === 'number' ? args.throttle_delay : 10,
		natural_fps:    typeof args.natural_fps    === 'number' ? args.natural_fps    : 30,
	};

	// init params — forward everything except CLI-only keys
	const CLI_ONLY = new Set(['duration', 'speed', 'stats_interval', 'throttle_delay', 'natural_fps', 'quiet', 'help', 'h', 'tank_file']);
	const initParams = {
		width:  typeof args.width  === 'number' ? args.width  : 1000,
		height: typeof args.height === 'number' ? args.height : 750,
	};
	for ( const [k, v] of Object.entries(args) ) {
		if ( CLI_ONLY.has(k) || k === 'width' || k === 'height' ) { continue; }
		if ( v !== null && v !== undefined ) { initParams[k] = v; }
	}

	// sim_queue: may have arrived as comma-separated string if passed without shell quoting
	if ( typeof initParams.sim_queue === 'string' ) {
		initParams.sim_queue = initParams.sim_queue.split(',').map(s => s.trim()).filter(Boolean);
	}

	const tank_file = typeof args.tank_file === 'string' ? args.tank_file : null;

	// ─── Spawn worker ──────────────────────────────────────────────────────────

	const workerPath = resolve(__dirname, '../src/workers/vectorcosm.worker.js');
	const worker     = new Worker(workerPath);

	const pending = new Map();
	let nextReqId = 1;
	let exiting   = false;

	// Send a command and return a Promise that resolves with the response data.
	function send(commandName, data = {}) {
		return new Promise((resolve) => {
			const request_id = 'cli-' + (nextReqId++);
			pending.set(request_id, resolve);
			worker.postMessage({ functionName: commandName, data, request_id });
		});
	}

	// Route incoming worker messages: resolve pending Promises or emit as JSONL.
	worker.on('message', (msg) => {
		const { functionName, data, request_id } = msg;
		if ( request_id && pending.has(request_id) ) {
			pending.get(request_id)(data);
			pending.delete(request_id);
			return;
		}
		emit(functionName, data, quiet);
	});

	worker.on('error', (err) => {
		process.stderr.write(`[cli] Worker error: ${err.message}\n${err.stack || ''}\n`);
	});

	worker.on('exit', (code) => {
		if ( !exiting && code !== 0 ) {
			process.stderr.write(`[cli] Worker exited with code ${code}\n`);
			process.exit(code);
		}
	});

	// Graceful shutdown — fires once regardless of reason (duration, signal, or error).
	async function shutdown(reason = 'shutdown') {
		if ( exiting ) { return; }
		exiting = true;
		emit('cli.terminate', { reason }, false);
		try {
			// ask the worker for a final report; fall back after 2s if it doesn't respond
			const final = await Promise.race([
				send('terminate'),
				new Promise(r => setTimeout(() => r(null), 2000)),
			]);
			if ( final ) { emit('cli.final_status', final, false); }
		}
		catch (_) {}
		await worker.terminate();
		process.exit(0);
	}

	process.on('SIGINT',  () => shutdown('SIGINT'));
	process.on('SIGTERM', () => shutdown('SIGTERM'));

	// ─── Boot sequence ─────────────────────────────────────────────────────────

	emit('cli.init', initParams, false);
	await send('init', initParams);

	// optionally import a tank scene from a local file
	if ( tank_file ) {
		const tank_path = resolve(tank_file); // resolve relative to cwd
		emit('cli.load_tank_file', { path: tank_path }, false);
		let scene = null;
		try {
			const raw = await readFile(tank_path, 'utf8');
			scene = JSON.parse(raw);
		}
		catch (e) {
			process.stderr.write(`[cli] Failed to read tank file "${tank_path}": ${e.message}\n`);
		}
		if ( scene ) {
			const result = await send('import_tank', { scene });
			emit('cli.import_tank_result', result, false);
		}
	}

	emit('cli.start_autonomous', autoParams, false);
	await send('start_autonomous', autoParams);

	// schedule stop after --duration seconds
	if ( duration > 0 ) {
		setTimeout(() => shutdown('duration'), duration * 1000);
	}
}

main().catch((err) => {
	process.stderr.write(`[cli] Fatal: ${err.message}\n${err.stack || ''}\n`);
	process.exit(1);
});
