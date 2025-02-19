import Vectorcosm from '../classes/class.Vectorcosm.js'
import { Boid } from '../classes/class.Boids.js'
import * as utils from '../util/utils.js'
// import Tank from './classes/class.Tank.js'
// import Simulation from './classes/class.Simulation.js'
// import BrainGraph from './classes/class.BrainGraph.js'
// import SimulatorControls from './components/SimulatorControls.vue'
// import TrainingProgramControls from './components/TrainingProgramControls.vue'
// import CameraControls from './components/CameraControls.vue'
// import BoidLibraryControls from './components/BoidLibraryControls.vue'
// import TankStats from './components/TankStats.vue'
// // import Plant from './classes/class.Plant.js'
// // import Poison from './classes/class.Poison.js'
// import { onMounted, ref, reactive, markRaw, shallowRef, shallowReactive } from 'vue'
// import PubSub from 'pubsub-js'
// import BoidLibrary from './classes/class.BoidLibrary.js'

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
	for ( let i=0; i < num_frames; i++ ) {
		globalThis.vc.update(delta);
	}
	let renderObjects = [];
	renderObjects.push({
		oid: globalThis.vc.tank.oid,
		type: 'tank',
		geodata: AutoIncludeGeoData(globalThis.vc.tank)
	});
	renderObjects.push( ... globalThis.vc.tank.boids.map( o => ({
		oid: o.oid,
		type:'boid',
		x: o.x,
		y: o.y,
		a: o.angle,
		s: o.scale,
		geodata: AutoIncludeGeoData(o)
	}) ));
	renderObjects.push( ... globalThis.vc.tank.plants.map( o => ({
		oid: o.oid,
		type:'plant',
		x: o.x,
		y: o.y,
		geodata: AutoIncludeGeoData(o)
	}) ));
	renderObjects.push( ... globalThis.vc.tank.foods.map( o => ({
		oid: o.oid,
		type:'food',
		x: o.x,
		y: o.y,
		s: 1,
		r: o.r, // needed to render dynamic radius
		geodata: AutoIncludeGeoData(o)
	}) ));
	renderObjects.push( ... globalThis.vc.tank.marks.map( o => ({
		oid: o.oid,
		type:'mark',
		x: o.x,
		y: o.y,
		age: o.age,
		lifespan: o.lifespan,
		geodata: AutoIncludeGeoData(o),
	}) ));
	renderObjects.push( ... globalThis.vc.tank.obstacles.map( o => ({
		oid: o.oid,
		type:'obstacle',
		x: o.x,
		y: o.y,
		geodata: AutoIncludeGeoData(o),
		pts: o.collision.hull // TODO we don't need this every frame
	}) ));
	
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
		'settings': globalThis.vc.simulation.settings,
		// 'stats': globalThis.vc.simulation.stats, // warning: contains graph data
	};
		
	// tank stats
	let tankStats = {
		boids: globalThis.vc.tank.boids.length,
		obstacles: globalThis.vc.tank.obstacles.length,
		plants: globalThis.vc.tank.plants.length,
		foods: globalThis.vc.tank.foods.length,
		marks: globalThis.vc.tank.marks.length,
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
		if ( obj ) { result = DescribeBoid(obj); }
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
			result = DescribeBoid(closest);
		}
	}
	
	// send back 
	globalThis.postMessage( {
		functionName: 'pickObject',
		data: result
	} );
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
	for ( let k in params.data ) {
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
		data: globalThis.vc.simulation.settings
	} );
});

// set up the main simulation
let vc = new Vectorcosm;
globalThis.vc = vc; // handy reference for everyone else
// globalThis.vc.onSimulationChange = new_sim => { sim.value = new_sim; }

function DescribeBoid( o ) {
	let data = { 
		type: 'boid',
		sensors: [],
	};
	
	// scalar values we can just copy
	for ( let i of ['oid','id','species','generation',
		'length','width','inertia','angmo',
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
		
	// brain outputs
	data.brain_outputs = o.brain.nodes
		.filter(n => n.type=='output')
		.map(n => ({val:n.activation.toFixed(2)}) );
	data.brain_outputs.forEach( (n,i) => n.name = o.motors[i].name );
		
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
		this_stoke_time: (m.this_stoke_time||0),
		strokepow: (m.strokepow||0),
		cost: m.cost,
		last_amount: Math.abs(m.last_amount||0)
	}) );
	
	// brain nodes
	data.brain = o.brain.nodes.map( n => {
		let value = utils.clamp(n.activation,-1,1);
		let hexval = utils.DecToHex( Math.round(Math.abs(value) * 255) );
		return { 
			type: n.type, 
			value,
			symbol: (n.type=='input' ? 'I' : ( n.type=='output' ? 'O' : n.squash.name.charAt(0) ) ),
			color: ( n.activation >= 0 ? ('#00' + hexval + '00') : ('#' + hexval + '0000') )
		};
	});
		
	return data;
}