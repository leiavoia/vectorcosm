/* <AI>
cli/profile-sim.js — Playwright/CDP browser profiler for Vectorcosm.

Launches headless Chromium, opens lab.html with sim params, warms up,
then captures:
  - TPS/frame stats via window.vectorcosmLab.status() sampled once per second
  - V8 CPU profile via CDP Tracing (disabled-by-default-v8.cpu_profiler)
  - Chrome trace (optional, timeline categories, Perfetto-compatible JSON)

When CPU profiling is enabled (default), uses CDP Tracing instead of Playwright
tracing. Both CPU profile and Chrome trace come from the same capture. Thread
selection (--thread=worker|main) controls which thread's CPU profile is extracted.

When CPU profiling is disabled (--no-cpuprofile), falls back to Playwright tracing
for the Chrome trace (.zip format for Playwright Trace Viewer).

Outputs:
  profile-output/cpuprofile-<ts>.json — V8 CPU profile (for analyze-profile.js)
  profile-output/trace-<ts>.json      — Chrome trace (open in https://ui.perfetto.dev)
  profile-output/summary-<ts>.json    — TPS/stats summary

REQUIRES
  npm install -D playwright
  npx playwright install chromium
  A Vite server must be running: npm run dev  OR  npm run preview

USAGE
  node cli/profile-sim.js [options]
  node cli/profile-sim.js --sim=peaceful_tank --duration=30
  node cli/profile-sim.js --sim=natural_tank --num_boids=200 --duration=60 --no-trace
  node cli/profile-sim.js --tank-id=my-saved-tank --duration=60

OPTIONS
  --sim=<name>           Sim preset (default: peaceful_tank)
  --num_boids=<n>        Population size
  --speed=<mode>         throttled | full | natural (default: throttled)
  --warmup=<s>           Warmup seconds (default: 60)
  --duration=<s>         Capture seconds (default: 30)
  --url=<url>            Server URL (default: http://localhost:5173)
  --output=<dir>         Output directory (default: ./profile-output)
  --thread=<t>           worker | main (default: worker)
  --tank-id=<name>       Load a saved tank from saves/tanks/<name>.tank.json instead of
                         using a sim preset. Suppresses sim/num_boids/width/height
                         defaults so the tank file controls those settings.
                         To obtain a tank file: use the Tank Library "Export" button
                         in the web UI → place the downloaded .tank.json in saves/tanks/.
                         NOTE: tanks saved via the browser "Save" button go to IndexedDB
                         (browser-only) and are NOT accessible here; export to file first.
  --no-cpuprofile        Skip V8 CPU profile capture
  --no-trace             Skip Chrome trace file
  --headful              Show browser window
  --help                 Print help
  Plus sim_meta_params dot-notation: --sim_meta_params.KEY=value

Default tank size: 3000x4000 (override with --width, --height; ignored when --tank-id is used)
</AI> */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdir, writeFile, access } from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// ─── Arg parser ───────────────────────────────────────────────────────────────

const INT_KEYS   = new Set(['num_boids', 'num_foods', 'num_plants', 'num_rocks', 'rounds', 'warmup', 'duration', 'natural_fps']);
const FLOAT_KEYS = new Set(['timeout', 'max_mutation', 'cullpct', 'throttle_delay']);

function coerceValue(key, raw) {
	if ( INT_KEYS.has(key) )   { const n = parseInt(raw, 10);  return isNaN(n) ? raw : n; }
	if ( FLOAT_KEYS.has(key) ) { const f = parseFloat(raw);    return isNaN(f) ? raw : f; }
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
		'Usage: node cli/profile-sim.js [options]',
		'',
		'  --sim=<name>           Sim preset  (default: peaceful_tank)',
		'  --num_boids=<n>        Population size',
		'  --speed=<mode>         throttled | full | natural  (default: throttled)',
		'  --warmup=<s>           Warmup seconds  (default: 60)',
		'  --duration=<s>         Capture seconds  (default: 30)',
		'  --url=<url>            Vite server URL  (default: http://localhost:5173)',
		'  --output=<dir>         Output directory  (default: ./profile-output)',
		'  --thread=<t>           worker | main  (default: worker)',
		'  --tank-id=<name>       Load saves/tanks/<name>.tank.json instead of a sim preset.',
		'                         Suppresses sim/num_boids/width/height defaults.',
		'                         Export from the web UI Tank Library → place .tank.json in',
		'                         saves/tanks/. (IndexedDB saves are NOT accessible here;',
		'  --no-cpuprofile        Skip V8 CPU profile capture',
		'  --no-trace             Skip Chrome trace file',
		'  --headful              Show browser window',
		'  --help                 Print help',
		'',
		'  Plus any sim param: --sim_meta_params.KEY=value',
		'',
		'Requirements:',
		'  npm install -D playwright && npx playwright install chromium',
		'  npm run dev   (or npm run preview for production build)',
		'',
		'Examples:',
		'  node cli/profile-sim.js --sim=peaceful_tank --duration=30',
		'  node cli/profile-sim.js --sim=natural_tank --num_boids=200 --duration=60',
		'  node cli/profile-sim.js --sim=natural_tank --warmup=5 --no-cpuprofile',
		'  node cli/profile-sim.js --tank-id=my-saved-tank --duration=60',
		'',
	].join('\n'));
}

// ─── Build lab URL from args ──────────────────────────────────────────────────
// Forward all sim-relevant params as URL query string; strip profiler-only keys.

const PROFILER_ONLY = new Set([
	'url', 'output', 'warmup', 'duration', 'no-trace', 'no-cpuprofile',
	'thread', 'headful', 'help', 'h', 'tank-id',
]);

function buildLabUrl(base, args) {
	const params = new URLSearchParams();
	for ( const [k, v] of Object.entries(args) ) {
		if ( PROFILER_ONLY.has(k) ) { continue; }
		if ( k === 'sim_meta_params' && v && typeof v === 'object' ) {
			for ( const [mk, mv] of Object.entries(v) ) {
				params.set(`sim_meta_params.${mk}`, String(mv));
			}
			continue;
		}
		params.set(k, String(v));
	}
	// 2s stats interval so status() samples reflect recent state
	params.set('stats_interval', '2000');
	return `${base}/lab.html?${params.toString()}`;
}

// ─── Load Playwright (optional devDependency) ─────────────────────────────────

async function loadPlaywright() {
	try {
		return await import('playwright');
	}
	catch (_) {
		process.stderr.write(
			'[profiler] Playwright not found.\n' +
			'  Install: npm install -D playwright\n' +
			'  Install browser: npx playwright install chromium\n'
		);
		process.exit(1);
	}
}

// ─── CDP Tracing helpers for V8 CPU profiling ─────────────────────────────────

// Start CDP tracing with V8 CPU profiler categories.
// Returns chunks array — populated as tracing runs.
async function startCDPTracing( cdp, includeTimeline ) {
	const chunks = [];
	cdp.on( 'Tracing.dataCollected', ({ value }) => chunks.push( ...value ) );
	const categories = [
		'disabled-by-default-v8.cpu_profiler',
		'disabled-by-default-v8.cpu_profiler.hires',
		'__metadata',
	];
	if ( includeTimeline ) {
		categories.push( 'devtools.timeline', 'v8.execute', 'disabled-by-default-devtools.timeline' );
	}
	await cdp.send( 'Tracing.start', {
		traceConfig: {
			includedCategories: categories,
			recordMode: 'recordContinuously',
		},
	} );
	return chunks;
}

// Stop CDP tracing and wait for all data to flush.
async function stopCDPTracing( cdp ) {
	const done = new Promise( r => cdp.once( 'Tracing.tracingComplete', r ) );
	await cdp.send( 'Tracing.end' );
	await done;
}

// Extract a V8 CPU profile for a specific thread from CDP trace events.
// targetThread: 'worker' or 'main'
function extractCPUProfile( traceEvents, targetThread ) {
	// build thread name map from metadata
	const threadNames = {};
	for ( const ev of traceEvents ) {
		if ( ev.cat === '__metadata' && ev.name === 'thread_name' && ev.args?.name ) {
			threadNames[`${ev.pid}:${ev.tid}`] = ev.args.name;
		}
	}

	// collect all threads that have ProfileChunk events
	const threadChunkCounts = {};
	for ( const ev of traceEvents ) {
		if ( ev.name === 'ProfileChunk' ) {
			const k = `${ev.pid}:${ev.tid}`;
			threadChunkCounts[k] = ( threadChunkCounts[k] || 0 ) + 1;
		}
	}

	const threadKeys = Object.keys( threadChunkCounts );
	if ( !threadKeys.length ) { return null; }

	// match target thread by name
	let targetKey = null;
	for ( const key of threadKeys ) {
		const name = ( threadNames[key] || '' ).toLowerCase();
		if ( targetThread === 'worker' && name.includes( 'worker' ) ) { targetKey = key; break; }
		if ( targetThread === 'main' && ( name.includes( 'crrenderer' ) || name.includes( 'main' ) ) ) { targetKey = key; break; }
	}

	// fallback heuristic: worker = non-main thread with most chunks
	if ( !targetKey ) {
		const sorted = threadKeys.sort( (a, b) => threadChunkCounts[b] - threadChunkCounts[a] );
		if ( targetThread === 'worker' ) {
			targetKey = sorted.find( k => {
				const name = ( threadNames[k] || '' ).toLowerCase();
				return !name.includes( 'crrenderer' ) && !name.includes( 'main' );
			} ) || sorted[0];
		}
		else {
			targetKey = sorted.find( k => {
				const name = ( threadNames[k] || '' ).toLowerCase();
				return name.includes( 'crrenderer' ) || name.includes( 'main' );
			} ) || sorted[sorted.length - 1];
		}
	}

	if ( !targetKey ) { return null; }
	const [targetPid, targetTid] = targetKey.split( ':' ).map( Number );

	// collect Profile and ProfileChunk events for target thread
	const nodes = [];
	const samples = [];
	const timeDeltas = [];
	let startTime = 0;

	for ( const ev of traceEvents ) {
		if ( ev.pid !== targetPid || ev.tid !== targetTid ) { continue; }
		if ( ev.name === 'Profile' && ev.args?.data?.startTime ) {
			startTime = ev.args.data.startTime;
		}
		if ( ev.name === 'ProfileChunk' && ev.args?.data ) {
			const d = ev.args.data;
			if ( d.cpuProfile?.nodes )   { nodes.push( ...d.cpuProfile.nodes ); }
			if ( d.cpuProfile?.samples ) { samples.push( ...d.cpuProfile.samples ); }
			if ( d.timeDeltas )          { timeDeltas.push( ...d.timeDeltas ); }
		}
	}

	if ( !nodes.length ) { return null; }

	return {
		nodes,
		samples,
		timeDeltas,
		startTime,
		endTime: startTime + timeDeltas.reduce( (a, b) => a + b, 0 ),
		$meta: {
			pid: targetPid,
			tid: targetTid,
			threadName: threadNames[targetKey] || 'unknown',
		},
	};
}

// ─── Stats helpers ────────────────────────────────────────────────────────────

function mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
function arrmax(arr) { return arr.length ? Math.max(...arr) : 0; }
function arrmin(arr) { return arr.length ? Math.min(...arr) : 0; }

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
	const args = parseArgs(process.argv);

	if ( args.help === 'true' || args.h === 'true' ) {
		printHelp();
		process.exit(0);
	}

	const serverUrl      = typeof args.url      === 'string' ? args.url      : 'http://localhost:5173';
	const outputDir      = typeof args.output   === 'string' ? args.output   : './profile-output';
	const warmupSecs     = typeof args.warmup   === 'number' ? args.warmup   : 60;
	const captureSecs    = typeof args.duration === 'number' ? args.duration : 30;
	const headless       = !(args.headful === 'true' || args.headful === true);
	const saveTrace      = !(args['no-trace'] === 'true' || args['no-trace'] === true);
	const saveCpuProfile = !(args['no-cpuprofile'] === 'true' || args['no-cpuprofile'] === true);
	const profileThread  = ( args.thread === 'main' ) ? 'main' : 'worker';

	// --tank-id: load a saved tank file instead of a sim preset.
	// When set, suppress sim/num_boids/width/height defaults so the tank file
	// controls those settings. tank_file is forwarded to lab.html as a URL param
	// (it is NOT in PROFILER_ONLY) so lab.js will fetch saves/tanks/<name>.tank.json
	// and call import_tank, restoring the full scene from the file.
	const tankId = typeof args['tank-id'] === 'string' ? args['tank-id'] : null;
	if ( tankId ) {
		args.tank_file = tankId;
		// only set speed default — tank file owns sim type, population, and dimensions
		if ( !args.speed ) { args.speed = 'throttled'; }
	}
	else {
		// default sim, speed, and tank dimensions for preset-based runs
		if ( !args.sim    ) { args.sim    = 'peaceful_tank'; }
		if ( !args.speed  ) { args.speed  = 'throttled'; }
		if ( !args.width  ) { args.width  = 3000; }
		if ( !args.height ) { args.height = 4000; }
	}

	const labUrl = buildLabUrl(serverUrl, args);
	const ts     = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

	const outDir = resolve(outputDir);
	await mkdir(outDir, { recursive: true });

	if ( tankId ) {
		console.log(`[profiler] tank-id:   ${tankId}  (saves/tanks/${tankId}.tank.json)`);
	}
	else {
		console.log(`[profiler] sim:       ${args.sim}`);
	}
	console.log(`[profiler] url:       ${labUrl}`);
	console.log(`[profiler] warmup:    ${warmupSecs}s   capture: ${captureSecs}s`);
	console.log(`[profiler] thread:    ${profileThread}`);
	console.log(`[profiler] cpu prof:  ${saveCpuProfile}`);
	console.log(`[profiler] trace:     ${saveTrace}`);
	console.log(`[profiler] output:    ${outDir}`);

	// ─── Preflight: verify tank file exists ───────────────────────────────────

	if ( tankId ) {
		const tankFilePath = resolve(__dirname, '..', 'saves', 'tanks', tankId + '.tank.json');
		try {
			await access(tankFilePath);
		} catch {
			process.stderr.write(
				`[profiler] ERROR: tank file not found: ${tankFilePath}\n` +
				`  Export a tank from the web UI (Tank Library → Export button)\n` +
				`  and place it at that path.\n`
			);
			process.exit(1);
		}
		console.log(`[profiler] tank file: OK (${tankFilePath})`);
	}

	// ─── Launch browser ───────────────────────────────────────────────────────

	const { chromium } = await loadPlaywright();
	const browser = await chromium.launch({ headless });
	const context = await browser.newContext();
	const page    = await context.newPage();

	// surface browser console errors and warnings to stderr
	page.on('console', msg => {
		if ( msg.type() === 'error' || msg.type() === 'warning' ) {
			process.stderr.write(`[browser:${msg.type()}] ${msg.text()}\n`);
		}
	});
	page.on('pageerror', err => {
		process.stderr.write(`[browser] page error: ${err.message}\n`);
	});

	// ─── Open lab page ────────────────────────────────────────────────────────

	console.log('[profiler] opening page ...');
	try {
		await page.goto(labUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
	}
	catch (e) {
		process.stderr.write(
			`[profiler] Could not reach ${serverUrl}\n` +
			`  Start the dev server first: npm run dev\n` +
			`  Error: ${e.message}\n`
		);
		await browser.close();
		process.exit(1);
	}

	// wait until lab.js has injected window.vectorcosmLab
	console.log('[profiler] waiting for simulation to start ...');
	try {
		await page.waitForFunction(() => window.vectorcosmLab !== undefined, { timeout: 30000 });
	}
	catch (e) {
		process.stderr.write('[profiler] Timed out waiting for vectorcosmLab to initialize.\n');
		await browser.close();
		process.exit(1);
	}
	console.log('[profiler] simulation started.');

	// ─── Warmup ───────────────────────────────────────────────────────────────

	if ( warmupSecs > 0 ) {
		console.log(`[profiler] warming up ${warmupSecs}s ...`);
		await page.waitForTimeout(warmupSecs * 1000);
	}

	const statusBefore = await page.evaluate(() => window.vectorcosmLab.status()).catch(() => null);
	console.log(`[profiler] baseline: ${JSON.stringify(statusBefore)}`);

	// ─── Start capture (CDP tracing or Playwright tracing) ────────────────────

	let cdp = null;
	let traceChunks = null;

	if ( saveCpuProfile ) {
		// CDP tracing captures CPU profile + optional timeline in one session
		cdp = await context.newCDPSession( page );
		traceChunks = await startCDPTracing( cdp, saveTrace );
		console.log( '[profiler] CDP tracing started (V8 CPU profiler).' );
	}
	else if ( saveTrace ) {
		// fallback: Playwright tracing (no CPU profile)
		await context.tracing.start( { screenshots: false, snapshots: true } );
		console.log( '[profiler] Playwright trace started.' );
	}

	// ─── Capture phase — sample status() once per second ─────────────────────

	const samples = [];
	for ( let i = 0; i < captureSecs; i++ ) {
		await page.waitForTimeout(1000);
		const s = await page.evaluate(() => window.vectorcosmLab.status()).catch(() => null);
		if ( s ) {
			samples.push(s);
			process.stdout.write(`\r[profiler] capturing ${i + 1}/${captureSecs}s  TPS: ${s.ticks_per_second ?? '?'}   `);
		}
	}
	process.stdout.write('\n');

	// ─── Stop capture ─────────────────────────────────────────────────────────

	let cpuProfileFile = null;
	let traceFile = null;

	if ( saveCpuProfile && cdp ) {
		await stopCDPTracing( cdp );
		console.log( `[profiler] CDP tracing stopped. ${traceChunks.length} trace events collected.` );

		// extract CPU profile for target thread
		const profile = extractCPUProfile( traceChunks, profileThread );
		if ( profile ) {
			cpuProfileFile = resolve( outDir, `cpuprofile-${ts}.json` );
			await writeFile( cpuProfileFile, JSON.stringify( profile ), 'utf8' );
			console.log( `[profiler] CPU profile (${profile.$meta.threadName}) → ${cpuProfileFile}` );
			console.log( `[profiler]   ${profile.nodes.length} nodes, ${profile.samples.length} samples` );
		}
		else {
			process.stderr.write( `[profiler] WARNING: no CPU profile data found for ${profileThread} thread.\n` );
		}

		// save Chrome trace JSON (all events, all threads)
		if ( saveTrace && traceChunks.length ) {
			traceFile = resolve( outDir, `trace-${ts}.json` );
			await writeFile( traceFile, JSON.stringify( traceChunks ), 'utf8' );
			console.log( `[profiler] Chrome trace → ${traceFile}` );
		}

		await cdp.detach().catch( () => {} );
	}
	else if ( saveTrace ) {
		traceFile = resolve( outDir, `trace-${ts}.zip` );
		await context.tracing.stop( { path: traceFile } );
		console.log( `[profiler] Playwright trace → ${traceFile}` );
	}

	// final stats snapshot (richer than status)
	const finalStats = await page.evaluate( () => window.vectorcosmLab.stats() ).catch( () => null );

	await browser.close();

	// ─── Summary ──────────────────────────────────────────────────────────────

	const tpsValues = samples.map(s => s.ticks_per_second).filter(v => typeof v === 'number' && v > 0);
	const summary = {
		ts,
		sim:             tankId ? null : args.sim,
		tank_id:         tankId ?? null,
		speed:           args.speed,
		num_boids:       statusBefore?.population_size ?? null,
		warmup_secs:     warmupSecs,
		capture_secs:    captureSecs,
		profile_thread:  saveCpuProfile ? profileThread : null,
		tps: {
			avg:  Math.round(mean(tpsValues)),
			peak: Math.round(arrmax(tpsValues)),
			min:  Math.round(arrmin(tpsValues)),
		},
		total_frames:    samples.length ? samples[samples.length - 1].frame_count    : null,
		total_sim_time:  samples.length ? samples[samples.length - 1].sim_time       : null,
		samples:         samples.length,
		cpuprofile_file: cpuProfileFile,
		trace_file:      traceFile,
		final_stats:     finalStats ?? null,
	};

	const summaryFile = resolve(outDir, `summary-${ts}.json`);
	await writeFile(summaryFile, JSON.stringify(summary, null, 2), 'utf8');

	// print summary to stdout
	console.log('');
	console.log('─── Profile Summary ─────────────────────────────────────────');
	if ( summary.tank_id ) {
		console.log(`  tank-id:      ${summary.tank_id}`);
	}
	else {
		console.log(`  sim:          ${summary.sim}`);
	}
	console.log(`  speed:        ${summary.speed}`);
	console.log(`  num_boids:    ${summary.num_boids ?? 'unknown'}`);
	console.log(`  TPS avg:      ${summary.tps.avg}   peak: ${summary.tps.peak}   min: ${summary.tps.min}`);
	console.log(`  total frames: ${summary.total_frames ?? 'unknown'}`);
	console.log(`  sim time:     ${(summary.total_sim_time ?? 0).toFixed(1)}s`);
	if ( cpuProfileFile ) {
		console.log(`  cpu profile → ${cpuProfileFile}  (${profileThread} thread)`);
	}
	if ( traceFile ) {
		console.log(`  trace →       ${traceFile}`);
		if ( traceFile.endsWith('.json') ) {
			console.log('  (open in https://ui.perfetto.dev)');
		}
		else {
			console.log('  (open in https://ui.perfetto.dev or trace.playwright.dev)');
		}
	}
	console.log(`  summary →     ${summaryFile}`);
	console.log('─────────────────────────────────────────────────────────────');
}

main().catch(err => {
	process.stderr.write(`[profiler] Fatal: ${err.message}\n${err.stack || ''}\n`);
	process.exit(1);
});
