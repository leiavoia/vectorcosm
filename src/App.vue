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

let render_styles = ['Natural', 'Vector', 'Zen', 'Grey'];

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
		// scalar values we can just copy
		for ( let i of ['id','species','generation',
			'length','width','inertia','angmo','total_fitness_score','stomach_contents','stomach_size',
			'age', 'lifespan', 'maturity_age', 'scale', 'mass',
			'traits' // hacky
			] ) {
			focus_boid_data.value[i] = vc.focus_object[i];
		}
		
		// metabolic stuff
		if ( !focus_boid_data.value.metab ) {
			focus_boid_data.value.metab = {};
		}
		else {
			for ( let k in vc.focus_object.metab ) {
				focus_boid_data.value.metab[k] = vc.focus_object.metab[k];
			}
		}
		
		// stats
		if ( !focus_boid_data.value.foodstats ) {
			focus_boid_data.value.foodstats = {};
		}
		else {
			for ( let k in vc.focus_object.stats.food ) {
				focus_boid_data.value.foodstats[k] = vc.focus_object.stats.food[k];
			}
		}
		
		// sensors
		focus_boid_data.value.sensors = vc.focus_object.sensor_outputs;
		
		// brain output
		focus_boid_data.value.outputs = vc.focus_object.brain.nodes
			.filter(n => n.type=='output')
			.map(n => ({val:n.activation.toFixed(2)}) );
		focus_boid_data.value.outputs.forEach( (n,i) => n.name = vc.focus_object.motors[i].name );
		
		// motors
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
			let value = utils.clamp(n.activation,-1,1);
			let hexval = utils.DecToHex( Math.round(Math.abs(value) * 255) );
			return {
				symbol: (n.type=='input' ? 'I' : ( n.type=='output' ? 'O' : n.squash.name.charAt(0) ) ),
				color: ( n.activation >= 0 ? ('#00' + hexval + '00') : ('#' + hexval + '0000') ),
				type: n.type,
				value
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
			// vc.ToggleShowSensors();
			render_styles.push( render_styles.shift() );
			vc.SetRenderStyle( render_styles[0] );
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
			<h2 style="text-align:center; margin-top:0.25em;">{{focus_boid_data.species.toUpperCase()}}</h2>
			<!-- <br/> -->
			<!-- <div id="boidviewer"  style="width:10em; aspect-ratio:1; margin: 0 auto"></div> -->
			<!-- <br/> -->
			<p style="text-align:center;">
				GEN: <output>{{focus_boid_data.generation}}</output>&nbsp;&nbsp;
				SIZE: <output>{{focus_boid_data.length.toFixed(0)}}</output>x<output>{{focus_boid_data.width.toFixed(0)}}</output>&nbsp;&nbsp;
				DIET: <output>
					<span v-if="(focus_boid_data.traits.food_mask||0) & 1">▲ </span>
					<span v-if="(focus_boid_data.traits.food_mask||0) & 2">■ </span>
					<span v-if="(focus_boid_data.traits.food_mask||0) & 4">⬟ </span>
					<span v-if="(focus_boid_data.traits.food_mask||0) & 8">⬢ </span>
					<span v-if="(focus_boid_data.traits.food_mask||0) & 16">⯃ </span>
					<span v-if="(focus_boid_data.traits.food_mask||0) & 32">&#9899; </span>
					🡒
					<span v-if="(focus_boid_data.traits.poop_complexity==1)">▲ </span>
					<span v-if="(focus_boid_data.traits.poop_complexity==2)">■ </span>
					<span v-if="(focus_boid_data.traits.poop_complexity==3)">⬟ </span>
					<span v-if="(focus_boid_data.traits.poop_complexity==4)">⬢ </span>
					<span v-if="(focus_boid_data.traits.poop_complexity==5)">⯃ </span>
					<span v-if="(focus_boid_data.traits.poop_complexity==6)">&#9899; </span>
				</output>
			</p>
				
			<details style="margin-bottom: 0.5em">
				<summary style="text-align:center; list-style-type: none;">...</summary>
				<div>
			
					<button @click="SaveBoid()">Save</button>
					<button @click="SaveSpecies()">Save Species</button>
					<button @click="SaveTankPopulation()">Save All</button>
					<button @click="SmiteBoid()">Smite</button>
									
					<p>ID: <output>{{focus_boid_data.id}}</output></p>
					<p>LIFESPAN: <output>{{focus_boid_data.lifespan}}</output></p>
					<p>MATURITY AGE: <output>{{focus_boid_data.maturity_age}}</output></p>
					<p>BITE: <output>{{(focus_boid_data.metab.bite_size||0).toFixed(1)}}</output>
						@ <output>{{(focus_boid_data.traits.bite_speed||0).toFixed(1)}}s</output></p>
					<p>METAB: <output>{{(focus_boid_data.metab.metabolic_rate||0).toFixed(1)}}</output></p>
					<p>DIGEST: <output>{{(focus_boid_data.metab.digest_rate||0).toFixed(1)}}</output></p>
					<table style="width:100%" id="nutrition_table">
						<tr>
							<td>Nutrition</td>
							<td v-for="v of focus_boid_data.traits.nutrition" :class="{
								'verybad':(v<=-2), 
								'verygood':(v>=2),
								'good':(v>0&&v<2)
								}">
								{{v.toFixed(1)}}
							</td>
						</tr>	
						<tr>
							<td>Stomach</td>
							<td v-for="v of focus_boid_data.metab.stomach" :class="{
								'good':(v>0), 
								'bad':(v<0),
								}">
								{{v.toFixed(1)}}
							</td>
						</tr>	
						<tr>
							<td>Bowel</td>
							<td v-for="v of focus_boid_data.metab.bowel">
								{{v.toFixed(1)}}
							</td>
						</tr>	
					</table>
					<p>Food Mask: <output>{{focus_boid_data.traits.food_mask||0}}</output></p>
					
					<h2>Stats</h2>
					<p>
						<span style="width:32%; display:inline-block;">bites:&nbsp;<output>{{(focus_boid_data.foodstats.bites||0).toFixed()}}</output></span>
						<span style="width:32%; display:inline-block;">edible:&nbsp;<output>{{(focus_boid_data.foodstats.edible||0).toFixed()}}</output></span>
						<span style="width:32%; display:inline-block;">toxins:&nbsp;<output>{{(focus_boid_data.foodstats.toxins||0).toFixed()}}</output></span>
						<span style="width:32%; display:inline-block;">total:&nbsp;<output>{{(focus_boid_data.foodstats.total||0).toFixed()}}</output></span>
						<span style="width:32%; display:inline-block;">inedible:&nbsp;<output>{{(focus_boid_data.foodstats.inedible||0).toFixed()}}</output></span>
						<span style="width:32%; display:inline-block;">tox_dmg:&nbsp;<output>{{(focus_boid_data.foodstats.toxin_dmg||0).toFixed()}}</output></span>
						<span style="width:32%; display:inline-block;">energy:&nbsp;<output>{{(focus_boid_data.foodstats.energy||0).toFixed()}}</output></span>
						<span style="width:32%; display:inline-block;">required:&nbsp;<output>{{(focus_boid_data.foodstats.required||0).toFixed()}}</output></span>
						<span style="width:32%; display:inline-block;">def_dmg:&nbsp;<output>{{(focus_boid_data.foodstats.deficit_dmg||0).toFixed()}}</output></span>
					</p>
					<br/>
				</div>
			</details>

			<details>
				<summary>	
					<div style="width:100%; margin-top:0.5em;">
						<div class="meter" >
							<output>
								Age <!-- {{(((focus_boid_data.age / focus_boid_data.lifespan)||0)*100).toFixed()}}% -->
							</output>
							<div style="background-color:#1F60AC; height: 100%;" 
								:style="{width:`${((focus_boid_data.age / focus_boid_data.lifespan)||0)*100}%`}"></div>
						</div>

						<div class="meter" >
							<output>
								Scale <!-- {{(((focus_boid_data.scale)||0)*100).toFixed()}}% -->
							</output>
							<div style="background-color:#1F60AC; height: 100%;" 
								:style="{width:`${((focus_boid_data.scale)||0)*100}%`}"></div>
						</div>
						
						<div class="meter" >
							<output>
								Energy <!-- {{(((focus_boid_data.metab.energy / focus_boid_data.metab.max_energy)||0)*100).toFixed()}}% -->
							</output>
							<div style="background-color:#1F60AC; height: 100%;" 
								:style="{width:`${((focus_boid_data.metab.energy / focus_boid_data.metab.max_energy)||0)*100}%`}"></div>
						</div>
					</div>
					
					<div style="width:100%; margin-top:0.5em;">
						<div class="meter" >
							<output>
								Bite <!-- {{(((focus_boid_data.metab.bite_time / focus_boid_data.traits.bite_speed)||0)*100).toFixed()}}% -->
							</output>
							<div style="background-color:#1F60AC; height: 100%;" 
								:style="{width:`${((focus_boid_data.metab.bite_time / focus_boid_data.traits.bite_speed)||0)*100}%`}"></div>
						</div>

						<div class="meter" >
							<output>
								Stomach <!-- {{(((focus_boid_data.metab.stomach_total / focus_boid_data.metab.stomach_size)||0)*100).toFixed()}}% -->
							</output>
							<div style="background-color:#1F60AC; height: 100%;" 
								:style="{width:`${((focus_boid_data.metab.stomach_total / focus_boid_data.metab.stomach_size)||0)*100}%`}"></div>
						</div>
											
						<div class="meter" >
							<output>
								Bowel <!-- {{(((focus_boid_data.metab.bowel_total / focus_boid_data.metab.bowel_size)||0)*100).toFixed()}}% -->
							</output>
							<div style="background-color:#1F60AC; height: 100%;" 
								:style="{width:`${((focus_boid_data.metab.bowel_total / focus_boid_data.metab.bowel_size)||0)*100}%`}"></div>
						</div>
					</div>
				</summary>
				<div>
					<h2>Vitals</h2>

					<!-- age -->
					<progress :value="focus_boid_data.age / focus_boid_data.lifespan"></progress> 
					&nbsp; Age <output>{{focus_boid_data.age.toFixed(0)}} / {{focus_boid_data.lifespan.toFixed(0)}}</output>
					&nbsp; <output v-if="focus_boid_data.age >= focus_boid_data.maturity_age">&#10004;</output>
					<br />
					
					<!-- energy -->
					<progress :value="(focus_boid_data.metab.energy / focus_boid_data.metab.max_energy )||0"></progress> 
					&nbsp; Energy <output>{{(focus_boid_data.metab.energy||0).toFixed(0)}} / {{(focus_boid_data.metab.max_energy||0).toFixed(0)}}</output>
						<span v-if="focus_boid_data.metab.growing" style="color:lime;"> ▲</span>
					<br />
					
					<!-- stomach -->		
					<progress :value="((focus_boid_data.metab.stomach_total / focus_boid_data.metab.stomach_size)||0)"></progress>
					&nbsp; Stomach
						<output>{{(focus_boid_data.metab.stomach_total||0).toFixed()}}</output> / 
						<output>{{(focus_boid_data.metab.stomach_size||0).toFixed()}}</output>
						<span v-if="focus_boid_data.metab.toxins" style="font-weight:bold; color:magenta;"> ☠</span>
						<span v-if="focus_boid_data.metab.deficient" style="font-weight:bold; color:yellow;"> ⚠</span>
					<br />
						
					<!-- bowel -->	
					<progress :value="((focus_boid_data.metab.bowel_total / focus_boid_data.metab.bowel_size)||0)"></progress>
					&nbsp; Bowel
						<output>{{(focus_boid_data.metab.bowel_total||0).toFixed()}}</output> / 
						<output>{{(focus_boid_data.metab.bowel_size||0).toFixed()}}</output>
					<br />
					
					<!-- bite -->
					<progress :value="((focus_boid_data.metab.bite_time / focus_boid_data.traits.bite_speed)||0)"></progress>
					&nbsp; Bite <output>{{(focus_boid_data.metab.bite_size||0).toFixed(1)}}</output>
						@ <output>{{(focus_boid_data.traits.bite_speed||0).toFixed(1)}}s</output>
					<br />
				</div>
								
			</details>

			<!-- SENSORS -->
			<details>
				<summary>
					<div class="krell">
						<div v-for="i of focus_boid_data.sensors" class="box"
							:style="{width:Math.min(10,(100/focus_boid_data.sensors.length)).toFixed()+'px'}">
							<div style="background-color:#80D4FF;" 
							:style="{height:`${(i.val||0)*100}%`}"></div>
						</div>
					</div>
					<h2 style="clear:none; width:auto;">Sensors</h2>
				</summary>
				<div style="margin:0;">	
					<div v-for="i of focus_boid_data.sensors" style="line-height:1.25em;vertical-align:center;" :class="{'sensor_block':true, 'compact':focus_boid_data.sensors.length>=10}">
						<progress :value="i.val||0"></progress>&nbsp;<span>{{i.name}}</span>
					</div>
				</div>
			</details>
								
			<!-- BRAIN -->
			<details>
				<summary>
					<div class="krell">
						<template v-for="n of focus_boid_data.brainnodes">
							<div v-if="n.symbol !== 'I'" class="box">
								<div style="background-color:#80D4FF;" 
									:style="{height:`${(n.value||0)*100}%`, backgroundColor:(n.value>=0?'#AAEEAA':'#B70808')}"></div>
							</div>
						</template>
					</div>			
					<h2>Brain</h2>
				</summary>
				<div style="margin:0;">
					<p class="brain"><!-- remove .micro for larger annotated cells -->
						<span :class="n.type" :style="{backgroundColor:n.color}" v-for="n of focus_boid_data.brainnodes">{{n.symbol}}</span>
					</p>
				</div>
			</details>
			
			<!-- MOTORS -->
			<details>
				<summary>
					<div class="krell">
						<div v-for="m of focus_boid_data.motors" class="box" >
							<div style="background-color:#e37f1f;" :style="{height:`${((m.this_stoke_time ? m.last_amount : 0)||0)*100}%`}"></div>
						</div>
					</div>
					<h2 style="clear:none; width:auto;">Motors</h2>
				</summary>
				<div style="margin:0;">
					<div v-for="m of focus_boid_data.motors" style="line-height:1.25em;">			
						<progress :value="(m.this_stoke_time ? m.last_amount : 0)||0"></progress>
						&nbsp;
						<span style="margin-right:0.35em;">{{m.name}}</span>
						<span v-if="m.linear" style="margin-right:0.35em; color:cyan;">{{Math.abs(m.linear.toFixed())}}</span>
						<span v-if="m.angular" style="margin-right:0.35em; color:pink;">{{Math.abs(m.angular.toFixed())}}</span>
						<span style="color:#DDD; font-style:italic;">{{m.stroketime.toFixed(1)}}s</span>
					</div>
				</div>
			</details>
				
		</section>
		
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
		line-height:1em; 
		width:6em; 
		}
		
	.good { background-color: #171; } 
	.verygood { font-weight:bold; background-color: #3A3; }
	.bad { background-color: #611; }
	.verybad { font-weight:bold; background-color: #911; }
	
	#nutrition_table TD {
		text-align:center;
		vertical-align:middle;
	}
	
	details[open] summary .krell { visibility:hidden; }
	details summary h2 { margin-top: 0.1em; }
	details:not([open]) summary h2 { margin-bottom:0.1em; margin-top: 0.1em; }
	.krell { max-width: 12rem;}
	
	section { height: fit-content; }

	.meter {
		display: inline-block; 
		overflow:hidden; 
		border:#3DAEE9 solid 1px; 
		border-radius:0.25em; 
		margin-right:1.8%; 
		width:31%; 
		height:1.5em; 
		position:relative;
	}
	.meter:last-child { margin-right:0; }
	.meter OUTPUT { 
		position:absolute; 
		top:0; 
		left:0; 
		right:0; 
		bottom:0; 
		text-align:center; 
		line-height:1.5em; 
		color: #FFF; 
	}
	summary {
		list-style: none; 
		margin:0;
	}
	summary > div.krell {
		 width:auto; 
		 text-align:right; 
		 display:flex; 
		 float:right; 
		 margin-top:0.5em;
	}
	.krell .box {
		background-color:#0004; 
		display:flex; 
		margin-right:2px; 
		width:10px; 
		height:1.25em;
	}
	.box > div {
		/* min-height:1px; */ /* enable this if you want some visual indicator that it exists */
		width: 100%; 
		align-self: flex-end;
	}
	details > *:last-child { padding-bottom: 1em; }
</style>
