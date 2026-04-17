/* <AI>
vectorcosm.worker.js — Simulation Web Worker. All heavy computation runs here.

COMMAND DISPATCH
- Uses CommandRegistry (class.CommandRegistry.js) for named command dispatch.
- Message listener extracts functionName, routes to commands.execute().
- Unhandled errors post { functionName: 'error', data: { command, message, stack } }.
- Built-in commands: help, describe, ping.

REGISTERED COMMANDS (all snake_case)
  App commands (14):
    update, pick_object, get_tank_env_data, end_sim, save_tank, load_tank,
    export_boids, load_boids, smite, rand_tank, init, update_sim_settings,
    push_sim_queue, add_saved_boids
  Autonomous loop (9):
    start_autonomous, stop_autonomous, resume_autonomous, set_speed, terminate,
    get_status, get_stats, get_population, export_tank
  Built-ins (3):
    help, describe, ping

AUTONOMOUS LOOP (Step 1.2)
- start_autonomous({ speed, throttle_delay, natural_fps, stats_interval })
  speed: 'full' (setTimeout 0, fixed 1/30 delta)
       | 'throttled' (setTimeout N ms, fixed 1/30 delta)
       | 'natural' (setTimeout remainder, real elapsed delta)
- In autonomous mode: NO render data sent. Stats posted via autonomous.stats every stats_interval ms.
- stop_autonomous / resume_autonomous — pause/resume without losing state.
- terminate — stop + post terminal status.
- get_status — instant snapshot: running, speed, frame_count, sim_time, round_num, population_size, wall_ms, ticks_per_second.
- get_stats — full sim + tank snapshot including sim.settings.
- get_population — compact boid list: oid, species, genus, gen, age, score, mass; opt inc_dna.
- export_tank — full scene JSON without DB write (same structure as SaveTank but returned directly).

PUBSUB EVENTS (forwarded to main thread, not commands — dot.notation)
  sim_complete, sim_round, sim_new, records_push, boid_records_push, save_tank (autosave)
  autonomous.stats — periodic stats during autonomous run

STORAGE (Step 3.1)
- BoidLibrary and TankLibrary use pluggable adapters (StorageAdapter interface).
- Browser: DexieAdapter (IndexedDB) set as default via dynamic import at worker startup.
- Node.js: MemoryAdapter (in-memory) set as default at worker startup.
- CLI runner (Step 3.3) may override adapter after startup via a command.

NODE.JS COMPATIBILITY (Step 3.2)
- IS_NODEJS detection: `typeof WorkerGlobalScope === 'undefined'` — avoids false positives from Vite's process shim.
- Browser: `self.addEventListener` registered SYNCHRONOUSLY before any async work. The Web Worker event loop continues running during top-level await suspension; messages arriving before addEventListener is called are permanently dropped. DexieAdapter loaded async via .then() after listener is in place.
- Node.js: await is fine because parentPort buffers messages internally until .on('message') is called.

GLOBALS
  globalThis.vc — the Vectorcosm instance (authoritative simulation state)
</AI> */

import Vectorcosm from '../classes/class.Vectorcosm.js'
import { Boid } from '../classes/class.Boids.js'
import * as utils from '../util/utils.js'
import { SimulationFactory } from '../classes/class.Simulation.js'
import PubSub from 'pubsub-js'
import BoidLibrary from '../classes/class.BoidLibrary.js'
import TankLibrary from '../classes/class.TankLibrary.js'
import Tank from '../classes/class.Tank.js'
import TankMaker from '../classes/class.TankMaker.js'
import CommandRegistry from '../classes/class.CommandRegistry.js'

const commands = new CommandRegistry();

// detect whether we're running as a browser Web Worker or a Node.js worker_threads worker.
// WorkerGlobalScope is a browser-only global — Vite's process shim pollutes process.versions
// in the browser bundle so we can't rely on `process` for this check.
const IS_NODEJS = typeof WorkerGlobalScope === 'undefined';

// broker incoming messages to the right handling function
// receives raw data (not a DOM Event) — both paths normalize before calling this
async function handleMessage(eventData) {
	const functionName = eventData?.functionName ?? eventData?.f;
	if ( !commands.has( functionName ) ) { return; }
	const result = await commands.execute( functionName, eventData );
	if ( !result.ok ) {
		globalThis.postMessage( { 
			functionName: 'error', 
			data: { 
				command: functionName, 
				message: result.error, 
				stack: result.stack 
			} 
		} );
	}
}

// IPC + storage setup — split by environment
if ( IS_NODEJS ) {
	// shim globalThis.postMessage so every existing postMessage() call works unchanged
	const { parentPort } = await import('worker_threads');
	globalThis.postMessage = parentPort.postMessage.bind(parentPort);
	// use zero-dep in-memory adapter (no IndexedDB in Node.js)
	const { default: MemoryAdapter } = await import('../classes/class.MemoryAdapter.js');
	BoidLibrary.default_adapter = new MemoryAdapter();
	TankLibrary.default_adapter = new MemoryAdapter();
	// parentPort delivers raw data objects (not DOM Events)
	parentPort.on('message', handleMessage);
}

// browser Web Worker — IndexedDB available via DexieAdapter
else {
	// MUST register synchronously before any await — the Web Worker event loop continues
	// running during top-level await suspension, so messages arriving while the DexieAdapter
	// import is in-flight are permanently dropped if addEventListener hasn't been called yet.
	self.addEventListener('message', event => handleMessage(event.data));
	// adapter load can be async — save/load commands aren't called during startup
	import('../classes/class.DexieAdapter.js').then(({ default: DexieAdapter }) => {
		BoidLibrary.default_adapter = new DexieAdapter();
		TankLibrary.default_adapter = new DexieAdapter();
	});
}

// this keeps track of which objects that already sent basic rendering info.
// we don't need to send all of that every frame, just on the first one.
function AutoIncludeGeoData(obj) {
	if ( obj.geodata_sent ) { return null; }
	obj.geodata_sent = true;
	if ( typeof(obj.GeoData)==='function' ) {
		return obj.GeoData();
	}
	return null;
}

commands.register( { name: 'update', description: 'Advance simulation and return render data', handler: params => {
	
	let delta = params.data?.delta || 1/30;
	let num_frames = params.data?.num_frames || 1;
	let inc_boid_animation_data = params.data?.inc_boid_animation_data ?? false;
	let inc_mark_animation_data = params.data?.inc_mark_animation_data ?? false;
	let inc_plant_animation_data = params.data?.inc_plant_animation_data ?? false;
	let inc_food_animation_data = params.data?.inc_food_animation_data ?? false;
	for ( let i=0; i < num_frames; i++ ) {
		globalThis.vc.update(delta);
	}
	let renderObjects = [];
	renderObjects.push({
		oid: globalThis.vc.tank.oid,
		type: 'tank',
		geodata: AutoIncludeGeoData(globalThis.vc.tank)
	});
	renderObjects.push( ... globalThis.vc.tank.boids.map( o => {
		let return_obj = {
			oid: o.oid,
			type:'boid',
			x: o.x,
			y: o.y,
			a: o.angle,
			s: o.scale,
			geodata: AutoIncludeGeoData(o)
		};
		if ( inc_boid_animation_data ) {
			return_obj.anim = {
				motor_fx: o.motors.map( m => {
					// effect based on stroke power
					const effect1 = ( m.this_stroke_time && m.last_amount ) ? (m.this_stroke_time ? m.last_amount : 0) : 0;
					// effect based on stroke time (smoother but less accurate)
					const effect2 = m.this_stroke_time ? (Math.sin(((m.t||0)/m.this_stroke_time) * Math.PI)) : 0;
					// blended result
					return (effect1 + effect2) / 2;
				} ),
				is_larva: ( o.age < o.larval_age && !globalThis.vc.simulation.settings?.ignore_lifecycle ),
				larva_pct: ( ( o.larval_age - o.age ) / o.larval_age )
			};
			// almost dead?
			if ( (o.metab.energy / o.metab.max_energy ) < 0.01 && !globalThis.vc.simulation.settings?.ignore_lifecycle ) {
				let pct = o.metab.energy / ( o.metab.max_energy * 0.01 );
				return_obj.anim.opacity = pct;
			}
		}
		return return_obj;
	}));
	renderObjects.push( ... globalThis.vc.tank.plants.map( o => {
		let return_obj = {
			oid: o.oid,
			type:'plant',
			geodata: AutoIncludeGeoData(o)
		};
		// plants don't move - that's kinda their whole thing
		if ( return_obj.geodata ) {
			return_obj.x = o.x;
			return_obj.y = o.y;
		}
		if ( inc_plant_animation_data ) {
			return_obj.anim = {
				age: o.age,
				lifespan: o.lifespan,
				perma: o.perma // support for plants that don't die or have natural life cycle
			}
		}
		return return_obj;
	}));
	renderObjects.push( ... globalThis.vc.tank.foods.map( o => {
		let return_obj = {
			oid: o.oid,
			type:'food',
			x: o.x,
			y: o.y,
			geodata: AutoIncludeGeoData(o)
		};
		if ( inc_food_animation_data ) {
			return_obj.anim = {
				r: o.r,
				age: o.age,
				lifespan: o.lifespan,
			}
		}
		return return_obj;
	}));
	renderObjects.push( ... globalThis.vc.tank.marks.map( o => {
		let return_obj = {
			oid: o.oid,
			type:'mark',
			geodata: AutoIncludeGeoData(o),
		};
		// marks don't move
		if ( return_obj.geodata ) {
			return_obj.x = o.x;
			return_obj.y = o.y;
		}		
		if ( inc_mark_animation_data ) {
			return_obj.anim = {
				age: o.age,
				lifespan: o.lifespan,
				sense_type: o.strongest_sense,
			}
		}
		return return_obj;
	}));
	renderObjects.push( ... globalThis.vc.tank.obstacles.map( o => {
		let return_obj = {
			oid: o.oid,
			type:'obstacle',
			geodata: AutoIncludeGeoData(o),
		};
		// rocks don't move — only send position with the first geodata payload
		if ( return_obj.geodata ) {
			return_obj.x = o.x;
			return_obj.y = o.y;
		}
		return return_obj;
	}));
	
		
	// compile simulation stats
	let simStats = null;
	let tankStats = null;
	// send stats every 30 frames, or immediately when settings are dirty
	stats_tick++;
	const send_stats = ( stats_tick % 30 === 0 ) || settings_dirty;
	if ( send_stats ) {
		simStats = {
			'best_score': globalThis.vc.simulation.stats.best_score,
			'best_avg_score': globalThis.vc.simulation.stats.best_avg_score,
			'framenum': globalThis.vc.simulation.stats.framenum,
			'round_num': globalThis.vc.simulation.stats.round_num,
			'round_best_score': globalThis.vc.simulation.stats.round_best_score,
			'round_avg_score': globalThis.vc.simulation.stats.round_avg_score,
			'timeout': globalThis.vc.simulation.settings.timeout,
			'round_time': (globalThis.vc.simulation.stats.round_time || 0),
			'name': globalThis.vc.simulation.settings.name,
			'segments': (globalThis.vc.simulation.settings.segments || 1),
			'sims_in_queue': globalThis.vc.sim_queue.length,
			// 'stats': globalThis.vc.simulation.stats, // warning: contains graph data
		};
		// only include the full settings object when it has changed
		if ( settings_dirty ) {
			simStats.settings = Object.assign( { sim_meta_params: globalThis.vc.sim_meta_params }, globalThis.vc.simulation.settings );
			settings_dirty = false;
		}

		// tank stats
		let species = new Set();
		for ( let b of globalThis.vc.tank.boids ) { species.add(b.species); }
		tankStats = {
			boids: globalThis.vc.tank.boids.length,
			species: species.size,
			rocks: globalThis.vc.tank.obstacles.length,
			plants: globalThis.vc.tank.plants.length,
			foods: globalThis.vc.tank.foods.length,
			marks: globalThis.vc.tank.marks.length,
			boid_mass: Math.floor( globalThis.vc.tank.boids.reduce( (a,b) => a+b.mass, 0 ) ),
			food_mass: Math.floor( globalThis.vc.tank.foods.reduce( (a,b) => a+b.value, 0 ) ),
		};
	}
		
	globalThis.postMessage( {
		functionName: 'update',
		data: { renderObjects, simStats, tankStats, round_time: globalThis.vc.simulation.stats.round_time || 0 }
	} );
} });

// per-frame stats throttle counter and settings dirty flag
let stats_tick = 0;
let settings_dirty = true; // true on start so settings are sent on first update

// autonomous loop state
let autonomous = false;
let auto_speed = null;             // 'full' | 'throttled' | 'natural'
let auto_loop_timer = null;
let auto_throttle_delay = 10;      // ms delay between ticks in 'throttled' mode
let auto_natural_fps = 30;         // target fps in 'natural' mode
let auto_stats_interval = 5000;    // ms between autonomous.stats posts (0 = disabled)
let auto_last_stats_ms = 0;
let auto_wall_start_ms = 0;        // performance.now() at loop start
let auto_frame_count = 0;
let auto_tps = 0;                  // rolling ticks-per-second
let auto_tps_window = 0;           // frame tally for current tps window
let auto_tps_window_start = 0;     // ms when the current tps window started
let auto_last_natural_ms = 0;      // previous tick time, for real-time delta
const AUTO_FIXED_DELTA = 1/30;     // fixed timestep used in full and throttled modes

let last_focus_object_id = null;
commands.register( { name: 'pick_object', description: 'Select a boid by ID or by proximity to coordinates', handler: params => {
	let result = null;
	let obj_id = params.data?.oid || 0;
	let obj = null;
	
	// if they want a specific object by ID, just get that
	if ( obj_id ) {
		// NOTE: we only check boids right now
		obj = globalThis.vc.tank.boids.find( o => o.oid == obj_id );
		if ( obj ) {
			result = DescribeBoid(
				obj, 
				params.data?.inc_sensor_geo, 
				params.data?.inc_brain, 
				params.data?.inc_brain // not a typo
			); 
		}
	}
	
	// find the closest object to mouse click
	else {
		const x = params.data.x ?? 0;
		const y = params.data.y ?? 0;
		const r = params.data.radius ?? 30;
		let objs = vc.tank.grid.GetObjectsByBox( x-r, y-r, x+r, y+y, o => o instanceof Boid );
		// optimization hint: if we are ignoring other boids, they are not in the collision detection grid.
		if ( vc.simulation.settings?.ignore_other_boids === true ) {
			objs = vc.tank.boids; // do them all brute force instead
		}
		// find the closest object
		const min_dist = r*r*2 + r*r*2;
		let closest_dist = 9999999999;
		for ( let o of objs ) {
			const d = (o.x - x) * (o.x - x) + (o.y - y) * (o.y - y);
			if ( d <= min_dist && d < closest_dist ) { 
				closest_dist = d;
				obj = o;
			}
		}
		// assemble a report based on object type
		if ( obj ) {
			obj_id = obj.oid;
			result = DescribeBoid(
				obj, 
				params.data?.inc_sensor_geo, 
				params.data?.inc_brain,
				params.data?.inc_brain, // not a typo
			);
		}
	}
	
	// if we are doing stat tracking and switched object IDs, we need to do some cleanup
	if ( globalThis.vc.simulation.settings?.boid_tally_freq ) {
		if ( obj_id != last_focus_object_id ) {
			// remove stat update event subscription on old object
			let old = globalThis.vc.tank.boids.find( o => o.oid == last_focus_object_id );
			if ( old ) {
				old.records.onInsert = null;
			}
			// install new callback
			if ( obj ) {
				obj.records.onInsert = ( data, layer ) => {
					PubSub.publishSync('boid.records.push', {data, layer} );
				};
			}
		}
		last_focus_object_id = obj_id;
	}
	
	// send back 
	globalThis.postMessage( {
		functionName: 'pick_object',
		request_id: params?.request_id,
		data: result
	} );
} });


commands.register( { name: 'get_tank_env_data', description: 'Return tank environment grid and whirl data', handler: params => {
	const grid = globalThis.vc.tank.datagrid;
	const whirls = globalThis.vc.tank.whirls;
	const request = params.data?.request || 'current';
	globalThis.postMessage( { functionName: 'get_tank_env_data', request_id: params?.request_id, data: { 
		grid,
		whirls,
		request
	} } );
} });

commands.register( { name: 'end_sim', description: 'End the current simulation immediately', handler: params => {
	globalThis.vc.simulation.killme = true;
	globalThis.postMessage( { functionName: 'end_sim', request_id: params?.request_id, data: null } );
} });

commands.register( { name: 'save_tank', description: 'Save current tank state to IndexedDB', handler: params => {
	const req_id = params?.request_id;
	globalThis.vc.SaveTank( params?.data?.id ).then(
		data => globalThis.postMessage( { functionName: 'save_tank', request_id: req_id, data } )
	);
} });

commands.register( { name: 'load_tank', description: 'Load a tank state from IndexedDB by ID', handler: params => {
	settings_dirty = true;
	globalThis.vc.LoadTank( params?.data?.id ?? 0, params.data?.settings );
	globalThis.postMessage( { functionName: 'load_tank', request_id: params?.request_id, data: null } );
} });

commands.register( { name: 'export_boids', description: 'Export boids as JSON, optionally saving to IndexedDB', handler: async params => {
	let to_db = !!params.data?.db;
	let str = await globalThis.vc.SavePopulation( params.data?.species, params.data?.ids, to_db );
	globalThis.postMessage( { functionName: 'export_boids', request_id: params?.request_id, data: str } );
} });

commands.register( { name: 'load_boids', description: 'Load a population of boids from JSON data', handler: params => {
	globalThis.vc.LoadPopulation( params.data );
	globalThis.postMessage( { functionName: 'load_boids', request_id: params?.request_id, data: null } );
} });

commands.register( { name: 'smite', description: 'Kill boids by ID', handler: params => {
	let ids = params.data.ids;
	let targets = globalThis.vc.tank.boids.filter( b => ids.includes(b.oid) );
	for ( let t of targets ) { t.Kill(); }
	globalThis.postMessage( { functionName: 'smite', request_id: params?.request_id, data: targets.map(t=>t.oid) } );
} });

commands.register( { name: 'rand_tank', description: 'Regenerate tank obstacles and environment', handler: params => {
	// this is really overreaching and we should make something cleaner
	const w = globalThis.vc.tank.width;
	const h = globalThis.vc.tank.height;
	const boids = globalThis.vc.tank.boids.splice(0,globalThis.vc.tank.boids.length);
	globalThis.vc.tank.Kill();
	globalThis.vc.tank = new Tank( w, h );
	globalThis.vc.tank.boids = boids;
	globalThis.vc.tank.MakeBackground();
	const tm = new TankMaker( globalThis.vc.tank, {} );
	tm.Make();
	globalThis.postMessage( { functionName: 'rand_tank', request_id: params?.request_id, data: null } );
} });


commands.register( { name: 'init', description: 'Initialize the simulation. Accepts: width, height, sim, sim_queue, sim_meta_params, num_boids, num_foods, num_plants, num_rocks, rounds, timeout, max_mutation, cullpct, lock_dimensions', handler: params => {
	globalThis.vc.Init(params.data);
	globalThis.postMessage( {
		functionName: 'init',
		request_id: params?.request_id,
		data: {
			width: globalThis.vc.tank.width,
			height: globalThis.vc.tank.height,
		}
	} );
} });


commands.register( { name: 'update_sim_settings', description: 'Update simulation settings on the fly', handler: params => {
	settings_dirty = true;
	// look for meta params separately
	if ( params.data?.sim_meta_params ) {
		for ( let k in params.data.sim_meta_params ) {
			globalThis.vc.sim_meta_params[k] = params.data.sim_meta_params[k];
		}
	}
	for ( let k in params.data ) {
		// skip meta params - those are saved in Vectorcosm itself
		if ( k == 'sim_meta_params' ) { continue; }
		switch (k) {
			// special cases for changing number of tank objects
			case 'num_boids': {
				if ( params.data.num_boids != globalThis.vc.simulation.settings.num_boids ) {
					globalThis.vc.simulation.SetNumBoids(params.data.num_boids);
				}
				break;
			}
			case 'num_rocks': {
				if ( params.data.num_rocks != globalThis.vc.simulation.settings.num_rocks ) {
					globalThis.vc.simulation.SetNumRocks(params.data.num_rocks);
				}
				break;
			}
			case 'num_plants': {
				if ( params.data.num_plants != globalThis.vc.simulation.settings.num_plants ) {
					globalThis.vc.simulation.SetNumPlants(params.data.num_plants);
				}
				break;
			}
			// volume needs to resize the tank itself
			case 'volume': {
				globalThis.vc.ResizeTankByVolume(params.data.volume);
				globalThis.vc.tank.geodata_sent = false;
				break;
			}
			// other settings are just static data
			default: {
				globalThis.vc.simulation.settings[k] = params.data[k];
			}
		}
	}
	globalThis.postMessage( {
		functionName: 'update_sim_settings',
		request_id: params?.request_id,
		data: Object.assign( { sim_meta_params: globalThis.vc.sim_meta_params }, globalThis.vc.simulation.settings )
	} );
} });

commands.register( { name: 'push_sim_queue', description: 'Add simulations to the queue', handler: params => {
	settings_dirty = true;
	// look for meta params
	let meta_params = params.data?.sim_meta_params;
	if ( meta_params ) {
		for ( let k in meta_params ) {
			globalThis.vc.sim_meta_params[k] = meta_params[k];
		}
	}
	// purge queue if requested
	if ( params.data?.reset ) {
		globalThis.vc.simulation.killme = true; // let nature take its course
		globalThis.vc.sim_queue.length = 0;
	}
	// look for named simulations from the library
	const sims = params.data?.sims;
	if ( sims ) {
		for ( let s of sims ) {
			globalThis.vc.sim_queue.push( 
				SimulationFactory(s)
			);
		}
	}
	globalThis.postMessage( {
		functionName: 'push_sim_queue',
		request_id: params?.request_id,
		data: Object.assign( { sim_meta_params: globalThis.vc.sim_meta_params }, globalThis.vc.simulation.settings )
	} );
} });

commands.register( { name: 'add_saved_boids', description: 'Load saved boids from library and add to current tank', handler: async params => {
	let num_added = 0;
	const lib = new BoidLibrary;
	for ( let id of params.data.ids ) {
		let data = await lib.GetData(id);
		if ( data && data.specimens ) {
			for ( let json of data.specimens ) {
				let b = new Boid( 0, 0, JSON.parse(json) );
				b.ScaleBoidByMass();
				globalThis.vc.simulation.AddBoidToTank(b); // handles safe spawn
				num_added++;						
			}
		}
	}
	globalThis.postMessage( {
		functionName: 'add_saved_boids',
		request_id: params?.request_id,
		data: { ok: true, num_added }
	} );
} });

// ─── LIBRARY MANAGEMENT ───────────────────────────────────────────────────────

// All library CRUD goes through these commands so the main thread never touches IndexedDB directly.

commands.register( { name: 'boid_library_list', description: 'List boid population index rows', handler: async params => {
	const lib = new BoidLibrary();
	const rows = await lib.Get( params.data || {} );
	globalThis.postMessage( { functionName: 'boid_library_list', request_id: params?.request_id, data: rows } );
} });

commands.register( { name: 'boid_library_delete', description: 'Delete a saved boid population by id', handler: async params => {
	const lib = new BoidLibrary();
	await lib.Delete( params.data.id );
	globalThis.postMessage( { functionName: 'boid_library_delete', request_id: params?.request_id, data: { ok: true } } );
} });

commands.register( { name: 'boid_library_update', description: 'Update index fields (label, star, etc.) for a saved population', handler: async params => {
	const lib = new BoidLibrary();
	await lib.Update( params.data.row );
	globalThis.postMessage( { functionName: 'boid_library_update', request_id: params?.request_id, data: { ok: true } } );
} });

commands.register( { name: 'boid_library_get_row', description: 'Get full row (index + specimens) for a saved population', handler: async params => {
	const lib = new BoidLibrary();
	const row = await lib.GetFullRow( params.data.id );
	globalThis.postMessage( { functionName: 'boid_library_get_row', request_id: params?.request_id, data: row } );
} });

commands.register( { name: 'boid_library_add_row', description: 'Import a boid population row from external JSON', handler: async params => {
	const lib = new BoidLibrary();
	const id = await lib.AddRow( params.data.row );
	globalThis.postMessage( { functionName: 'boid_library_add_row', request_id: params?.request_id, data: { id } } );
} });

commands.register( { name: 'tank_library_list', description: 'List tank index rows', handler: async params => {
	const lib = new TankLibrary();
	const rows = await lib.Get( params.data || {} );
	globalThis.postMessage( { functionName: 'tank_library_list', request_id: params?.request_id, data: rows } );
} });

commands.register( { name: 'tank_library_delete', description: 'Delete a saved tank by id', handler: async params => {
	const lib = new TankLibrary();
	await lib.Delete( params.data.id );
	globalThis.postMessage( { functionName: 'tank_library_delete', request_id: params?.request_id, data: { ok: true } } );
} });

commands.register( { name: 'tank_library_get_row', description: 'Get full row (index + scene) for a saved tank', handler: async params => {
	const lib = new TankLibrary();
	const row = await lib.GetFullRow( params.data.id );
	globalThis.postMessage( { functionName: 'tank_library_get_row', request_id: params?.request_id, data: row } );
} });

commands.register( { name: 'tank_library_add_row', description: 'Import a tank row from external JSON (stores only, does not load)', handler: async params => {
	const lib = new TankLibrary();
	const id = await lib.AddRow( params.data.row );
	globalThis.postMessage( { functionName: 'tank_library_add_row', request_id: params?.request_id, data: { id } } );
} });

// ─── AUTONOMOUS LOOP ──────────────────────────────────────────────────────────

// post a stats snapshot during autonomous operation
function PostAutonomousStats() {
	const wall_ms = performance.now() - auto_wall_start_ms;
	let species = new Set();
	for ( let b of globalThis.vc.tank.boids ) { species.add(b.species); }
	globalThis.postMessage( {
		functionName: 'autonomous.stats',
		data: {
			running: autonomous,
			speed: auto_speed,
			frame_count: auto_frame_count,
			sim_time: globalThis.vc.simulation?.stats?.round_time || 0,
			round_num: globalThis.vc.simulation?.stats?.round_num || 0,
			population_size: globalThis.vc.tank.boids.length,
			species: species.size,
			wall_ms,
			ticks_per_second: auto_tps,
		}
	} );
}

// single tick: advance the sim, maintain metrics, reschedule itself
function AutoTick() {
	if ( !autonomous ) { return; }
	const tick_start = performance.now();

	// compute delta
	let delta;
	if ( auto_speed === 'natural' ) {
		delta = auto_last_natural_ms ? (tick_start - auto_last_natural_ms) / 1000 : AUTO_FIXED_DELTA;
		auto_last_natural_ms = tick_start;
		// clamp: don't let a stall produce a huge time warp
		delta = Math.min(delta, 0.1);
	} 
	else {
		delta = AUTO_FIXED_DELTA;
	}

	globalThis.vc.update(delta);
	auto_frame_count++;

	// rolling tps (1s window)
	auto_tps_window++;
	const tps_elapsed = tick_start - auto_tps_window_start;
	if ( tps_elapsed >= 1000 ) {
		auto_tps = auto_tps_window / (tps_elapsed / 1000);
		auto_tps_window = 0;
		auto_tps_window_start = tick_start;
	}

	// periodic stats post
	if ( auto_stats_interval > 0 && (tick_start - auto_last_stats_ms) >= auto_stats_interval ) {
		auto_last_stats_ms = tick_start;
		PostAutonomousStats();
	}

	// schedule next tick
	const tick_duration = performance.now() - tick_start;
	if ( auto_speed === 'full' ) {
		auto_loop_timer = setTimeout(AutoTick, 0);
	} 
	else if ( auto_speed === 'throttled' ) {
		auto_loop_timer = setTimeout(AutoTick, auto_throttle_delay);
	} 
	else if ( auto_speed === 'natural' ) {
		const target_ms = 1000 / auto_natural_fps;
		auto_loop_timer = setTimeout(AutoTick, Math.max(0, target_ms - tick_duration));
	}
}

// Start the autonomous loop. Params: speed (full|throttled|natural), throttle_delay, natural_fps, stats_interval
commands.register( { name: 'start_autonomous', description: 'Start the autonomous simulation loop. Params: speed (full|throttled|natural), throttle_delay (ms), natural_fps, stats_interval (ms)', handler: params => {
	if ( autonomous ) {
		globalThis.postMessage( { functionName: 'start_autonomous', request_id: params?.request_id, data: { ok: false, error: 'already running' } } );
		return;
	}
	auto_speed = params.data?.speed || 'throttled';
	auto_throttle_delay = params.data?.throttle_delay ?? 10;
	auto_natural_fps = params.data?.natural_fps ?? 30;
	auto_stats_interval = params.data?.stats_interval ?? 5000;
	autonomous = true;
	const now = performance.now();
	auto_wall_start_ms = now;
	auto_last_stats_ms = now;
	auto_frame_count = 0;
	auto_tps = 0;
	auto_tps_window = 0;
	auto_tps_window_start = now;
	auto_last_natural_ms = (auto_speed === 'natural') ? now : 0;
	auto_loop_timer = setTimeout(AutoTick, 0);
	globalThis.postMessage( { functionName: 'start_autonomous', request_id: params?.request_id, data: { ok: true, speed: auto_speed } } );
} });

commands.register( { name: 'stop_autonomous', description: 'Stop (pause) the autonomous loop', handler: params => {
	autonomous = false;
	if ( auto_loop_timer !== null ) {
		clearTimeout(auto_loop_timer);
		auto_loop_timer = null;
	}
	globalThis.postMessage( { functionName: 'stop_autonomous', request_id: params?.request_id, data: { ok: true, frame_count: auto_frame_count } } );
} });

commands.register( { name: 'resume_autonomous', description: 'Resume a paused autonomous loop', handler: params => {
	if ( autonomous ) {
		globalThis.postMessage( { functionName: 'resume_autonomous', request_id: params?.request_id, data: { ok: false, error: 'already running' } } );
		return;
	}
	if ( !auto_speed ) {
		globalThis.postMessage( { functionName: 'resume_autonomous', request_id: params?.request_id, data: { ok: false, error: 'not initialized — call start_autonomous first' } } );
		return;
	}
	autonomous = true;
	if ( auto_speed === 'natural' ) { auto_last_natural_ms = performance.now(); }
	auto_loop_timer = setTimeout(AutoTick, 0);
	globalThis.postMessage( { functionName: 'resume_autonomous', request_id: params?.request_id, data: { ok: true, speed: auto_speed } } );
} });

commands.register( { name: 'set_speed', description: 'Change autonomous loop speed without stopping. Params: speed (full|throttled|natural), throttle_delay, natural_fps', handler: params => {
	if ( params.data?.speed ) { auto_speed = params.data.speed; }
	if ( params.data?.throttle_delay !== undefined ) { auto_throttle_delay = params.data.throttle_delay; }
	if ( params.data?.natural_fps !== undefined ) { auto_natural_fps = params.data.natural_fps; }
	globalThis.postMessage( { functionName: 'set_speed', request_id: params?.request_id, data: { ok: true, speed: auto_speed } } );
} });

commands.register( { name: 'terminate', description: 'Stop the autonomous loop and post a final status report', handler: params => {
	autonomous = false;
	if ( auto_loop_timer !== null ) {
		clearTimeout(auto_loop_timer);
		auto_loop_timer = null;
	}
	const wall_ms = auto_wall_start_ms ? (performance.now() - auto_wall_start_ms) : 0;
	let species = new Set();
	for ( let b of globalThis.vc.tank.boids ) { species.add(b.species); }
	globalThis.postMessage( {
		functionName: 'terminate',
		request_id: params?.request_id,
		data: {
			ok: true,
			frame_count: auto_frame_count,
			sim_time: globalThis.vc.simulation?.stats?.round_time || 0,
			round_num: globalThis.vc.simulation?.stats?.round_num || 0,
			population_size: globalThis.vc.tank.boids.length,
			species: species.size,
			wall_ms,
			ticks_per_second: auto_tps,
		}
	} );
} });

commands.register( { name: 'get_status', description: 'Get autonomous loop status and summary simulation stats', handler: params => {
	const wall_ms = auto_wall_start_ms ? (performance.now() - auto_wall_start_ms) : 0;
	let species = new Set();
	for ( let b of globalThis.vc.tank.boids ) { species.add(b.species); }
	globalThis.postMessage( {
		functionName: 'get_status',
		request_id: params?.request_id,
		data: {
			running: autonomous,
			speed: auto_speed,
			frame_count: auto_frame_count,
			sim_time: globalThis.vc.simulation?.stats?.round_time || 0,
			round_num: globalThis.vc.simulation?.stats?.round_num || 0,
			population_size: globalThis.vc.tank.boids.length,
			species: species.size,
			wall_ms,
			ticks_per_second: auto_tps,
		}
	} );
} });

commands.register( { name: 'get_stats', description: 'Get a full simulation + tank stats snapshot', handler: params => {
	const wall_ms = auto_wall_start_ms ? (performance.now() - auto_wall_start_ms) : 0;
	const sim = globalThis.vc.simulation;
	const tank = globalThis.vc.tank;
	let species = new Set();
	for ( let b of tank.boids ) { species.add(b.species); }
	globalThis.postMessage( {
		functionName: 'get_stats',
		request_id: params?.request_id,
		data: {
			running: autonomous,
			speed: auto_speed,
			frame_count: auto_frame_count,
			wall_ms,
			ticks_per_second: auto_tps,
			sim: {
				name: sim?.settings?.name,
				round_num: sim?.stats?.round_num || 0,
				round_time: sim?.stats?.round_time || 0,
				best_score: sim?.stats?.best_score || 0,
				best_avg_score: sim?.stats?.best_avg_score || 0,
				round_best_score: sim?.stats?.round_best_score || 0,
				round_avg_score: sim?.stats?.round_avg_score || 0,
				sims_in_queue: globalThis.vc.sim_queue.length,
				settings: sim?.settings,
			},
			tank: {
				boids: tank.boids.length,
				species: species.size,
				plants: tank.plants.length,
				foods: tank.foods.length,
				rocks: tank.obstacles.length,
				marks: tank.marks.length,
				boid_mass: Math.floor( tank.boids.reduce( (a,b) => a+b.mass, 0 ) ),
				food_mass: Math.floor( tank.foods.reduce( (a,b) => a+b.value, 0 ) ),
			},
		}
	} );
} });

commands.register( { name: 'get_population', description: 'Get compact population list (oid, species, age, score, dna). Params: inc_dna (bool)', handler: params => {
	const inc_dna = params.data?.inc_dna ?? false;
	const list = globalThis.vc.tank.boids.map( b => {
		const entry = {
			oid: b.oid,
			species: b.species,
			genus: b.genus,
			generation: b.generation,
			age: Math.round(b.age),
			score: b.stats?.food || 0,
			mass: Math.round(b.mass),
		};
		if ( inc_dna ) { entry.dna = b.dna?.hex || null; }
		return entry;
	});
	globalThis.postMessage( {
		functionName: 'get_population',
		request_id: params?.request_id,
		data: list,
	} );
} });

commands.register( { name: 'export_tank', description: 'Export full tank state as structured JSON without a DB write', handler: params => {
	const tank = globalThis.vc.tank;
	const sim = globalThis.vc.simulation;
	const scene = {
		tank: tank.Export(),
		boids: tank.boids.map( x => x.Export() ),
		obstacles: tank.obstacles.map( x => x.Export() ),
		foods: tank.foods.map( x => x.Export() ),
		plants: tank.plants.map( x => x.Export() ),
		sim_settings: sim?.settings || {},
	};
	globalThis.postMessage( {
		functionName: 'export_tank',
		request_id: params?.request_id,
		data: scene,
	} );
} });

commands.register( { name: 'import_tank', description: 'Load a full tank scene from a plain JSON object (no DB required). Accepts same scene format as export_tank.', handler: params => {
	const scene = params.data?.scene ?? params.data;
	const settings = params.data?.settings ?? null;
	const ok = globalThis.vc.ImportTank(scene, settings);
	settings_dirty = true;
	globalThis.postMessage( {
		functionName: 'import_tank',
		request_id: params?.request_id,
		data: {
			ok,
			boids: globalThis.vc.tank.boids.length,
			width: globalThis.vc.tank.width,
			height: globalThis.vc.tank.height,
		}
	} );
} });

// listen for critical internal events and report back via API
let onSimCompleteSubscription = PubSub.subscribe('sim.complete', (msg, sim) => {
	let stats = Object.assign({}, sim.stats);
	delete(stats.records); // don't need records - those are sent separately
	globalThis.postMessage( {
		functionName: 'sim_complete',
		data: {
			settings: sim.settings,
			stats: stats,
			in_queue: globalThis.vc.sim_queue.length
		}
	} );
});
let onSimRoundSubscription = PubSub.subscribe('sim.round', (msg, sim) => {
	let datapacket = Object.assign({}, sim.stats);
	delete(datapacket.chartdata); // don't need all of this every frame
	delete(datapacket.records); // don't need all of this every frame
	globalThis.postMessage( {
		functionName: 'sim_round',
		data: datapacket
	} );
});
let onSimNewSubscription = PubSub.subscribe('sim.new', (msg, sim) => {
	// force the tank geometry to update
	globalThis.vc.tank.geodata_sent = false;
	settings_dirty = true;
	globalThis.postMessage( {
		functionName: 'sim_new',
		data: sim.settings
	} );
});
let onRecordsPushSubscription = PubSub.subscribe('records.push', (msg,data) => {
	globalThis.postMessage( {
		functionName: 'records_push',
		data: data
	} );
});

// simulation autosave
let onAutosaveSubscription = PubSub.subscribe('autosave', (msg,data) => {
	globalThis.postMessage( {
		functionName: 'save_tank',
		data: data
	} );
});

// if stat tracking is enabled for individual boids, an update just occurred. 
// this just let's the front-end know we have data it might want. no data is passed here.
// if the front end needs details it will ask for a specific boid's stats.
let onBoidRecordsPushSubscription = PubSub.subscribe('boid.records.push', (msg,data) => {
	globalThis.postMessage( {
		functionName: 'boid_records_push',
		data: data
	} );
});
		
// set up the main simulation
let vc = new Vectorcosm;
globalThis.vc = vc; // handy reference for everyone else

// built-in introspection and health-check commands
commands.register( { name: 'help', description: 'List all available commands with metadata', handler: (params) => {
	const list = commands.list();
	globalThis.postMessage( { functionName: 'help', data: list, request_id: params?.request_id } );
} });

commands.register( { name: 'describe', description: 'Get full metadata for a single command', params: {
	name: { type: 'string', description: 'Command name to describe' }
}, handler: params => {
	const info = commands.describe( params.data?.name );
	globalThis.postMessage( { functionName: 'describe', data: info, request_id: params?.request_id } );
} });

commands.register( { name: 'ping', description: 'Health check — returns pong', handler: (params) => {
	globalThis.postMessage( { functionName: 'ping', data: 'pong', request_id: params?.request_id } );
} });

function DescribeBoid( o, inc_sensor_geo=false,  inc_brain=false, inc_stats=0 ) {
	let data = { 
		type: 'boid',
		sensors: []
	};
	
	// scalar values we can just copy
	for ( let i of ['oid','id','species','genus','generation','speciation',
		'length','width','linear_impulse','torque',
		'age', 'life_credits', 'health', 'maturity_age', 'scale', 'mass',
		'metab', 'traits', 'stats'
		] ) {
		data[i] = o[i];
	}
		
	// sensors - combine the sensor values with labels
	for ( let i = 0; i < o.sensor_labels.length; i++ ) {
		let val = o.sensor_outputs[i] || 0;
		if ( Number.isNaN( val ) ) { val = 0; }; 
		if ( !Number.isFinite( o.sensor_outputs[i] ) ) { val = 0; }; 
		data.sensors.push({ name: o.sensor_labels[i], val });
	}
		
	// endocrine: just the current hormone levels
	data.hormones = o.endocrine.hormones;
		
	// brain outputs
	const neuromotors = o.motors.filter( m => m.neuro );
	data.brain_outputs = o.brain.outputs.map( (v,i) => ({
		name: (neuromotors[i]?.name || 'UNKNOWN'),
		val: v
	}));
	
	// motors
	data.motors = o.motors.map( m => ({
		name: m.name,
		strokefunc: (m.strokefunc || 'constant'),
		t: m.t,
		min_act: m.min_act,
		linear: m.linear,
		angular: m.angular,
		wheel: m.wheel,
		stroketime: m.stroketime,
		this_stroke_time: (m.this_stroke_time||0),
		strokepow: (m.strokepow||0),
		cost: m.cost,
		last_amount: Math.abs(m.last_amount||0)
	}) );
	
	// brain nodes
	data.brain_type = o.brain.type; // hint for UI to switch rendering modes
	if ( o.brain.type === 'snn' ) {
		data.brain = o.brain.network.nodes.map( (n,i) => {
			let v = n.fired===o.brain.network.tick ? 1 : n.v;
			let hexval = utils.DecToHex( Math.round(Math.abs(v) * 255) );
			let color = ( v >= 0 ? ('#00' + hexval + '00') : ('#' + hexval + '0000') );
			if ( v === 1 ) { color = '#FFFFFF'; }
			const is_input = o.brain.network.inputs.contains(i);
			return { 
				type: (is_input ? 'input' : 'node'), 
				value: v,
				symbol: (is_input ? 'I' : 'N'),
				color: color,
				fired: (n.fired===o.brain.network.tick)
			};
		});
		// separate outputs
		data.brain.push( ...o.brain.network.outputs.map( n => {
			let v = n.output;
			let r = utils.DecToHex( Math.round(Math.abs(v) * 230) );
			let g = utils.DecToHex( Math.round(Math.abs(v) * 120) );
			let b = utils.DecToHex( Math.round(Math.abs(v) * 30) );
			let color = '#' + r + g + b;
			return { 
				type: 'output', 
				value: v,
				symbol: 'O',
				color: color 
			};
		}) );
	}
	
	if ( o.brain.type === 'epann' ) {
		data.brain = [];
		for ( let i = 0; i < o.brain.network.nodes.length; i++ ) {
			const first_output = o.brain.network.nodes.length - o.brain.network.num_outputs;
			const is_input = i < o.brain.network.num_inputs;
			const is_output = i >= first_output;
			let n = o.brain.network.nodes[i];
			let v = utils.clamp(n.value,-1,1);
			let hexval = utils.DecToHex( Math.round(Math.abs(v) * 255) );
			let color = ( v >= 0 ? ('#00' + hexval + '00') : ('#' + hexval + '0000') );
			if ( v === 1 ) { color = '#FFFFFF'; }
			if ( is_output ) {
				let r = utils.DecToHex( Math.round(Math.abs(v) * 230) );
				let g = utils.DecToHex( Math.round(Math.abs(v) * 120) );
				let b = utils.DecToHex( Math.round(Math.abs(v) * 30) );
				color = '#' + r + g + b;
			}
			data.brain.push( { 
				type: (is_input ? 'input' : ( is_output ? 'output' : 'hidden') ), 
				value: v,
				symbol: (is_input ? 'I' : ( is_output ? 'O' : n.squash_type.charAt(0).toUpperCase() ) ), 
				color: color,
			} );
		}
	}
		
	if ( inc_sensor_geo ) {	
		// include sensor visualization geometry
		data.sensor_geo = { type:'group' };
		data.sensor_geo.children = o.sensors.filter( s =>
			s.type=='locater' || 
			s.detect=='food' || 
			s.type=='whisker' || 
			s.detect=='obstacles' || 
			s.detect=='light' || 
			s.type==='sense' )
			.map( i => i.CreateGeometry() );
	}
	
	if ( inc_brain ) {	
		// include data for brain graph 
		data.brain_struct = o.brain.network.Export(false); // POD
	}
	
	// send all stats that we have (first frame)
	if ( inc_stats && o.records ) {
		data.records = o.records.Export();
	}
				
	return data;
}