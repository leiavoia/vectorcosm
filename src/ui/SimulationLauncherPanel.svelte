<script>
	import * as utils from '../util/utils.js'

	let { api } = $props();
	
	// assume there are no set meta params when program begins
	// let meta_params = reactive({
	// 	num_boids: ( globalThis.vc.sim_meta_params.num_boids || 0 ),
	// 	segments: ( globalThis.vc.sim_meta_params.segments || 0 )
	// });
	
	// function updateNumBoids() {
	// 	if ( meta_params.num_boids < 2 ) { meta_params.num_boids = 0; } 
	// 	if ( meta_params.segments && meta_params.num_boids ) {
	// 		let diff = meta_params.num_boids % meta_params.segments;
	// 		if ( diff ) {
	// 			meta_params.num_boids -= diff;
	// 			globalThis.vc.sim_meta_params.num_boids = meta_params.num_boids;
	// 		}
	// 	}
	// 	globalThis.vc.sim_meta_params.num_boids = meta_params.num_boids;
	// }
	
	// function updateNumSegments() {
	// 	if ( meta_params.segments < 1 ) { meta_params.segments = 0; } 
	// 	if ( meta_params.segments && meta_params.num_boids ) {
	// 		let diff = meta_params.num_boids % meta_params.segments;
	// 		if ( diff ) {
	// 			meta_params.num_boids -= diff;
	// 			globalThis.vc.sim_meta_params.num_boids = meta_params.num_boids;
	// 		}
	// 	}
	// 	globalThis.vc.sim_meta_params.segments = meta_params.segments;
	// }
	
	api.RegisterResponseCallback( 'pushSimQueue', data => {
		// console.log(data);
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
			reset: true
		});
	}
	
</script>

<style>
	BUTTON {
		width:100%;
		margin-bottom:0.25rem;
	}
</style>

<section>
	<header>
		<h3>Training Programs</h3>
	</header>

	<button onclick={()=>RunProgram('quickstart')}>Quickstart</button>
	<button onclick={()=>RunProgram('the_works')}>The Works</button>
	<button onclick={()=>RunProgram('random')}>Random Suite</button>
	<button onclick={()=>RunProgram('steering_comp')}>Steering - Comprehensive</button>
	<button onclick={()=>RunProgram('food_training_sim_comp')}>Food Chase - Comprehensive</button>
	<br/>
	<br/>
	<button onclick={()=>RunProgram('natural_tank')}>Natural Tank</button>
	<button onclick={()=>RunProgram('petri_dish')}>Petri Dish</button>
	<button onclick={()=>RunProgram('finishing_school')}>Finishing School</button>
	<button onclick={()=>RunProgram('obstacle_course')}>Obstacle Course</button>
	<button onclick={()=>RunProgram('race_track')}>Race Track</button>
	<button onclick={()=>RunProgram('combat')}>Combat</button>
	<button onclick={()=>RunProgram('turning_training_easy')}>Steering - Easy</button>
	<button onclick={()=>RunProgram('turning_training_medium')}>Steering - Medium</button>
	<button onclick={()=>RunProgram('turning_training_hard')}>Steering - Hard</button>
	<button onclick={()=>RunProgram('turning_training_xhard')}>Steering - Extra Hard</button>
	<button onclick={()=>RunProgram('treasure_hunt_easy')}>Treasure Hunt - Easy</button>
	<button onclick={()=>RunProgram('treasure_hunt_hard')}>Treasure Hunt - Hard</button>
	<button onclick={()=>RunProgram('treasure_hunt_perpetual')}>Treasure Hunt - Perpetual</button>
	<button onclick={()=>RunProgram('food_training_sim_easy')}>Food Chase - Easy</button>
	<button onclick={()=>RunProgram('food_training_sim_medium')}>Food Chase - Medium</button>
	<button onclick={()=>RunProgram('food_training_sim_hard')}>Food Chase - Hard</button>
	
	<!-- meta params -->
	<!-- <h3>Meta Parameters</h3>
	<label for="num_rocks_slider">Boids</label>
	<input v-model.number="meta_params.num_boids" @change="updateNumBoids()" type="range" min="1" max="250" step="1" style="margin-bottom:-0.25em;" id="meta_num_boids" />
	<output for="meta_num_boids" id="meta_num_boids_output">{{meta_params.num_boids < 2 ? 'NOT SET' : meta_params.num_boids}}</output>

	<br/>
	
	<label for="num_rocks_slider">Segments</label>
	<input v-model.number="meta_params.segments" @change="updateNumSegments()" type="range" min="1" max="16" step="1" style="margin-bottom:-0.25em;" id="meta_num_segments" />
	<output for="meta_num_segments" id="meta_num_segments_output">{{meta_params.segments < 2 ? 'NOT SET' : meta_params.segments}}</output> -->
		
</section>	
