
import Vectorcosm from '../classes/class.Vectorcosm.js'
// import * as utils from './util/utils.js'
// import Tank from './classes/class.Tank.js'
// import Simulation from './classes/class.Simulation.js'
// import BrainGraph from './classes/class.BrainGraph.js'
// import { Boid } from './classes/class.Boids.js'
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
		x: 0,
		y: 0,
		a: 0,
		s: 1,
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
		a: 0,
		s: 1,
		r: o.r, // needed to render dynamic radius
		geodata: AutoIncludeGeoData(o)
	}) ));
	renderObjects.push( ... globalThis.vc.tank.marks.map( o => ({
		oid: o.oid,
		type:'mark',
		x: o.x,
		y: o.y,
		a: 0,
		s: 1
	}) ));
	renderObjects.push( ... globalThis.vc.tank.obstacles.map( o => ({
		oid: o.oid,
		type:'obstacle',
		x: o.x,
		y: o.y,
		a: 0,
		s: 1,
		geodata: AutoIncludeGeoData(o),
		pts: o.collision.hull
	}) ));
	
	globalThis.postMessage( {
		functionName: 'update',
		data: { renderObjects }
	} );
});

function_registry.set( 'getTankStats', params => {
	globalThis.postMessage( {
		functionName: 'getTankStats',
		data: {
			boids: globalThis.vc.tank.boids.length,
			obstacles: globalThis.vc.tank.obstacles.length,
			plants: globalThis.vc.tank.plants.length,
			foods: globalThis.vc.tank.foods.length,
			marks: globalThis.vc.tank.marks.length,
		}
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

// set up the main simulation
let vc = new Vectorcosm;
globalThis.vc = vc; // handy reference for everyone else
// globalThis.vc.onSimulationChange = new_sim => { sim.value = new_sim; }

