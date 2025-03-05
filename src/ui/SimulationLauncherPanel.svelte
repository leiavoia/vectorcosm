<script>
	import * as utils from '../util/utils.js'
	import { getContext } from 'svelte';
	
	const setPanelMode = getContext('setPanelMode'); // allow self closing with setPanelMode()
	
	let { api } = $props();
	
	let meta_num_boids = $state(0);
	let meta_num_segments = $state(1);
	let meta_num_rounds = $state(0);
	
	let selected_sim = $state(null);
	
	let comprehensive_sims = $state([
		'quickstart',
		'the_works',
		'random',
		'steering_comp',
		'food_training_sim_comp',
	]);
	
	let indv_sims = $state([
		'natural_tank',
		'petri_dish',
		'finishing_school',
		'obstacle_course',
		'race_track',
		'combat',
		'turning_training_easy',
		'turning_training_medium',
		'turning_training_hard',
		'turning_training_xhard',
		'treasure_hunt_easy',
		'treasure_hunt_hard',
		'treasure_hunt_perpetual',
		'food_training_sim_easy',
		'food_training_sim_medium',
		'food_training_sim_hard',
	]);
	
	api.RegisterResponseCallback( 'pushSimQueue', data => {
		 setPanelMode('sim_controls');
	});
	
	function RunProgram( program_name ) {
		let queue = [];
		switch (program_name) {
			// compound simulation queues need to be defined here
			case 'quickstart' : {
				queue.push( 'turning_training_easy' );
				queue.push( 'turning_training_medium' );
				queue.push( 'food_training_sim_easy' );
				queue.push( 'finishing_school' );
				break;
			}
			case 'the_works' : {
				queue.push( 'turning_training_easy' );
				queue.push( 'turning_training_medium' );
				queue.push( 'turning_training_hard' );
				queue.push( 'food_training_sim_medium' );
				queue.push( 'food_training_sim_hard' );
				queue.push( 'turning_training_xhard' );
				queue.push( 'treasure_hunt_hard' );
				queue.push( 'finishing_school' );
				break;
			}
			case 'steering_comp' : {
				queue.push( 'turning_training_easy' );
				queue.push( 'turning_training_medium' );
				queue.push( 'turning_training_hard' );
				queue.push( 'turning_training_xhard' );
				queue.push( 'treasure_hunt_easy' );
				queue.push( 'finishing_school' );
				break;
			}
			case 'food_training_sim_comp' : {
				queue.push( 'food_training_sim_easy' );
				queue.push( 'food_training_sim_medium' );
				queue.push( 'food_training_sim_hard' );
				queue.push( 'finishing_school' );
				break;
			}
			case 'random' : {
				let num = utils.RandomInt( 3, 7 );
				for ( let i=0; i < num; i++ ) {
					queue.push( 'random' );
				}
				break;
			}
			// singles can be referenced by name
			default : {
				queue.push( program_name );
				break;
			}
		}
		api.SendMessage('pushSimQueue', {
			sims: queue,
			reset: true, // clear queue
			sim_meta_params: {
				num_boids: meta_num_boids,
				segments: meta_num_segments,
				rounds: meta_num_rounds
			}
		});
	}
	
</script>

<style>
	.slider_block OUTPUT {
		width: 4rem;
	}
	.slider_block LABEL {
		width: 6rem;
	}
</style>

<section>
	<header>
		<h3>Training Programs</h3>
	</header>

	<h4>Comprehensive Training</h4>
	<select bind:value={selected_sim} onchange={()=>RunProgram(selected_sim)}>
		<option value="quickstart">Quickstart</option>
		<option value="the_works">The Works</option>
		<option value="random">Random Suite</option>
		<option value="steering_comp">Steering - Comprehensive</option>
		<option value="food_training_sim_comp">Food Chase - Comprehensive</option>
	</select>
	
	<h4>Individual Programs</h4>
	<select bind:value={selected_sim} onchange={()=>RunProgram(selected_sim)}>
		<option value="natural_tank">Natural Tank</option>
		<option value="petri_dish">Petri Dish</option>
		<option value="finishing_school">Finishing School</option>
		<option value="obstacle_course">Obstacle Course</option>
		<option value="race_track">Race Track</option>
		<option value="combat">Combat</option>
		<option value="turning_training_easy">Steering - Easy</option>
		<option value="turning_training_medium">Steering - Medium</option>
		<option value="turning_training_hard">Steering - Hard</option>
		<option value="turning_training_xhard">Steering - Extra Hard</option>
		<option value="treasure_hunt_easy">Treasure Hunt - Easy</option>
		<option value="treasure_hunt_hard">Treasure Hunt - Hard</option>
		<option value="treasure_hunt_perpetual">Treasure Hunt - Perpetual</option>
		<option value="food_training_sim_easy">Food Chase - Easy</option>
		<option value="food_training_sim_medium">Food Chase - Medium</option>
		<option value="food_training_sim_hard">Food Chase - Hard</option>
	</select>
</section>

<section>
	<header>
		<h3>Meta Parameters</h3>
	</header>	
	
	<div class="slider_block">
		<label for="meta_num_boids">Boids:</label>
		<input bind:value={meta_num_boids} type="range" min="0" max="250" step="1" id="meta_num_boids" />
		<output>{meta_num_boids||'default'}</output>
	</div>
	
	<div class="slider_block">
		<label for="meta_num_segments">Segments:</label>
		<input bind:value={meta_num_segments} type="range" min="0" max="16" step="1" id="meta_num_segments" />
		<output>{meta_num_segments||1}</output>
	</div>
	
	<div class="slider_block">
		<label for="meta_num_rounds">Rounds:</label>
		<input bind:value={meta_num_rounds} type="range" min="0" max="500" step="1" id="meta_num_rounds" />
		<output>{meta_num_rounds||'default'}</output>
	</div>
	
</section>	
