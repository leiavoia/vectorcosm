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
import TrainingProgramControls from './components/TrainingProgramControls.vue'
import CameraControls from './components/CameraControls.vue'
import BoidLibraryControls from './components/BoidLibraryControls.vue'
import TankStats from './components/TankStats.vue'
// import Plant from './classes/class.Plant.js'
// import Poison from './classes/class.Poison.js'
import { onMounted, ref, reactive, markRaw, shallowRef, shallowReactive } from 'vue'
import PubSub from 'pubsub-js'
import BoidLibrary from './classes/class.BoidLibrary.js'

let sim = shallowRef(null);

let vc = new Vectorcosm; // the app, proper
window.vc = vc; 
window.vc.onSimulationChange = new_sim => { sim.value = new_sim; }

let dragging = false;
let show_boid_library = ref(false);
let show_boid_details = ref(false);
let show_ui = ref(false);
let show_camera_controls = ref(false);
let show_tank_debug = ref(false);
let show_training_programs = ref(false);

let idle_for = ref(0);
let is_idle = ref(false);

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
		// detect if focus object has changed since last frame
		if ( focus_boid_data.value.id != vc.focus_object.id ) {
			show_boid_details.value = vc.camera.show_boid_info_on_focus;
		}
		for ( let i of ['id','species','generation','max_energy','energy','diet','diet_range',
			'length','width','inertia','angmo','total_fitness_score','stomach_contents','stomach_size',
			'age', 'lifespan', 'maturity_age', 'scale',
			'base_bite_rate', 'base_energy', 'base_rest_metabolism', 'base_digestion_rate', 'base_stomach_size',
			] ) {
			focus_boid_data.value[i] = vc.focus_object[i];
		}
		focus_boid_data.value.sensors = vc.focus_object.sensor_outputs;
		
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
			last_amount: Math.abs(m.last_amount||0)
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
const zoompct = 0.25;

// body.addEventListener("touchstart", function(event) {
// 	event.preventDefault();
// 	if ( !vc.show_ui ) { vc.ToggleUI(); }
// });

function ToggleUI() {
	show_ui.value = !show_ui.value;
}

function ToggleCameraControls() {
	show_camera_controls.value = !show_camera_controls.value;
}
function ToggleBoidLibrary() {
	show_boid_library.value = !show_boid_library.value;
}
function ToggleTrainingProgramControls() {
	show_training_programs.value = !show_training_programs.value;
}

function ToggleTankDebug() {
	show_tank_debug.value = !show_tank_debug.value;
	if ( vc?.tank ) {
		vc.tank.DrawDebugBoundaryRectangle( show_tank_debug.value );
	}
}

body.addEventListener("wheel", function(event) {
	let newscale = vc.scale * ((1 + zoompct)/1);
	if ( event.deltaY > 0 ) { newscale = vc.scale * (1/(1 + zoompct)); }
	// record mouse click in world space
	const [prev_x, prev_y] = vc.ScreenToWorldCoord( event.clientX, event.clientY );
	// zoom into center of screen
	const [world_x, world_y] = vc.ScreenToWorldCoord(vc.width * 0.5, vc.height * 0.5);
	vc.PointCameraAt( world_x, world_y, newscale );
	// where would the mouse point be now?
	const [new_x, new_y] = vc.ScreenToWorldCoord( event.clientX, event.clientY );
	// move screen to maintain the offset from click point
	vc.PointCameraAt( world_x - (new_x - prev_x), world_y - (new_y - prev_y) );
});

const keyFunctionMap = {
	'Pause': _ => {
			vc.TogglePause();
		},
	'p': _ => {
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
	'\'': _ => {
			vc.ResizeTankToWindow(true);
			vc.ResetCameraZoom();
		},
	'Home': _ => {
			vc.ResetCameraZoom();
		},
	'ArrowLeft': _ => {
			vc.MoveCamera( -100, 0 );
		},
	'ArrowRight': _ => {
			vc.MoveCamera( 100, 0 );
		},
	'ArrowUp': _ => {
			vc.MoveCamera( 0, -100 );
		},
	'ArrowDown': _ => {
			vc.MoveCamera( 0, 100 );
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
	's': _ => {
			vc.SaveTank();
		},
	'a': _ => {
			vc.LoadTank();
		},
	'1': _ => {
			vc.ToggleShowSensors();
		},
	'2': _ => {
			ToggleUI();
		},
	'b': _ => {
			vc.ToggleShowBrainmap()
		},
	'3': _ => {
			ToggleCameraControls();
		},
	'4': _ => {
			ToggleBoidLibrary();
		},
	'8': _ => {
			vc.animate_boids = !vc.animate_boids;
		},
	'6': _ => {
			vc.tank.bg_visible = !vc.tank.bg_visible;
			vc.tank.bg.visible = vc.tank.bg_visible;
		},
	'7': _ => {
			ToggleTankDebug();
		},
	'5': _ => {
			ToggleTrainingProgramControls();
		},
	'r': _ => {
			vc.responsive_tank_size = !vc.responsive_tank_size;
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
			vc.CinemaMode( !vc.camera.cinema_mode );
		},
	'Escape': _ => {
			if ( show_boid_details.value ) { show_boid_details.value = false; }
			else if ( vc.focus_object ) { vc.StopTrackObject(); }
		},
	'i': _ => {
			if ( vc.focus_object ) {
				show_boid_details.value = !show_boid_details.value;
				if ( show_boid_details.value ) {
					b.show_sensors = true;
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
	idle_for.value = 0;
	is_idle.value = false;
}
function MouseUp(event) {
	// let ClickMap handle it instead to avoid phantom clicks on objects
	dragging = false;
	idle_for.value = 0;
	is_idle.value = false;
}
function MouseMove(event) {
	if ( dragging ) {
		vc.MoveCamera( -event.movementX, -event.movementY );
	}
	idle_for.value = 0;
	is_idle.value = false;
}
		
function SaveBoid() {
	if ( vc.focus_object ) {
		const lib = new BoidLibrary();
		lib.Add(vc.focus_object);
	}
}
		
function SaveSpecies() {
	if ( vc.focus_object && vc.tank ) {
		const lib = new BoidLibrary();
		lib.Add( vc.tank.boids.filter( b => b.species === vc.focus_object.species ) );
	}
}
		
function SaveTankPopulation() {
	if ( vc.focus_object && vc.tank ) {
		const lib = new BoidLibrary();
		lib.Add( vc.tank.boids );
	}
}

function SmiteBoid() {
	if ( vc.focus_object ) {
		vc.focus_object.Kill();
	}
}
			
function UpdateIdleTime() {
	idle_for.value += 0.5;
	is_idle.value = idle_for.value >= 2;
    setTimeout( UpdateIdleTime, 500 );
};
			
window.addEventListener("resize", function (event) {
    // there is no "windowResizeFinished" event, so settle for timeout to avoid jank
	if ( window.resizeTimeout ) { clearTimeout(window.resizeTimeout); }
    window.resizedFinished = setTimeout(function() {
		vc.height = window.innerHeight;
		vc.width = window.innerWidth;
		vc.two.fit();
		vc.SetViewScale( vc.scale ); // trigger update, even though scale hasent changed
		vc.ResizeTankToWindow();
		vc.tank.ScaleBackground();
		vc.ResetCameraZoom(); // also does parallax
    }, 200);
});

onMounted(() => {
	vc.Init();
	vc.Play();
	UpdateIdleTime(); // start the clock
}) 

function ClickMap( event ) {
	// if ( dragging ) { 
	// 	dragging = false;
	// 	return false; 
	// }
	const [x,y] = vc.ScreenToWorldCoord( event.clientX, event.clientY );
	if ( event.button > 0 ) { 
		vc.PointCameraAt( x, y );
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
		show_boid_details.value = vc.camera.show_boid_info_on_focus;
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
		// boid portrait
		let elem = document.getElementById('boidviewer');
		if ( elem ) {
			boidviewer.clear();
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
		}
		// braingraphing
		let braingraph_elem = document.getElementById('braingraph');
		if ( braingraph_elem ) {
			braingraph_context.clear();
			braingraph_context.appendTo(braingraph_elem);
			braingraph = new BrainGraph(null,braingraph_context);
			braingraph.setTarget(obj);
			braingraph.Draw();
			braingraph_context.update();
		}
	}, 100 );
}

</script>

<template>
    <div :class="{'shape-container':true, 'hidecursor':is_idle}" 
		@click="ClickMap($event)" 
		@contextmenu.prevent="ClickMap($event)" 
		@mousemove="MouseMove($event)"
		@mousedown="MouseDown($event)"
		@mouseup="MouseUp($event)"
	>
      <div id="draw-shapes"></div>
    </div>
    <main>

		<!--
		<section class="boid-braingraph-panel" v-if="show_boid_details && focus_boid_data">
			<div id="braingraph"  style="width:100%; height: 100%;"></div>
		</section>
		-->
		
		<section v-show="show_camera_controls">
			<camera-controls @close="ToggleCameraControls()"></camera-controls>
		</section>	
		
		<section v-if="show_boid_library">
			<boid-library-controls @close="ToggleBoidLibrary()"></boid-library-controls>
		</section>	
		
		<section v-if="show_training_programs">
			<training-program-controls @close="ToggleTrainingProgramControls()"></training-program-controls>
		</section>	
		
		<section v-if="sim" v-show="show_ui">
			<simulator-controls :sim="sim" @close="ToggleUI()" ></simulator-controls>
			<tank-stats :sim="sim"></tank-stats>
		</section>	
		
		<section class="boid-detail" v-if="show_boid_details && focus_boid_data">
			<h2 style="text-align:center;">{{focus_boid_data.species.toUpperCase()}}</h2>
			<!-- <br/> -->
			<!-- <div id="boidviewer"  style="width:10em; aspect-ratio:1; margin: 0 auto"></div> -->
			<!-- <br/> -->
			<p style="text-align:center;">GENERATION:<output>{{focus_boid_data.generation}}</output></p>
			<p style="text-align:center;">SIZE: <output>
				{{focus_boid_data.length.toFixed(0)}} x {{focus_boid_data.width.toFixed(0)}} 
				({{(focus_boid_data.scale*100).toFixed()}}%)
			</output></p>
			<!-- <p>SCALE: <output>{{focus_boid_data.scale.toFixed(2)}}</output></p> -->
			<details style="margin-bottom: 0.5em">
				<summary style="text-align:center; list-style-type: none;">...</summary>
				<div>
					<p>ID: <output>{{focus_boid_data.id}}</output></p>
					<p>DIET: <output>{{focus_boid_data.diet.toFixed(2)}} (R:{{focus_boid_data.diet_range.toFixed(2)}})</output></p>
					<p>LIFESPAN: <output>{{focus_boid_data.lifespan}}</output></p>
					<p>MATURITY AGE: <output>{{focus_boid_data.maturity_age}}</output></p>
					<p>BITE: <output>{{focus_boid_data.base_bite_rate.toFixed(5)}}</output></p>
					<p>BASE ENERGY: <output>{{focus_boid_data.base_energy.toFixed(5)}}</output></p>
					<p>BASE METAB: <output>{{focus_boid_data.base_rest_metabolism.toFixed(5)}}</output></p>
					<p>BASE DIGEST: <output>{{focus_boid_data.base_digestion_rate.toFixed(5)}}</output></p>
					<p>BASE STOMACH: <output>{{focus_boid_data.base_stomach_size.toFixed(5)}}</output></p>
				</div>
			</details>
			
			<button @click="SaveBoid()">Save</button>
			<button @click="SaveSpecies()">Save Species</button>
			<button @click="SaveTankPopulation()">Save All</button>
			<button @click="SmiteBoid()">Smite</button>
			
			<h2>Vitals</h2>
			<p>
				<!--
				<progress :value="focus_boid_data.scale"></progress> 
				&nbsp; Scale <output>{{(focus_boid_data.scale*100).toFixed(0)}}%</output>
				<br />
				-->
				
				<progress :value="focus_boid_data.age / focus_boid_data.lifespan"></progress> 
				&nbsp; Age <output>{{focus_boid_data.age.toFixed(0)}} / {{focus_boid_data.lifespan.toFixed(0)}}</output>
				&nbsp; <output v-if="focus_boid_data.age >= focus_boid_data.maturity_age">&#10004;</output>
				<br />
				
				<progress :value="focus_boid_data.stomach_contents / (focus_boid_data.stomach_size * focus_boid_data.scale )"></progress> 
				&nbsp; Stomach <output>{{focus_boid_data.stomach_contents.toFixed(0)}} / {{(focus_boid_data.stomach_size * focus_boid_data.scale).toFixed(0)}}</output>
				<br />
				
				<progress :value="focus_boid_data.energy / ( focus_boid_data.max_energy )"></progress> 
				&nbsp; Energy <output>{{focus_boid_data.energy.toFixed(0)}} / {{(focus_boid_data.max_energy ).toFixed(0)}}</output>
				<br />
			</p>
			
			<h2>Brain</h2>
			<p class="brain micro"><!-- remove .micro for larger annotated cells -->
				<span :class="n.type" :style="{backgroundColor:n.color}" v-for="n of focus_boid_data.brainnodes">{{n.symbol}}</span>
			</p>
			
			<h2>Motors</h2>
			<div v-for="m of focus_boid_data.motors" style="line-height:1.25em;">			
				<progress :value="m.this_stoke_time ? m.last_amount : 0"></progress>
				&nbsp;
				<span style="margin-right:0.35em;">{{m.name}}</span>
				<span v-if="m.linear" style="margin-right:0.35em; color:cyan;">{{Math.abs(m.linear.toFixed())}}</span>
				<span v-if="m.angular" style="margin-right:0.35em; color:pink;">{{Math.abs(m.angular.toFixed())}}</span>
				<span style="color:#DDD; font-style:italic;">{{m.stroketime.toFixed(1)}}s</span>
			</div>
					
			<h2>Sensors</h2>
			<div v-for="i of focus_boid_data.sensors" style="line-height:1.25em;vertical-align:center;" :class="{'sensor_block':true, 'compact':focus_boid_data.sensors.length>=10}">
				<progress :value="i.val"></progress>&nbsp;<span>{{i.name}}</span>
			</div>
						
		</section>
		
		<!--
		<section class="boid-motors" v-if="show_boid_details && focus_boid_data">			
			<h2>Motors</h2>
			<div v-for="m of focus_boid_data.motors">			
				<progress :value="m.this_stoke_time ? m.last_amount : 0"></progress>
				&nbsp;
				{{m.name}}, <i>{{m.strokefunc}}</i>, &gt;{{m.min_act.toFixed(2)}}, t{{m.t.toFixed(2)}}/{{m.stroketime.toFixed(2)}}, ${{m.cost.toFixed(2)}}
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
		-->
		
		<!-- style="display:flex; flex-flow: column;pointer-events:auto; user-select: none;" -->
				
		<!--				
			<section class="iconmenu" v-show="idle_for < 2" style="text-align:center;">
				<button @click="ToggleUI();" 						style="background:#AAAA; border:none; border-radius:0.2rem;  width:3rem; aspect-ratio:1/1; display:inline-block; padding:0em; margin: 0 0.25em; font-size:200%;">📊</button>
				<button @click="ToggleCameraControls();" 			style="background:#AAAA; border:none; border-radius:0.2rem;  width:3rem; aspect-ratio:1/1; display:inline-block; padding:0em; margin: 0 0.25em; font-size:200%;">🎥</button>
				<button @click="ToggleBoidLibrary();" 				style="background:#AAAA; border:none; border-radius:0.2rem;  width:3rem; aspect-ratio:1/1; display:inline-block; padding:0em; margin: 0 0.25em; font-size:200%;">💾</button>
				<button @click="ToggleTrainingProgramControls();" 	style="background:#AAAA; border:none; border-radius:0.2rem;  width:3rem; aspect-ratio:1/1; display:inline-block; padding:0em; margin: 0 0.25em; font-size:200%;">🔄</button>
			</section>
		-->
	</main>
</template>

<style>
	
	INPUT[type=range] { 
		margin-right:0.5em; 
	}
	
	LABEL {
		width: 4em;
		display:inline-block;
		text-align:left;
	}	
	
	OUTPUT {
		color: #80D4FF; 
		font-weight:bold;
	}
	
	P { margin-bottom: 0; margin-top: 0; }

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
		grid-template-columns: 21rem 0.65fr 0.65fr 19em;
		grid-template-rows: 0.5fr 0.5fr 4rem;
		gap: 1rem;
		pointer-events:none;
	}
	main > section {
		background: #0005;
		backdrop-filter: blur(2px);
		border-radius: 1rem;
		padding: 0.5rem 1rem;
		pointer-events:auto;
		user-select: none;
	}
	.iconmenu {
		grid-row: 3/4;
		grid-column: span 5 / 5;
	}
	.boid-detail {
		grid-row: 1 / 2;
		grid-column: 4 / 5;
		font-size: 80%;
	}
	.boid-braingraph-panel {
		grid-row: span 1 / 2;
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
		border: 1px outset #AAA;
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
	.brain.micro SPAN {
		font-size: 70%;
		color: transparent;
	}

	#draw-shapes {
		width: 100vw;
		height: 100vh;
	}
	
	#shape-container {
		width: 100vw;
		height: 100vh;
	}
	
	.hidecursor {
		cursor: none;
	}
	
	.sensor_block.compact { width: 50%; display:inline-block;}
	.sensor_block.compact PROGRESS { width: 4em; }
	.sensor_block.compact SPAN {
		display:inline-block; 
		overflow-x:hidden;
		overflow-y:visible;
		line-height:1.25em; 
		width:6em; 
		}
	
</style>
