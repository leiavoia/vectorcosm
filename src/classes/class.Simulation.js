import Tank from '../classes/class.Tank.js'
import Food from '../classes/class.Food.js'
import { BoidFactory } from '../classes/class.Boids.js'
import neataptic from "neataptic";

export default class Simulation {

	constructor( tank, settings ) {
		this.tank = tank || new Tank( this.tank.width, this.tank.height );
		this.settings = {
			max_mutation: 15, // up to
			cullpct: 0.5, // 0..1
			min_score: 2,
			// width: 0,
			// height: 0,
			num_boids: 40,
			num_foods: 1,
			time: 50, // in seconds
			rounds: 5000,
			species: 'Boid',
			mutation_options: [
				// neataptic.methods.mutation.ADD_NODE,
				// neataptic.methods.mutation.SUB_NODE,
				neataptic.methods.mutation.ADD_CONN,
				neataptic.methods.mutation.SUB_CONN,
				neataptic.methods.mutation.MOD_WEIGHT,
				neataptic.methods.mutation.MOD_BIAS,
				// neataptic.methods.mutation.MOD_ACTIVATION,
				// neataptic.methods.mutation.ADD_GATE,
				// neataptic.methods.mutation.SUB_GATE,
				// neataptic.methods.mutation.ADD_SELF_CONN,
				// neataptic.methods.mutation.SUB_SELF_CONN,
				// neataptic.methods.mutation.ADD_BACK_CONN,
				// neataptic.methods.mutation.SUB_BACK_CONN,
				// neataptic.methods.mutation.SWAP_NODES
			],
		};
		if ( settings ) {
			this.settings = Object.assign(this.settings, settings);
		}
		this.stats = {
			best_score: 0,
			best_avg_score: 0,
			best_brain: null,
			round: {
				num: 0,
				best_score: 0,
				avg_score: 0,
				time: 0
			},
			chartdata: {
				averages: [],
				highscores: []
			},
			framenum: 0
		};
		this.turbo = false;
	}
	
	Setup() {
		// starting population
		this.tank.boids.forEach( x => x.Kill() );
		this.tank.boids.length = 0;
		let spawn_x = (Math.random() > 0.5 ? 0.25 : 0.75) * this.tank.width; 
		let spawn_y = (Math.random() > 0.5 ? 0.25 : 0.75) * this.tank.height; 	
		for ( let i=0; i < this.settings.num_boids; i++ ) {
			const b = BoidFactory(this.species, spawn_x, spawn_y, this.tank );
			// b.angle = 0;
			this.tank.boids.push(b);
		}
		// make dinner
		this.tank.foods.forEach( x => x.Kill() );
		this.tank.foods.length = 0;
		for ( let i=0; i < this.settings.num_foods; i++ ) {
			let food = new Food( this.tank.width - spawn_x, this.tank.height - spawn_y );
			food.vx = Math.random() * 10 - 5;
			food.vy = Math.random() * 100 - 50;
			this.tank.foods.push(food);
		}
	}
	
	Update( delta ) {
		this.stats.round.time += delta;
		
		// keep the food coming
		if ( this.tank.foods.length < this.settings.num_foods ) {
			let diff = this.settings.num_foods - this.tank.foods.length;
			for ( let i=0; i < diff; i++ ) {
				let food = new Food( this.tank.width * Math.random(), this.tank.height * Math.random() );
				food.vx = Math.random() * 10 - 5;
				food.vy = Math.random() * 100 - 50;
				this.tank.foods.push(food);
			}	
		}
			
		// reset the round if we hit time
		if ( this.stats.round.time && this.stats.round.time >= this.settings.time ) { 
			// record stats
			this.stats.round.num++;
			this.stats.round.time = 0;
			this.stats.round.best_score = 0;
			this.stats.round.avg_score = 0;
			let avg = 0;
			let best = 0;
			for ( let b of this.tank.boids ) {
				avg += b.total_fitness_score || 0;
				best = Math.max(b.total_fitness_score||0, best);
			}
			avg /= this.tank.boids.length || 1;
			this.stats.round.avg_score = avg;
			this.stats.round.best_score = best;
			this.stats.best_score = Math.max(this.stats.best_score, this.stats.round.best_score);
			this.stats.best_avg_score = Math.max(this.stats.best_avg_score, this.stats.round.avg_score);
			this.stats.chartdata.averages.push(avg);
			this.stats.chartdata.highscores.push(best);
			
			// FIXME: EXTERNALIZE AND RECONNECT
			// simulatorChart.data.labels.push(this.stats.round.num);
			// simulatorChart.update();
			
			// remove deadbeats
			if ( this.settings.min_score !== null ) {
				this.tank.boids.filter( x => x.total_fitness_score < this.settings.min_score ).forEach( x => x.Kill() );
			}
			this.tank.boids = this.tank.boids.filter( x => !x.dead );
			// sort boids by sensor score ASC
			this.tank.boids.sort( (a,b) => a.total_fitness_score - b.total_fitness_score );
			// cull the herd, keep the winners
			const numkill = Math.trunc(this.tank.boids.length * this.settings.cullpct);
			this.tank.boids.splice(0,numkill).forEach( x=> x.Kill() );
			// create boids to make up the difference
			let n = this.settings.num_boids;
			let diff = n - this.tank.boids.length;
			if ( diff > 0 ) {
				const parent_selection = this.tank.boids.slice();
				for ( let i=0; i < diff; i++ ) {
					let parent = parent_selection.length ? parent_selection[ Math.trunc( Math.random() * parent_selection.length ) ] : null;
					let species = parent ? parent.species : this.settings.species;
					let b = BoidFactory( species, 0, 0, this.tank );
					if ( parent ) {
						b.brain = neataptic.Network.fromJSON(parent.brain.toJSON());
						for ( let j=0; j < this.settings.max_mutation; j++ ) { 
							let option = this.settings.mutation_options[ Math.trunc(Math.random() * this.settings.mutation_options.length) ];
							b.brain.mutate(option);
							// TODO: drop any nodes that have no connections
						}
						// inherit body geometry stuff
						// TODO -- THIS IS REALLY UGLY
						b.bodyplan.geo.remove(); // out with the old
						b.bodyplan = parent.bodyplan.Copy(); // in with the new
						b.container.add([b.bodyplan.geo]);
						b.bodyplan.Mutate(); // for fun!
					}
					// if no survivors, it automatically has a randomly generated brain
					this.tank.boids.push(b);
				}			
			}
			// reset entire population
			let new_angle = Math.random() * Math.PI * 2;
			let spawn_x = (Math.random() > 0.5 ? 0.25 : 0.75) * this.tank.width; 
			let spawn_y = (Math.random() > 0.5 ? 0.25 : 0.75) * this.tank.height; 			
			for ( let b of this.tank.boids ) {
				b.total_fitness_score = 0;
				b.angle = new_angle;
				b.x = spawn_x;
				b.y = spawn_y;
				b.angmo = 0;
				b.inertia = 0;
				b.energy = b.max_energy;
			}
			// respawn food
			this.tank.foods.forEach( x => x.Kill() );
			this.tank.foods.length = 0;
			for ( let i=0; i < this.settings.num_foods; i++ ) {
				let food = new Food( this.tank.width - spawn_x, this.tank.height - spawn_y );
				food.vx = Math.random() * 10 - 5;
				food.vy = Math.random() * 100 - 50;
				this.tank.foods.push(food);
			}			
			// // move the food
			// for ( let food of this.tank.foods ) {
			// 	food.x = food.geo.position.x = this.tank.width - spawn_x;
			// 	food.y = food.geo.position.y = this.tank.height - spawn_y;
			// 	food.vx = 0; // Math.random() * 10 - 5;
			// 	food.vy = Math.random() * 100 - 50;
			// 	food.value = 100;
			// }
		}
		// end simulation code ------/\--------------------------
	}	
}