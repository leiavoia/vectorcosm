/* <AI>
url-params.js — Shared URL parameter parser for GUI and lab/headless modes.

Usage:
  import { parseSimParams, PARAM_SCHEMA } from './util/url-params.js';
  const config = parseSimParams(new URLSearchParams(window.location.search));
  // config only contains keys that were present in the URL (unset params are absent).

PARAM_SCHEMA: self-documenting map of all supported params. Usable by lab.js for help text.

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
	// Population
	num_boids:    { type: 'int',          default: null,  desc: 'Initial boid population size' },
	// Environment
	num_foods:    { type: 'int',          default: null,  desc: 'Number of food items' },
	num_plants:   { type: 'int',          default: null,  desc: 'Number of plants' },
	num_rocks:    { type: 'int',          default: null,  desc: 'Number of rocks / obstacles' },
	// Round timing
	rounds:       { type: 'int',          default: null,  desc: 'Number of rounds to run (0 = perpetual)' },
	timeout:      { type: 'float',        default: null,  desc: 'Round timeout in seconds' },
	// Genetics
	max_mutation: { type: 'float',        default: null,  desc: 'Mutation rate per breeding cycle (0..1)' },
	cullpct:      { type: 'float',        default: null,  desc: 'Fraction of population culled each round (0..1)' },
	// Autonomous / lab mode speed
	speed:        { type: 'string',       default: null,  desc: 'Autonomous speed mode: full | throttled | natural' },
};

/**
 * Parse URL search params into a structured config object.
 * Only keys that are explicitly present in the URL are included in the result.
 * @param {URLSearchParams|Object} searchParams - URLSearchParams instance or plain {key:value} object.
 * @returns {Object} Parsed config. Keys absent from the URL are absent from the return value.
 */
export function parseSimParams( searchParams ) {
	// normalise: accept plain objects or URLSearchParams
	const get = ( key ) => {
		if ( searchParams instanceof URLSearchParams ) { return searchParams.get(key); }
		const v = searchParams[key];
		return v !== undefined && v !== null ? String(v) : null;
	};

	const result = {};

	for ( const [key, schema] of Object.entries(PARAM_SCHEMA) ) {
		const raw = get(key);
		if ( raw === null || raw === '' ) { continue; } // skip absent / empty params

		switch ( schema.type ) {
			case 'int': {
				const n = parseInt(raw, 10);
				if ( !isNaN(n) ) { result[key] = n; }
				break;
			}
			case 'float': {
				const f = parseFloat(raw);
				if ( !isNaN(f) ) { result[key] = f; }
				break;
			}
			case 'bool': {
				result[key] = raw !== '0' && raw.toLowerCase() !== 'false';
				break;
			}
			case 'string_array': {
				const parts = raw.split(',').map( s => s.trim() ).filter( s => s.length > 0 );
				if ( parts.length > 0 ) { result[key] = parts; }
				break;
			}
			default: // 'string'
				result[key] = raw;
		}
	}

	return result;
}
