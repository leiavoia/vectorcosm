export default {	
	food_training_sim_easy: {
		simtype: 'FoodChaseSimulation',
		name: 'Food Chase - Easy',
		num_boids: 50,
		// random_boid_pos: true,
		// random_food_pos: true,
		time: 20,
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
		scale: 1.0,
		angle_spread: 0.2,
		current: 0,
		num_foods: 1,
		food_speed: 70,
		food_bounce_margin: 300,
		food_friction: false,
		food_value:2000,
		end: {
			avg_score:500,
			avg_score_rounds: 10,
			rounds:200
		},
		poop:false,
		ignore_other_boids:true,
		sterile:true
	},
	
	food_training_sim_medium: {
		simtype: 'FoodChaseSimulation',
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
		food_bounce_margin: 300,
		food_friction: false,
		food_value:2000,
		end: {
			avg_score:500,
			avg_score_rounds: 10,
			rounds:500
		},
		poop:false,
		ignore_other_boids:true,
		sterile:true,
	},
	
	food_training_sim_hard: {
		simtype: 'FoodChaseSimulation',
		name: 'Food Chase - Hard',
		num_boids: 60,
		// random_boid_pos: true,
		// random_food_pos: true,
		time: 80,
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
		scale: 0.6,
		angle_spread: 0.2,
		current: 0,
		num_foods: 3,
		food_speed: 400,
		food_bounce_margin: 300,
		food_friction: false,
		food_value:2000,
		end: {
			avg_score:600,
			avg_score_rounds: 10,
			rounds:500
		},
		poop:false,
		ignore_other_boids:true,
		sterile:true
	},
	
	turning_training_easy: {
		simtype: 'TurningSimulation',
		name: 'Steering - Easy',
		num_boids: 100,
		num_foods: 1,
		time: 1.6,
		max_mutation: 0.5,
		brain_mutation_rate: 0.25,
		angle_spread: 0.7, // radians
		cullpct: 0.5,
		distance: 500,
		scale:0.5,
		distance_variance: 0.4,
		end: {
			avg_score:90,
			avg_score_rounds: 7,
			rounds:200
		},
		poop:false,
		ignore_other_boids:true,
		sterile:true,
		on_bite_ignore:true,
		edibility: 1
	},
	turning_training_medium: {
		simtype: 'TurningSimulation',
		name: 'Steering - Medium',
		num_boids: 100,
		num_foods: 2,
		time: 5,
		max_mutation: 0.2,
		brain_mutation_rate: 0.25,
		angle_spread: 1.0, // radians
		cullpct: 0.3,
		distance: 500,
		scale:0.45,
		distance_variance: 0.3,
		end: {
			avg_score:88,
			avg_score_rounds: 10,
			rounds:100
		},
		poop:false,
		ignore_other_boids:true,
		sterile:true,
		on_bite_ignore:true,
		edibility: 1
	},
	turning_training_hard: {
		simtype: 'TurningSimulation',
		name: 'Steering - Hard',
		num_boids: 100,
		num_foods: 5,
		time: 16,
		num_rocks:1,
		max_mutation: 0.2,
		brain_mutation_rate: 0.25,
		angle_spread: 1, // radians
		cullpct: 0.3,
		distance: 450,
		scale:0.25,
		distance_variance: 0.2,
		end: {
			avg_score:88,
			avg_score_rounds: 7,
			rounds:120
		},
		poop:false,
		ignore_other_boids:true,
		sterile:true,
		on_bite_ignore:true,
		edibility: 1
	},
	turning_training_xhard: {
		simtype: 'TurningSimulation',
		name: 'Steering - Extra Hard',
		num_boids: 100,
		num_foods: 5,
		num_rocks: 5,
		time: 20,
		max_mutation: 0.2,
		brain_mutation_rate: 0.25,
		angle_spread: 1, // radians
		cullpct: 0.3,
		distance: 450,
		scale:0.25,
		distance_variance: 0.2,
		end: {
			avg_score:86,
			avg_score_rounds: 7,
			rounds:150
		},
		poop:false,
		ignore_other_boids:true,
		sterile:true,
		on_bite_ignore:true,
		edibility: 1
	},
	treasure_hunt_training: {
		simtype: 'FoodChaseSimulation',
		name: 'Treasure Hunt',
		num_boids: 60,
		num_foods: 25,
		num_rocks: 8,
		time: 120,
		max_mutation: 0.3,
		cullpct: 0.2,
		scale:0.3,
		end: {
			avg_score:86,
			avg_score_rounds: 7,
			rounds:150
		},
		poop:false,
		ignore_other_boids:true,
		sterile:true,
		on_bite_ignore:true,
		target_spread: 0,
		edibility: 1,
		permafood:true,
		food_speed: 0.00001,
		random_food_pos: true,
		food_bounce_margin: 100,
		food_friction: true,
		food_value:1000,
		end: {
			// avg_score:600,
			// avg_score_rounds: 10,
			rounds:150
		}
	},
	
	natural_tank: {
		simtype: 'NaturalTankSimulation',
		name: 'Natural Tank',
		num_boids: 60,
		random_boid_pos: true,
		random_food_pos: true,
		time: 0,
		// min_score: 5,
		max_mutation: 0.2,
		num_rocks: 3,
		num_plants: 10,
		species:'random',
		scale: 0.5,
		current: 0.1,
		num_foods: 0,
		food_friction: true,
		tide: 600,
		add_decor: 0.75,
		random_boid_angle: true,
		allow_speciation: false // temporary until we get brain rewiring figured out
	},
			
	petri_dish: {
		simtype: 'FoodChaseSimulation',
		name: 'Petri Dish',
		num_boids: 1,
		random_boid_pos: true,
		random_food_pos: true,
		time: 1000000,
		// min_score: 5,
		max_mutation: 0,
		num_rocks: 0,
		num_plants: 0,
		edibility: 1,
		scale: 1.3,
		current: 0,
		num_foods: 1,
		food_speed: 0,
		food_bounce_margin: 200,
		food_friction: false,
		food_value:1000,
		poop:true,
		ignore_other_boids:false,
		sterile:false
	}
};