
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
		for ( let i=0; i < 100; i++ ) {
			globalThis.vc.update(delta);
		}
		let returnMsg =  {
			frame: globalThis.vc.simulation?.stats.framenum,
			boids: globalThis.vc.tank.boids.length,
		};
		globalThis.postMessage( returnMsg );
	}
	
});

// set up the main simulation
let vc = new Vectorcosm;
globalThis.vc = vc; // handy reference for everyone else
// globalThis.vc.onSimulationChange = new_sim => { sim.value = new_sim; }
vc.Init();
