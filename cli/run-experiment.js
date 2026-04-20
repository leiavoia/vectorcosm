/* <AI>
cli/run-experiment.js — Long-running evolution experiment runner with checkpointing.

TWO OPERATING MODES (auto-detected from first sim_new event):

  ROUND MODE (round-based training sims: timeout > 0)
    - Checkpoint every --checkpoint_every rounds  (default: 5)
    - Logs one entry per round to events.jsonl
    - Stops when: sim reaches its built-in termination (rounds exhausted OR min_avg_score met),
      OR when --rounds cap is hit, OR --duration wall-seconds expire
    - Checkpoint files: checkpoint-R<N>.tank.json

  NATURAL MODE (NaturalTankSimulation: timeout = 0, perpetual)
    - Checkpoint every --checkpoint_interval sim-seconds  (default: 300)
    - Logs one entry per autonomous.stats heartbeat to events.jsonl
    - Stops only when: --duration wall-seconds expire, or SIGINT/SIGTERM
    - Checkpoint files: checkpoint-T<sim_seconds>.tank.json

USAGE
  node cli/run-experiment.js --name=<name> [options]
  node cli/run-experiment.js --name=evo-study --sim=natural_tank --duration=3600
  node cli/run-experiment.js --name=evo-study --sim=turning_training_easy --rounds=50
  node cli/run-experiment.js --name=evo-study --resume
  node cli/run-experiment.js --name=evo-study --sim=natural_tank --sim_meta_params.num_boids=150

OPTIONS
  --name=<name>              Experiment name / output folder (required)
  --sim=<name>               Sim preset  (default: natural_tank)
  --speed=<mode>             full | throttled | natural  (default: full)
  --duration=<s>             Wall-clock stop  (0 = unlimited; default: 0)
  --output=<dir>             Base output directory  (default: ./saves/experiments)
  --resume                   Resume from last checkpoint in <output>/<name>/
  --status_interval=<ms>     Print status to stderr every N ms  (default: 10000)
  --quiet                    Suppress periodic status messages
  --help                     Print help and exit

  ROUND MODE options:
  --rounds=<n>               Cap: stop after N rounds  (0 = sim decides; default: 0)
  --checkpoint_every=<n>     Checkpoint every N rounds  (default: 5)

  NATURAL MODE options:
  --checkpoint_interval=<s>  Checkpoint every N sim-seconds  (default: 300)
  --stats_interval=<ms>      Heartbeat / log interval ms  (default: 5000)

  Plus sim params: --num_boids, --max_mutation, --cullpct, --timeout, etc.
  Plus: --sim_meta_params.KEY=value

OUTPUT (all written to <output>/<name>/)
  config.json            — experiment config (written/updated at start)
  events.jsonl           — one JSON line per round (round mode) or heartbeat (natural mode)
  checkpoint-R<N>.tank.json  — round-mode checkpoint after round N
  checkpoint-T<S>.tank.json  — natural-mode checkpoint at sim-second S
  summary.json           — final summary (written on clean shutdown)

RESUME
  --resume reads the latest checkpoint (either type) and calls import_tank to restore state.
  Sim type is restored from saved sim_settings.simtype.
</AI> */

import { Worker } from 'worker_threads';
import { readFile, writeFile, mkdir, readdir } from 'fs/promises';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// ─── Arg parser (mirrors run-sim.js) ─────────────────────────────────────────

const INT_KEYS = new Set([
	'num_boids', 'num_foods', 'num_plants', 'num_rocks', 'rounds',
	'throttle_delay', 'natural_fps', 'checkpoint_every', 'checkpoint_interval',
	'status_interval', 'stats_interval', 'width', 'height',
]);
const FLOAT_KEYS = new Set(['timeout', 'max_mutation', 'cullpct', 'duration']);

function coerceValue(key, raw) {
	if ( INT_KEYS.has(key) )   { const n = parseInt(raw, 10);  return isNaN(n) ? null : n; }
	if ( FLOAT_KEYS.has(key) ) { const f = parseFloat(raw);    return isNaN(f) ? null : f; }
	return raw;
}

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

// ─── Help ─────────────────────────────────────────────────────────────────────

function printHelp() {
	process.stdout.write([
		'Usage: node cli/run-experiment.js --name=<name> [options]',
		'',
		'  --name=<name>              Experiment name / output folder (required)',
		'  --sim=<name>               Sim preset  (default: natural_tank)',
		'  --speed=<mode>             full | throttled | natural  (default: full)',
		'  --duration=<s>             Wall-clock stop  (0 = unlimited; default: 0)',
		'  --output=<dir>             Base output dir  (default: ./saves/experiments)',
		'  --resume                   Resume from last checkpoint',
		'  --status_interval=<ms>     Status every N ms to stderr  (default: 10000)',
		'  --quiet                    Suppress periodic status',
		'  --help                     Print help',
		'',
		'  Round-mode options (round-based training sims):',
		'  --rounds=<n>               Cap rounds  (0 = sim decides; default: 0)',
		'  --checkpoint_every=<n>     Checkpoint every N rounds  (default: 5)',
		'',
		'  Natural-mode options (NaturalTankSimulation, perpetual):',
		'  --checkpoint_interval=<s>  Checkpoint every N sim-seconds  (default: 300)',
		'  --stats_interval=<ms>      Heartbeat / log interval ms  (default: 5000)',
		'',
		'  Plus sim params: --num_boids, --max_mutation, --cullpct, --timeout, etc.',
		'  Plus: --sim_meta_params.KEY=value',
		'',
		'Examples:',
		'  node cli/run-experiment.js --name=evo-study --sim=natural_tank --duration=3600',
		'  node cli/run-experiment.js --name=evo-study --sim=turning_training_easy --rounds=50',
		'  node cli/run-experiment.js --name=evo-study --resume',
		'',
	].join('\n'));
}

// ─── JSONL output ─────────────────────────────────────────────────────────────

function emit(event, data) {
	process.stdout.write(JSON.stringify({ event, data, ts: Date.now() }) + '\n');
}

// ─── Find latest checkpoint ───────────────────────────────────────────────────
// Scans dir for checkpoint-R<N>.tank.json (round mode) and checkpoint-T<S>.tank.json (natural mode).
// Returns { file, label, type:'round'|'natural', round, sim_time } for the most recent file,
// where "most recent" is determined by mtime (actual last-written file wins regardless of label).

async function findLatestCheckpoint(dir) {
	let files;
	try { files = await readdir(dir); }
	catch (_) { return null; }
	let best = null;
	for ( const f of files ) {
		const mr = f.match(/^checkpoint-R(\d+)\.tank\.json$/);
		const mt = f.match(/^checkpoint-T(\d+)\.tank\.json$/);
		if ( !mr && !mt ) { continue; }
		const entry = {
			file:     join(dir, f),
			type:     mr ? 'round' : 'natural',
			round:    mr ? parseInt(mr[1], 10) : 0,
			sim_time: mt ? parseInt(mt[1], 10) : 0,
			label:    mr ? `round ${mr[1]}` : `sim-time ${mt[1]}s`,
		};
		if ( !best || entry.file > best.file ) { best = entry; } // lexicographic: R/T + zero-padded OK, otherwise mtime would be better
	}
	// re-sort by mtime if we found candidates (most recently written = true latest)
	if ( best ) {
		const { stat } = await import('fs/promises');
		let latestMtime = 0;
		let latestEntry = null;
		for ( const f of files ) {
			const mr = f.match(/^checkpoint-R(\d+)\.tank\.json$/);
			const mt = f.match(/^checkpoint-T(\d+)\.tank\.json$/);
			if ( !mr && !mt ) { continue; }
			try {
				const s = await stat(join(dir, f));
				if ( s.mtimeMs > latestMtime ) {
					latestMtime = s.mtimeMs;
					latestEntry = {
						file:     join(dir, f),
						type:     mr ? 'round' : 'natural',
						round:    mr ? parseInt(mr[1], 10) : 0,
						sim_time: mt ? parseInt(mt[1], 10) : 0,
						label:    mr ? `round ${mr[1]}` : `sim-time ${mt[1]}s`,
					};
				}
			}
			catch (_) {}
		}
		return latestEntry;
	}
	return null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
	const args = parseArgs(process.argv);

	if ( args.help === 'true' || args.h === 'true' ) {
		printHelp();
		process.exit(0);
	}

	if ( !args.name || typeof args.name !== 'string' ) {
		process.stderr.write('[experiment] --name is required.\n');
		process.exit(1);
	}

	const expName           = args.name;
	const baseDir           = typeof args.output            === 'string' ? args.output            : './saves/experiments';
	const expDir            = resolve(baseDir, expName);
	const targetRounds      = typeof args.rounds            === 'number' ? args.rounds            : 0;   // 0 = sim decides
	const ckptEvery         = typeof args.checkpoint_every  === 'number' ? args.checkpoint_every  : 5;   // round mode
	const ckptIntervalSecs  = typeof args.checkpoint_interval === 'number' ? args.checkpoint_interval : 300; // natural mode (sim-seconds)
	const statsIntervalMs   = typeof args.stats_interval    === 'number' ? args.stats_interval    : 5000; // natural mode heartbeat
	const duration          = typeof args.duration          === 'number' ? args.duration          : 0;   // wall-seconds, 0=unlimited
	const speed             = typeof args.speed             === 'string' ? args.speed             : 'full';
	const doResume          = args.resume === 'true' || args.resume === true;
	const quiet             = args.quiet  === 'true' || args.quiet  === true;
	const statusMs          = typeof args.status_interval   === 'number' ? args.status_interval   : 10000;

	// build init params — forward all non-experiment keys
	const EXP_ONLY = new Set([
		'name', 'output', 'rounds', 'checkpoint_every', 'checkpoint_interval',
		'speed', 'resume', 'quiet', 'status_interval', 'stats_interval', 'duration',
		'throttle_delay', 'natural_fps', 'help', 'h',
	]);
	const initParams = {
		width:  typeof args.width  === 'number' ? args.width  : 1000,
		height: typeof args.height === 'number' ? args.height : 750,
	};
	for ( const [k, v] of Object.entries(args) ) {
		if ( EXP_ONLY.has(k) || k === 'width' || k === 'height' ) { continue; }
		if ( v !== null && v !== undefined ) { initParams[k] = v; }
	}

	// default sim preset when not resuming
	if ( !initParams.sim && !doResume ) { initParams.sim = 'natural_tank'; }

	// sim_queue comma-string → array
	if ( typeof initParams.sim_queue === 'string' ) {
		initParams.sim_queue = initParams.sim_queue.split(',').map(s => s.trim()).filter(Boolean);
	}

	// always enable autonomous.stats — heartbeat for natural mode, status telemetry for round mode
	const autoParams = {
		speed,
		stats_interval: statsIntervalMs,
		throttle_delay: typeof args.throttle_delay === 'number' ? args.throttle_delay : 10,
		natural_fps:    typeof args.natural_fps    === 'number' ? args.natural_fps    : 30,
	};

	// ─── Setup output dir ─────────────────────────────────────────────────────

	await mkdir(expDir, { recursive: true });

	const eventsLogFile = join(expDir, 'events.jsonl');
	const configFile    = join(expDir, 'config.json');
	const summaryFile   = join(expDir, 'summary.json');

	// ─── Load checkpoint if resuming ──────────────────────────────────────────

	let checkpointScene  = null;
	let resumeRound      = 0;   // rounds completed before resume (round mode)
	let resumeSimTime    = 0;   // sim-seconds completed before resume (natural mode)

	if ( doResume ) {
		const ckpt = await findLatestCheckpoint(expDir);
		if ( !ckpt ) {
			process.stderr.write(`[experiment] --resume: no checkpoint found in ${expDir}\n`);
			process.exit(1);
		}
		process.stderr.write(`[experiment] resuming from ${ckpt.file} (after ${ckpt.label})\n`);
		const raw = await readFile(ckpt.file, 'utf8');
		checkpointScene = JSON.parse(raw);
		resumeRound   = ckpt.round;
		resumeSimTime = ckpt.sim_time;
		// import_tank restores the sim from sim_settings.simtype; don't override
		delete initParams.sim;
		delete initParams.sim_queue;
	}

	// ─── Spawn worker ─────────────────────────────────────────────────────────

	const workerPath = resolve(__dirname, '../src/workers/vectorcosm.worker.js');
	const worker     = new Worker(workerPath);

	const { WorkerThreadTransport } = await import('../src/protocol/transports.js');
	const { default: WorkerClient } = await import('../src/protocol/WorkerClient.js');

	const transport = new WorkerThreadTransport( worker );
	const client    = new WorkerClient( transport, { prefix: 'exp', timeout: 0 } );

	let exiting = false;

	// round-mode tracking
	let roundCount = resumeRound;

	// natural-mode tracking
	let nextCheckpointSimTime = resumeSimTime + ckptIntervalSecs;
	let lastLoggedSimTime     = resumeSimTime;

	// sim mode: null until first sim_new fires
	let simMode = null;  // 'round' | 'natural'

	// log buffer — flushed every LOG_FLUSH_EVERY events
	let logBuf = '';
	const LOG_FLUSH_EVERY = 5;
	let logEventCount = 0;
	let statusTimer = null;

	// ─── Checkpoint ───────────────────────────────────────────────────────────

	async function saveCheckpoint(label) {
		const scene = await client.call('export_tank').catch(() => null);
		if ( !scene ) {
			process.stderr.write(`[experiment] checkpoint "${label}" failed — export_tank returned null.\n`);
			return;
		}
		const file = join(expDir, `checkpoint-${label}.tank.json`);
		await writeFile(file, JSON.stringify(scene), 'utf8').catch(e =>
			process.stderr.write(`[experiment] checkpoint write error: ${e.message}\n`)
		);
		if ( !quiet ) { process.stderr.write(`[experiment] checkpoint → ${file}\n`); }
		emit('exp.checkpoint', { label, file });
	}

	// ─── Log flush ────────────────────────────────────────────────────────────

	async function flushLog() {
		if ( !logBuf ) { return; }
		const buf = logBuf;
		logBuf = '';
		await writeFile(eventsLogFile, buf, { flag: 'a' }).catch(e =>
			process.stderr.write(`[experiment] log write error: ${e.message}\n`)
		);
	}

	async function appendLog(entry) {
		logBuf += JSON.stringify({ ts: Date.now(), ...entry }) + '\n';
		logEventCount++;
		if ( logEventCount % LOG_FLUSH_EVERY === 0 ) { await flushLog(); }
	}

	// ─── Graceful shutdown ────────────────────────────────────────────────────

	async function shutdown(reason = 'shutdown') {
		if ( exiting ) { return; }
		exiting = true;
		if ( statusTimer !== null ) { clearInterval(statusTimer); statusTimer = null; }
		process.stderr.write(`[experiment] shutting down (${reason}) ...\n`);

		await flushLog();

		// final checkpoint with whatever the current state is
		if ( simMode === 'round' && roundCount > 0 ) {
			await saveCheckpoint(`R${roundCount}`);
		}
		else if ( simMode === 'natural' ) {
			// use last known sim_time for label; fall back to round-style if we never got any
			const s = await client.call('get_status').catch(() => null);
			const t = s?.sim_time ? Math.floor(s.sim_time) : Math.floor(resumeSimTime);
			await saveCheckpoint(`T${t}`);
		}
		else if ( roundCount > 0 ) {
			// mode unknown (shutdown before first sim_new?), use round count
			await saveCheckpoint(`R${roundCount}`);
		}

		let finalStatus = null;
		try {
			finalStatus = await Promise.race([
				client.call('terminate'),
				new Promise(r => setTimeout(() => r(null), 2000)),
			]);
		}
		catch (_) {}

		const summary = {
			name:             expName,
			reason,
			sim_mode:         simMode,
			rounds_completed: roundCount,
			target_rounds:    targetRounds,
			config:           initParams,
			final_status:     finalStatus,
		};
		await writeFile(summaryFile, JSON.stringify(summary, null, 2), 'utf8').catch(() => {});
		emit('exp.summary', summary);

		await worker.terminate();
		process.exit(0);
	}

	process.on('SIGINT',  () => shutdown('SIGINT'));
	process.on('SIGTERM', () => shutdown('SIGTERM'));

	// ─── Worker event routing ───────────────────────────────────────────────

	// sim_new: detect mode from the first sim that loads
	client.on('sim_new', (data) => {
		if ( simMode === null ) {
			// timeout === 0 (or missing) → natural/perpetual sim; otherwise round-based training
			simMode = ( !data.timeout ) ? 'natural' : 'round';
			process.stderr.write(`[experiment] sim mode: ${simMode}  (simtype=${data.simtype ?? 'unknown'})\n`);
		}
		emit('sim_new', data);
	});

	// ── ROUND MODE: sim_round is the heartbeat ────────────────────────────
	client.on('sim_round', async (data) => {
		roundCount++;
		emit('sim_round', data);
		await appendLog({ event: 'sim_round', exp_round: roundCount, ...data });

		if ( ckptEvery > 0 && roundCount % ckptEvery === 0 ) {
			await saveCheckpoint(`R${roundCount}`);
		}
		// explicit round cap (in addition to sim's own stop conditions)
		if ( targetRounds > 0 && roundCount >= targetRounds ) {
			await shutdown('rounds_complete');
		}
	});

	// ── ROUND MODE: training sim reached its own stop condition ───────────
	client.on('sim_complete', async (data) => {
		emit('sim_complete', data);
		// if there is nothing left in the queue, the experiment is done
		if ( data.in_queue === 0 ) {
			await shutdown('sim_complete');
		}
	});

	// ── NATURAL MODE: autonomous.stats is the heartbeat ───────────────────
	client.on('autonomous.stats', async (data) => {
		emit('autonomous.stats', data);

		if ( simMode === 'natural' ) {
			const sim_time = data.sim_time ?? 0;
			await appendLog({ event: 'autonomous.stats', ...data });
			lastLoggedSimTime = sim_time;

			// checkpoint when we cross the next interval threshold
			if ( sim_time >= nextCheckpointSimTime ) {
				const label = `T${Math.floor(sim_time)}`;
				await saveCheckpoint(label);
				// advance threshold by interval, skip missed intervals
				while ( nextCheckpointSimTime <= sim_time ) {
					nextCheckpointSimTime += ckptIntervalSecs;
				}
			}
		}
	});

	worker.on('error', (err) => {
		process.stderr.write(`[experiment] Worker error: ${err.message}\n${err.stack || ''}\n`);
	});

	worker.on('exit', (code) => {
		if ( !exiting && code !== 0 ) {
			process.stderr.write(`[experiment] Worker exited with code ${code}\n`);
			process.exit(code);
		}
	});

	// ─── Periodic status line to stderr ──────────────────────────────────────

	if ( statusMs > 0 && !quiet ) {
		statusTimer = setInterval(async () => {
			if ( exiting ) { return; }
			const s = await client.call('get_status').catch(() => null);
			if ( !s ) { return; }
			if ( simMode === 'round' ) {
				process.stderr.write(
					`[experiment] round=${roundCount}/${targetRounds || '∞'}  ` +
					`tps=${s.ticks_per_second}  pop=${s.population_size}  species=${s.species}\n`
				);
			}
			else {
				const t = s.sim_time ? s.sim_time.toFixed(0) : '?';
				process.stderr.write(
					`[experiment] sim_time=${t}s  next_ckpt=${nextCheckpointSimTime}s  ` +
					`tps=${s.ticks_per_second}  pop=${s.population_size}  species=${s.species}\n`
				);
			}
		}, statusMs);
	}

	// ─── Boot sequence ────────────────────────────────────────────────────────

	await writeFile(configFile, JSON.stringify({
		name:                   expName,
		init:                   initParams,
		auto:                   autoParams,
		target_rounds:          targetRounds,
		checkpoint_every:       ckptEvery,
		checkpoint_interval:    ckptIntervalSecs,
		duration,
		resumed_from_round:     resumeRound,
		resumed_from_sim_time:  resumeSimTime,
		started_at:             new Date().toISOString(),
	}, null, 2), 'utf8');

	emit('exp.start', { name: expName, resume: doResume, resume_round: resumeRound, resume_sim_time: resumeSimTime });

	await client.call('init', initParams);

	if ( checkpointScene ) {
		await client.call('import_tank', { scene: checkpointScene });
		emit('exp.resumed', { round: resumeRound, sim_time: resumeSimTime });
	}

	await client.call('start_autonomous', autoParams);
	emit('exp.running', { name: expName, speed, target_rounds: targetRounds, duration });

	if ( duration > 0 ) {
		setTimeout(() => shutdown('duration'), duration * 1000);
	}
}

main().catch(err => {
	process.stderr.write(`[experiment] Fatal: ${err.message}\n${err.stack || ''}\n`);
	process.exit(1);
});
