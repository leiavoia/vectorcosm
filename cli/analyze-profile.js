/* <AI>
cli/analyze-profile.js — V8 CPU profile hot-path extractor.

Parses a cpuprofile JSON (from profile-sim.js), computes self/total time per
function, extracts source snippets from local files, and outputs a structured
hot-paths report for AI analysis.

Input:  profile-output/cpuprofile-<ts>.json (V8 CPU profile format)
Output: profile-output/hot-paths-<ts>.json  (structured report with source)
        + readable text summary on stdout

V8 CPU profile format:
  nodes[]      — call tree nodes, each with callFrame (functionName, url, lineNumber)
  samples[]    — node IDs at top of stack per sample
  timeDeltas[] — µs between consecutive samples

Algorithm:
  1. Build node map + parent map from nodes tree
  2. For each sample: accumulate selfTime on leaf node, totalTime up ancestor chain
  3. Filter noise: (program), (garbage collector), (idle), node_modules
  4. Sort by selfTime descending, take top N
  5. Map callFrame.url → local file path (strip Vite dev server origin)
  6. Read ±40 lines of source at each hot function's lineNumber
  7. For top entries, walk call chain from node to root
  8. Write hot-paths.json + print text summary

USAGE
  node cli/analyze-profile.js [options]
  node cli/analyze-profile.js --file=profile-output/cpuprofile-2026-04-18T04-12-11.json
  node cli/analyze-profile.js --top=30

OPTIONS
  --file=<path>       Input cpuprofile (default: newest in profile-output/)
  --top=<n>           Number of hot functions (default: 20)
  --chains=<n>        Number of entries with full call chains (default: 10)
  --context=<n>       Source lines above/below hot line (default: 40)
  --url-base=<url>    Vite URL prefix to strip (default: http://localhost:5173)
  --src-root=<path>   Local project root (default: auto-detect from __dirname/../)
  --output=<dir>      Output directory (default: same as input file's directory)
  --help              Print help
</AI> */

import { resolve, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { readFile, readdir, writeFile } from 'fs/promises';

const __filename = fileURLToPath( import.meta.url );
const __dirname  = dirname( __filename );

// ─── Arg parser ───────────────────────────────────────────────────────────────

const INT_KEYS = new Set( ['top', 'chains', 'context'] );

function parseArgs( argv ) {
	const args = {};
	for ( let i = 2; i < argv.length; i++ ) {
		const arg = argv[i];
		if ( !arg.startsWith( '--' ) ) { continue; }
		const eq  = arg.indexOf( '=' );
		const key = eq >= 0 ? arg.slice( 2, eq ) : arg.slice( 2 );
		const raw = eq >= 0
			? arg.slice( eq + 1 )
			: ( argv[i + 1] && !argv[i + 1].startsWith( '--' ) ? argv[++i] : 'true' );
		args[key] = INT_KEYS.has( key ) ? parseInt( raw, 10 ) : raw;
	}
	return args;
}

// ─── Help ─────────────────────────────────────────────────────────────────────

function printHelp() {
	process.stdout.write( [
		'Usage: node cli/analyze-profile.js [options]',
		'',
		'  --file=<path>       Input cpuprofile JSON (default: newest in profile-output/)',
		'  --top=<n>           Number of hot functions to report (default: 20)',
		'  --chains=<n>        Entries with full call chains (default: 10)',
		'  --context=<n>       Source context lines above/below (default: 40)',
		'  --url-base=<url>    Vite URL prefix to strip (default: http://localhost:5173)',
		'  --src-root=<path>   Local project root (default: auto)',
		'  --output=<dir>      Output directory (default: input file\'s directory)',
		'  --help              Print help',
		'',
		'Examples:',
		'  node cli/analyze-profile.js',
		'  node cli/analyze-profile.js --file=profile-output/cpuprofile-2026-04-18.json --top=30',
		'',
	].join( '\n' ) );
}

// ─── Find newest cpuprofile in a directory ────────────────────────────────────

async function findNewestCpuProfile( dir ) {
	let files;
	try { files = await readdir( dir ); }
	catch { return null; }
	const cpuFiles = files
		.filter( f => f.startsWith( 'cpuprofile-' ) && f.endsWith( '.json' ) )
		.sort()
		.reverse();
	return cpuFiles.length ? resolve( dir, cpuFiles[0] ) : null;
}

// ─── Profile analysis ─────────────────────────────────────────────────────────

// Noise function names and URL patterns to exclude
const NOISE_NAMES = new Set( [
	'(root)', '(program)', '(garbage collector)', '(idle)',
	'', '(anonymous)',
] );

function isNoise( callFrame ) {
	if ( NOISE_NAMES.has( callFrame.functionName ) ) { return true; }
	const url = callFrame.url || '';
	if ( url.includes( 'extensions/' ) ) { return true; }
	// V8 internals have no URL or start with 'native ' or 'v8/'
	if ( !url || url.startsWith( 'native ' ) || url.startsWith( 'v8/' ) ) { return true; }
	return false;
}

// Build timing data from profile
function analyzeProfile( profile ) {
	const { nodes, samples, timeDeltas } = profile;

	// build node map and parent map
	const nodeMap = new Map();
	const parentMap = new Map();
	for ( const node of nodes ) {
		nodeMap.set( node.id, node );
		// CDP Tracing format uses node.parent; standard V8 format uses node.children
		if ( node.parent !== undefined ) {
			parentMap.set( node.id, node.parent );
		}
		if ( node.children ) {
			for ( const childId of node.children ) {
				parentMap.set( childId, node.id );
			}
		}
	}

	// accumulate times from samples
	const selfTime  = new Map(); // nodeId → µs
	const totalTime = new Map(); // nodeId → µs

	for ( let i = 0; i < samples.length; i++ ) {
		const nodeId = samples[i];
		const delta  = timeDeltas[i] || 0;

		// self time: this node was on top of stack
		selfTime.set( nodeId, ( selfTime.get( nodeId ) || 0 ) + delta );

		// total time: walk up to root, add delta to every ancestor
		let current = nodeId;
		while ( current !== undefined ) {
			totalTime.set( current, ( totalTime.get( current ) || 0 ) + delta );
			current = parentMap.get( current );
		}
	}

	// total profile time
	const totalProfileTime = timeDeltas.reduce( (a, b) => a + b, 0 );

	// build entries for all non-noise nodes that have any self time
	const entries = [];
	for ( const [nodeId, selfUs] of selfTime.entries() ) {
		const node = nodeMap.get( nodeId );
		if ( !node ) { continue; }
		if ( isNoise( node.callFrame ) ) { continue; }

		const totalUs = totalTime.get( nodeId ) || 0;
		entries.push( {
			nodeId,
			functionName: node.callFrame.functionName || '(anonymous)',
			url:          node.callFrame.url || '',
			lineNumber:   node.callFrame.lineNumber,   // 0-based from V8
			columnNumber: node.callFrame.columnNumber,
			self_us:      selfUs,
			total_us:     totalUs,
			self_ms:      Math.round( selfUs / 1000 ),
			total_ms:     Math.round( totalUs / 1000 ),
			self_pct:     totalProfileTime > 0 ? ( selfUs / totalProfileTime * 100 ) : 0,
			total_pct:    totalProfileTime > 0 ? ( totalUs / totalProfileTime * 100 ) : 0,
			hitCount:     node.hitCount || 0,
		} );
	}

	// sort by self time descending
	entries.sort( (a, b) => b.self_us - a.self_us );

	// aggregate entries by function+location (same function called from different
	// paths appears as separate tree nodes — merge them for the summary)
	const aggMap = new Map();
	for ( const e of entries ) {
		const key = `${e.url}:${e.lineNumber}:${e.functionName}`;
		if ( aggMap.has( key ) ) {
			const a = aggMap.get( key );
			a.self_us  += e.self_us;
			a.total_us += e.total_us;
			a.hitCount += e.hitCount;
			a.nodeIds.push( e.nodeId );
		}
		else {
			aggMap.set( key, {
				nodeId:       e.nodeId, // keep first (highest self_time) for call chain
				nodeIds:      [e.nodeId],
				functionName: e.functionName,
				url:          e.url,
				lineNumber:   e.lineNumber,
				columnNumber: e.columnNumber,
				self_us:      e.self_us,
				total_us:     e.total_us,
				hitCount:     e.hitCount,
			} );
		}
	}
	const aggregated = [...aggMap.values()].map( a => ( {
		...a,
		self_ms:   Math.round( a.self_us / 1000 ),
		total_ms:  Math.round( a.total_us / 1000 ),
		self_pct:  totalProfileTime > 0 ? ( a.self_us / totalProfileTime * 100 ) : 0,
		total_pct: totalProfileTime > 0 ? ( a.total_us / totalProfileTime * 100 ) : 0,
	} ) );
	aggregated.sort( (a, b) => b.self_us - a.self_us );

	return { entries: aggregated, nodeMap, parentMap, totalProfileTime };
}

// Walk call chain from a node up to root
function getCallChain( nodeId, nodeMap, parentMap ) {
	const chain = [];
	let current = nodeId;
	while ( current !== undefined ) {
		const node = nodeMap.get( current );
		if ( node ) {
			chain.unshift( {
				functionName: node.callFrame.functionName || '(anonymous)',
				url:          node.callFrame.url || '',
				lineNumber:   node.callFrame.lineNumber,
			} );
		}
		current = parentMap.get( current );
	}
	return chain;
}

// ─── Source snippet reader ────────────────────────────────────────────────────

// Convert Vite dev server URL to local file path
function urlToLocalPath( url, urlBase, srcRoot ) {
	if ( !url ) { return null; }
	// strip Vite URL base
	let localPath = url;
	if ( localPath.startsWith( urlBase ) ) {
		localPath = localPath.slice( urlBase.length );
	}
	// strip query string and hash (Vite adds ?t=... for HMR)
	const qIdx = localPath.indexOf( '?' );
	if ( qIdx >= 0 ) { localPath = localPath.slice( 0, qIdx ); }
	const hIdx = localPath.indexOf( '#' );
	if ( hIdx >= 0 ) { localPath = localPath.slice( 0, hIdx ); }
	// strip leading slash
	if ( localPath.startsWith( '/' ) ) { localPath = localPath.slice( 1 ); }
	if ( !localPath ) { return null; }
	return resolve( srcRoot, localPath );
}

// Read source lines around a target line
async function readSourceSnippet( filePath, lineNumber, contextLines ) {
	if ( !filePath || lineNumber < 0 ) { return null; }
	try {
		const content = await readFile( filePath, 'utf8' );
		const lines = content.split( '\n' );
		// V8 lineNumber is 0-based
		const targetLine = lineNumber;
		const start = Math.max( 0, targetLine - contextLines );
		const end   = Math.min( lines.length - 1, targetLine + contextLines );
		const snippet = [];
		for ( let i = start; i <= end; i++ ) {
			const marker = ( i === targetLine ) ? '>>>' : '   ';
			snippet.push( `${marker} ${String( i + 1 ).padStart( 5 )} | ${lines[i]}` );
		}
		return {
			filePath,
			startLine: start + 1, // 1-based for humans
			endLine:   end + 1,
			targetLine: targetLine + 1,
			text: snippet.join( '\n' ),
		};
	}
	catch {
		return null;
	}
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
	const args = parseArgs( process.argv );

	if ( args.help === 'true' || args.h === 'true' ) {
		printHelp();
		process.exit( 0 );
	}

	const topN         = ( typeof args.top     === 'number' && args.top > 0 )     ? args.top     : 20;
	const chainCount   = ( typeof args.chains  === 'number' && args.chains > 0 )  ? args.chains  : 10;
	const contextLines = ( typeof args.context === 'number' && args.context > 0 ) ? args.context : 40;
	const urlBase      = typeof args['url-base']  === 'string' ? args['url-base']  : 'http://localhost:5173';
	const srcRoot      = typeof args['src-root']  === 'string' ? resolve( args['src-root'] ) : resolve( __dirname, '..' );

	// find input file
	let inputFile = null;
	if ( typeof args.file === 'string' ) {
		inputFile = resolve( args.file );
	}
	else {
		const defaultDir = resolve( './profile-output' );
		inputFile = await findNewestCpuProfile( defaultDir );
		if ( !inputFile ) {
			process.stderr.write(
				'[analyze] No cpuprofile files found in profile-output/\n' +
				'  Run: npm run profile -- --sim=peaceful_tank --duration=20\n'
			);
			process.exit( 1 );
		}
	}

	const outputDir = typeof args.output === 'string'
		? resolve( args.output )
		: dirname( inputFile );

	console.log( `[analyze] input:     ${inputFile}` );
	console.log( `[analyze] top:       ${topN}` );
	console.log( `[analyze] chains:    ${chainCount}` );
	console.log( `[analyze] context:   ±${contextLines} lines` );
	console.log( `[analyze] src root:  ${srcRoot}` );

	// ─── Load and parse profile ───────────────────────────────────────────────

	let profile;
	try {
		const raw = await readFile( inputFile, 'utf8' );
		profile = JSON.parse( raw );
	}
	catch ( e ) {
		process.stderr.write( `[analyze] Failed to read profile: ${e.message}\n` );
		process.exit( 1 );
	}

	if ( !profile.nodes || !profile.samples || !profile.timeDeltas ) {
		process.stderr.write( '[analyze] Invalid profile: missing nodes, samples, or timeDeltas.\n' );
		process.exit( 1 );
	}

	console.log( `[analyze] nodes:     ${profile.nodes.length}` );
	console.log( `[analyze] samples:   ${profile.samples.length}` );
	if ( profile.$meta ) {
		console.log( `[analyze] thread:    ${profile.$meta.threadName} (pid:${profile.$meta.pid} tid:${profile.$meta.tid})` );
	}

	// ─── Analyze ──────────────────────────────────────────────────────────────

	const { entries, nodeMap, parentMap, totalProfileTime } = analyzeProfile( profile );
	const topEntries = entries.slice( 0, topN );

	console.log( `[analyze] total profile time: ${( totalProfileTime / 1000 ).toFixed( 0 )} ms` );
	console.log( `[analyze] unique functions with self time: ${entries.length}` );
	console.log( '' );

	// ─── Enrich with source snippets and call chains ──────────────────────────

	// deduplicate file reads
	const fileCache = new Map();
	async function cachedReadSnippet( url, lineNumber ) {
		const localPath = urlToLocalPath( url, urlBase, srcRoot );
		if ( !localPath ) { return null; }
		const cacheKey = `${localPath}:${lineNumber}`;
		if ( fileCache.has( cacheKey ) ) { return fileCache.get( cacheKey ); }
		const snippet = await readSourceSnippet( localPath, lineNumber, contextLines );
		fileCache.set( cacheKey, snippet );
		return snippet;
	}

	const report = [];
	for ( let i = 0; i < topEntries.length; i++ ) {
		const e = topEntries[i];
		const localPath = urlToLocalPath( e.url, urlBase, srcRoot );
		const relPath = localPath ? localPath.replace( srcRoot + '/', '' ) : e.url;

		const entry = {
			rank:         i + 1,
			functionName: e.functionName,
			file:         relPath,
			line:         e.lineNumber + 1, // 1-based for humans
			column:       e.columnNumber + 1,
			self_ms:      e.self_ms,
			total_ms:     e.total_ms,
			self_pct:     Math.round( e.self_pct * 100 ) / 100,
			total_pct:    Math.round( e.total_pct * 100 ) / 100,
			source_snippet: null,
			call_chain:     null,
		};

		// source snippet
		entry.source_snippet = await cachedReadSnippet( e.url, e.lineNumber );

		// call chain for top entries
		if ( i < chainCount ) {
			entry.call_chain = getCallChain( e.nodeId, nodeMap, parentMap )
				.filter( c => !NOISE_NAMES.has( c.functionName ) )
				.map( c => {
					const lp = urlToLocalPath( c.url, urlBase, srcRoot );
					return {
						functionName: c.functionName,
						file: lp ? lp.replace( srcRoot + '/', '' ) : c.url,
						line: c.lineNumber + 1,
					};
				} );
		}

		report.push( entry );
	}

	// ─── Write output ─────────────────────────────────────────────────────────

	const ts = basename( inputFile ).replace( 'cpuprofile-', '' ).replace( '.json', '' );
	const hotPathsFile = resolve( outputDir, `hot-paths-${ts}.json` );

	const output = {
		generated:      new Date().toISOString(),
		input_file:     inputFile,
		profile_thread: profile.$meta?.threadName ?? 'unknown',
		total_time_ms:  Math.round( totalProfileTime / 1000 ),
		total_samples:  profile.samples.length,
		top_n:          topN,
		entries:        report,
	};

	await writeFile( hotPathsFile, JSON.stringify( output, null, 2 ), 'utf8' );
	console.log( `[analyze] hot-paths → ${hotPathsFile}` );

	// ─── Print text summary ───────────────────────────────────────────────────

	console.log( '' );
	console.log( '─── Hot Functions (by self time) ─────────────────────────────' );
	console.log( '' );
	console.log(
		'  #   self_ms  self%   total_ms  total%  function'.padEnd( 80 ) + 'location'
	);
	console.log( '  ' + '─'.repeat( 100 ) );

	for ( const e of report ) {
		const rank     = String( e.rank ).padStart( 3 );
		const selfMs   = String( e.self_ms ).padStart( 7 );
		const selfPct  = e.self_pct.toFixed( 1 ).padStart( 5 );
		const totalMs  = String( e.total_ms ).padStart( 9 );
		const totalPct = e.total_pct.toFixed( 1 ).padStart( 5 );
		const name     = e.functionName.padEnd( 30 ).slice( 0, 30 );
		const loc      = `${e.file}:${e.line}`;
		console.log( `  ${rank}  ${selfMs}  ${selfPct}%  ${totalMs}  ${totalPct}%  ${name}  ${loc}` );
	}

	console.log( '' );

	// print call chains for top entries
	const chainsToShow = report.filter( e => e.call_chain );
	if ( chainsToShow.length ) {
		console.log( '─── Call Chains ─────────────────────────────────────────────' );
		console.log( '' );
		for ( const e of chainsToShow ) {
			console.log( `  #${e.rank} ${e.functionName} (${e.self_ms}ms self, ${e.total_ms}ms total)` );
			if ( e.call_chain ) {
				for ( let i = 0; i < e.call_chain.length; i++ ) {
					const c = e.call_chain[i];
					const indent = '    ' + '  '.repeat( i );
					const arrow = i < e.call_chain.length - 1 ? '→' : '★';
					console.log( `${indent}${arrow} ${c.functionName}  ${c.file}:${c.line}` );
				}
			}
			console.log( '' );
		}
	}

	console.log( '─────────────────────────────────────────────────────────────' );
}

main().catch( err => {
	process.stderr.write( `[analyze] Fatal: ${err.message}\n${err.stack || ''}\n` );
	process.exit( 1 );
} );
