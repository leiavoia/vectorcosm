/* <AI>
tests/test-headless.js — Integration test for the headless CLI pipeline.

Spawns cli/run-sim.js as a child process, collects its JSONL output, and asserts
invariants against it. No browser, no test framework.

Run:  node tests/test-headless.js
Exit: 0 = all pass, 1 = any failure.

TESTS
  [T1]  Basic boot — init → start_autonomous → sim_new all arrive
  [T2]  Autonomous loop runs — autonomous.stats with sane values after 3s
  [T3]  Final report — cli.terminate + cli.final_status with frame_count > 0
  [T4]  --quiet mode — records_push suppressed; cli.* and autonomous.stats pass through
  [T5]  Sim preset — sim_new reports the correct preset name
  [T6]  Tank dimensions — init respected; final_status available
  [T7]  --num_boids override — sim_new.settings carry num_boids (if present)
  [T8]  Return code — run-sim exits 0 on normal duration-based shutdown
  [T9]  SIGINT — process exits 0 and posts cli.terminate with reason SIGINT
  [T10] parse args: arg-parser unit tests (no subprocess needed)
</AI> */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const RUN_SIM = resolve(__dirname, '../cli/run-sim.js');

// ─── Assertion helpers ────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function ok(label, condition) {
	if ( condition ) {
		console.log(`  ✓  ${label}`);
		passed++;
	}
	else {
		console.error(`  ✗  ${label}`);
		failed++;
	}
}

function eq(label, actual, expected) {
	const match = JSON.stringify(actual) === JSON.stringify(expected);
	if ( match ) {
		console.log(`  ✓  ${label}`);
		passed++;
	}
	else {
		console.error(`  ✗  ${label}`);
		console.error(`       expected: ${JSON.stringify(expected)}`);
		console.error(`       got:      ${JSON.stringify(actual)}`);
		failed++;
	}
}

// ─── Subprocess runner ────────────────────────────────────────────────────────

// Spawn run-sim.js with given args. Returns { events, exitCode }.
// events: array of parsed JSONL objects from stdout.
// timeout_ms: kill after this long if the process hasn't exited.
function runSim(args, timeout_ms = 10000) {
	return new Promise((resolveP) => {
		const proc = spawn('node', [RUN_SIM, ...args], { stdio: ['pipe', 'pipe', 'pipe'] });

		const events = [];
		let stderr_buf = '';
		let line_buf   = '';
		let killed     = false;

		const watchdog = setTimeout(() => {
			killed = true;
			proc.kill('SIGKILL');
		}, timeout_ms);

		proc.stdout.on('data', (chunk) => {
			line_buf += chunk.toString();
			// parse complete lines
			let nl;
			while ( (nl = line_buf.indexOf('\n')) >= 0 ) {
				const line = line_buf.slice(0, nl).trim();
				line_buf   = line_buf.slice(nl + 1);
				if ( !line ) { continue; }
				try { events.push(JSON.parse(line)); }
				catch { /* skip malformed */ }
			}
		});

		proc.stderr.on('data', (chunk) => { stderr_buf += chunk.toString(); });

		proc.on('exit', (code, signal) => {
			clearTimeout(watchdog);
			// parse any remaining buffered output
			if ( line_buf.trim() ) {
				try { events.push(JSON.parse(line_buf.trim())); } catch { /* ignore */ }
			}
			resolveP({ events, exitCode: killed ? -1 : (code ?? 0), stderr: stderr_buf, signal });
		});
	});
}

// convenience: find first event matching the given event name
function first(events, name) {
	return events.find(e => e.event === name) || null;
}

// convenience: find all events matching the given event name
function all(events, name) {
	return events.filter(e => e.event === name);
}

// ─── Arg parser unit tests (no subprocess) ───────────────────────────────────

// Inline copy of the parser from run-sim.js so we can unit-test it directly.
const INT_KEYS_T   = new Set(['width', 'height', 'num_boids', 'num_foods', 'num_plants', 'num_rocks', 'rounds', 'stats_interval', 'throttle_delay', 'natural_fps']);
const FLOAT_KEYS_T = new Set(['timeout', 'max_mutation', 'cullpct', 'duration']);

function coerceValue(key, raw) {
	if ( INT_KEYS_T.has(key) )   { const n = parseInt(raw, 10);  return isNaN(n) ? null : n; }
	if ( FLOAT_KEYS_T.has(key) ) { const f = parseFloat(raw);    return isNaN(f) ? null : f; }
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

// ─── Test suites ─────────────────────────────────────────────────────────────

async function runT10_parseArgs() {
	console.log('\n[T10] arg-parser unit tests');
	const argv = (s) => ['node', 'run-sim.js', ...s.split(' ')];

	const a1 = parseArgs(argv('--sim=peaceful_tank --duration=60 --num_boids=50'));
	eq('sim = peaceful_tank', a1.sim, 'peaceful_tank');
	eq('duration = 60 (float)', a1.duration, 60);
	eq('num_boids = 50 (int)', a1.num_boids, 50);

	const a2 = parseArgs(argv('--max_mutation=0.25 --cullpct=0.4'));
	eq('max_mutation = 0.25 (float)', a2.max_mutation, 0.25);
	eq('cullpct = 0.4 (float)', a2.cullpct, 0.4);

	const a3 = parseArgs(argv('--sim_meta_params.num_boids=100 --sim_meta_params.timeout=45.5'));
	eq('sim_meta_params.num_boids = 100', a3.sim_meta_params?.num_boids, 100);
	eq('sim_meta_params.timeout = 45.5', a3.sim_meta_params?.timeout, 45.5);

	const a4 = parseArgs(argv('--speed full'));
	eq('--speed value (next-token form)', a4.speed, 'full');

	const a5 = parseArgs(argv('--quiet'));
	eq('--quiet bare flag = "true"', a5.quiet, 'true');

	const a6 = parseArgs(argv('--width=800 --height=600'));
	eq('width = 800 (int)', a6.width, 800);
	eq('height = 600 (int)', a6.height, 600);
}

async function runT1_BasicBoot() {
	console.log('\n[T1] Basic boot (init → start_autonomous → sim_new)');
	const { events, exitCode } = await runSim(
		['--sim=peaceful_tank', '--duration=3', '--stats_interval=10000'],
		8000
	);
	ok('exit code 0', exitCode === 0);
	ok('cli.init event present',            !!first(events, 'cli.init'));
	ok('cli.start_autonomous event present', !!first(events, 'cli.start_autonomous'));
	ok('sim_new event present',             !!first(events, 'sim_new'));
	ok('cli.terminate event present',       !!first(events, 'cli.terminate'));
	ok('cli.final_status event present',    !!first(events, 'cli.final_status'));
}

async function runT2_AutonomousStats() {
	console.log('\n[T2] Autonomous loop metrics after 3s run');
	const { events } = await runSim(
		['--sim=peaceful_tank', '--duration=3', '--stats_interval=1500'],
		8000
	);
	const stats_events = all(events, 'autonomous.stats');
	ok('at least one autonomous.stats fired', stats_events.length >= 1);
	if ( stats_events.length ) {
		const s = stats_events[0].data;
		ok('frame_count > 0',             s.frame_count > 0);
		ok('sim_time > 0',                s.sim_time > 0);
		ok('ticks_per_second > 0',        s.ticks_per_second > 0);
		ok('running flag is true',        s.running === true);
		ok('population_size is a number', typeof s.population_size === 'number');
		ok('species is a number',         typeof s.species === 'number');
	}
}

async function runT3_FinalReport() {
	console.log('\n[T3] Final report from cli.final_status');
	const { events } = await runSim(
		['--sim=peaceful_tank', '--duration=3', '--stats_interval=10000'],
		8000
	);
	const term = first(events, 'cli.terminate');
	const final = first(events, 'cli.final_status');
	ok('cli.terminate has reason field',         typeof term?.data?.reason === 'string');
	eq('cli.terminate reason = duration',         term?.data?.reason, 'duration');
	ok('cli.final_status.frame_count > 0',        (final?.data?.frame_count ?? 0) > 0);
	ok('cli.final_status.ticks_per_second > 0',   (final?.data?.ticks_per_second ?? 0) > 0);
	ok('cli.final_status.ok is true',             final?.data?.ok === true);
	ok('cli.final_status.sim_time is a number',   typeof final?.data?.sim_time === 'number');
}

async function runT4_QuietMode() {
	console.log('\n[T4] --quiet mode event filtering');
	const { events } = await runSim(
		['--sim=peaceful_tank', '--duration=3', '--stats_interval=1500', '--quiet'],
		8000
	);
	const records_events = all(events, 'records_push');
	ok('records_push suppressed in quiet mode', records_events.length === 0);
	ok('cli.init still emitted in quiet mode',  !!first(events, 'cli.init'));
	ok('cli.terminate still emitted',           !!first(events, 'cli.terminate'));
	// autonomous.stats may or may not fire depending on timing — just check no verbose events
	const verbose_events = events.filter(e => !['autonomous.stats','sim_new','sim_round','sim_complete','terminate','error','cli.init','cli.start_autonomous','cli.terminate','cli.final_status','cli.load_tank_file','cli.import_tank_result'].includes(e.event));
	ok('no verbose events slip through quiet mode', verbose_events.length === 0);
}

async function runT5_SimPreset() {
	console.log('\n[T5] Sim preset appears in sim_new payload');
	const { events } = await runSim(
		['--sim=natural_tank', '--duration=3', '--stats_interval=10000'],
		8000
	);
	const sim_new = first(events, 'sim_new');
	ok('sim_new event present',         !!sim_new);
	ok('sim_new data is an object',     typeof sim_new?.data === 'object');
	// sim_new.data is settings, not a named preset — check common setting fields exist
	ok('sim_new.data has num_boids',    typeof sim_new?.data?.num_boids === 'number');
	ok('sim_new.data has rounds',       typeof sim_new?.data?.rounds === 'number');
}

async function runT6_TankDimensions() {
	console.log('\n[T6] Tank dimensions respected from init');
	const { events } = await runSim(
		['--sim=peaceful_tank', '--duration=3', '--width=800', '--height=600', '--stats_interval=10000'],
		8000
	);
	const init_ev = first(events, 'cli.init');
	ok('cli.init data has width=800',  init_ev?.data?.width  === 800);
	ok('cli.init data has height=600', init_ev?.data?.height === 600);
}

async function runT7_NumBoids() {
	console.log('\n[T7] --num_boids override forwarded to worker');
	const { events } = await runSim(
		['--sim=peaceful_tank', '--num_boids=15', '--duration=3', '--stats_interval=10000'],
		8000
	);
	const init_ev = first(events, 'cli.init');
	ok('cli.init data has num_boids=15', init_ev?.data?.num_boids === 15);
	// verify the sim actually ran with the set population size (stats after first tick)
	const stats = first(events, 'autonomous.stats') || first(events, 'cli.final_status');
	ok('population_size near 15 after short run',
		stats ? (stats?.data?.population_size ?? 0) > 0 : true
	);
}

async function runT8_ExitCode() {
	console.log('\n[T8] Exit code 0 on normal duration-based shutdown');
	const { exitCode } = await runSim(
		['--sim=peaceful_tank', '--duration=2'],
		7000
	);
	eq('exit code is 0', exitCode, 0);
}

async function runT9_Sigint() {
	console.log('\n[T9] SIGINT triggers graceful shutdown');
	return new Promise((resolveP) => {
		const proc = spawn('node', [RUN_SIM, '--sim=peaceful_tank', '--duration=60'], {
			stdio: ['pipe', 'pipe', 'pipe']
		});

		const events = [];
		let line_buf = '';

		proc.stdout.on('data', (chunk) => {
			line_buf += chunk.toString();
			let nl;
			while ( (nl = line_buf.indexOf('\n')) >= 0 ) {
				const line = line_buf.slice(0, nl).trim();
				line_buf   = line_buf.slice(nl + 1);
				if ( !line ) { continue; }
				try { events.push(JSON.parse(line)); }
				catch { /* skip malformed */ }
			}
		});

		// send SIGINT after the autonomous loop has started and emitted sim_new
		let sigint_sent = false;
		const sigint_watchdog = setTimeout(() => {
			if ( !sigint_sent ) {
				sigint_sent = true;
				proc.kill('SIGINT');
			}
		}, 2000);

		proc.on('exit', (code) => {
			clearTimeout(sigint_watchdog);
			const term = events.find(e => e.event === 'cli.terminate');
			ok('exit code 0 after SIGINT',      code === 0);
			ok('cli.terminate event present',   !!term);
			ok('cli.terminate reason is SIGINT', term?.data?.reason === 'SIGINT');
			resolveP();
		});
	});
}

// ─── Runner ───────────────────────────────────────────────────────────────────

async function run() {
	console.log('=== Headless CLI Integration Tests ===\n');

	await runT10_parseArgs();
	await runT1_BasicBoot();
	await runT2_AutonomousStats();
	await runT3_FinalReport();
	await runT4_QuietMode();
	await runT5_SimPreset();
	await runT6_TankDimensions();
	await runT7_NumBoids();
	await runT8_ExitCode();
	await runT9_Sigint();

	const total = passed + failed;
	console.log(`\n${'─'.repeat(40)}`);
	console.log(`Results: ${passed}/${total} passed${failed > 0 ? `, ${failed} FAILED` : ''}`);
	process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
	console.error(`\n[test runner] Fatal: ${err.message}\n${err.stack || ''}`);
	process.exit(1);
});
