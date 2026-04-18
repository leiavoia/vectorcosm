/* <AI>
cli/tui.js — Interactive terminal UI dashboard for Vectorcosm.

ARCHITECTURE
  Opens with no simulations. User creates sessions interactively.
  Orchestrator (orchestrator.js) manages worker processes.
  Views rendered with raw ANSI — zero dependencies.

VIEWS (switched via number keys on bottom bar)
  1. DASHBOARD  — session table, create/pause/resume/kill sessions
  2. SESSION    — focused session detail: stats, param sliders, graphs
  3. NEW SIM    — sim preset picker + param config before launch
  4. LIBRARY    — load/save tanks and boid populations

KEYBOARD
  Global: q=quit, 1-4=switch view, n=new sim (shortcut to view 3)
  Dashboard: arrows=select session, Enter=focus (view 2), k=kill, p=pause, r=resume
  Session: arrows=navigate sliders, +/-=adjust, s=save tank, b=save boids, g=toggle graphs
  New Sim: arrows=navigate, Enter=select/launch
  Library: arrows=navigate, Enter=load, t=tanks tab, b=boids tab

POLLING
  Every 1000ms: pollStatus() on all sessions (get_status).
  records_push events collected per-session for live graph data.

WORKER COMMANDS USED
  init, start_autonomous, stop_autonomous, resume_autonomous, terminate,
  get_status, get_stats, get_records, get_population, update_sim_settings,
  save_tank, export_tank, import_tank, export_boids, load_boids,
  tank_library_list, tank_library_get_row, tank_library_add_row,
  boid_library_list, boid_library_get_row, boid_library_add_row
</AI> */

import Orchestrator from './orchestrator.js';

// ─── ANSI helpers ──────────────────────────────────────────────────────────────

const ESC = '\x1B[';
const A = {
	reset:      ESC + '0m',
	bold:       ESC + '1m',
	dim:        ESC + '2m',
	underline:  ESC + '4m',
	green:      ESC + '32m',
	yellow:     ESC + '33m',
	red:        ESC + '31m',
	cyan:       ESC + '36m',
	blue:       ESC + '34m',
	magenta:    ESC + '35m',
	white:      ESC + '97m',
	bgBlue:     ESC + '44m',
	bgGray:     ESC + '100m',
	clear:      ESC + '2J' + ESC + 'H',
	hideCursor: ESC + '?25l',
	showCursor: ESC + '?25h',
	clearLine:  ESC + '2K',
};

const green   = s => A.green   + s + A.reset;
const yellow  = s => A.yellow  + s + A.reset;
const red     = s => A.red     + s + A.reset;
const cyan    = s => A.cyan    + s + A.reset;
const blue    = s => A.blue    + s + A.reset;
const magenta = s => A.magenta + s + A.reset;
const dim     = s => A.dim     + s + A.reset;
const bold    = s => A.bold    + s + A.reset;
const inv     = s => A.bgBlue + A.white + s + A.reset;

function fmtTime( ms ) {
	if ( ms == null || ms <= 0 ) { return '       -'; }
	const s  = Math.floor( ms / 1000 );
	const h  = Math.floor( s / 3600 );
	const m  = Math.floor( ( s % 3600 ) / 60 );
	const ss = s % 60;
	return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0') + ':' + String(ss).padStart(2,'0');
}

function fmtNum( n, w ) {
	if ( n == null ) { return dim( '-'.padStart( w ) ); }
	return String( Math.round( n ) ).padStart( w );
}

function fmtFloat( n, w, dec = 2 ) {
	if ( n == null ) { return dim( '-'.padStart( w ) ); }
	return n.toFixed( dec ).padStart( w );
}

// clamp to integer range
function clamp( v, lo, hi ) { return Math.max( lo, Math.min( hi, Math.round( v ) ) ); }
function clampf( v, lo, hi ) { return Math.max( lo, Math.min( hi, v ) ); }

// truncate or pad a string to exactly w visible chars
function fit( s, w ) {
	if ( s.length > w ) { return s.slice( 0, w - 1 ) + '…'; }
	return s.padEnd( w );
}

// ─── Sparkline / ASCII bar chart ──────────────────────────────────────────────

const SPARK_CHARS = '▁▂▃▄▅▆▇█';

function sparkline( arr, width ) {
	if ( !arr || arr.length === 0 ) { return dim( '·'.repeat( width ) ); }
	// take last `width` values
	const vals = arr.slice( -width );
	let min = Infinity, max = -Infinity;
	for ( const v of vals ) {
		if ( v < min ) { min = v; }
		if ( v > max ) { max = v; }
	}
	const range = max - min || 1;
	let result = '';
	for ( const v of vals ) {
		const idx = Math.min( SPARK_CHARS.length - 1, Math.floor( ( ( v - min ) / range ) * ( SPARK_CHARS.length - 1 ) ) );
		result += SPARK_CHARS[ idx ];
	}
	// pad left if fewer data points than width
	if ( result.length < width ) { result = ' '.repeat( width - result.length ) + result; }
	return result;
}

function barH( value, max, width ) {
	if ( max <= 0 ) { return dim( '·'.repeat( width ) ); }
	const filled = Math.round( ( value / max ) * width );
	return green( '█'.repeat( Math.min( filled, width ) ) ) + dim( '░'.repeat( Math.max( 0, width - filled ) ) );
}

// ─── Simulation Presets ───────────────────────────────────────────────────────

const SIM_PRESETS = [
	'peaceful_tank',
	'natural_tank',
	'combat',
	'food_training_sim_easy',
	'food_training_sim_medium',
	'food_training_sim_hard',
	'turning_training_easy',
	'turning_training_medium',
	'turning_training_hard',
	'turning_training_xhard',
	'race_track',
	'obstacle_course',
	'treasure_hunt_easy',
	'treasure_hunt_hard',
	'treasure_hunt_perpetual',
	'learning_gym',
	'petri_dish',
	'finishing_school',
];

// ─── Tunable parameters (name, label, min, max, step, type) ──────────────────

const TUNABLES = [
	{ key: 'num_boids',        label: 'Boids',          min: 1,    max: 200,  step: 1,    type: 'int'   },
	{ key: 'num_foods',        label: 'Foods',          min: 0,    max: 200,  step: 1,    type: 'int'   },
	{ key: 'num_plants',       label: 'Plants',         min: 0,    max: 100,  step: 1,    type: 'int'   },
	{ key: 'fruiting_speed',   label: 'Fruiting',       min: 0,    max: 10,   step: 0.1,  type: 'float' },
	{ key: 'max_mutation',     label: 'Mutation',       min: 0,    max: 1,    step: 0.01, type: 'float' },
	{ key: 'cullpct',          label: 'Cull %',         min: 0,    max: 1,    step: 0.05, type: 'float' },
	{ key: 'viscosity',        label: 'Viscosity',      min: 0,    max: 1,    step: 0.05, type: 'float' },
	{ key: 'speciation_rate',  label: 'Speciation',     min: 0,    max: 100,  step: 1,    type: 'int'   },
	{ key: 'food_speed',       label: 'Food Speed',     min: 0,    max: 10,   step: 0.1,  type: 'float' },
	{ key: 'food_value',       label: 'Food Value',     min: 0,    max: 100,  step: 1,    type: 'float' },
];

// ─── State ────────────────────────────────────────────────────────────────────

const orch       = new Orchestrator();
let   stopped    = false;
const startTime  = Date.now();

// view state
const VIEW = { DASHBOARD: 0, SESSION: 1, NEW_SIM: 2, LIBRARY: 3 };
let currentView  = VIEW.DASHBOARD;

// dashboard state
let dashCursor    = 0;     // selected row in session list
let sessionOrder  = [];    // ordered list of session names

// session detail state
let focusedSession = null; // name of session being viewed
let sliderCursor   = 0;    // selected tunable
let showGraphs     = true; // toggle graphs on/off
const sessionRecords = new Map();   // sessionName → { stat: [values] } (rolling buffer from records_push)
const sessionSettings = new Map();  // sessionName → last known settings object
const sessionSimNames = new Map();  // sessionName → sim name from sim_new

// new sim state
let newSimCursor  = 0;     // selected preset
let newSimParams  = {};    // param overrides before launch
let newSimParamCursor = 0; // cursor within param list
let newSimPhase   = 'preset'; // 'preset' | 'params'

// library state
let libTab        = 'tanks'; // 'tanks' | 'boids'
let libCursor     = 0;
let libData       = [];      // array of rows from library_list

// screen dimensions
let termW = process.stdout.columns || 120;
let termH = process.stdout.rows || 40;
process.stdout.on( 'resize', () => {
	termW = process.stdout.columns || 120;
	termH = process.stdout.rows || 40;
} );

// naming
let sessionCounter = 0;
function nextSessionName() { return 's' + ( sessionCounter++ ); }

// ─── Event wiring ─────────────────────────────────────────────────────────────

// Collect records_push events per session (layer 0 only, for graphs)
orch.on( '*', 'records_push', ( sessionName, _event, data ) => {
	if ( data?.layer !== 0 ) { return; }
	if ( !sessionRecords.has( sessionName ) ) { sessionRecords.set( sessionName, {} ); }
	const rec = sessionRecords.get( sessionName );
	const d = data.data;
	for ( const key in d ) {
		if ( !rec[ key ] ) { rec[ key ] = []; }
		rec[ key ].push( d[ key ] );
		// keep last 120 points
		if ( rec[ key ].length > 120 ) { rec[ key ].shift(); }
	}
} );

orch.on( '*', 'sim_new', ( sessionName, _event, data ) => {
	sessionSimNames.set( sessionName, data?.name || '?' );
	// clear old records on new sim
	sessionRecords.delete( sessionName );
} );

// ─── Terminal setup ────────────────────────────────────────────────────────────

process.stdout.write( A.hideCursor + A.clear );

function restoreTerminal() {
	try {
		process.stdout.write( A.showCursor + '\n' );
		if ( process.stdin.isTTY ) { process.stdin.setRawMode( false ); }
	}
	catch ( _ ) {}
}
process.on( 'exit', restoreTerminal );

// ─── Shutdown ─────────────────────────────────────────────────────────────────

async function shutdown( reason = 'user' ) {
	if ( stopped ) { return; }
	stopped = true;
	process.stdout.write( '\n' + dim( `Shutting down (${reason})...` ) + '\n' );
	await orch.terminateAll();
	process.exit( 0 );
}

process.on( 'SIGTERM', () => shutdown( 'SIGTERM' ) );
process.stdout.on( 'error', () => {} );

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sessionsArray() { return orch.sessions(); }

function focusedSessionInfo() {
	if ( !focusedSession ) { return null; }
	return orch.getSession( focusedSession );
}

function focusedSessionRecords() {
	return sessionRecords.get( focusedSession ) || {};
}

// Get or refresh settings from the focused session
async function refreshSettings( name ) {
	try {
		const stats = await orch.call( name, 'get_stats', {} );
		if ( stats?.sim?.settings ) {
			sessionSettings.set( name, stats.sim.settings );
		}
		return stats?.sim?.settings;
	}
	catch { return null; }
}

// ─── View: DASHBOARD ──────────────────────────────────────────────────────────

function renderDashboard( lines ) {
	const sessions = sessionsArray();
	sessionOrder = sessions.map( s => s.name );

	lines.push( '' );
	lines.push( bold( '  DASHBOARD' ) + dim( '  ─  session overview' ) );
	lines.push( '' );

	if ( sessions.length === 0 ) {
		lines.push( dim( '  No sessions. Press [n] to create a new simulation, or [Tab] to switch views.' ) );
		lines.push( '' );
		return;
	}

	// header
	const hdr = '  ' +
		' '.padEnd(3) +
		'Name'.padEnd(14) +
		'Status'.padEnd(12) +
		'TPS'.padStart(7) +
		'Pop'.padStart(6) +
		'Spc'.padStart(5) +
		'Rnd'.padStart(6) +
		'Wall'.padStart(10) +
		'  Sim';
	lines.push( dim( '  ' + '─'.repeat( termW - 4 ) ) );
	lines.push( hdr );
	lines.push( dim( '  ' + '─'.repeat( termW - 4 ) ) );

	for ( let i = 0; i < sessions.length; i++ ) {
		const s = sessions[i];
		const st = s.last_status;
		const sel = ( i === dashCursor ) ? cyan( '▸ ' ) : '  ';
		const name = fit( s.name, 14 );
		const status = statusStr( s );
		const tps  = fmtNum( st?.ticks_per_second, 7 );
		const pop  = fmtNum( st?.population_size, 6 );
		const spc  = fmtNum( st?.species, 5 );
		const rnd  = fmtNum( st?.round_num, 6 );
		const wall = fmtTime( st?.wall_ms ).padStart( 10 );
		const sim  = dim( ( sessionSimNames.get( s.name ) || '' ).slice( 0, 20 ) );
		const highlight = ( i === dashCursor ) ? A.bold : '';
		lines.push( '  ' + sel + highlight + name + status + tps + pop + spc + rnd + wall + '  ' + sim + A.reset );
	}
	lines.push( dim( '  ' + '─'.repeat( termW - 4 ) ) );
	lines.push( '' );
	lines.push( dim( '  [↑↓] select  [Enter] focus  [p] pause  [r] resume  [k] kill  [n] new sim  [Tab] next view' ) );
}

function statusStr( session ) {
	const st  = session.status;
	const run = session.last_status?.running;
	if ( st === 'crashed'  ) { return red(    'CRASHED'  ).padEnd( 12 + 9 ); }
	if ( st === 'stopped'  ) { return dim(    'stopped'  ).padEnd( 12 + 8 ); }
	if ( st === 'spawning' ) { return cyan(   'spawning' ).padEnd( 12 + 9 ); }
	if ( run               ) { return green(  'RUNNING'  ).padEnd( 12 + 9 ); }
	return yellow( 'paused' ).padEnd( 12 + 9 );
}

// ─── View: SESSION DETAIL ─────────────────────────────────────────────────────

function renderSession( lines ) {
	const info = focusedSessionInfo();
	if ( !info ) {
		lines.push( '' );
		lines.push( dim( '  No session focused. Go to Dashboard and press Enter on a session.' ) );
		return;
	}

	const st = info.last_status || {};
	const settings = sessionSettings.get( focusedSession ) || {};
	const simName = sessionSimNames.get( focusedSession ) || '?';

	lines.push( '' );
	lines.push( bold( '  SESSION: ' + focusedSession ) + '  ' + dim( simName ) + '  ' + statusStr( info ) );
	lines.push( '' );

	// stats row
	const statsLine = [
		`TPS: ${bold( fmtNum( st.ticks_per_second, 5 ) )}`,
		`Pop: ${fmtNum( st.population_size, 4 )}`,
		`Spc: ${fmtNum( st.species, 3 )}`,
		`Round: ${fmtNum( st.round_num, 4 )}`,
		`Wall: ${fmtTime( st.wall_ms )}`,
		`Frames: ${fmtNum( st.frame_count, 8 )}`,
	].join( '   ' );
	lines.push( '  ' + statsLine );
	lines.push( '' );

	// tunable parameters as slider-like display
	lines.push( bold( '  Parameters' ) + dim( '  [↑↓] select  [←→ or +/-] adjust' ) );
	lines.push( dim( '  ' + '─'.repeat( 60 ) ) );

	for ( let i = 0; i < TUNABLES.length; i++ ) {
		const t = TUNABLES[i];
		const val = settings[ t.key ];
		const sel = ( i === sliderCursor ) ? cyan( '▸ ' ) : '  ';
		const label = t.label.padEnd( 14 );
		const valStr = t.type === 'float' ? fmtFloat( val, 8, 2 ) : fmtNum( val, 8 );
		// visual bar
		const pct = val != null ? ( val - t.min ) / ( t.max - t.min ) : 0;
		const barW = 20;
		const bar = barH( pct, 1, barW );
		const highlight = ( i === sliderCursor ) ? A.bold : '';
		lines.push( '  ' + sel + highlight + label + valStr + '  ' + bar + A.reset );
	}
	lines.push( '' );

	// graphs section
	if ( showGraphs ) {
		lines.push( bold( '  Graphs' ) + dim( '  [g] toggle' ) );
		const rec = focusedSessionRecords();
		const graphW = Math.max( 20, termW - 24 );
		const graphStats = ['boids', 'species', 'food_eaten', 'births', 'deaths', 'avg_age'];
		for ( const stat of graphStats ) {
			const arr = rec[ stat ] || [];
			const last = arr.length > 0 ? arr[ arr.length - 1 ] : null;
			const label = stat.padEnd( 14 );
			const num = fmtNum( last, 6 );
			const spark = sparkline( arr, Math.min( graphW, 50 ) );
			lines.push( '  ' + dim( label ) + num + '  ' + cyan( spark ) );
		}
	}
	else {
		lines.push( dim( '  [g] show graphs' ) );
	}
	lines.push( '' );
	lines.push( dim( '  [p] pause  [r] resume  [k] kill  [s] save tank  [b] save boids' ) );
}

// ─── View: NEW SIM ────────────────────────────────────────────────────────────

// Pre-launch param overrides (shown when user picks a preset)
const NEW_SIM_PARAMS = [
	{ key: 'num_boids',    label: 'Boids',     min: 1,   max: 200,  step: 1,   type: 'int',   def: null },
	{ key: 'num_foods',    label: 'Foods',     min: 0,   max: 200,  step: 1,   type: 'int',   def: null },
	{ key: 'num_plants',   label: 'Plants',    min: 0,   max: 100,  step: 1,   type: 'int',   def: null },
	{ key: 'width',        label: 'Width',     min: 200, max: 4000, step: 50,  type: 'int',   def: 1000 },
	{ key: 'height',       label: 'Height',    min: 200, max: 3000, step: 50,  type: 'int',   def: 750 },
	{ key: 'speed',        label: 'Speed',     min: 0,   max: 2,    step: 1,   type: 'enum',  def: 0, enums: ['full', 'throttled', 'natural'] },
];

function renderNewSim( lines ) {
	lines.push( '' );
	lines.push( bold( '  NEW SIMULATION' ) );
	lines.push( '' );

	if ( newSimPhase === 'preset' ) {
		lines.push( dim( '  Select a simulation preset:' ) );
		lines.push( dim( '  ' + '─'.repeat( 40 ) ) );

		// show presets in a scrolling window
		const maxVisible = Math.max( 5, termH - 14 );
		const startIdx = Math.max( 0, newSimCursor - Math.floor( maxVisible / 2 ) );
		const endIdx = Math.min( SIM_PRESETS.length, startIdx + maxVisible );

		for ( let i = startIdx; i < endIdx; i++ ) {
			const sel = ( i === newSimCursor ) ? cyan( '▸ ' ) : '  ';
			const highlight = ( i === newSimCursor ) ? A.bold : '';
			lines.push( '  ' + sel + highlight + SIM_PRESETS[ i ] + A.reset );
		}

		lines.push( '' );
		lines.push( dim( '  [↑↓] select  [Enter] configure & launch  [Esc] cancel' ) );
	}
	else if ( newSimPhase === 'params' ) {
		const preset = SIM_PRESETS[ newSimCursor ];
		lines.push( '  Preset: ' + bold( preset ) );
		lines.push( dim( '  Configure launch params (null = use preset default):' ) );
		lines.push( dim( '  ' + '─'.repeat( 50 ) ) );

		for ( let i = 0; i < NEW_SIM_PARAMS.length; i++ ) {
			const p = NEW_SIM_PARAMS[i];
			const val = newSimParams[ p.key ];
			const sel = ( i === newSimParamCursor ) ? cyan( '▸ ' ) : '  ';
			const highlight = ( i === newSimParamCursor ) ? A.bold : '';
			let valStr;
			if ( p.type === 'enum' ) {
				const idx = val ?? p.def;
				valStr = p.enums[ idx ] || '?';
			}
			else if ( val == null ) {
				valStr = dim( '(default)' );
			}
			else {
				valStr = p.type === 'float' ? val.toFixed(2) : String( val );
			}
			lines.push( '  ' + sel + highlight + p.label.padEnd( 12 ) + A.reset + '  ' + valStr );
		}

		lines.push( '' );
		lines.push( dim( '  [↑↓] select  [←→] adjust  [Enter] launch  [Esc] back to presets' ) );
	}
}

// ─── View: LIBRARY ────────────────────────────────────────────────────────────

function renderLibrary( lines ) {
	lines.push( '' );
	const tankTab = libTab === 'tanks' ? inv( ' Tanks ' ) : dim( ' Tanks ' );
	const boidTab = libTab === 'boids' ? inv( ' Boids ' ) : dim( ' Boids ' );
	lines.push( '  ' + bold( 'LIBRARY' ) + '    ' + tankTab + '  ' + boidTab );
	lines.push( '' );

	if ( libData.length === 0 ) {
		lines.push( dim( '  No saved items. Use [s] in Session view to save.' ) );
		lines.push( dim( '  Press [R] to refresh.' ) );
		lines.push( '' );
		return;
	}

	lines.push( dim( '  ' + '─'.repeat( termW - 4 ) ) );

	if ( libTab === 'tanks' ) {
		const hdr = '  ' + ' '.repeat(3) + 'ID'.padStart(5) + '  ' + 'Label'.padEnd(20) + '  ' + 'Boids'.padStart(6) + '  ' + 'Plants'.padStart(7) + '  ' + 'Size'.padEnd(12);
		lines.push( dim( hdr ) );
		lines.push( dim( '  ' + '─'.repeat( termW - 4 ) ) );

		const maxRows = Math.max( 3, termH - 16 );
		const startIdx = Math.max( 0, libCursor - Math.floor( maxRows / 2 ) );
		const endIdx = Math.min( libData.length, startIdx + maxRows );

		for ( let i = startIdx; i < endIdx; i++ ) {
			const row = libData[i];
			const sel = ( i === libCursor ) ? cyan( '▸ ' ) : '  ';
			const highlight = ( i === libCursor ) ? A.bold : '';
			const id = String( row.id ).padStart( 5 );
			const label = fit( row.label || '(unnamed)', 20 );
			const boids = fmtNum( row.num_boids, 6 );
			const plants = fmtNum( row.num_plants, 7 );
			const size = `${row.width || '?'}x${row.height || '?'}`;
			lines.push( '  ' + sel + highlight + id + '  ' + label + '  ' + boids + '  ' + plants + '  ' + size + A.reset );
		}
	}
	else {
		const hdr = '  ' + ' '.repeat(3) + 'ID'.padStart(5) + '  ' + 'Label'.padEnd(20) + '  ' + 'Count'.padStart(6) + '  ' + 'Species'.padStart(8);
		lines.push( dim( hdr ) );
		lines.push( dim( '  ' + '─'.repeat( termW - 4 ) ) );

		const maxRows = Math.max( 3, termH - 16 );
		const startIdx = Math.max( 0, libCursor - Math.floor( maxRows / 2 ) );
		const endIdx = Math.min( libData.length, startIdx + maxRows );

		for ( let i = startIdx; i < endIdx; i++ ) {
			const row = libData[i];
			const sel = ( i === libCursor ) ? cyan( '▸ ' ) : '  ';
			const highlight = ( i === libCursor ) ? A.bold : '';
			const id = String( row.id ).padStart( 5 );
			const label = fit( row.label || '(unnamed)', 20 );
			const count = fmtNum( row.count, 6 );
			const species = fmtNum( row.num_species, 8 );
			lines.push( '  ' + sel + highlight + id + '  ' + label + '  ' + count + '  ' + species + A.reset );
		}
	}

	lines.push( dim( '  ' + '─'.repeat( termW - 4 ) ) );
	lines.push( '' );
	lines.push( dim( '  [t] tanks  [b] boids  [R] refresh  [Enter] load into focused session  [↑↓] select' ) );
}

// ─── Main render ──────────────────────────────────────────────────────────────

function render() {
	const sessions = sessionsArray();
	const wallElapsed = fmtTime( Date.now() - startTime );
	const numRunning = sessions.filter( s => s.last_status?.running ).length;

	// Tab bar
	const tabs = [
		currentView === VIEW.DASHBOARD ? inv( ' 1:Dashboard ' ) : dim( ' 1:Dashboard ' ),
		currentView === VIEW.SESSION   ? inv( ' 2:Session ' )   : dim( ' 2:Session ' ),
		currentView === VIEW.NEW_SIM   ? inv( ' 3:New Sim ' )   : dim( ' 3:New Sim ' ),
		currentView === VIEW.LIBRARY   ? inv( ' 4:Library ' )   : dim( ' 4:Library ' ),
	].join( ' ' );

	const title = bold( 'VECTORCOSM' ) +
		`  sessions: ${sessions.length}` +
		`  running: ${numRunning}` +
		`  wall: ${wallElapsed}`;

	const out = [ A.clear, '', '  ' + title + '    ' + tabs, '' ];

	switch ( currentView ) {
		case VIEW.DASHBOARD: renderDashboard( out ); break;
		case VIEW.SESSION:   renderSession( out ); break;
		case VIEW.NEW_SIM:   renderNewSim( out ); break;
		case VIEW.LIBRARY:   renderLibrary( out ); break;
	}

	process.stdout.write( out.join( '\n' ) + '\n' );
}

// ─── Key handlers ─────────────────────────────────────────────────────────────

async function handleKey( key ) {
	// global keys
	if ( key === 'q' || key === '\u0003' ) { return shutdown( 'quit' ); }
	if ( key === '1' ) { currentView = VIEW.DASHBOARD; return; }
	if ( key === '2' ) { currentView = VIEW.SESSION; return; }
	if ( key === '3' ) { currentView = VIEW.NEW_SIM; newSimPhase = 'preset'; return; }
	if ( key === '4' ) { currentView = VIEW.LIBRARY; await refreshLibrary(); return; }

	// TAB cycles views forward, Shift+TAB (not common) would need more work
	if ( key === '\t' ) {
		const next = ( currentView + 1 ) % 4;
		if ( next === VIEW.LIBRARY ) { await refreshLibrary(); }
		if ( next === VIEW.NEW_SIM ) { newSimPhase = 'preset'; }
		currentView = next;
		return;
	}

	// 'n' shortcut: go to New Sim from any view
	if ( key === 'n' && currentView !== VIEW.NEW_SIM ) {
		currentView = VIEW.NEW_SIM;
		newSimPhase = 'preset';
		return;
	}

	switch ( currentView ) {
		case VIEW.DASHBOARD: await handleDashboardKey( key ); break;
		case VIEW.SESSION:   await handleSessionKey( key ); break;
		case VIEW.NEW_SIM:   await handleNewSimKey( key ); break;
		case VIEW.LIBRARY:   await handleLibraryKey( key ); break;
	}
}

async function handleDashboardKey( key ) {
	const count = sessionOrder.length;

	// arrow up
	if ( key === '\x1B[A' ) { dashCursor = Math.max( 0, dashCursor - 1 ); return; }
	// arrow down
	if ( key === '\x1B[B' ) { dashCursor = Math.min( count - 1, dashCursor + 1 ); return; }

	// Enter: focus session
	if ( key === '\r' && count > 0 ) {
		focusedSession = sessionOrder[ dashCursor ];
		await refreshSettings( focusedSession );
		currentView = VIEW.SESSION;
		return;
	}

	// p: pause
	if ( key === 'p' && count > 0 ) {
		const name = sessionOrder[ dashCursor ];
		try { await orch.call( name, 'stop_autonomous', {} ); } catch {}
		return;
	}

	// r: resume
	if ( key === 'r' && count > 0 ) {
		const name = sessionOrder[ dashCursor ];
		try { await orch.call( name, 'resume_autonomous', {} ); } catch {}
		return;
	}

	// k: kill session
	if ( key === 'k' && count > 0 ) {
		const name = sessionOrder[ dashCursor ];
		try { await orch.terminate( name ); } catch {}
		dashCursor = Math.min( dashCursor, sessionOrder.length - 2 );
		if ( dashCursor < 0 ) { dashCursor = 0; }
		return;
	}
}

async function handleSessionKey( key ) {
	if ( !focusedSession ) { return; }
	const info = focusedSessionInfo();
	if ( !info ) { return; }

	// arrow up/down: navigate sliders
	if ( key === '\x1B[A' ) { sliderCursor = Math.max( 0, sliderCursor - 1 ); return; }
	if ( key === '\x1B[B' ) { sliderCursor = Math.min( TUNABLES.length - 1, sliderCursor + 1 ); return; }

	// arrow left / minus: decrease
	if ( key === '\x1B[D' || key === '-' ) { await adjustTunable( -1 ); return; }
	// arrow right / plus: increase
	if ( key === '\x1B[C' || key === '+' || key === '=' ) { await adjustTunable( 1 ); return; }

	// g: toggle graphs
	if ( key === 'g' ) { showGraphs = !showGraphs; return; }

	// p: pause
	if ( key === 'p' ) {
		try { await orch.call( focusedSession, 'stop_autonomous', {} ); } catch {}
		return;
	}

	// r: resume
	if ( key === 'r' ) {
		try { await orch.call( focusedSession, 'resume_autonomous', {} ); } catch {}
		return;
	}

	// k: kill
	if ( key === 'k' ) {
		try { await orch.terminate( focusedSession ); } catch {}
		focusedSession = null;
		currentView = VIEW.DASHBOARD;
		return;
	}

	// s: save tank
	if ( key === 's' ) {
		try {
			const result = await orch.call( focusedSession, 'save_tank', {} );
			statusMessage = `Tank saved (id: ${result?.id || '?'})`;
		}
		catch ( e ) { statusMessage = `Save failed: ${e.message}`; }
		return;
	}

	// b: save boids
	if ( key === 'b' ) {
		try {
			const result = await orch.call( focusedSession, 'export_boids', { db: true } );
			statusMessage = 'Boids saved to library';
		}
		catch ( e ) { statusMessage = `Save failed: ${e.message}`; }
		return;
	}
}

let statusMessage = null;

async function adjustTunable( dir ) {
	const t = TUNABLES[ sliderCursor ];
	if ( !t ) { return; }
	const settings = sessionSettings.get( focusedSession ) || {};
	let val = settings[ t.key ];
	if ( val == null ) { val = ( t.min + t.max ) / 2; }

	if ( t.type === 'float' ) {
		val = clampf( val + dir * t.step, t.min, t.max );
		val = Math.round( val / t.step ) * t.step; // snap to step
	}
	else {
		val = clamp( val + dir * t.step, t.min, t.max );
	}

	// send to worker
	try {
		const result = await orch.call( focusedSession, 'update_sim_settings', { [t.key]: val } );
		if ( result ) { sessionSettings.set( focusedSession, result ); }
	}
	catch {}
}

async function handleNewSimKey( key ) {
	if ( newSimPhase === 'preset' ) {
		if ( key === '\x1B[A' ) { newSimCursor = Math.max( 0, newSimCursor - 1 ); return; }
		if ( key === '\x1B[B' ) { newSimCursor = Math.min( SIM_PRESETS.length - 1, newSimCursor + 1 ); return; }

		// Enter: go to param phase
		if ( key === '\r' ) {
			newSimPhase = 'params';
			newSimParamCursor = 0;
			// reset params
			newSimParams = {};
			for ( const p of NEW_SIM_PARAMS ) {
				newSimParams[ p.key ] = p.def;
			}
			return;
		}

		// Esc: back to dashboard
		if ( key === '\x1B' ) { currentView = VIEW.DASHBOARD; return; }
	}
	else if ( newSimPhase === 'params' ) {
		if ( key === '\x1B[A' ) { newSimParamCursor = Math.max( 0, newSimParamCursor - 1 ); return; }
		if ( key === '\x1B[B' ) { newSimParamCursor = Math.min( NEW_SIM_PARAMS.length - 1, newSimParamCursor + 1 ); return; }

		// left/right: adjust param
		if ( key === '\x1B[D' || key === '-' ) { adjustNewSimParam( -1 ); return; }
		if ( key === '\x1B[C' || key === '+' || key === '=' ) { adjustNewSimParam( 1 ); return; }

		// Enter: launch
		if ( key === '\r' ) { await launchNewSim(); return; }

		// Esc: back to preset selection
		if ( key === '\x1B' ) { newSimPhase = 'preset'; return; }
	}
}

function adjustNewSimParam( dir ) {
	const p = NEW_SIM_PARAMS[ newSimParamCursor ];
	if ( !p ) { return; }
	let val = newSimParams[ p.key ] ?? p.def;
	if ( p.type === 'enum' ) {
		val = ( ( val ?? 0 ) + dir + p.enums.length ) % p.enums.length;
	}
	else if ( p.type === 'float' ) {
		val = val == null ? ( p.min + p.max ) / 2 : val;
		val = clampf( val + dir * p.step, p.min, p.max );
		val = Math.round( val / p.step ) * p.step;
	}
	else {
		val = val == null ? Math.round( ( p.min + p.max ) / 2 ) : val;
		val = clamp( val + dir * p.step, p.min, p.max );
	}
	newSimParams[ p.key ] = val;
}

async function launchNewSim() {
	const preset = SIM_PRESETS[ newSimCursor ];
	const name = nextSessionName();

	// build init params
	const initP = { sim: preset };
	for ( const p of NEW_SIM_PARAMS ) {
		const v = newSimParams[ p.key ];
		if ( v == null ) { continue; }
		if ( p.type === 'enum' ) {
			initP[ p.key ] = p.enums[ v ];
		}
		else {
			initP[ p.key ] = v;
		}
	}
	// extract speed-related param
	const speed = initP.speed || 'full';
	delete initP.speed;

	try {
		await orch.spawn( name, initP );
		await orch.call( name, 'start_autonomous', { speed, stats_interval: 2000 } );
		await refreshSettings( name );
		focusedSession = name;
		currentView = VIEW.SESSION;
		statusMessage = `Session "${name}" launched (${preset})`;
	}
	catch ( e ) {
		statusMessage = `Failed to launch: ${e.message}`;
	}
}

// ─── Library ──────────────────────────────────────────────────────────────────

async function refreshLibrary() {
	libData = [];
	libCursor = 0;
	try {
		if ( !focusedSession ) {
			// no session to query — library commands need a session
			// use any available session, or none
			const sessions = sessionsArray();
			if ( sessions.length === 0 ) { return; }
			const name = sessions[0].name;
			const cmd = libTab === 'tanks' ? 'tank_library_list' : 'boid_library_list';
			libData = await orch.call( name, cmd, {} ) || [];
		}
		else {
			const cmd = libTab === 'tanks' ? 'tank_library_list' : 'boid_library_list';
			libData = await orch.call( focusedSession, cmd, {} ) || [];
		}
	}
	catch {}
}

async function handleLibraryKey( key ) {
	if ( key === '\x1B[A' ) { libCursor = Math.max( 0, libCursor - 1 ); return; }
	if ( key === '\x1B[B' ) { libCursor = Math.min( libData.length - 1, libCursor + 1 ); return; }

	if ( key === 't' ) { libTab = 'tanks'; await refreshLibrary(); return; }
	if ( key === 'b' ) { libTab = 'boids'; await refreshLibrary(); return; }
	if ( key === 'R' ) { await refreshLibrary(); return; }

	// Enter: load selected item into focused session
	if ( key === '\r' && libData.length > 0 && focusedSession ) {
		const row = libData[ libCursor ];
		try {
			if ( libTab === 'tanks' ) {
				const full = await orch.call( focusedSession, 'tank_library_get_row', { id: row.id } );
				if ( full?.scene ) {
					await orch.call( focusedSession, 'stop_autonomous', {} );
					await orch.call( focusedSession, 'import_tank', full.scene );
					await orch.call( focusedSession, 'start_autonomous', { speed: 'full', stats_interval: 2000 } );
					await refreshSettings( focusedSession );
					statusMessage = `Tank "${row.label || row.id}" loaded into ${focusedSession}`;
					currentView = VIEW.SESSION;
				}
			}
			else {
				const full = await orch.call( focusedSession, 'boid_library_get_row', { id: row.id } );
				if ( full?.specimens ) {
					await orch.call( focusedSession, 'load_boids', JSON.stringify( full.specimens ) );
					statusMessage = `Boids "${row.label || row.id}" loaded into ${focusedSession}`;
					currentView = VIEW.SESSION;
				}
			}
		}
		catch ( e ) {
			statusMessage = `Load failed: ${e.message}`;
		}
		return;
	}
}

// ─── Keyboard input ───────────────────────────────────────────────────────────

if ( process.stdin.isTTY ) {
	process.stdin.setRawMode( true );
	process.stdin.resume();
	process.stdin.setEncoding( 'utf8' );

	process.stdin.on( 'data', ( chunk ) => {
		// handle key, then re-render immediately so input feels responsive
		handleKey( chunk )
			.then( () => { if ( !stopped ) { render(); showStatus(); } } )
			.catch( () => {} );
	} );
}

// ─── Render loop ──────────────────────────────────────────────────────────────

function showStatus() {
	if ( statusMessage ) {
		process.stdout.write( '\n  ' + yellow( statusMessage ) + '\n' );
		statusMessage = null;
	}
}

// Poll loop: refresh data from workers, then re-render.
// Keyboard input triggers its own immediate render (see stdin handler).
async function pollLoop() {
	if ( stopped ) { return; }
	await orch.pollStatus();
	render();
	showStatus();
	if ( !stopped ) { setTimeout( pollLoop, 1000 ); }
}

// ─── CLI arg parser ────────────────────────────────────────────────────────────

function parseArgs( argv ) {
	const args = {};
	for ( let i = 2; i < argv.length; i++ ) {
		const arg = argv[i];
		if ( !arg.startsWith( '--' ) ) { continue; }
		const eq  = arg.indexOf( '=' );
		const key = eq >= 0 ? arg.slice( 2, eq ) : arg.slice( 2 );
		const raw = eq >= 0 ? arg.slice( eq + 1 ) : ( argv[ i + 1 ] && !argv[ i + 1 ].startsWith( '--' ) ? argv[ ++i ] : null );
		if ( raw == null ) { args[ key ] = true; }
		else {
			const n = Number( raw );
			args[ key ] = ( raw !== '' && !isNaN( n ) ) ? n : raw;
		}
	}
	return args;
}

const args = parseArgs( process.argv );

if ( args.help ) {
	process.stdout.write( [
		'',
		bold( 'VECTORCOSM TUI' ) + ' — interactive terminal dashboard',
		'',
		'USAGE',
		'  node cli/tui.js [--help]',
		'',
		'Opens an empty dashboard. Create simulations interactively.',
		'',
		'KEYBOARD',
		'  1-4 / Tab     Switch views: Dashboard, Session, New Sim, Library',
		'  n             New simulation (shortcut)',
		'  q / Ctrl-C    Quit',
		'',
		'DASHBOARD VIEW',
		'  ↑/↓           Select session',
		'  Enter          Focus session → switch to Session view',
		'  p/r/k          Pause / Resume / Kill selected session',
		'',
		'SESSION VIEW',
		'  ↑/↓           Navigate parameters',
		'  ←/→ or +/-    Adjust parameter values',
		'  g              Toggle stat graphs',
		'  p/r/k          Pause / Resume / Kill',
		'  s              Save tank to library',
		'  b              Save boids to library',
		'',
		'NEW SIM VIEW',
		'  ↑/↓           Select preset',
		'  Enter          Configure params / Launch',
		'  Esc            Back',
		'',
		'LIBRARY VIEW',
		'  t/b            Switch Tanks / Boids tab',
		'  R              Refresh list',
		'  ↑/↓           Select entry',
		'  Enter          Load into focused session',
		'',
	].join( '\n' ) );
	process.exit( 0 );
}

// ─── Start ────────────────────────────────────────────────────────────────────

pollLoop();
