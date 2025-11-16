import Vectorcosm from '../classes/class.Vectorcosm.js'
import { Boid } from '../classes/class.Boids.js'
import * as utils from '../util/utils.js'
import { SimulationFactory } from '../classes/class.Simulation.js'
import PubSub from 'pubsub-js'
import BoidLibrary from '../classes/class.BoidLibrary.js'
import Tank from '../classes/class.Tank.js'
import TankMaker from '../classes/class.TankMaker.js'

const function_registry = new Map();

// broker incoming messages to the right handling function
self.addEventListener('message', (event) => {
	const eventData = event.data;
	const functionName = eventData?.functionName ?? eventData?.f;
	const f = function_registry.get(functionName);
	if ( f ) { f(eventData); }
});

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

function_registry.set( 'update', params => {
	
	let delta = params.delta || 1/30;
	let num_frames = params?.num_frames || 1;
	let inc_boid_animation_data = params?.inc_boid_animation_data ?? false;
	let inc_mark_animation_data = params?.inc_mark_animation_data ?? false;
	let inc_plant_animation_data = params?.inc_plant_animation_data ?? false;
	let inc_food_animation_data = params?.inc_food_animation_data ?? false;
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
	renderObjects.push( ... globalThis.vc.tank.obstacles.map( o => ({
		oid: o.oid,
		type:'obstacle',
		x: o.x,
		y: o.y,
		geodata: AutoIncludeGeoData(o),
	}) ));
	
	renderObjects.push( ... globalThis.vc.tank.obstacles.map( o => {
		let return_obj = {
			oid: o.oid,
			type:'obstacle',
			geodata: AutoIncludeGeoData(o),
		};
		// rocks don't move
		if ( return_obj.geodata ) {
			return_obj.x = o.x;
			return_obj.y = o.y;
		}
		return return_obj;
	}));
	
		
	// compile simulation stats
	let simStats = {
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
		'settings': Object.assign( { sim_meta_params: globalThis.vc.sim_meta_params }, globalThis.vc.simulation.settings )
		// 'stats': globalThis.vc.simulation.stats, // warning: contains graph data
	};
		
	// tank stats
	let species = new Set();
	for ( let b of globalThis.vc.tank.boids ) {
		species.add(b.species);
	}
	let tankStats = {
		boids: globalThis.vc.tank.boids.length,
		species: species.size,
		rocks: globalThis.vc.tank.obstacles.length,
		plants: globalThis.vc.tank.plants.length,
		foods: globalThis.vc.tank.foods.length,
		marks: globalThis.vc.tank.marks.length,
		boid_mass: Math.floor( globalThis.vc.tank.boids.reduce( (a,b) => a+b.mass, 0 ) ),
		food_mass: Math.floor( globalThis.vc.tank.foods.reduce( (a,b) => a+b.value, 0 ) ),
	}
			
	globalThis.postMessage( {
		functionName: 'update',
		data: { 
			renderObjects,
			simStats,
			tankStats
			}
	} );
});

function_registry.set( 'pickObject', params => {
	let result = null;
	
	// if they want a specific object by ID, just get that
	if ( params.data?.oid ) {
		// NOTE: we only check boids right now
		let obj = globalThis.vc.tank.boids.find( o => o.oid == params.data.oid );
		if ( obj ) { result = DescribeBoid(obj, params.data?.inc_sensor_geo, params.data?.inc_brain); }
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
		let closest = null;
		let closest_dist = 9999999999;
		for ( let o of objs ) {
			const d = (o.x - x) * (o.x - x) + (o.y - y) * (o.y - y);
			if ( d <= min_dist && d < closest_dist ) { 
				closest_dist = d;
				closest = o;
			}
		}
		// assemble a report based on object type
		if ( closest ) {
			result = DescribeBoid(closest, params.data?.inc_sensor_geo, params.data?.inc_brain);
		}
	}
	
	// send back 
	globalThis.postMessage( {
		functionName: 'pickObject',
		data: result
	} );
});


function_registry.set( 'getTankEnvironmentData', params => {
	const grid = globalThis.vc.tank.datagrid;
	const whirls = globalThis.vc.tank.whirls;
	const request = params.data?.request || 'current';
	globalThis.postMessage( { functionName: 'getTankEnvironmentData', data: { 
		grid,
		whirls,
		request
	} } );
});

function_registry.set( 'endSim', params => {
	globalThis.vc.simulation.killme = true;
	globalThis.postMessage( { functionName: 'endSim', data: null } );
});

function_registry.set( 'saveTank', params => {
	globalThis.vc.SaveTank( params?.data?.id ?? 0 );
	globalThis.postMessage( { functionName: 'saveTank', data: null } );
});

function_registry.set( 'loadTank', params => {
	globalThis.vc.LoadTank( params?.data?.id ?? 0, params.data?.settings );
	globalThis.postMessage( { functionName: 'loadTank', data: null } );
});

function_registry.set( 'exportBoids', params => {
	let db = params.data?.db || false;
	let str = globalThis.vc.SavePopulation( params.data?.species, params.data?.ids, db );
	globalThis.postMessage( { functionName: 'exportBoids', data: str } );
});

function_registry.set( 'loadBoids', params => {
	globalThis.vc.LoadPopulation( params.data );
	globalThis.postMessage( { functionName: 'loadBoids', data: null } );
});

function_registry.set( 'smite', params => {
	let ids = params.data.ids;
	let targets = globalThis.vc.tank.boids.filter( b => ids.includes(b.oid) );
	for ( let t of targets ) { t.Kill(); }
	globalThis.postMessage( { functionName: 'smite', data: targets.map(t=>t.oid) } );
});

function_registry.set( 'randTank', params => {
	// this is really overreaching and we should make something cleaner
	const w = globalThis.vc.tank.width;
	const h = globalThis.vc.tank.height;
	const boids = globalThis.vc.tank.boids.splice(0,globalThis.vc.tank.boids.length);
	globalThis.vc.tank.Kill();
	globalThis.vc.tank = new Tank( w, h );
	globalThis.vc.tank.boids = boids;
	globalThis.vc.tank.boids.forEach( b => b.tank = globalThis.vc.tank );
	globalThis.vc.tank.MakeBackground();
	const tm = new TankMaker( globalThis.vc.tank, {} );
	tm.Make();
	globalThis.postMessage( { functionName: 'randTank', data: null } );
});


function_registry.set( 'init', params => {
	globalThis.vc.Init(params.data);
	globalThis.postMessage( {
		functionName: 'init',
		data: {
			width: globalThis.vc.tank.width,
			height: globalThis.vc.tank.height,
		}
	} );
});


function_registry.set( 'updateSimSettings', params => {
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
		functionName: 'updateSimSettings',
		data: Object.assign( { sim_meta_params: globalThis.vc.sim_meta_params }, globalThis.vc.simulation.settings )
	} );
});

function_registry.set( 'pushSimQueue', params => {
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
		functionName: 'pushSimQueue',
		data: Object.assign( { sim_meta_params: globalThis.vc.sim_meta_params }, globalThis.vc.simulation.settings )
	} );
});

function_registry.set( 'addSavedBoidsToTank', async params => {
	let num_added = 0;
	const lib = new BoidLibrary;
	for ( let id of params.data.ids ) {
		let results = await lib.Get({id});
		for ( let row of results ) {
			for ( let json of row.specimens ) {
				let b = new Boid( 0, 0, globalThis.vc.tank, JSON.parse(json) );
				b.ScaleBoidByMass();
				globalThis.vc.simulation.AddBoidToTank(b); // handles safe spawn
				num_added++;						
			}
		}
	}
	globalThis.postMessage( {
		functionName: 'addSavedBoidsToTank',
		data: { ok: true, num_added }
	} );
});

// listen for critical internal events and report back via API
let onSimCompleteSubscription = PubSub.subscribe('sim.complete', (msg, sim) => {
	let stats = Object.assign({}, sim.stats);
	delete(stats.records); // don't need records - those are sent separately
	globalThis.postMessage( {
		functionName: 'simComplete',
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
		functionName: 'simRound',
		data: datapacket
	} );
});
let onSimNewSubscription = PubSub.subscribe('sim.new', (msg, sim) => {
	// force the tank geometry to update
	globalThis.vc.tank.geodata_sent = false;
	globalThis.postMessage( {
		functionName: 'simNew',
		data: sim.settings
	} );
});
let onRecordsPushSubscription = PubSub.subscribe('records.push', (msg,data) => {
	globalThis.postMessage( {
		functionName: 'records.push',
		data: data
	} );
});
		
// set up the main simulation
let vc = new Vectorcosm;
globalThis.vc = vc; // handy reference for everyone else

function DescribeBoid( o, inc_sensor_geo=false,  inc_brain=false ) {
	let data = { 
		type: 'boid',
		sensors: [],
	};
	
	// scalar values we can just copy
	for ( let i of ['oid','id','species','genus','generation','speciation',
		'length','width','linear_impulse','torque',
		'age', 'lifespan', 'maturity_age', 'scale', 'mass',
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
		
	// brain outputs - depends on brain type
	if ( o.brain.type==='snn' || o.brain.type==='rnn' || o.brain.type==='epann' ) {
		data.brain_outputs = o.brain.outputs.map( (v,i) => ({
			name: (o.motors[i]?.name || 'UNKNOWN'),
			val: v
		}));
	}
	
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
	if ( o.brain.type === 'rnn' ) {
		data.brain = [];
		for ( let i = 0; i < o.brain.network.nodes.length; i++ ) {
			data.brain.push( ...o.brain.network.nodes[i].map( v => {
				v = utils.clamp(v,-1,1);
				let hexval = utils.DecToHex( Math.round(Math.abs(v) * 255) );
				let color = ( v >= 0 ? ('#00' + hexval + '00') : ('#' + hexval + '0000') );
				if ( v === 1 ) { color = '#FFFFFF'; }
				const is_input = i==0;
				return { 
					type: (is_input ? 'input' : 'node' ), 
					value: v,
					symbol: (is_input ? 'I' : 'N' ),
					color: color,
				};
			}) );
		}
		// separate outputs
		data.brain.push( ...o.brain.network.nodes[ o.brain.network.nodes.length-1 ].map( v => {
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
			s.type==='sense' )
			.map( i => i.CreateGeometry() );
	}
	if ( inc_brain ) {	
		// include data for brain graph 
		data.brain_struct = o.brain.network.Export(false); // POD
	}
				
	return data;
}