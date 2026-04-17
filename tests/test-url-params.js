#!/usr/bin/env node
// test-url-params.js — Unit test for src/util/url-params.js
// Run: node test-url-params.js

import { parseSimParams, PARAM_SCHEMA, META_PARAM_TYPES } from '../src/util/url-params.js';

let passed = 0;
let failed = 0;

function assert( label, actual, expected ) {
	const ok = JSON.stringify(actual) === JSON.stringify(expected);
	if ( ok ) {
		console.log( `  ✓  ${label}` );
		passed++;
	}
	else {
		console.error( `  ✗  ${label}` );
		console.error( `       expected: ${JSON.stringify(expected)}` );
		console.error( `       got:      ${JSON.stringify(actual)}` );
		failed++;
	}
}

console.log('\n--- PARAM_SCHEMA ---');
assert( 'PARAM_SCHEMA is an object',         typeof PARAM_SCHEMA, 'object' );
assert( 'schema has sim entry',              typeof PARAM_SCHEMA.sim, 'object' );
assert( 'schema has num_boids entry',        typeof PARAM_SCHEMA.num_boids, 'object' );
assert( 'schema has speed entry',            typeof PARAM_SCHEMA.speed, 'object' );
assert( 'META_PARAM_TYPES is an object',     typeof META_PARAM_TYPES, 'object' );
assert( 'META_PARAM_TYPES has segments',     typeof META_PARAM_TYPES.segments, 'string' );

console.log('\n--- parseSimParams: URLSearchParams ---');
{
	const sp = new URLSearchParams('sim=peaceful_tank&num_boids=50');
	const cfg = parseSimParams(sp);
	assert( 'parses sim string',       cfg.sim,       'peaceful_tank' );
	assert( 'parses num_boids int',    cfg.num_boids, 50 );
	assert( 'width absent → missing',  'width' in cfg, false );
}

console.log('\n--- parseSimParams: int and float coercion ---');
{
	const sp = new URLSearchParams('num_boids=100&rounds=10&timeout=45.5&max_mutation=0.2&cullpct=0.7&num_foods=3&num_plants=5&num_rocks=2');
	const cfg = parseSimParams(sp);
	assert( 'num_boids = 100',     cfg.num_boids,    100 );
	assert( 'rounds = 10',         cfg.rounds,       10 );
	assert( 'timeout = 45.5',      cfg.timeout,      45.5 );
	assert( 'max_mutation = 0.2',  cfg.max_mutation, 0.2 );
	assert( 'cullpct = 0.7',       cfg.cullpct,      0.7 );
	assert( 'num_foods = 3',       cfg.num_foods,    3 );
	assert( 'num_plants = 5',      cfg.num_plants,   5 );
	assert( 'num_rocks = 2',       cfg.num_rocks,    2 );
}

console.log('\n--- parseSimParams: width/height override ---');
{
	const sp = new URLSearchParams('width=2560&height=1440');
	const cfg = parseSimParams(sp);
	assert( 'width = 2560',   cfg.width,  2560 );
	assert( 'height = 1440',  cfg.height, 1440 );
}

console.log('\n--- parseSimParams: sim_queue comma list ---');
{
	const sp = new URLSearchParams('sim_queue=natural_tank,peaceful_tank,combat');
	const cfg = parseSimParams(sp);
	assert( 'sim_queue is array',    Array.isArray(cfg.sim_queue), true );
	assert( 'sim_queue length = 3',  cfg.sim_queue.length, 3 );
	assert( 'sim_queue[0]',          cfg.sim_queue[0], 'natural_tank' );
	assert( 'sim_queue[2]',          cfg.sim_queue[2], 'combat' );
}

console.log('\n--- parseSimParams: speed string ---');
{
	const sp = new URLSearchParams('speed=throttled');
	const cfg = parseSimParams(sp);
	assert( 'speed = throttled', cfg.speed, 'throttled' );
}

console.log('\n--- parseSimParams: plain object input ---');
{
	const cfg = parseSimParams({ sim: 'natural_tank', num_boids: '25', rounds: '5' });
	assert( 'plain object: sim',        cfg.sim,       'natural_tank' );
	assert( 'plain object: num_boids',  cfg.num_boids, 25 );
	assert( 'plain object: rounds',     cfg.rounds,    5 );
}

console.log('\n--- parseSimParams: empty / invalid inputs ---');
{
	const cfg = parseSimParams(new URLSearchParams(''));
	assert( 'empty string → empty result', Object.keys(cfg).length, 0 );
}
{
	const cfg = parseSimParams(new URLSearchParams('num_boids=notanumber'));
	assert( 'bad int → key absent', 'num_boids' in cfg, false );
}
{
	const cfg = parseSimParams(new URLSearchParams('sim_queue='));
	assert( 'empty sim_queue → key absent', 'sim_queue' in cfg, false );
}

console.log('\n--- parseSimParams: sim_meta_params dot notation ---');
{
	const sp = new URLSearchParams('sim_meta_params.num_boids=100&sim_meta_params.rounds=5&sim_meta_params.cullpct=0.5&sim_meta_params.segments=2');
	const cfg = parseSimParams(sp);
	assert( 'produces sim_meta_params block',      typeof cfg.sim_meta_params, 'object' );
	assert( 'meta num_boids = 100',                cfg.sim_meta_params?.num_boids,    100 );
	assert( 'meta rounds = 5',                     cfg.sim_meta_params?.rounds,       5 );
	assert( 'meta cullpct = 0.5',                  cfg.sim_meta_params?.cullpct,      0.5 );
	assert( 'meta segments = 2',                   cfg.sim_meta_params?.segments,     2 );
	assert( 'flat keys NOT present at top level',  'num_boids' in cfg, false );
}
{
	// mixed: flat overrides for init-time sims + meta for all-sims-sticky
	const sp = new URLSearchParams('sim=natural_tank&num_boids=30&sim_meta_params.num_boids=60');
	const cfg = parseSimParams(sp);
	assert( 'flat num_boids = 30 (init-time only)', cfg.num_boids, 30 );
	assert( 'meta num_boids = 60 (sticky)',          cfg.sim_meta_params?.num_boids, 60 );
	assert( 'sim = natural_tank',                    cfg.sim, 'natural_tank' );
}
{
	// unknown meta subkeys are ignored
	const sp = new URLSearchParams('sim_meta_params.unknown_key=99');
	const cfg = parseSimParams(sp);
	assert( 'unknown meta subkey → no sim_meta_params block', 'sim_meta_params' in cfg, false );
}
{
	// bad type in meta
	const sp = new URLSearchParams('sim_meta_params.num_boids=notanumber');
	const cfg = parseSimParams(sp);
	assert( 'bad meta int → key absent', cfg.sim_meta_params?.num_boids, undefined );
}

// --- Summary ---
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if ( failed > 0 ) { process.exit(1); }
