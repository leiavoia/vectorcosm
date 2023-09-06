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

let dragging = false;
let show_boid_details = ref(false);

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
			'length','width','inertia','angmo','energy_cost','total_fitness_score','stomach_contents','stomach_size',
			'age', 'lifespan', 'maturity_age' ] ) {
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


// input events

const body = document.querySelector("body");
const zoompct = 0.07;

body.addEventListener("touchstart", function(event) {
	event.preventDefault();
	if ( !vc.show_ui ) { vc.ToggleUI(); }
});

body.addEventListener("wheel", function(event) {
	if ( event.deltaY > 0 ) {
		const newscale = vc.scale * (1/(1 + zoompct));
		const scalediff = Math.abs( vc.scale - newscale );
		const [prev_x, prev_y] = ScreenToWorldCoord( event.clientX, event.clientY );
		vc.MoveCamera( 0, 0, -scalediff );
		const [x, y] = ScreenToWorldCoord( event.clientX, event.clientY );
		vc.MoveCamera( x - prev_x, y - prev_y );
	}
	else {
		const newscale = vc.scale * ((1 + zoompct)/1);
		const scalediff = Math.abs( vc.scale - newscale );
		const [prev_x, prev_y] = ScreenToWorldCoord( event.clientX, event.clientY );
		vc.MoveCamera( 0, 0, scalediff );
		const [x, y] = ScreenToWorldCoord( event.clientX, event.clientY );
		vc.MoveCamera( x - prev_x, y - prev_y );
	}
});

const keyFunctionMap = {
	'Pause': _ => {
			vc.TogglePause();
		},
	'_': _ => {
			const diff = Math.abs( vc.scale - (vc.scale * (1/(1 + zoompct))) );
			vc.MoveCamera( 0, 0, -diff );
		},
	'-': _ => {
			const diff = Math.abs( vc.scale - (vc.scale * (1/(1 + zoompct))) );
			vc.MoveCamera( 0, 0, -diff );
		},
	'=': _ => {
			const diff = Math.abs( vc.scale - (vc.scale * ((1 + zoompct)/1)) );
			vc.MoveCamera( 0, 0, diff );
		},
	'+': _ => {
			const diff = Math.abs( vc.scale - (vc.scale * ((1 + zoompct)/1)) );
			vc.MoveCamera( 0, 0, diff );
		},
	';': _ => {
			vc.ResetCameraZoom();
		},
	'ArrowLeft': _ => {
			vc.MoveCamera( 100, 0, 0 );
		},
	'ArrowRight': _ => {
			vc.MoveCamera( -100, 0, 0 );
		},
	'ArrowUp': _ => {
			vc.MoveCamera( 0, 100, 0 );
		},
	'ArrowDown': _ => {
			vc.MoveCamera( 0, -100, 0 );
		},
	'PageUp': _ => {
			vc.ShiftFocusTarget();
			if ( show_boid_details.value ) {
				RefreshBoidDetailsDynamicObjects( vc.focus_object );
			}			
		},
	'PageDown': _ => {
			vc.ShiftFocusTarget(-1);
			if ( show_boid_details.value ) {
				RefreshBoidDetailsDynamicObjects( vc.focus_object );
			}			
		},
	'ScrollLock': _ => {
			vc.ResizeTankToWindow();
		},
	'1': _ => {
			vc.ToggleShowSensors();
		},
	'2': _ => {
			vc.ToggleUI()
		},
	'b': _ => {
			vc.ToggleShowBrainmap()
		},
	'3': _ => {
			vc.SaveLeader();
		},
	'4': _ => {
			vc.LoadLeader();
		},
	'5': _ => {
			vc.animate_boids = !vc.animate_boids;
		},
	'9': _ => {
			vc.SavePopulation();
		},
	'0': _ => {
			vc.LoadPopulation();
		},
	'End': _ => {
			vc.ToggleSimulatorFF();
		},
	'c': _ => {
			vc.CinemaMode( !vc.cinema_mode );
		},
	'Escape': _ => {
			if ( show_boid_details.value ) { show_boid_details.value = false; }
			else if ( vc.focus_object ) { vc.StopTrackObject(); }
		},
	'i': _ => {
			if ( vc.focus_object ) {
				show_boid_details.value = !show_boid_details.value;
				if ( show_boid_details.value ) {
					RefreshBoidDetailsDynamicObjects( vc.focus_object );
				}
			}
		},
	't': _ => {
			if ( vc.focus_object ) { vc.StopTrackObject(); }
			else {
				const b = vc.tank.boids.sort( (a,b) => b.total_fitness_score - a.total_fitness_score )[0];
				vc.TrackObject(b);
				if ( show_boid_details.value ) {
					RefreshBoidDetailsDynamicObjects( vc.focus_object );
				}						
			}
		},
	'l': _ => {
			const b = vc.tank.boids.sort( (a,b) => b.total_fitness_score - a.total_fitness_score )[0];
			if ( b ) console.log(b);
		},
}

body.addEventListener("keydown", function(event) {
	if ( event.key in keyFunctionMap ) {
		event.preventDefault();
		keyFunctionMap[event.key]();
	}
});
		
function MouseDown(event) {
	dragging = true;
}
function MouseUp(event) {
	// let ClickMap handle it instead to avoid phantom clicks on objects
	dragging = false;
}
function MouseMove(event) {
	if ( dragging ) {
		vc.MoveCamera( event.movementX, event.movementY );
	}
}
			
window.addEventListener("resize", function (event) {
	vc.height = window.innerHeight;
	vc.width = window.innerWidth;
	vc.two.fit();
	vc.SetViewScale( vc.scale ); // trigger update, even though scale hasent changed
	vc.ResizeTankToWindow(); // not a permanent place to put this. needs a "responsive" game settings
});
				

onMounted(() => {
	vc.Init();
	vc.Play();
}) 

function ScreenToWorldCoord( x, y ) {
	x = ( x - vc.renderLayers['tank'].position.x ) / vc.scale;
	y = ( y - vc.renderLayers['tank'].position.y ) / vc.scale;
	return [x,y];
}

function ClickMap( event ) {
	// if ( dragging ) { 
	// 	dragging = false;
	// 	return false; 
	// }
	const [x,y] = ScreenToWorldCoord( event.clientX, event.clientY );
	if ( event.button > 0 ) { 
		vc.PointCameraAt( x, y, null );
		return false;
	}
	// find objects near pointer click
	const r = 30 * (1/vc.scale);
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
		show_boid_details.value = true;
		vc.TrackObject(closest);
		RefreshBoidDetailsDynamicObjects(closest);
	}
	else {
		vc.StopTrackObject();
		if ( braingraph ) { 
			braingraph.Kill();
			braingraph = null;
		}
	}
}

function RefreshBoidDetailsDynamicObjects(obj) {
	setTimeout( _ => {
		boidviewer.clear();
		let elem = document.getElementById('boidviewer');
		boidviewer.appendTo(elem);
		let geo = obj.body.geo.clone();
		geo.dashes = obj.body.geo.dashes;
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
		braingraph.setTarget(obj);
		braingraph.Draw();
		braingraph_context.update();
	}, 100 );
}

</script>

<template>
    <div class="shape-container">
      <div id="draw-shapes"></div>
    </div>
    <div class="ui" id="ui_container" style="visibility:hidden;"  v-if="sim">
		<simulator-controls :sim="sim"></simulator-controls>
    </div>
    <main 
		@click="ClickMap($event)" 
		@contextmenu.prevent="ClickMap($event)" 
		@mousemove="MouseMove($event)"
		@mousedown="MouseDown($event)"
		@mouseup="MouseUp($event)"
		>
		<section class="iconmenu" v-if="show_boid_details && focus_boid_data" style="display:flex; flex-flow: column;">
			<button style="width:100%; padding:0.5em; margin: 0 0 0.25em; display:block;">Exit</button>
			<button style="width:100%; padding:0.5em; margin: 0 0 0.25em; display:block;">Save Specimen</button>
		</section>
		<section class="boid-braingraph-panel" v-if="show_boid_details && focus_boid_data">
			<div id="braingraph"  style="width:100%; height: 100%;"></div>
		</section>
		<section class="boid-detail" v-if="show_boid_details && focus_boid_data">
			<h2 style="text-align:center;">{{focus_boid_data.species.toUpperCase()}}</h2>
			<br/>
			<!-- <div id="boidviewer"  style="width:12em; height: 12em; background:transparent; border-radius:0.5em; float:right; margin: 0 0 1em 1em; box-sizing: border-box;"></div> -->
			<div id="boidviewer"  style="width:10em; aspect-ratio:1; margin: 0 auto"></div>
			<br/>
			<p>ID: {{focus_boid_data.id}}</p>
			<p>GENERATION: {{focus_boid_data.generation}}</p>
			<p>SIZE: {{focus_boid_data.length}} x {{focus_boid_data.width}}</p>
			<p>DIET: {{focus_boid_data.diet.toFixed(2)}}</p>
			<p>DIET_RANGE: {{focus_boid_data.diet_range.toFixed(2)}}</p>
			<p>INERTIA: {{focus_boid_data.inertia.toFixed(1)}}</p>
			<p>ANGULAR: {{focus_boid_data.angmo.toFixed(1)}}</p>
			<p>LIFESPAN: {{focus_boid_data.lifespan}}</p>
			<p>MATURITY AGE: {{focus_boid_data.maturity_age}}</p>
			<!-- <p>ENERGY: {{focus_boid_data.energy.toFixed(1)}}</p> -->
			<!-- <p>MAX_ENERGY: {{focus_boid_data.max_energy.toFixed(1)}}</p> -->
			<p>SCORE: {{focus_boid_data.total_fitness_score.toFixed(1)}}</p>
			
			<h2>Vitals</h2>
			<p>
				<progress :value="focus_boid_data.age / focus_boid_data.lifespan"></progress> 
				&nbsp; Age {{focus_boid_data.age.toFixed(0)}} / {{focus_boid_data.lifespan.toFixed(0)}}
				<br />
				
				<progress :value="focus_boid_data.stomach_contents / focus_boid_data.stomach_size"></progress> 
				&nbsp; Stomach {{focus_boid_data.stomach_contents.toFixed(0)}} / {{focus_boid_data.stomach_size.toFixed(0)}}
				<br />
				
				<progress :value="focus_boid_data.energy / focus_boid_data.max_energy"></progress> 
				&nbsp; Energy {{focus_boid_data.energy.toFixed(0)}} / {{focus_boid_data.max_energy.toFixed(0)}}
				<br />
			</p>
			
			<!-- <h2>Brain</h2>
			<p class="brain">
				<span :class="n.type" :style="{backgroundColor:n.color}" v-for="n of focus_boid_data.brainnodes">{{n.symbol}}</span>
			</p> -->
			
		</section>
		<section class="boid-motors" v-if="show_boid_details && focus_boid_data">			
			<h2>Motors</h2>
			<div v-for="m of focus_boid_data.motors">
				<!-- <progress :value="m.this_stoke_time ? (m.strokepow * (1-(m.t / m.this_stoke_time))) : 0"></progress> -->
				<!-- <progress :value="m.this_stoke_time ? (1-(m.t / m.this_stoke_time)) : 0"></progress> -->
				<!-- <progress :value="m.this_stoke_time ? m.strokepow : 0"></progress>				 -->
				<progress :value="m.this_stoke_time ? m.last_amount : 0"></progress>
				&nbsp;
				{{m.name}}, <i>{{m.strokefunc}}</i>, &gt;{{m.min_act.toFixed(2)}}, t{{m.stroketime.toFixed(2)}}, ${{m.cost.toFixed(2)}}
				
			</div>
			
		</section>
		<section class="boid-sensors" v-if="show_boid_details && focus_boid_data">			
			<h2>Sensors</h2>
			<div v-for="i of focus_boid_data.sensors">
				<progress :value="i.val"></progress> &nbsp; {{i.name}}
			</div>
			
		</section>
		<section class="boid-brain-output" v-if="show_boid_details && focus_boid_data">			
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
		grid-template-columns: 10rem 0.65fr 0.65fr 28em;
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
