<script setup>
	import Tank from '../classes/class.Tank.js'
	import { ref, reactive, toRaw, markRaw, shallowRef, nextTick, triggerRef, onMounted, watch } from 'vue'
	import { SimulationFactory } from '../classes/class.Simulation.js'	
	import * as utils from '../util/utils.js'

	// assume there are no set meta params when program begins
	let meta_params = reactive({
		num_boids: ( globalThis.vc.sim_meta_params.num_boids || 0 ),
		segments: ( globalThis.vc.sim_meta_params.segments || 0 )
	});
	
	function updateNumBoids() {
		if ( meta_params.num_boids < 2 ) { meta_params.num_boids = 0; } 
		if ( meta_params.segments && meta_params.num_boids ) {
			let diff = meta_params.num_boids % meta_params.segments;
			if ( diff ) {
				meta_params.num_boids -= diff;
				globalThis.vc.sim_meta_params.num_boids = meta_params.num_boids;
			}
		}
		globalThis.vc.sim_meta_params.num_boids = meta_params.num_boids;
	}
	
	function updateNumSegments() {
		if ( meta_params.segments < 1 ) { meta_params.segments = 0; } 
		if ( meta_params.segments && meta_params.num_boids ) {
			let diff = meta_params.num_boids % meta_params.segments;
			if ( diff ) {
				meta_params.num_boids -= diff;
				globalThis.vc.sim_meta_params.num_boids = meta_params.num_boids;
			}
		}
		globalThis.vc.sim_meta_params.segments = meta_params.segments;
	}
	
	function RunProgram( program_name ) {
		globalThis.vc.tank.Kill();
		globalThis.vc.tank = new Tank( 100,100 );
		globalThis.vc.tank.MakeBackground();
		globalThis.vc.SetRenderStyle( globalThis.vc.render_style );
		globalThis.vc.ResetCameraZoom();
		// TODO: this would probably appreciate a defined API instead of overreaching
		globalThis.vc.sim_queue.length = 0;
		switch (program_name) {
			// compound simulation queues need to be defined here
			case 'quickstart' : {
				globalThis.vc.sim_queue.push( SimulationFactory( globalThis.vc.tank, 'turning_training_easy' ) );
				globalThis.vc.sim_queue.push( SimulationFactory( globalThis.vc.tank, 'turning_training_medium' ) );
				globalThis.vc.sim_queue.push( SimulationFactory( globalThis.vc.tank, 'food_training_sim_easy' ) );
				globalThis.vc.sim_queue.push( SimulationFactory( globalThis.vc.tank, 'finishing_school' ) );
				break;
			}
			case 'the_works' : {
				globalThis.vc.sim_queue.push( SimulationFactory( globalThis.vc.tank, 'turning_training_easy' ) );
				globalThis.vc.sim_queue.push( SimulationFactory( globalThis.vc.tank, 'turning_training_medium' ) );
				globalThis.vc.sim_queue.push( SimulationFactory( globalThis.vc.tank, 'turning_training_hard' ) );
				globalThis.vc.sim_queue.push( SimulationFactory( globalThis.vc.tank, 'food_training_sim_medium' ) );
				globalThis.vc.sim_queue.push( SimulationFactory( globalThis.vc.tank, 'food_training_sim_hard' ) );
				globalThis.vc.sim_queue.push( SimulationFactory( globalThis.vc.tank, 'turning_training_xhard' ) );
				globalThis.vc.sim_queue.push( SimulationFactory( globalThis.vc.tank, 'treasure_hunt_hard' ) );
				globalThis.vc.sim_queue.push( SimulationFactory( globalThis.vc.tank, 'finishing_school' ) );
				break;
			}
			case 'steering_comp' : {
				globalThis.vc.sim_queue.push( SimulationFactory( globalThis.vc.tank, 'turning_training_easy' ) );
				globalThis.vc.sim_queue.push( SimulationFactory( globalThis.vc.tank, 'turning_training_medium' ) );
				globalThis.vc.sim_queue.push( SimulationFactory( globalThis.vc.tank, 'turning_training_hard' ) );
				globalThis.vc.sim_queue.push( SimulationFactory( globalThis.vc.tank, 'turning_training_xhard' ) );
				globalThis.vc.sim_queue.push( SimulationFactory( globalThis.vc.tank, 'treasure_hunt_easy' ) );
				globalThis.vc.sim_queue.push( SimulationFactory( globalThis.vc.tank, 'finishing_school' ) );
				break;
			}
			case 'food_training_sim_comp' : {
				globalThis.vc.sim_queue.push( SimulationFactory( globalThis.vc.tank, 'food_training_sim_easy' ) );
				globalThis.vc.sim_queue.push( SimulationFactory( globalThis.vc.tank, 'food_training_sim_medium' ) );
				globalThis.vc.sim_queue.push( SimulationFactory( globalThis.vc.tank, 'food_training_sim_hard' ) );
				globalThis.vc.sim_queue.push( SimulationFactory( globalThis.vc.tank, 'finishing_school' ) );
				break;
			}
			case 'random' : {
				let num = utils.RandomInt( 3, 7 );
				for ( let i=0; i < num; i++ ) {
					globalThis.vc.sim_queue.push( SimulationFactory( globalThis.vc.tank, 'random' ) );
				}
				break;
			}
			// singles can be referenced by name
			default : {
				globalThis.vc.sim_queue.push( SimulationFactory( globalThis.vc.tank, program_name ) );
				break;
			}
		}
		globalThis.vc.LoadNextSim();
	}
	
</script>

<template>
	<div>
		<h2>Training Programs</h2>
		
		<button @click="$emit('close')" style="width:100%;">Close</button>
		<br/>
		<br/>

		<button @click="RunProgram('quickstart')" style="width:100%; margin-bottom:0.25rem;">Quickstart</button>
		<button @click="RunProgram('the_works')" style="width:100%; margin-bottom:0.25rem;">The Works</button>
		<button @click="RunProgram('natural_tank')" style="width:100%; margin-bottom:0.25rem;">Natural Tank</button>
		<button @click="RunProgram('petri_dish')" style="width:100%; margin-bottom:0.25rem;">Petri Dish</button>
		<button @click="RunProgram('turning_training_easy')" style="width:100%; margin-bottom:0.25rem;">Steering - Easy</button>
		<button @click="RunProgram('turning_training_medium')" style="width:100%; margin-bottom:0.25rem;">Steering - Medium</button>
		<button @click="RunProgram('turning_training_hard')" style="width:100%; margin-bottom:0.25rem;">Steering - Hard</button>
		<button @click="RunProgram('turning_training_xhard')" style="width:100%; margin-bottom:0.25rem;">Steering - Extra Hard</button>
		<button @click="RunProgram('treasure_hunt_easy')" style="width:100%; margin-bottom:0.25rem;">Treasure Hunt - Easy</button>
		<button @click="RunProgram('treasure_hunt_hard')" style="width:100%; margin-bottom:0.25rem;">Treasure Hunt - Hard</button>
		<button @click="RunProgram('treasure_hunt_perpetual')" style="width:100%; margin-bottom:0.25rem;">Treasure Hunt - Perpetual</button>
		<button @click="RunProgram('steering_comp')" style="width:100%; margin-bottom:0.25rem;">Steering - Comprehensive</button>
		<button @click="RunProgram('food_training_sim_easy')" style="width:100%; margin-bottom:0.25rem;">Food Chase - Easy</button>
		<button @click="RunProgram('food_training_sim_medium')" style="width:100%; margin-bottom:0.25rem;">Food Chase - Medium</button>
		<button @click="RunProgram('food_training_sim_hard')" style="width:100%; margin-bottom:0.25rem;">Food Chase - Hard</button>
		<button @click="RunProgram('food_training_sim_comp')" style="width:100%; margin-bottom:0.25rem;">Food Chase - Comprehensive</button>
		<button @click="RunProgram('finishing_school')" style="width:100%; margin-bottom:0.25rem;">Finishing School</button>
		<button @click="RunProgram('obstacle_course')" style="width:100%; margin-bottom:0.25rem;">Obstacle Course</button>
		<button @click="RunProgram('race_track')" style="width:100%; margin-bottom:0.25rem;">Race Track</button>
		<button @click="RunProgram('combat')" style="width:100%; margin-bottom:0.25rem;">Combat</button>
		<button @click="RunProgram('random')" style="width:100%; margin-bottom:0.25rem;">Random Suite</button>
		
		<!-- meta params -->
		<h3>Meta Parameters</h3>
		<label for="num_rocks_slider">Boids</label>
		<input v-model.number="meta_params.num_boids" @change="updateNumBoids()" type="range" min="1" max="250" step="1" style="margin-bottom:-0.25em;" id="meta_num_boids" />
		<output for="meta_num_boids" id="meta_num_boids_output">{{meta_params.num_boids < 2 ? 'NOT SET' : meta_params.num_boids}}</output>

		<br/>
		
		<label for="num_rocks_slider">Segments</label>
		<input v-model.number="meta_params.segments" @change="updateNumSegments()" type="range" min="1" max="16" step="1" style="margin-bottom:-0.25em;" id="meta_num_segments" />
		<output for="meta_num_segments" id="meta_num_segments_output">{{meta_params.segments < 2 ? 'NOT SET' : meta_params.segments}}</output>
		
				
		<!-- Programs -->
		<!-- <h3>Programs</h3>
		<div style="border: 1px solid white; margin: 1em 0; padding: 1em 0.5em;">
			<p>Starting Population:</p>
			<select>
				<option>Random</option>
				<option>Current Tank</option>
				<option>From Buffer</option>
			</select>
			<p>When Finished:</p>
			<select>
				<option>Save to Buffer</option>
				<option>Add to Tank</option>
				<option>Replace Tank</option>
			</select>
			<p>On Extinction:</p>
			<select>
				<option>Restart</option>
				<option>Stop</option>
			</select>
			<p>Run Program:</p>
			<div>
				<button @click="RunProgram()">Program 1</button>
				<button>Delete</button>
				<button>Edit</button>
			</div>
		</div> -->
		
		<!-- Sessions -->
		<!-- <h3>Sessions</h3>
		<div style="border: 1px solid white; margin: 1em 0; padding: 1em 0.5em;">
			<div>
				<button>Session 1</button>
				<button>Delete</button>
				<button>Edit</button>
			</div>
		</div> -->
		
		<!-- Session Config -->
		<!-- <h3>Session Configuration</h3>
		<div style="border: 1px solid white; margin: 1em 0; padding: 1em 0.5em;">
			<input type="text" placeholder="Session Name" />
			max_mutation: 0.1<br/>
			cullpct: 0.6<br/>
			min_score: null,<br/>
			num_boids: 40,<br/>
			num_foods: 1,<br/>
			num_plants: 0,<br/>
			num_rocks: 0,<br/>
			add_decor: false,<br/>
			time: 30<br/>
			end.rounds: 5,<br/>
			end.avg_score: 10,	<br/>
			end.avg_score_rounds: 5<br/>
			species: 'random',<br/>
			fruiting_speed: 1.0,<br/>
			random_boid_pos: true,<br/>
			random_food_pos: true,<br/>
			target_spread: 400,<br/>
			species:'random',<br/>
			edibility: 1,<br/>
			scale: 0.5,<br/>
			angle_spread: 0.2,<br/>
			current: 0.1,<br/>
			food_friction: true,<br/>
			tide: 600,<br/>
		</div> -->
		
	</div>
	  
			  
</template>

<style>
	BUTTON.on {
		background-color: #80D4FF;
	}
	.button_rack {
		display:flex; 
		align-items:stretch;
	}
	.button_rack BUTTON {
		flex: 1 1 auto;
	}
	TR.selected {
		background-color: #26A;
	}
	TR {
		cursor: pointer;
	}
	B { font-weight:bold; }
	.ghost {
		pointer-events:none;
		opacity: 0.35;
	}
	.scrollbox {
		max-height: 20em;
		overflow-y: scroll;
	}
</style>