/**
 * tests/test-command-registry.js
 * Pure Node.js test for CommandRegistry. No browser required.
 * Run: node tests/test-command-registry.js
 */

import CommandRegistry from '../src/classes/class.CommandRegistry.js';

let passed = 0;
let failed = 0;

function assert( condition, label ) {
	if ( condition ) {
		passed++;
		console.log( `  ✓ ${label}` );
	} else {
		failed++;
		console.error( `  ✗ ${label}` );
	}
}

async function run() {
	console.log( 'CommandRegistry tests\n' );

	// ── register ──
	console.log( '--- register ---' );
	const reg = new CommandRegistry();

	reg.register( {
		name: 'ping',
		description: 'Health check',
		handler: () => 'pong',
	} );
	assert( reg.has( 'ping' ), 'has() returns true after register' );
	assert( !reg.has( 'nonexistent' ), 'has() returns false for unknown command' );

	// duplicate registration throws
	let threw = false;
	try { reg.register( { name: 'ping', handler: () => {} } ); }
	catch { threw = true; }
	assert( threw, 'duplicate register throws' );

	// missing name throws
	threw = false;
	try { reg.register( { handler: () => {} } ); }
	catch { threw = true; }
	assert( threw, 'register without name throws' );

	// missing handler throws
	threw = false;
	try { reg.register( { name: 'bad' } ); }
	catch { threw = true; }
	assert( threw, 'register without handler throws' );

	// ── execute ──
	console.log( '\n--- execute ---' );
	let result = await reg.execute( 'ping' );
	assert( result.ok === true, 'execute returns ok: true' );
	assert( result.result === 'pong', 'execute returns correct result' );

	// unknown command
	result = await reg.execute( 'nope' );
	assert( result.ok === false, 'unknown command returns ok: false' );
	assert( result.error.includes( 'nope' ), 'error message includes command name' );

	// handler that throws
	reg.register( {
		name: 'explode',
		description: 'Always throws',
		handler: () => { throw new Error( 'boom' ); },
	} );
	result = await reg.execute( 'explode' );
	assert( result.ok === false, 'throwing handler returns ok: false' );
	assert( result.error === 'boom', 'error message captured' );
	assert( typeof result.stack === 'string', 'stack trace captured' );

	// async handler
	reg.register( {
		name: 'async_op',
		description: 'Async handler',
		handler: async ( params ) => params.x * 2,
	} );
	result = await reg.execute( 'async_op', { x: 21 } );
	assert( result.ok === true && result.result === 42, 'async handler works' );

	// ── list ──
	console.log( '\n--- list ---' );
	const list = reg.list();
	assert( Array.isArray( list ), 'list() returns array' );
	assert( list.length === 3, 'list has correct count (3 commands)' );
	const pingEntry = list.find( c => c.name === 'ping' );
	assert( pingEntry !== undefined, 'list includes ping' );
	assert( pingEntry.description === 'Health check', 'list preserves description' );
	assert( !( 'handler' in pingEntry ), 'list does not expose handler' );

	// ── describe ──
	console.log( '\n--- describe ---' );
	const desc = reg.describe( 'ping' );
	assert( desc !== null, 'describe returns object' );
	assert( desc.name === 'ping', 'describe has correct name' );
	assert( !( 'handler' in desc ), 'describe does not expose handler' );

	assert( reg.describe( 'nonexistent' ) === null, 'describe unknown returns null' );

	// ── params metadata ──
	console.log( '\n--- params metadata ---' );
	reg.register( {
		name: 'with_params',
		description: 'Command with param metadata',
		params: {
			count: { type: 'number', optional: false, description: 'How many' },
			label: { type: 'string', optional: true, description: 'Display name' },
		},
		returns: { description: 'Nothing' },
		handler: () => null,
	} );
	const wpDesc = reg.describe( 'with_params' );
	assert( wpDesc.params.count.type === 'number', 'param type preserved' );
	assert( wpDesc.params.label.optional === true, 'param optional flag preserved' );
	assert( wpDesc.returns.description === 'Nothing', 'returns metadata preserved' );

	// ── summary ──
	console.log( `\n${'='.repeat(40)}` );
	console.log( `Results: ${passed} passed, ${failed} failed` );
	process.exit( failed > 0 ? 1 : 0 );
}

run();
