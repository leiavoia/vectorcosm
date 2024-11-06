<script setup>
	// import * as utils from '../util/utils.js'
	// import BoidLibrary from '../classes/class.BoidLibrary.js'
	import {Boid} from '../classes/class.Boids.js'
	import PubSub from 'pubsub-js'
	import Tank from '../classes/class.Tank.js'
	import { ref, reactive, toRaw, markRaw, shallowRef, nextTick, triggerRef, onMounted, watch } from 'vue'
	import { AvoidEdgesSimulation, TurningSimulation, FoodChaseSimulation, BasicTravelSimulation } from '../classes/class.Simulation.js'	
	
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
	
	function MakeTurningSim() { 
		return new TurningSimulation(window.vc.tank,{
			name: 'Steering - Easy',
			num_boids: 100,
			num_foods: 1,
			num_rocks: 0,
			time: 1.6,
			max_mutation: 0.5,
			brain_mutation_rate: 0.25,
			angle_spread: 0.7, // radians
			cullpct: 0.5,
			distance: 500,
			scale:0.5,
			distance_variance: 0.2,
			end: {
				avg_score:90,
				avg_score_rounds: 7,
				rounds:200
			},
			poop:false,
			ignore_other_boids:true,
			sterile:true,
			on_bite_ignore:true
		});
	}
		
	function MakeFoodChaseSimEasy() { 
		return new FoodChaseSimulation(window.vc.tank,{
			name: 'Food Chase - Easy',
			num_boids: 50,
			random_boid_pos: true,
			random_food_pos: true,
			time: 20,
			max_mutation: 0.1,
			// you can separately define DNA and brain mutations, in case you want just one or the other
			// dna_mutation_rate: 0.1,
			// brain_mutation_rate: 0.1,
			num_rocks: 0,
			num_plants: 0,
			target_spread: 200,
			species:'random',
			cullpct: 0.4,
			edibility: 1,
			scale: 1.1,
			angle_spread: 0.2,
			current: 0,
			num_foods: 1,
			food_speed: 70,
			food_value:2000,
			food_bounce_margin: 300,
			food_friction: false,
			// circular_current: true,
			// tide: 300,
			end: {
				avg_score:500,
				avg_score_rounds: 10,
				rounds:50
			},
			poop:false,
			ignore_other_boids:true,
			sterile:true
		});
	}
	
	function MakeFoodChaseSimMedium() { 
		return new FoodChaseSimulation(window.vc.tank,{
			name: 'Food Chase - Medium',
			num_boids: 80,
			// random_boid_pos: true,
			// random_food_pos: true,
			time: 45,
			// min_score: 5,
			max_mutation: 0.1,
			// you can separately define DNA and brain mutations, in case you want just one or the other
			// dna_mutation_rate: 0.1,
			// brain_mutation_rate: 0.1,
			num_rocks: 0,
			num_plants: 0,
			target_spread: 200,
			species:'random',
			cullpct: 0.4,
			edibility: 1,
			scale: 0.7,
			angle_spread: 0.2,
			current: 0,
			num_foods: 2,
			food_speed: 125,
			food_value:2000,
			food_bounce_margin: 300,
			food_friction: false,
			end: {
				avg_score:500,
				avg_score_rounds: 10,
				rounds:500
			},
			poop:false,
			ignore_other_boids:true,
			sterile:true
		});
	}
		
	function RunProgram( program_num ) {
		window.vc.tank.Kill();
		window.vc.tank = new Tank( 100,100 );
		window.vc.tank.MakeBackground();
		window.vc.ResetCameraZoom();
		// TODO: this would probably appreciate a defined API instead of overreaching
		window.vc.sim_queue.length = 0;
		switch (program_num) {
			case 1: {
				window.vc.sim_queue.push(MakeTurningSim());
				break;
			}
			case 2: {
				window.vc.sim_queue.push(MakeFoodChaseSimEasy());
				break;
			}
			case 3: {
				window.vc.sim_queue.push(MakeFoodChaseSimMedium());
				break;
			}
			default: {
				window.vc.sim_queue.push(MakeTurningSim());
				window.vc.sim_queue.push(MakeFoodChaseSimEasy());
				window.vc.sim_queue.push(MakeFoodChaseSimMedium());
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
				
		<button @click="RunProgram(1)" style="width:100%; margin-bottom:0.25rem;">Basic Steering</button>
		<button @click="RunProgram(2)" style="width:100%; margin-bottom:0.25rem;">Food Chase - Easy</button>
		<button @click="RunProgram(3)" style="width:100%; margin-bottom:0.25rem;">Food Chase - Medium</button>
		<button @click="RunProgram(4)" style="width:100%; margin-bottom:0.25rem;">The Works</button>
		
		
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