/* <AI>
url-params.js — Shared URL parameter parser for GUI and lab/headless modes.

Usage:
  import { parseSimParams, PARAM_SCHEMA } from './util/url-params.js';
  const config = parseSimParams(new URLSearchParams(window.location.search));
  // config only contains keys that were present in the URL (unset params are absent).

PARAM_SCHEMA: self-documenting map of all supported params. Usable by lab.js for help text.

Dot-notation sim_meta_params: use `sim_meta_params.KEY=value` to set sticky per-session overrides
that apply to all simulations in the queue. Example: '?sim_meta_params.num_boids=100&sim_queue=...'
Flat sim settings (e.g. '?num_boids=50') only apply to the sims built at init time, not sticky.

Works in both browser (URLSearchParams) and Node.js (URLSearchParams is built-in since v10).
</AI> */

// All supported URL parameters.
// type: 'int' | 'float' | 'bool' | 'string' | 'string_array'
// default: value used when param is absent. null means "not set" (caller falls back to its own default).
export const PARAM_SCHEMA = {
	// Tank dimensions (pixels)
	width:        { type: 'int',          default: null,  desc: 'Tank width in pixels' },
	height:       { type: 'int',          default: null,  desc: 'Tank height in pixels' },
	// Simulation preset
	sim:          { type: 'string',       default: null,  desc: 'Simulation preset name (e.g. peaceful_tank, natural_tank)' },
	// Queue of sim names run in sequence (comma-separated)
	sim_queue:    { type: 'string_array', default: null,  desc: 'Comma-separated list of simulation presets to run in sequence' },
	// Per-sim overrides (applied to sims built at init time only — not sticky)
	num_boids:    { type: 'int',          default: null,  desc: 'Initial boid population size' },
	num_foods:    { type: 'int',          default: null,  desc: 'Number of food items' },
	num_plants:   { type: 'int',          default: null,  desc: 'Number of plants' },
	num_rocks:    { type: 'int',          default: null,  desc: 'Number of rocks / obstacles' },
	rounds:       { type: 'int',          default: null,  desc: 'Number of rounds to run (0 = perpetual)' },
	timeout:      { type: 'float',        default: null,  desc: 'Round timeout in seconds' },
	max_mutation: { type: 'float',        default: null,  desc: 'Mutation rate per breeding cycle (0..1)' },
	cullpct:      { type: 'float',        default: null,  desc: 'Fraction of population culled each round (0..1)' },
	// Autonomous / lab mode speed
	speed:        { type: 'string',       default: null,  desc: 'Autonomous speed mode: full | throttled | natural' },
};

// Type map for sim_meta_params dot-notation sub-keys: sim_meta_params.KEY=value
// These become sticky session-level overrides applied to every sim in the queue.
export const META_PARAM_TYPES = {
	num_boids:    'int',
	segments:     'int',
	rounds:       'int',
	num_foods:    'int',
	num_plants:   'int',
	num_rocks:    'int',
	timeout:      'float',
	max_mutation: 'float',
	cullpct:      'float',
};

// Coerce a raw string to a typed value. Returns undefined if invalid/empty.
function coerce( raw, type ) {
	if ( raw === null || raw === '' ) { return undefined; }
	switch ( type ) {
		case 'int': {
			const n = parseInt(raw, 10);
			return isNaN(n) ? undefined : n;
		}
		case 'float': {
			const f = parseFloat(raw);
			return isNaN(f) ? undefined : f;
		}
		case 'bool':
			return raw !== '0' && raw.toLowerCase() !== 'false';
		case 'string_array': {
			const parts = raw.split(',').map( s => s.trim() ).filter( s => s.length > 0 );
			return parts.length > 0 ? parts : undefined;
		}
		default: // 'string'
			return raw;
	}
}

/**
 * Parse URL search params into a structured config object.
 * Only keys that are explicitly present in the URL are included in the result.
 *
 * Flat keys (e.g. num_boids=50) → apply to sims built at init time only.
 * Dotted keys (e.g. sim_meta_params.num_boids=50) → sticky session-level overrides.
 *
 * @param {URLSearchParams|Object} searchParams
 * @returns {Object} Parsed config. Keys absent from the URL are absent from the return value.
 */
export function parseSimParams( searchParams ) {
	const result = {};

	// normalize iteration: always work with [key, rawValue] pairs
	const entries = searchParams instanceof URLSearchParams
		? [...searchParams.entries()]
		: Object.entries(searchParams).map( ([k,v]) => [k, v !== undefined && v !== null ? String(v) : null] );

	for ( const [key, rawVal] of entries ) {
		if ( rawVal === null || rawVal === '' ) { continue; }

		// dotted namespace: sim_meta_params.KEY=value
		const dot = key.indexOf('.');
		if ( dot !== -1 ) {
			const ns = key.slice(0, dot);
			const subkey = key.slice(dot + 1);
			if ( ns === 'sim_meta_params' && subkey in META_PARAM_TYPES ) {
				const val = coerce(rawVal, META_PARAM_TYPES[subkey]);
				if ( val !== undefined ) {
					if ( !result.sim_meta_params ) { result.sim_meta_params = {}; }
					result.sim_meta_params[subkey] = val;
				}
			}
			continue; // unknown dotted keys are silently ignored
		}

		// flat top-level keys
		const schema = PARAM_SCHEMA[key];
		if ( !schema ) { continue; }
		const val = coerce(rawVal, schema.type);
		if ( val !== undefined ) { result[key] = val; }
	}

	return result;
}
