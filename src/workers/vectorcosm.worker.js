
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


self.addEventListener('message', (event) => {

	const eventData = event.data; // JSON.parse(event.data);
	if ( eventData?.f=='update' ) {
		let delta = eventData.delta || 1/30;
		let num_frames = eventData?.num_frames || 1;
		for ( let i=0; i < num_frames; i++ ) {
			globalThis.vc.update(delta);
		}
		let renderObjects = globalThis.vc.tank.boids.map( b => ({
			oid: b.oid,
			type:'boid',
			x: b.x,
			y: b.y,
			a: b.angle,
			s: b.scale
		}));
		renderObjects.push( ... globalThis.vc.tank.plants.map( o => ({
			oid: o.oid,
			type:'plant',
			x: o.x,
			y: o.y,
			a: Math.PI*0.25,
			s: 1
		}) ));
		renderObjects.push( ... globalThis.vc.tank.foods.map( o => ({
			oid: o.oid,
			type:'food',
			x: o.x,
			y: o.y,
			a: 0,
			s: 1
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
			pts: o.collision.hull
		}) ));
		
		let returnMsg =  {
			frame: globalThis.vc.simulation?.stats.framenum,
			boids: globalThis.vc.tank.boids.length,
			obstacles: globalThis.vc.tank.obstacles.length,
			plants: globalThis.vc.tank.plants.length,
			foods: globalThis.vc.tank.foods.length,
			marks: globalThis.vc.tank.marks.length,
			renderObjects
		};
		globalThis.postMessage( returnMsg );
	}
	
});

// set up the main simulation
let vc = new Vectorcosm;
globalThis.vc = vc; // handy reference for everyone else
// globalThis.vc.onSimulationChange = new_sim => { sim.value = new_sim; }
vc.Init();
