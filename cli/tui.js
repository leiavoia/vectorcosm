/* <AI>
cli/tui.js — Terminal UI dashboard for Vectorcosm Orchestrator.

Creates an Orchestrator, spawns N sessions, runs live table display.
Polls get_status every second for all sessions; re-renders table on each tick.

get_status fields used:
  running, speed, frame_count, sim_time (round elapsed, seconds), round_num,
  population_size, species, wall_ms (total wall clock since start), ticks_per_second

USAGE
  node cli/tui.js [options]
  node cli/tui.js --count=3 --sim=peaceful_tank --duration=300
  node cli/tui.js --count=2 --sim=natural_tank --speed=full --num_boids=60
  node cli/tui.js --help

OPTIONS
  --count=<n>             Number of sessions to spawn (default: 2)
  --name-prefix=<p>       Session name prefix (default: 's')
  --sim=<name>            Sim preset for all sessions (default: peaceful_tank)
  --speed=<mode>          full | throttled | natural  (default: full)
  --duration=<seconds>    Auto-shutdown after N seconds; 0 = unlimited (default: 0)
  --stats_interval=<ms>   Autonomous stats post period (default: 2000)
  --width=<n>             Tank width (default: 1000)
  --height=<n>            Tank height (default: 750)
  Standard sim params: num_boids, num_foods, num_plants, num_rocks, rounds, timeout,
                       max_mutation, cullpct

KEYBOARD
  q / Ctrl-C    Quit (graceful shutdown of all sessions)

DISPLAY COLUMNS
  Name(14) | Status(10) | TPS(6) | Pop(6) | Spc(5) | Round(6) | Wall(8)
</AI> */

import Orchestrator from './orchestrator.js';

// ─── ANSI helpers ──────────────────────────────────────────────────────────────

const A = {
	reset:      '\x1B[0m',
	bold:       '\x1B[1m',
	dim:        '\x1B[2m',
	green:      '\x1B[32m',
	yellow:     '\x1B[33m',
	red:        '\x1B[31m',
	cyan:       '\x1B[36m',
	blue:       '\x1B[34m',
	white:      '\x1B[97m',
	clear:      '\x1B[2J\x1B[H',
	hideCursor: '\x1B[?25l',
	showCursor: '\x1B[?25h',
};

const green  = s => A.green  + s + A.reset;
const yellow = s => A.yellow + s + A.reset;
const red    = s => A.red    + s + A.reset;
const cyan   = s => A.cyan   + s + A.reset;
const dim    = s => A.dim    + s + A.reset;
const bold   = s => A.bold   + s + A.reset;

// Format milliseconds as HH:MM:SS string
function fmtTime( ms ) {
	if ( ms == null || ms <= 0 ) { return '       -'; }
	const s  = Math.floor( ms / 1000 );
	const h  = Math.floor( s / 3600 );
	const m  = Math.floor( ( s % 3600 ) / 60 );
	const ss = s % 60;
	return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0') + ':' + String(ss).padStart(2,'0');
}

// Format a number right-padded to width. Uses dim dash if null/undefined.
function fmtNum( n, w ) {
	if ( n == null ) { return dim('-'.padStart( w )); }
	return String( Math.round( n ) ).padStart( w );
}

// ─── CLI arg parser ────────────────────────────────────────────────────────────

function parseArgs( argv ) {
	const args = {};
	for ( let i = 2; i < argv.length; i++ ) {
		const arg = argv[i];
		if ( !arg.startsWith('--') ) { continue; }
		const eq  = arg.indexOf('=');
		const key = eq >= 0 ? arg.slice(2, eq) : arg.slice(2);
		const raw = eq >= 0 ? arg.slice(eq + 1) : ( argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : null );
		if ( raw == null ) { args[key] = true; }
		else {
			const n = Number(raw);
			args[key] = ( raw !== '' && !isNaN(n) ) ? n : raw;
		}
	}
	return args;
}

// ─── Configuration ─────────────────────────────────────────────────────────────

const args = parseArgs( process.argv );

if ( args.help ) {
	process.stdout.write( [
		'',
		'VECTORCOSM TUI — live dashboard for multiple parallel simulations',
		'',
		'USAGE',
		'  node cli/tui.js [options]',
		'',
		'OPTIONS',
		'  --count=<n>             Sessions to spawn (default: 2)',
		'  --name-prefix=<p>       Name prefix, e.g. "s" → s0, s1, s2  (default: s)',
		'  --sim=<name>            Sim preset (default: peaceful_tank)',
		'  --speed=<mode>          full | throttled | natural  (default: full)',
		'  --duration=<seconds>    Auto-quit after N seconds; 0 = unlimited',
		'  --stats_interval=<ms>   Stats post period (default: 2000)',
		'  --width=<n>             Tank width (default: 1000)',
		'  --height=<n>            Tank height (default: 750)',
		'  --num_boids=<n>         Boid population per session',
		'  --num_foods=<n>         Food items per session',
		'  --num_plants=<n>        Plants per session',
		'  --rounds=<n>            Max rounds (0 = perpetual)',
		'  --timeout=<f>           Round timeout seconds',
		'',
		'KEYBOARD',
		'  q / Ctrl-C    Quit gracefully',
		'',
	].join('\n') );
	process.exit(0);
}

const count          = Math.max( 1, Math.min( 16, Math.round( args.count ?? 2 ) ) );
const namePrefix     = String( args['name-prefix'] ?? 's' );
const speed          = String( args.speed ?? 'full' );
const duration       = parseFloat( args.duration ) || 0;
const statsInterval  = parseInt( args.stats_interval ) || 2000;

// Worker init params — pass through all known sim params
const SIM_PARAM_KEYS = new Set(['sim','sim_queue','width','height','num_boids','num_foods','num_plants','num_rocks','rounds','timeout','max_mutation','cullpct']);
const initParams = { width: 1000, height: 750, sim: 'peaceful_tank' };
for ( const [ k, v ] of Object.entries( args ) ) {
	if ( SIM_PARAM_KEYS.has(k) ) { initParams[k] = v; }
}

// ─── Orchestrator + session metadata ──────────────────────────────────────────

const orch      = new Orchestrator();
const simNames  = new Map();   // sessionName → last seen sim name from sim_new event
let   stopped   = false;
const startTime = Date.now();

// Track current sim name per session from sim_new events
orch.on( '*', 'sim_new', ( sessionName, _event, data ) => {
	simNames.set( sessionName, data?.name || '?' );
} );

// ─── Terminal setup ────────────────────────────────────────────────────────────

process.stdout.write( A.hideCursor + A.clear );

// Restore terminal regardless of how we exit
function restoreTerminal() {
	try {
		process.stdout.write( A.showCursor + '\n' );
		if ( process.stdin.isTTY ) { process.stdin.setRawMode( false ); }
	}
	catch ( _ ) {}
}
process.on( 'exit', restoreTerminal );

if ( process.stdin.isTTY ) {
	process.stdin.setRawMode( true );
	process.stdin.resume();
	process.stdin.setEncoding( 'utf8' );
	process.stdin.on( 'data', ( key ) => {
		if ( key === 'q' || key === '\u0003' ) { shutdown( 'quit' ); }
	} );
}

process.on( 'SIGTERM', () => shutdown( 'SIGTERM' ) );
process.stdout.on( 'error', () => {} );   // ignore broken pipe

// ─── Shutdown ─────────────────────────────────────────────────────────────────

async function shutdown( reason = 'user' ) {
	if ( stopped ) { return; }
	stopped = true;
	process.stdout.write( '\n' + dim( `Shutting down (${reason})...` ) + '\n' );
	await orch.terminateAll();
	process.exit( 0 );
}

// ─── Render ───────────────────────────────────────────────────────────────────

// STATUS column: 10 visible chars (no padding needed — each string is exactly 10)
function statusStr( session ) {
	const st  = session.status;
	const run = session.last_status?.running;
	if ( st === 'crashed'  ) { return red(    'CRASHED   ' ); }
	if ( st === 'stopped'  ) { return dim(    'stopped   ' ); }
	if ( st === 'spawning' ) { return cyan(   'spawning  ' ); }
	if ( run               ) { return green(  'RUNNING   ' ); }
	return yellow( 'ready     ' );
}

// Column header aligned to match renderRow field widths:
//   2 lead + name(16) + 2sep + stat(10) + 2sep + tps(6) + 2sep + pop(6) + 2sep + spc(4) + 2sep + rnd(6) + 2sep + wall(8) + 2sep + sim
const COL_HEAD = '  ' +
	'Name'.padEnd(16) +
	'  ' + 'Status'.padEnd(10) +
	'  ' + 'TPS'.padStart(6) +
	'  ' + 'Pop'.padStart(6) +
	'  ' + 'Spc'.padStart(4) +
	'  ' + 'Round'.padStart(6) +
	'  ' + 'Wall'.padEnd(8) +
	'  Sim';

const DIVIDER = '  ' + '─'.repeat( 76 );

function renderRow( session ) {
	const s    = session.last_status;
	const name = session.name.slice(0, 16).padEnd(16);
	const stat = statusStr( session );
	const tps  = fmtNum( s?.ticks_per_second, 6 );
	const pop  = fmtNum( s?.population_size,  6 );
	const spc  = fmtNum( s?.species,           4 );
	const rnd  = fmtNum( s?.round_num,         6 );
	const wall = fmtTime( s?.wall_ms );
	const sim  = dim( ( simNames.get( session.name ) || initParams.sim || '' ).slice(0, 20) );
	return `  ${name}  ${stat}  ${tps}  ${pop}  ${spc}  ${rnd}  ${wall}  ${sim}`;
}

function render() {
	const wallElapsed = fmtTime( Date.now() - startTime );
	const sessions    = orch.sessions();
	const numRunning  = sessions.filter( s => s.last_status?.running ).length;

	const title = bold('VECTORCOSM') + ' orchestrator' +
		`   sessions: ${sessions.length}` +
		`   running: ${numRunning}` +
		`   wall: ${wallElapsed}` +
		( duration > 0 ? `   auto-quit: ${fmtTime( ( startTime + duration * 1000 ) - Date.now() )}` : '' );

	const lines = [
		A.clear,
		'',
		'  ' + title,
		'',
		DIVIDER,
		COL_HEAD,
		DIVIDER,
		...sessions.map( s => renderRow(s) ),
		DIVIDER,
		'',
		dim( '  [q] quit' ),
		'',
	];
	process.stdout.write( lines.join('\n') );
}

// ─── Render loop ──────────────────────────────────────────────────────────────

async function renderLoop() {
	if ( stopped ) { return; }
	await orch.pollStatus();
	render();
	if ( !stopped ) { setTimeout( renderLoop, 1000 ); }
}

// ─── Startup ──────────────────────────────────────────────────────────────────

async function start() {
	// Spawn all sessions (init in parallel)
	const spawnJobs = [];
	for ( let i = 0; i < count; i++ ) {
		const name = `${namePrefix}${i}`;
		spawnJobs.push( orch.spawn( name, initParams ) );
	}
	await Promise.allSettled( spawnJobs );

	// Start autonomous run for each session (in parallel)
	const startJobs = orch.sessions().map( s =>
		orch.call( s.name, 'start_autonomous', { speed, stats_interval: statsInterval } )
			.catch( e => {
				process.stderr.write( `Failed to start "${s.name}": ${e.message}\n` );
			} )
	);
	await Promise.allSettled( startJobs );

	// Auto-quit timer
	if ( duration > 0 ) {
		setTimeout( () => shutdown('duration'), duration * 1000 );
	}

	// Start render loop
	renderLoop();
}

start().catch( e => {
	restoreTerminal();
	process.stderr.write( 'Startup error: ' + e.message + '\n' );
	process.exit( 1 );
} );
