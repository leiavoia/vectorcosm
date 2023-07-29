<script setup>
import Two from "two.js";
import neataptic from "neataptic";
// import * as Chart from "chart.js";
import Chart from 'chart.js/auto';
// you can optimize package size by not including everything. see:
// https://www.chartjs.org/docs/latest/getting-started/integration.html
import * as utils from './util/utils.js'
import Tank from './classes/class.Tank.js'
import Vectorcosm from './classes/class.Vectorcosm.js'
import Simulation from './classes/class.Simulation.js'
import BrainGraph from './classes/class.BrainGraph.js'
import { Boid } from './classes/class.Boids.js'
import SimulatorControls from './components/SimulatorControls.vue'
// import Plant from './classes/class.Plant.js'
// import Poison from './classes/class.Poison.js'
import { onMounted, ref, reactive, markRaw, shallowRef, shallowReactive } from 'vue'
import PubSub from 'pubsub-js'


let sim = shallowRef(null);

let vc = new Vectorcosm; // the app, proper
window.vc = vc; 
window.vc.onSimulationChange = new_sim => { sim.value = new_sim; }


let boidviewer = new Two({ fitted: true, type: 'SVGRenderer' }); 
let braingraph_context = new Two({ fitted: true, type: 'SVGRenderer' }); 
let braingraph = null;

let focus_boid_data = ref();

// subscriptions to critical events
let frameUpdateSubscription = PubSub.subscribe('frame-update', (msg,data) => {
	// copy data from boid in focus. 
	// it would nice to just reactify the boid itself, 
	// but its considered high performance data and we need to stay hands off
	if ( vc.focus_object ) {
		if ( !focus_boid_data.value ) { focus_boid_data.value = {}; }
		for ( let i of ['id','species','generation','max_energy','energy','diet','diet_range',
			'length','width','inertia','angmo','energy_cost','total_fitness_score'] ) {
			focus_boid_data.value[i] = vc.focus_object[i];
		}
		focus_boid_data.value.sensors = vc.focus_object.sensors.map(s => ({name:s.name||s.detect, val:s.val}) );
		focus_boid_data.value.outputs = vc.focus_object.brain.nodes
			.filter(n => n.type=='output')
			.map(n => ({val:n.activation.toFixed(2)}) );
		focus_boid_data.value.outputs.forEach( (n,i) => n.name = vc.focus_object.motors[i].name );
		focus_boid_data.value.motors = vc.focus_object.motors.map( m => ({
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
			last_amount: (m.last_amount||0)
		}) );
		focus_boid_data.value.brainnodes = vc.focus_object.brain.nodes.map( n => {
			let hexval = utils.DecToHex( Math.round(Math.abs(utils.clamp(n.activation,-1,1)) * 255) );
			return {
				symbol: (n.type=='input' ? 'I' : ( n.type=='output' ? 'O' : n.squash.name.charAt(0) ) ),
				color: ( n.activation >= 0 ? ('#00' + hexval + '00') : ('#' + hexval + '0000') ),
				type: n.type
			};
		});
		if ( braingraph ) { 
			braingraph.setTarget(vc.focus_object);
			braingraph.Draw();
			braingraph_context.update();		
		}
	}
	else if ( focus_boid_data.value ) {
		focus_boid_data.value = null;
	}
});


// Handle key down events
const body = document.querySelector("body");
body.addEventListener("touchstart", function(event) {
	event.preventDefault();
	if ( !vc.show_ui ) { vc.ToggleUI(); }
});
body.addEventListener("keydown", function(event) {
	if ( event.which == 80 || event.which == 19 ) {  // `Pause` 
		vc.TogglePause();
	}
	else if ( event.keyCode == 37 ) {  // `left arrow` 
		event.preventDefault();
		vc.ShiftFocusTarget(-1);
	}
	else if ( event.keyCode == 39 ) {  // `right arrow` 
		event.preventDefault();
		vc.ShiftFocusTarget();
	}
	else if ( event.which == 49 ) {  // `1` 
		event.preventDefault();
		vc.ToggleShowSensors();
	}
	else if ( event.which == 50 ) {  // `2` 
		event.preventDefault();
		vc.ToggleUI()
	}
	else if ( event.which == 66 ) {  // `B` 
		event.preventDefault();
		vc.ToggleShowBrainmap()
	}
	else if ( event.which == 51 ) {  // `3` 
		event.preventDefault();
		vc.SaveLeader();
	}
	else if ( event.which == 52 ) {  // `4` 
		event.preventDefault();
		vc.LoadLeader();
	}
	else if ( event.which == 53 ) {  // `5` 
		event.preventDefault();
		vc.animate_boids = !vc.animate_boids;
	}
	else if ( event.which == 57 ) {  // `9` 
		event.preventDefault();
		vc.SavePopulation();
	}
	else if ( event.which == 48 ) {  // `0` 
		event.preventDefault();
		vc.LoadPopulation();
	}
	else if ( event.which == 70 || event.which == 35 ) {  // `END` 
		event.preventDefault();
		vc.ToggleSimulatorFF();
	}
	else if ( event.which == 84 ) {  // `T` 
		event.preventDefault();
		if ( vc.focus_object ) { vc.StopTrackObject(); }
		else {
			const b = vc.tank.boids.sort( (a,b) => b.total_fitness_score - a.total_fitness_score )[0];
			vc.TrackObject(b);
		}
	}
	else if ( event.which == 76 ) {  // `L` 
		event.preventDefault();
		const b = vc.tank.boids.sort( (a,b) => b.total_fitness_score - a.total_fitness_score )[0];
		if ( b ) console.log(b);
	}
});
			
window.addEventListener("resize", function (event) {
	vc.height = window.innerHeight;
	vc.width = window.innerWidth;
	vc.two.fit();
	vc.SetViewScale( vc.scale ); // trigger update, even though scale hasent changed
	if ( vc.tank ) { vc.tank.Resize(vc.width, vc.height); } // [!]HACK - move this 
});
				

onMounted(() => {
	vc.Init();
	vc.Play();
}) 


function ClickMap( event ) {
	console.log(event);
	// todo convert mouse click from screen space to world space
	const x = event.clientX;
	const y = event.clientY;
	// find objects near pointer click
	const r = 30;
	let objs = vc.tank.grid.GetObjectsByBox( x-r, y-r, x+r, y+y, Boid );
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
	if ( closest ) {
		vc.TrackObject(closest);
		let timeout = setTimeout( _ => {
			boidviewer.clear();
			let elem = document.getElementById('boidviewer');
			boidviewer.appendTo(elem);
			let geo = closest.bodyplan.geo.clone();
			geo.dashes = closest.bodyplan.geo.dashes;
			console.log(geo);
			geo.position.x = boidviewer.width * 0.5;
			geo.position.y = boidviewer.height * 0.5;
			geo.rotation = -Math.PI * 0.5;
			const bounds = geo.getBoundingClientRect();
			geo.scale = Math.max(boidviewer.width, boidviewer.height) / Math.max( bounds.height, bounds.width );
			geo.scale *= 0.90; // whitespace
			// geo.center();
			boidviewer.add(geo);
			boidviewer.update();
			
			// braingraphing
			braingraph_context.clear();
			let braingraph_elem = document.getElementById('braingraph');
			braingraph_context.appendTo(braingraph_elem);
			braingraph = new BrainGraph(null,braingraph_context);
			braingraph.setTarget(closest);
			braingraph.Draw();
			braingraph_context.update();
		}, 100 );
	}
	else {
		vc.StopTrackObject();
		if ( braingraph ) { 
			braingraph.Kill();
			braingraph = null;
		}
	}
}

</script>

<template>
    <div class="shape-container">
      <div id="draw-shapes"></div>
    </div>
    <div class="ui" id="ui_container" style="visibility:hidden;"  v-if="sim">
		<simulator-controls :sim="sim"></simulator-controls>
    </div>
    <main @click="ClickMap($event)">
		<section class="iconmenu" v-if="focus_boid_data" style="display:flex; flex-flow: column;">
			<button style="width:100%; padding:0.5em; margin: 0 0 0.25em; display:block;">Exit</button>
			<button style="width:100%; padding:0.5em; margin: 0 0 0.25em; display:block;">Save Specimen</button>
		</section>
		<section class="boid-braingraph-panel" v-if="focus_boid_data">
			<div id="braingraph"  style="width:100%; height: 100%;"></div>
		</section>
		<section class="boid-detail" v-if="focus_boid_data">
			<h2 style="text-align:center;">{{focus_boid_data.species.toUpperCase()}}</h2>
			<br/>
			<!-- <div id="boidviewer"  style="width:12em; height: 12em; background:transparent; border-radius:0.5em; float:right; margin: 0 0 1em 1em; box-sizing: border-box;"></div> -->
			<div id="boidviewer"  style="width:100%; aspect-ratio:1;"></div>
			<br/>
			<p>ID: {{focus_boid_data.id}}</p>
			<p>GENERATION: {{focus_boid_data.generation}}</p>
			<p>SIZE: {{focus_boid_data.length}} x {{focus_boid_data.width}}</p>
			<p>DIET: {{focus_boid_data.diet.toFixed(2)}}</p>
			<p>DIET_RANGE: {{focus_boid_data.diet_range.toFixed(2)}}</p>
			<p>INERTIA: {{focus_boid_data.inertia.toFixed(1)}}</p>
			<p>ANGULAR: {{focus_boid_data.angmo.toFixed(1)}}</p>
			<p>ENERGY_COST: {{focus_boid_data.energy_cost}}</p>
			<!-- <p>ENERGY: {{focus_boid_data.energy.toFixed(1)}}</p> -->
			<!-- <p>MAX_ENERGY: {{focus_boid_data.max_energy.toFixed(1)}}</p> -->
			<p>SCORE: {{focus_boid_data.total_fitness_score.toFixed(1)}}</p>
			
			<h2>Vitals</h2>
			<p>
				<progress :value="focus_boid_data.energy / focus_boid_data.max_energy"></progress> 
				&nbsp; Energy {{focus_boid_data.energy.toFixed(0)}} / {{focus_boid_data.max_energy.toFixed(0)}}
			</p>
			
			<!-- <h2>Brain</h2>
			<p class="brain">
				<span :class="n.type" :style="{backgroundColor:n.color}" v-for="n of focus_boid_data.brainnodes">{{n.symbol}}</span>
			</p> -->
			
		</section>
		<section class="boid-motors" v-if="focus_boid_data">			
			<h2>Motors</h2>
			<div v-for="m of focus_boid_data.motors">
				<!-- <progress :value="m.this_stoke_time ? (m.strokepow * (1-(m.t / m.this_stoke_time))) : 0"></progress> -->
				<!-- <progress :value="m.this_stoke_time ? (1-(m.t / m.this_stoke_time)) : 0"></progress> -->
				<!-- <progress :value="m.this_stoke_time ? m.strokepow : 0"></progress>				 -->
				<progress :value="m.this_stoke_time ? m.last_amount : 0"></progress>
				&nbsp;
				{{m.name}}, <i>{{m.strokefunc}}</i>, &gt;{{m.min_act.toFixed(2)}}
			</div>
			
		</section>
		<section class="boid-sensors" v-if="focus_boid_data">			
			<h2>Sensors</h2>
			<div v-for="i of focus_boid_data.sensors">
				<progress :value="i.val"></progress> &nbsp; {{i.name}}
			</div>
			
		</section>
		<section class="boid-brain-output" v-if="focus_boid_data">			
			<h2>NN Outputs</h2>
			<div v-for="o of focus_boid_data.outputs">
				<progress :value="o.val"></progress> &nbsp; {{o.name}}
			</div>
		</section>
	</main>
</template>

<style scoped>
	main {
		color:white; 
		position: fixed; 
		left:1em; 
		top:1em; 
		right:1em;
		bottom:1em;
		z-index: 2; 
		visibility: visible;		
		/* border: 1px solid white; */
		display:grid;
		grid-template-columns: 10rem 0.65fr 0.65fr 30em;
		grid-template-rows: 1fr 1fr;
		gap: 1rem;
	}
	main > section {
		background: #0005;
		backdrop-filter: blur(10px);
		border-radius: 1rem;
		padding: 1rem 2rem;
	}
	.iconmenu {
		grid-row: 1 /3;
	}
	.boid-detail {
		grid-row: 1 / 3;
		grid-column: 4 / 5;
		
	}
	.boid-braingraph-panel {
		grid-row: 1 / 2;
		grid-column: 2 / 3;
		backdrop-filter: blur(4px);
	}
	.boid-detail P {
		margin: 0;
	}
	.brain SPAN {
		display:inline-block;
		height:1.5em;
		width: 1.5em;
		border: 1px solid #AAA;
		margin: 0;
		padding: 0.1em 0.25em;
		background-color: #000;
		font-family: monospace;
		text-align:center;
		font-weight:bold;
		margin-right: 2px;
		margin-bottom: 2px;
	}
	.brain SPAN.hidden {
		border-radius:50%;	
	}
	.brain SPAN.input {
		border-top-right-radius:50%;	
		border-bottom-right-radius:50%;	
	}
	
</style>
