/* <AI>
cli/profile-sim.js — Playwright/CDP browser profiler for Vectorcosm.

Launches headless Chromium, opens lab.html with sim params, warms up,
then captures:
  - TPS/frame stats via window.vectorcosmLab.status() sampled once per second
  - Chrome trace (devtools timeline: GC, scripting, rendering, memory) via Playwright tracing API

Outputs:
  profile-output/trace-<ts>.zip    — Chrome trace (open in chrome://tracing or https://ui.perfetto.dev)
  profile-output/summary-<ts>.json — stats summary
  Summary printed to stdout.

REQUIRES
  npm install -D playwright
  npx playwright install chromium
  A Vite server must be running: npm run dev  OR  npm run preview

USAGE
  node cli/profile-sim.js [options]
  node cli/profile-sim.js --sim=peaceful_tank --duration=30
  node cli/profile-sim.js --sim=natural_tank --num_boids=200 --duration=60 --no-trace

OPTIONS
  --sim=<name>           Sim preset (default: peaceful_tank)
  --num_boids=<n>        Population size
  --speed=<mode>         throttled | full | natural (default: throttled)
  --warmup=<s>           Warmup seconds (default: 10)
  --duration=<s>         Capture seconds (default: 30)
  --url=<url>            Server URL (default: http://localhost:5173)
  --output=<dir>         Output directory (default: ./profile-output)
  --no-trace             Skip Chrome trace file
  --headful              Show browser window
  --help                 Print help
  Plus sim_meta_params dot-notation: --sim_meta_params.KEY=value
</AI> */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdir, writeFile } from 'fs/promises';

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
		'  --warmup=<s>           Warmup seconds  (default: 10)',
		'  --duration=<s>         Capture seconds  (default: 30)',
		'  --url=<url>            Vite server URL  (default: http://localhost:5173)',
		'  --output=<dir>         Output directory  (default: ./profile-output)',
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
		'  node cli/profile-sim.js --sim=natural_tank --warmup=5 --no-trace',
		'',
	].join('\n'));
}

// ─── Build lab URL from args ──────────────────────────────────────────────────
// Forward all sim-relevant params as URL query string; strip profiler-only keys.

const PROFILER_ONLY = new Set(['url', 'output', 'warmup', 'duration', 'no-trace', 'headful', 'help', 'h']);

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

	const serverUrl   = typeof args.url      === 'string' ? args.url      : 'http://localhost:5173';
	const outputDir   = typeof args.output   === 'string' ? args.output   : './profile-output';
	const warmupSecs  = typeof args.warmup   === 'number' ? args.warmup   : 10;
	const captureSecs = typeof args.duration === 'number' ? args.duration : 30;
	const headless    = !(args.headful === 'true' || args.headful === true);
	const saveTrace   = !(args['no-trace'] === 'true' || args['no-trace'] === true);

	// default sim and speed
	if ( !args.sim   ) { args.sim   = 'peaceful_tank'; }
	if ( !args.speed ) { args.speed = 'throttled'; }

	const labUrl = buildLabUrl(serverUrl, args);
	const ts     = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

	const outDir = resolve(outputDir);
	await mkdir(outDir, { recursive: true });

	console.log(`[profiler] sim:      ${args.sim}`);
	console.log(`[profiler] url:      ${labUrl}`);
	console.log(`[profiler] warmup:   ${warmupSecs}s   capture: ${captureSecs}s`);
	console.log(`[profiler] trace:    ${saveTrace}`);
	console.log(`[profiler] output:   ${outDir}`);

	// ─── Launch browser ───────────────────────────────────────────────────────

	const { chromium } = await loadPlaywright();
	const browser = await chromium.launch({ headless });
	const context = await browser.newContext();
	const page    = await context.newPage();

	// surface browser console errors to stderr
	page.on('console', msg => {
		if ( msg.type() === 'error' ) {
			process.stderr.write(`[browser] ${msg.text()}\n`);
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

	// ─── Start trace ──────────────────────────────────────────────────────────

	if ( saveTrace ) {
		await context.tracing.start({ screenshots: false, snapshots: true });
		console.log('[profiler] trace started.');
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

	// ─── Stop trace ───────────────────────────────────────────────────────────

	const traceFile = resolve(outDir, `trace-${ts}.zip`);
	if ( saveTrace ) {
		await context.tracing.stop({ path: traceFile });
		console.log(`[profiler] trace saved → ${traceFile}`);
	}

	// final stats snapshot (richer than status)
	const finalStats = await page.evaluate(() => window.vectorcosmLab.stats()).catch(() => null);

	await browser.close();

	// ─── Summary ──────────────────────────────────────────────────────────────

	const tpsValues = samples.map(s => s.ticks_per_second).filter(v => typeof v === 'number' && v > 0);
	const summary = {
		ts,
		sim:          args.sim,
		speed:        args.speed,
		num_boids:    statusBefore?.population_size ?? null,
		warmup_secs:  warmupSecs,
		capture_secs: captureSecs,
		tps: {
			avg:  Math.round(mean(tpsValues)),
			peak: Math.round(arrmax(tpsValues)),
			min:  Math.round(arrmin(tpsValues)),
		},
		total_frames:   samples.length ? samples[samples.length - 1].frame_count    : null,
		total_sim_time: samples.length ? samples[samples.length - 1].sim_time       : null,
		samples:        samples.length,
		trace_file:     saveTrace ? traceFile : null,
		final_stats:    finalStats ?? null,
	};

	const summaryFile = resolve(outDir, `summary-${ts}.json`);
	await writeFile(summaryFile, JSON.stringify(summary, null, 2), 'utf8');

	// print summary to stdout
	console.log('');
	console.log('─── Profile Summary ─────────────────────────────────────────');
	console.log(`  sim:          ${summary.sim}`);
	console.log(`  speed:        ${summary.speed}`);
	console.log(`  num_boids:    ${summary.num_boids ?? 'unknown'}`);
	console.log(`  TPS avg:      ${summary.tps.avg}   peak: ${summary.tps.peak}   min: ${summary.tps.min}`);
	console.log(`  total frames: ${summary.total_frames ?? 'unknown'}`);
	console.log(`  sim time:     ${(summary.total_sim_time ?? 0).toFixed(1)}s`);
	if ( saveTrace ) {
		console.log(`  trace →       ${traceFile}`);
		console.log('  (open in https://ui.perfetto.dev or chrome://tracing)');
	}
	console.log(`  summary →     ${summaryFile}`);
	console.log('─────────────────────────────────────────────────────────────');
}

main().catch(err => {
	process.stderr.write(`[profiler] Fatal: ${err.message}\n${err.stack || ''}\n`);
	process.exit(1);
});
