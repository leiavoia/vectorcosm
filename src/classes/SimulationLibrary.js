export default {	

	race_track: {
		simtype: 'AvoidEdgesSimulation',
		name: 'Obstacle Course',
		num_boids: 60,
		time: 24,
		scale:0.6,
		punishment: 2,
		max_segment_spread: 170,
		max_mutation: 0.3,
		cullpct: 0.3,
		food_proximity_bonus: 1,
		// tunnel: true,
		spiral:true,
		end: { rounds:100 },
		poop:false,
		ignore_other_boids:true,
		ignore_lifecycle:true,
		no_marks:true,
		no_combat:true,
		score_on_travel:true,
		score_on_proximity:true,
	},
	
	obstacle_course: {
		simtype: 'AvoidEdgesSimulation',
		name: 'Obstacle Course',
		num_boids: 60,
		time: 12,
		scale:0.6,
		punishment: 2,
		max_segment_spread: 170,
		joints: 10,
		max_mutation: 0.3,
		cullpct: 0.3,
		angle_spread: 0,
		food_proximity_bonus: 1,
		tunnel: true,
		// spiral:true,
		end: { rounds:100 },
		poop:false,
		ignore_other_boids:true,
		ignore_lifecycle:true,
		no_marks:true,
		no_combat:true,
		score_on_travel:true,
		score_on_proximity:true,
	},

	food_training_sim_easy: {
		simtype: 'FoodChaseSimulation',
		name: 'Food Chase - Easy',
		num_boids: 50,
		// random_boid_pos: true,
		// random_food_pos: true,
		time: 16,
		// min_score: 5,
		max_mutation: 0.1,
		// you can separately define DNA and brain mutations, in case you want just one or the other
		// dna_mutation_rate: 0.1,
		// brain_mutation_rate: 0.1,
		num_rocks: 0,
		num_plants: 0,
		species:'random',
		cullpct: 0.4,
		edibility: 1,
		scale: 1.0,
		current: 0,
		num_foods: 1,
		food_speed: 70,
		food_bounce_margin: 300,
		food_friction: false,
		food_value:3000,
		food_lifespan: 10,
		phantomfood: true,
		end: {
			avg_score:500,
			avg_score_rounds: 10,
			rounds:150
		},
		poop:false,
		ignore_other_boids:true,
		ignore_lifecycle:true,
		no_marks:true,
		no_combat:true,
		score_on_travel:true,
		score_on_proximity:true,
	},
	
	food_training_sim_medium: {
		simtype: 'FoodChaseSimulation',
		name: 'Food Chase - Medium',
		num_boids: 80,
		// random_boid_pos: true,
		// random_food_pos: true,
		time: 30,
		// min_score: 5,
		max_mutation: 0.1,
		// you can separately define DNA and brain mutations, in case you want just one or the other
		// dna_mutation_rate: 0.1,
		// brain_mutation_rate: 0.1,
		num_rocks: 1,
		num_plants: 0,
		species:'random',
		cullpct: 0.3,
		edibility: 1,
		scale: 0.7,
		current: 0,
		num_foods: 2,
		food_speed: 125,
		food_bounce_margin: 300,
		food_friction: false,
		food_value:1000,
		food_lifespan: 10,
		phantomfood: true,
		end: {
			avg_score:500,
			avg_score_rounds: 10,
			rounds:150
		},
		poop:false,
		ignore_other_boids:true,
		ignore_lifecycle:true,
		no_marks:true,
		no_combat:true,
		score_on_travel:false,
		score_on_proximity:true,
	},
	
	food_training_sim_hard: {
		simtype: 'FoodChaseSimulation',
		name: 'Food Chase - Hard',
		num_boids: 60,
		// random_boid_pos: true,
		// random_food_pos: true,
		time: 60,
		// min_score: 5,
		max_mutation: 0.2,
		// you can separately define DNA and brain mutations, in case you want just one or the other
		// dna_mutation_rate: 0.1,
		// brain_mutation_rate: 0.1,
		num_rocks: 3,
		num_plants: 0,
		species:'random',
		cullpct: 0.2,
		edibility: 1,
		scale: 0.6,
		current: 0,
		num_foods: 3,
		food_speed: 400,
		food_bounce_margin: 300,
		food_friction: false,
		food_value:300,
		food_lifespan: 7,
		phantomfood: true,
		end: {
			avg_score:600,
			avg_score_rounds: 10,
			rounds:180
		},
		poop:false,
		ignore_other_boids:true,
		ignore_lifecycle:true,
		no_marks:true,
		no_combat:true,
		score_on_travel:false,
		score_on_proximity:true,
	},
	
	finishing_school: {
		simtype: 'FinishingSimulation',
		name: 'Finishing School',
		num_boids: 80,
		num_foods: 40,
		num_rocks: 8,
		time: 60,
		max_mutation: 0.2,
		cullpct: 0.2,
		scale:0.3,
		end: { rounds:60 },
		poop:true,
		ignore_other_boids:false,
		on_bite_ignore:true,
		edibility: 1,
		permafood:true,
		food_speed: 0.00001,
		random_food_pos: true,
		random_boid_pos: true,
		random_boid_angle: true,
		food_bounce_margin: 0,
		food_friction: true,
		food_value:300,
		ignore_lifecycle:true,
		no_marks:false,
		no_combat:false,
		score_on_travel:false,
		score_on_proximity:false,
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
		on_bite_ignore:true,
		edibility: 1,
		ignore_lifecycle:true,
		no_marks:true,
		no_combat:true,
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
		on_bite_ignore:true,
		edibility: 1,
		ignore_lifecycle:true,
		no_marks:true,
		no_combat:true,
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
		on_bite_ignore:true,
		edibility: 1,
		ignore_lifecycle:true,
		no_marks:true,
		no_combat:true,
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
		on_bite_ignore:true,
		edibility: 1,
		ignore_lifecycle:true,
		no_marks:true,
		no_combat:true,
	},
	treasure_hunt_easy: {
		simtype: 'FoodChaseSimulation',
		name: 'Treasure Hunt - Easy',
		num_boids: 80,
		num_foods: 25,
		num_rocks: 6,
		time: 120,
		max_mutation: 0.3,
		cullpct: 0.2,
		scale:0.3,
		end: { rounds:120 },
		poop:false,
		ignore_other_boids:true,
		on_bite_ignore:true,
		edibility: 1,
		permafood:true,
		food_speed: 0.00001,
		random_food_pos: true,
		food_bounce_margin: 0,
		food_friction: true,
		food_value:1000,
		ignore_lifecycle:true,
		no_marks:true,
		no_combat:true,
		score_on_travel:false,
		score_on_proximity:false,
	},
	treasure_hunt_hard: {
		simtype: 'FoodChaseSimulation',
		name: 'Treasure Hunt - Hard',
		num_boids: 80,
		num_foods: 50,
		num_rocks: 20,
		time: 120,
		max_mutation: 0.3,
		cullpct: 0.2,
		scale:0.26,
		end: { rounds:250 },
		poop:false,
		ignore_other_boids:true,
		on_bite_ignore:true,
		edibility: 1,
		permafood:true,
		food_speed: 0.00001,
		random_food_pos: true,
		food_bounce_margin: 0,
		food_friction: true,
		food_value:1000,
		ignore_lifecycle:true,
		no_marks:true,
		no_combat:true,
		score_on_travel:false,
		score_on_proximity:false,
	},	
	treasure_hunt_perpetual: {
		simtype: 'FoodChaseSimulation',
		name: 'Treasure Hunt - Perpetual',
		num_boids: 80,
		num_foods: 50,
		num_rocks: 20,
		time: 120,
		max_mutation: 0.3,
		cullpct: 0.2,
		scale:0.26,
		end: { rounds:10000000 },
		poop:false,
		ignore_other_boids:true,
		on_bite_ignore:true,
		edibility: 1,
		permafood:true,
		food_speed: 0.00001,
		random_food_pos: true,
		food_bounce_margin: 0,
		food_friction: true,
		food_value:1000,
		ignore_lifecycle:true,
		no_marks:true,
		no_combat:true,
		score_on_travel:false,
		score_on_proximity:false,
	},	
	natural_tank: {
		simtype: 'NaturalTankSimulation',
		name: 'Natural Tank',
		num_boids: 40,
		random_boid_pos: true,
		safe_spawn: true,
		time: 0,
		// min_score: 5,
		max_mutation: 0.2,
		num_rocks: 0,
		num_plants: 10,
		species:'random',
		scale: 0.5,
		current: 0.1,
		num_foods: 0,
		food_friction: true,
		tide: 600,
		add_decor: false,
		random_boid_angle: true,
		randomize_age:false,
		random_terrain:true,
		no_combat:true,
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
		num_rocks: 5,
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
		randomize_age:false,
	},
			
	combat: {
		simtype: 'CombatSimulation',
		name: 'Combat',
		num_boids: 120,
		segments: 3,
		random_boid_pos: true,
		random_boid_angle: true,
		time: 16,
		cullpct: 0.3,
		max_mutation: 0.3,
		num_rocks: 0,
		num_plants: 0,
		edibility: 1,
		scale: 0.24,
		current: 0,
		num_foods: 0,
		poop:false,
		ignore_other_boids:false,
		randomize_age:false,
		ignore_lifecycle:true,
		no_marks:true,
	}
};