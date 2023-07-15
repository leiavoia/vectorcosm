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
import { BoidFactory } from './classes/class.Boids.js'
// import Plant from './classes/class.Plant.js'
// import Poison from './classes/class.Poison.js'
import { onMounted, ref, reactive, markRaw } from 'vue'

// set up Two now, attach to DOM later
let two = new Two({ fitted: true, type: 'CanvasRenderer' });
window.two = two; // make available everywhere
// this.config.globalProperties.two = two;

// will be created by Chart.js after DOM loads
let simulatorChart = null;
let simulation = null;
let tank = null;
	
// world settings
let world = reactive({
	use_species: 'Boid',
	settings: { 
		viscosity: 0.5, // 0..1
		max_mutation: 10, // up to
		cullpct: 0.5, // 0..1
	},
	ui: {
		show_collision_detection: false,
		show_ui: true,
		show_brainmap: false,
		focus_object: null,
		focus_geo: null,
		fps: 0,
	},
	width: 0,
	height: 0,
	scale: 0.5,
	simulator: {
		num_boids: 30,
		turbo: false,
		time: 30, // in seconds
		rounds: 5000,
		best_score: 0,
		best_avg_score: 0,
		best_brain: null,
		round: {
			num: 0,
			best_score: 0,
			avg_score: 0,
			time: 0
		},
		chartdata: markRaw({ // causes problems with Vue when marked reactive
			averages: [],
			highscores: []
		}),
		framenum: 0
	}
});
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
	world.simulator.framenum = two.frameCount;
	world.ui.fps = Math.round(1/delta);
	
	// braingraph the leader
	DrawBrainGraph();
									
}		

function DrawBrainGraph() {
	if ( world.ui.show_brainmap && !world.simulator.turbo ) {
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

function RunSimulator()	{
	if ( world.simulator.round.time <= world.simulator.time && world.simulator.turbo ) {
		if ( two.playing ) { two.pause(); }
		for ( let n=0; n < 100; n++ ) {
			++two.frameCount; // fake it
			update( two.frameCount, 0.055 );
		}
		--two.frameCount;
		two.update();
		setTimeout( RunSimulator, 0 );
	}
	else {
		two.play();
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
		
		
function SaveLeader() {
	if ( tank.boids.length ) {
		const b = tank.boids.sort( (a,b) => b.total_fitness_score - a.total_fitness_score )[0];
		localStorage.setItem("leader-brain", JSON.stringify(b.brain.toJSON()));
		console.log("Saved leader brain with score " + b.total_fitness_score.toFixed(1) );
	}		
}

function LoadLeader() {
	let json = localStorage.getItem("leader-brain");
	if (json) {
		json = JSON.parse(json);
		let brain = neataptic.Network.fromJSON(json);
		// const b = BoidFactory(world.use_species, Math.random()*world.width, Math.random()*world.height );
		const b = BoidFactory(world.use_species, world.width*0.25, world.height*0.25,tank );
		b.brain = brain;
		b.angle = Math.random() * Math.PI * 2;		
		tank.boids.push(b);				
		console.log("Spawned saved brain" );
	}		
}

function ChangeViewScale() {
	SetViewScale(world.scale);
}

function ChangeNumBoids(x) {
	let n = parseInt(x) || parseInt(world.simulator.num_boids);
	// document.getElementById('numboids_slider_output').value = n;
	let diff = n - tank.boids.length;
	if ( diff > 0 ) {
		for ( let i=0; i < diff; i++ ) {
			// const b = BoidFactory(world.use_species, Math.random()*world.width, Math.random()*world.height );
			const b = BoidFactory(world.use_species, world.width*0.25, world.height*0.25,tank );
			b.angle = Math.random() * Math.PI * 2;
			tank.boids.push(b);
		}			
	}
	else if ( diff < 0 ) {		
		tank.boids.splice(0,-diff).forEach( x => x.Kill() );
	}
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
function ToggleSimulatorFF() {
	world.simulator.turbo = !world.simulator.turbo;
	if ( world.simulator.turbo ) { RunSimulator(); }
}
function TogglePause() {
	if ( two.playing ) { two.pause(); console.log('paused'); } 
	else { two.play(); console.log('playing'); }
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
			
function MakeSimulatorChart( element_id, averages, highscores ) {

	const chartdata = {
		labels: [],
		datasets: [
			{
				label: 'Average',
				backgroundColor: '#3DAEE9',
				borderColor: '#3DAEE9',
				borderWidth: 1,
				fill:true,
				data: averages,
				order: 2,
				tension: 0.2,
			},
			{
				label: 'Best',
				backgroundColor: '#55EEFF33',
				borderColor: '#55EEFF33',
				borderWidth: 1,
				fill:true,
				tension: 0.2,
				data: highscores,
			},
		]
	};
	const chartconfig = {
		type: 'line',
		data: chartdata,
		options: {
			responsive: false,
			aspectRatio: 2.5,
			interaction: {
				intersect: false,
			},					
			plugins: {
				legend: {
					position: 'top',
					display:false,
				},
				title: {
					display: false,
				}
			},
			scales: {
				x: { display: false },
				y: { display: false }
			}				
		}
	};
	return new Chart( document.getElementById(element_id), chartconfig );
}
		
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
	simulation = markRaw( new Simulation(tank,{}) );
	simulation.Setup();
	
	// chart data for simulation
	simulatorChart = MakeSimulatorChart('simulatorChart', world.simulator.chartdata.averages, world.simulator.chartdata.highscores);

	// draw screen
	two.update();
	two.play();
	
}) // end onMounted

</script>

<template>

    <div class="shape-container">
      <div id="draw-shapes"></div>
    </div>
    
    <div class="ui" id="ui_container">
	
      <button @click="TogglePause()" id="pause_button">Pause</button>
      <button @click="ToggleSimulatorFF()" id="fast_forward_button">FF</button>
      <button @click="ToggleUI()" id="hide_ui_button">UI</button>
      <button @click="ToggleShowSensors()" id="show_sensors_button">Sensors</button>
      <button @click="ToggleShowBrainmap()" id="show_brainmap_button">Brain</button>
      <button @click="SaveLeader()" id="save_leader_button">Save</button>
      <button @click="LoadLeader()" id="load_leader_button">Load</button>
      
      <br />
      
	  <!-- <p>FOOO: {{barf}}</p> -->
	  
      <label for="numboids_slider">Boids</label>
      <input v-model.number="world.simulator.num_boids" @change="ChangeNumBoids()" type="range" min="0" max="250" step="1" style="margin-bottom:-0.25em;" id="numboids_slider" />
      <output for="numboids_slider" id="numboids_slider_output">{{world.simulator.num_boids}}</output>
      
      <br/>
      
      <label for="mutation_slider">Mutation</label>
      <input v-model.number="world.settings.max_mutation" type="range" min="1" max="25" step="1" style="margin-bottom:-0.25em;" id="mutation_slider" />
      <output for="mutation_slider" id="mutation_slider_output">{{world.settings.max_mutation}}</output>
      
      <br/>
      
      <label for="culling_slider">Culling</label>
      <input v-model.number="world.settings.cullpct" type="range" min="0.1" max="0.9" step="0.1" style="margin-bottom:-0.25em;" id="culling_slider" />
      <output for="culling_slider" id="culling_slider_output">{{world.settings.cullpct}}</output>
      
      <br/>
      
      <label for="viscosity_slider">Viscosity</label>
      <input v-model.number="world.settings.viscosity" type="range" min="0" max="1" step="0.01" style="margin-bottom:-0.25em;" id="viscosity_slider" />
      <output for="viscosity_slider" id="viscosity_slider_output">{{world.settings.viscosity}}</output>
      
      <br/>
      
      <label for="world_scale_slider">Scale</label>
      <input v-model.number="world.scale" @change="ChangeViewScale()" type="range" min="0.1" max="2" step="0.1" style="margin-bottom:-0.25em;" id="world_scale_slider" />
      <output for="world_scale_slider" id="world_scale_slider_output">{{world.scale}}</output>
      
      <br/>
      
      <label for="round_time_slider">Timeout</label>
      <input v-model.number="world.simulator.time" type="range" min="10" max="180" step="1" style="margin-bottom:-0.25em;" id="round_time_slider" />
      <output for="round_time_slider" id="round_time_slider_output">{{world.simulator.time}}</output>
      
      <br/>
      
      Round: <output id="round_output">{{world.simulator.round.num}}</output> | 
      Best: <output id="best_score_output">{{world.simulator.round.best_score.toFixed()}}</output> | 
      Avg: <output id="avg_score_output">{{world.simulator.round.avg_score.toFixed()}}</output>
      
      <br />
      
      Sim Best: <output id="total_score_output">{{world.simulator.best_score.toFixed()}}</output> | 
      Best Avg: <output id="best_avg_score_output">{{world.simulator.best_avg_score.toFixed()}}</output>
      
      <br/>
      
      T: <output id="sim_time_output">{{world.simulator.round.time.toFixed(1)}}</output> | 
      F: <output id="framenum_output">{{world.simulator.framenum}}</output> | 
      FPS: <output id="fps_output">{{world.ui.fps}}</output>
      
      <br/>

      <canvas id="simulatorChart" style="width: 12em; height: 4em;"></canvas>
    </div>
</template>

<style scoped>

</style>
