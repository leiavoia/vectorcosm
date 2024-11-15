<script setup>
	// import * as utils from '../util/utils.js'
	// import BoidLibrary from '../classes/class.BoidLibrary.js'
	import {Boid} from '../classes/class.Boids.js'
	import PubSub from 'pubsub-js'
	import Tank from '../classes/class.Tank.js'
	import { ref, reactive, toRaw, markRaw, shallowRef, nextTick, triggerRef, onMounted, watch } from 'vue'
	import { SimulationFactory } from '../classes/class.Simulation.js'
	
	// const lib = new BoidLibrary();
	let rows = reactive([]);
			
	// async function QueryLibrary( order_by='date', ascending=false, star=null ) {
	// 	rows.length = 0;
	// 	let results = await lib.Get({ order_by, ascending, star });
	// 	rows.push( ...results );
	// 	num_selected = 0;
	// }
	
	// QueryLibrary( order_by, ascending, star );
	
	// // listen for library additions from other components
	// let libraryUpdateSubscription = PubSub.subscribe('boid-library-addition', (msg,data) => {
	// 	QueryLibrary( order_by, ascending, star );
	// });
			
	function RunProgram( program_name ) {
		window.vc.tank.Kill();
		window.vc.tank = new Tank( 100,100 );
		window.vc.tank.MakeBackground();
		window.vc.ResetCameraZoom();
		// TODO: this would probably appreciate a defined API instead of overreaching
		window.vc.sim_queue.length = 0;
		switch (program_name) {
			case 'quickstart' : {
				window.vc.sim_queue.push( SimulationFactory( window.vc.tank, 'turning_training_easy' ) );
				window.vc.sim_queue.push( SimulationFactory( window.vc.tank, 'turning_training_medium' ) );
				window.vc.sim_queue.push( SimulationFactory( window.vc.tank, 'food_training_sim_easy' ) );
				break;
			}
			case 'the_works' : {
				window.vc.sim_queue.push( SimulationFactory( window.vc.tank, 'turning_training_easy' ) );
				window.vc.sim_queue.push( SimulationFactory( window.vc.tank, 'turning_training_medium' ) );
				window.vc.sim_queue.push( SimulationFactory( window.vc.tank, 'turning_training_hard' ) );
				window.vc.sim_queue.push( SimulationFactory( window.vc.tank, 'turning_training_xhard' ) );
				window.vc.sim_queue.push( SimulationFactory( window.vc.tank, 'treasure_hunt_perpetual' ) );
				break;
			}
			case 'natural_tank' : {
				window.vc.sim_queue.push( SimulationFactory( window.vc.tank, 'natural_tank' ) );
				break;
			}
			case 'petri_dish' : {
				window.vc.sim_queue.push( SimulationFactory( window.vc.tank, 'petri_dish' ) );
				break;
			}
			case 'turning_training_easy' : {
				window.vc.sim_queue.push( SimulationFactory( window.vc.tank, 'turning_training_easy' ) );
				break;
			}
			case 'turning_training_medium' : {
				window.vc.sim_queue.push( SimulationFactory( window.vc.tank, 'turning_training_medium' ) );
				break;
			}
			case 'turning_training_hard' : {
				window.vc.sim_queue.push( SimulationFactory( window.vc.tank, 'turning_training_hard' ) );
				break;
			}
			case 'turning_training_xhard' : {
				window.vc.sim_queue.push( SimulationFactory( window.vc.tank, 'turning_training_xhard' ) );
				break;
			}
			case 'treasure_hunt_easy' : {
				window.vc.sim_queue.push( SimulationFactory( window.vc.tank, 'treasure_hunt_easy' ) );
				break;
			}
			case 'treasure_hunt_hard' : {
				window.vc.sim_queue.push( SimulationFactory( window.vc.tank, 'treasure_hunt_hard' ) );
				break;
			}
			case 'treasure_hunt_perpetual' : {
				window.vc.sim_queue.push( SimulationFactory( window.vc.tank, 'treasure_hunt_perpetual' ) );
				break;
			}
			case 'steering_comp' : {
				window.vc.sim_queue.push( SimulationFactory( window.vc.tank, 'turning_training_easy' ) );
				window.vc.sim_queue.push( SimulationFactory( window.vc.tank, 'turning_training_medium' ) );
				window.vc.sim_queue.push( SimulationFactory( window.vc.tank, 'turning_training_hard' ) );
				window.vc.sim_queue.push( SimulationFactory( window.vc.tank, 'turning_training_xhard' ) );
				window.vc.sim_queue.push( SimulationFactory( window.vc.tank, 'treasure_hunt_easy' ) );
				break;
			}
			case 'food_training_sim_easy' : {
				window.vc.sim_queue.push( SimulationFactory( window.vc.tank, 'food_training_sim_easy' ) );
				break;
			}
			case 'food_training_sim_medium' : {
				window.vc.sim_queue.push( SimulationFactory( window.vc.tank, 'food_training_sim_medium' ) );
				break;
			}
			case 'food_training_sim_hard' : {
				window.vc.sim_queue.push( SimulationFactory( window.vc.tank, 'food_training_sim_hard' ) );
				break;
			}
			case 'food_training_sim_comp' : {
				window.vc.sim_queue.push( SimulationFactory( window.vc.tank, 'food_training_sim_easy' ) );
				window.vc.sim_queue.push( SimulationFactory( window.vc.tank, 'food_training_sim_medium' ) );
				window.vc.sim_queue.push( SimulationFactory( window.vc.tank, 'food_training_sim_hard' ) );
				break;
			}
		}
		window.vc.LoadNextSim();
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