<script setup>
import Two from "two.js";
import neataptic from "neataptic";
// import * as Chart from "chart.js";
import Chart from 'chart.js/auto';
// you can optimize package size by not including everything. see:
// https://www.chartjs.org/docs/latest/getting-started/integration.html
import * as utils from './util/utils.js'
import Tank from './classes/class.Tank.js'
import Simulation from './classes/class.Simulation.js'
import BrainGraph from './classes/class.BrainGraph.js'
import SimulatorControls from './components/SimulatorControls.vue'
import { BoidFactory } from './classes/class.Boids.js'
// import Plant from './classes/class.Plant.js'
// import Poison from './classes/class.Poison.js'
import { onMounted, ref, reactive, markRaw, shallowRef, shallowReactive } from 'vue'

// set up Two now, attach to DOM later
let two = new Two({ fitted: true, type: 'CanvasRenderer' });
window.two = two; // make available everywhere
// this.config.globalProperties.two = two;

let simulation = null;
let sim = shallowRef(null); 
let tank = null;

// world settings
let world = {
	ui: {
		show_collision_detection: false,
		show_ui: false,
		show_brainmap: false,
		focus_object: null,
		focus_geo: null,
		fps: 0,
	},
	width: 0,
	height: 0,
	scale: 0.5
};
window.world = world; // TODO: /!\ TEMPORARY

// graphing and chart setup				
Chart.defaults.color = '#FFF';
Chart.defaults.elements.line.backgroundColor = '#41A34F';
Chart.defaults.elements.line.borderColor = '#41A34F';
Chart.defaults.elements.bar.backgroundColor = '#41A34F';
Chart.defaults.elements.bar.borderColor = '#41A34F';
Chart.defaults.elements.point.radius = 0;

// default scale depends on device you are on
function SetViewScale( scale ) {
	world.scale = utils.clamp( scale, 0.1, 10 );
	world.width =  two.width / world.scale,
	world.height =  two.height / world.scale,
	two.scene.scale = world.scale;
	if ( world.braingraph ) {
		world.braingraph.onScreenSizeChange();
	}
}

// use delta param to supply manual deltas for simulations.
// otherwise it will use two.js's built in delta tracking.
function update(frameNumber, delta=0) {
	
	// fix delta supplied in ms
	if ( delta && delta > 1 ) { delta /= 1000; }
	delta = Math.min( (delta || two.timeDelta/1000), 0.25); // beware of spikes from pausing
	
	// update simulation		
	if ( simulation ) {
		simulation.Update(delta);
	}			
	
	// update all boids
	for ( let b of tank.boids ) {
		b.Update(delta);
	}
	
	// update food
	for ( let i = tank.foods.length-1; i >= 0; i-- ) {
		const food = tank.foods[i];
		food.Update(delta);
		if ( food.dead || !food.value ) {
			tank.foods.splice(i,1);
		}
	}
	
	// UI stats
	// world.simulator.framenum = two.frameCount;
	world.ui.fps = Math.round(1/delta);
	
	// braingraph the leader
	DrawBrainGraph();
									
}		

function DrawBrainGraph() {
	if ( world.ui.show_brainmap && !simulation.turbo ) {
		// anything to track?
		if ( tank.boids.length ) {	
			let target = world.ui.focus_object || tank.boids.sort( (a,b) => b.total_fitness_score - a.total_fitness_score )[0];
			TrackObject(target);
			world.braingraph =  world.braingraph ?? new BrainGraph(target);
			world.braingraph.setTarget(target);
			world.braingraph.Draw();
		}
		// otherwise close
		else if ( world.braingraph ) {
			world.braingraph.Kill();
			world.braingraph = null;				
		}
	}
	else if ( world.braingraph ) {
		world.braingraph.Kill();
		world.braingraph = null;				
	}
}
		
function TrackObject(o) {
	if ( !o ) { return; }
	if ( o.dead ) {
		if ( world.ui.focus_object == o ) { StopTrackObject(); }
		return;
	}
	world.ui.focus_object = o;
	if ( !world.ui.focus_geo ) {
		world.ui.focus_geo = two.makeCircle(world.ui.focus_object.x, world.ui.focus_object.y, 50);
		world.ui.focus_geo.stroke = '#AEA';
		world.ui.focus_geo.linewidth = 4;
		world.ui.focus_geo.fill = 'transparent';
	}
	else {
		world.ui.focus_geo.position.x = world.ui.focus_object.x;
		world.ui.focus_geo.position.y = world.ui.focus_object.y;
	}
}
function StopTrackObject() {
	if ( !world.ui.focus_object ) { return ; }
	world.ui.focus_object = null;
	if ( world.ui.focus_geo ) {
		world.ui.focus_geo.remove();
		world.ui.focus_geo = null;
	}
}
function ShiftFocusTarget() {
	if ( !tank.boids.length ) { return; }
	if ( !world.ui.focus_object ) { 
		TrackObject(tank.boids[0]);
	}
	else {
		let i = tank.boids.indexOf( world.ui.focus_object );
		if ( ++i == tank.boids.length ) { i = 0; }
		TrackObject( tank.boids[i] );
		console.log('tracking ' + 1 );
	}
}

function ChangeViewScale() {
	SetViewScale(world.scale);
}

function SetShowUI(x) {
	world.ui.show_ui = !!x;
	let el = document.getElementById('ui_container');
	if ( world.ui.show_ui ) { el.style.visibility = 'visible'; }
	else { el.style.visibility = 'hidden'; }
}
function ToggleUI() {
	SetShowUI( !world.ui.show_ui );
}
function SetShowSensors(x) {
	world.ui.show_collision_detection = !world.ui.show_collision_detection;
}
function ToggleShowSensors() {
	SetShowSensors( !world.ui.show_collision_detection );
}
function ToggleShowBrainmap() {
	if ( world.ui.show_brainmap ) { StopTrackObject(); }
	world.ui.show_brainmap = !world.ui.show_brainmap;
}

// Handle key down events
const body = document.querySelector("body");
body.addEventListener("touchstart", function(event) {
	if ( !world.ui.show_ui ) ToggleUI();
});
body.addEventListener("keydown", function(event) {
	if ( event.keyCode == 19 ) {  // `Pause` 
		TogglePause();
	}
	else if ( event.keyCode == 39 ) {  // `right arrow` 
		event.preventDefault();
		ShiftFocusTarget();
	}
	else if ( event.which == 49 ) {  // `1` 
		event.preventDefault();
		ToggleShowSensors();
	}
	else if ( event.which == 50 ) {  // `2` 
		event.preventDefault();
		ToggleUI()
	}
	else if ( event.which == 66 ) {  // `B` 
		event.preventDefault();
		ToggleShowBrainmap()
	}
	else if ( event.which == 51 ) {  // `3` 
		event.preventDefault();
		SaveLeader();
	}
	else if ( event.which == 52 ) {  // `4` 
		event.preventDefault();
		LoadLeader();
	}
	else if ( event.which == 35 ) {  // `END` 
		event.preventDefault();
		ToggleSimulatorFF();
	}
	else if ( event.which == 76 ) {  // `L` 
		event.preventDefault();
		const b = tank.boids.sort( (a,b) => b.total_fitness_score - a.total_fitness_score )[0];
		if ( b ) console.log(b);
	}
});
			
window.addEventListener("resize", function (event) {
	world.height = window.innerHeight / world.scale;
	world.width = window.innerWidth / world.scale;
	two.fit();
});
				
// set up Two.js
onMounted(() => {
	
	// set up Two
	let elem = document.getElementById('draw-shapes');
	two.appendTo(elem);
	// `types is one of: 'WebGLRenderer', 'SVGRenderer', 'CanvasRenderer'
	two.bind('update', update);
	
	// default screen scaling based on user window
	if ( two.width < 500 ) { SetViewScale(0.4); }
	else if ( two.width < 1200 ) { SetViewScale(0.6); }
	else if ( two.width < 1900 ) { SetViewScale(1); }
	else { SetViewScale(1); }

	// set up tank
	tank = new Tank( world.width, world.height );
	tank.MakeBackground();
	
	// set up the simulation
	simulation = new Simulation(tank,{});
	simulation.Setup();
	
	sim.value = simulation;
	
	// draw screen
	two.update();
	two.play();
	
	
	console.log('app mounted');
}) // end onMounted



</script>

<template>
    <div class="shape-container">
      <div id="draw-shapes"></div>
    </div>
    <div class="ui" id="ui_container" v-if="sim">
		<simulator-controls :sim="sim"></simulator-controls>
    </div>
</template>

<style scoped>

</style>
