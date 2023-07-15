import Tank from '../classes/class.Tank.js'
import Food from '../classes/class.Food.js'
import { BoidFactory } from '../classes/class.Boids.js'
import neataptic from "neataptic";

export default class Simulation {

	constructor( tank, settings ) {
		this.tank = tank || new Tank( this.tank.width, this.tank.height );
		this.settings = {
			max_mutation: 5, // up to
			cullpct: 0.4, // 0..1
			min_score: null,
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
				neataptic.methods.mutation.MOD_ACTIVATION,
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
			framenum: 0,
			delta: 0
		};
		this.turbo = false;
		this.onUpdate = null;
		this.onRound = null;
		this.onComplete = null; // not implemented
	}
	
	Setup() {
		// sterilize the tank
		this.tank.boids.forEach( x => x.Kill() );
		this.tank.boids.length = 0;
		this.tank.foods.forEach( x => x.Kill() );
		this.tank.foods.length = 0;
	}
	
	Reset() {
		// inherit me	
	}
	
	ScoreBoidPerFrame(b) {
		// inherit me
	}
	
	Update( delta ) {
		// house keeping
		this.stats.round.time += delta;
		this.stats.delta = delta;
		this.stats.framenum++;
		// score boids on performance
		for ( let b of this.tank.boids ) { this.ScoreBoidPerFrame(b); }
		// reset the round if we hit time
		if ( this.stats.round.time && this.stats.round.time >= this.settings.time ) { 
			// final scoring
			for ( let b of this.tank.boids ) { this.ScoreBoidPerRound(b); }
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
			this.Reset();
			if ( typeof(this.onRound) === 'function' ) { this.onRound(this); }
		}
					
		if ( typeof(this.onUpdate) === 'function' ) { this.onUpdate(this); }
		
	}	
	
	SetNumBoids(x) {
		this.settings.num_boids = parseInt(x);
		let diff = this.settings.num_boids - this.tank.boids.length;
		if ( diff > 0 ) {
			for ( let i=0; i < diff; i++ ) {
				// const b = BoidFactory(world.use_species, Math.random()*world.width, Math.random()*world.height );
				const b = BoidFactory(this.settings.species, this.tank.width*0.25, this.tank.height*0.25, this.tank );
				b.angle = Math.random() * Math.PI * 2;
				this.tank.boids.push(b);
			}			
		}
		else if ( diff < 0 ) {		
			this.tank.boids.splice(0,-diff).forEach( x => x.Kill() );
		}
	}
}

export class FoodChaseSimulation extends Simulation {
	Setup() {
		super.Setup(); // sterilize
		// starting population
		let spawn_x = (Math.random() > 0.5 ? 0.25 : 0.75) * this.tank.width; 
		let spawn_y = (Math.random() > 0.5 ? 0.25 : 0.75) * this.tank.height; 	
		for ( let i=0; i < this.settings.num_boids; i++ ) {
			const b = BoidFactory(this.species, spawn_x, spawn_y, this.tank );
			// b.angle = 0;
			this.tank.boids.push(b);
		}
		// make dinner
		for ( let i=0; i < this.settings.num_foods; i++ ) {
			let food = new Food( this.tank.width - spawn_x, this.tank.height - spawn_y );
			food.vx = Math.random() * 10 - 5;
			food.vy = Math.random() * 100 - 50;
			this.tank.foods.push(food);
		}
	}
	Reset() {
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
			b.total_fitness_score = 0;
			b.fitness_score = 0;
			b.total_movement_cost = 0;
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
	}	
	ScoreBoidPerFrame(b) {
		// record energy used for later
		b.total_movement_cost = (b.total_movement_cost || 0 ) + ( b.last_movement_cost || 0 );
		// calculate score for this frame	
		b.fitness_score = 0;
		// record travel distance or lack thereof
		if ( !b.total_fitness_score ) { 
			b.startx = b.x;
			b.starty = b.y;
			b.total_fitness_score = 0.01; // wink
		}
		else {
			b.max_travel = b.max_travel || 0;
			let travel = Math.abs(b.x - b.startx) + Math.abs(b.y - b.starty);
			if ( travel >  b.max_travel ) {
				b.total_fitness_score += (travel - b.max_travel) / 500;
				b.max_travel = travel;
			}
		}
		// sensor collision detection				
		b.fitness_score = 0;
		let score_div = 0;
		for ( let s of b.sensors ) {
			if ( s.detect=='food' ) { 
				score_div++;
				b.fitness_score += s.val;
				// inner sensor is worth more
				if ( s.name=="touch" ) { b.fitness_score += s.val * 3; }
				// outer awareness sensor is worth less.
				if ( s.name=="awareness" ) { b.fitness_score -= s.val * 0.9; }
			}
		}
		b.fitness_score /= score_div;
		// eat food, get win!
		for ( let food of this.tank.foods ) { 
			const dx = Math.abs(food.x - this.x);
			const dy = Math.abs(food.y - this.y);
			const d = Math.sqrt(dx*dx + dy*dy);
			let r = Math.max( this.width, this.length );
			if ( d <= r + food.r ) { this.fitness_score += 25; }
		}		
		b.total_fitness_score += b.fitness_score * this.stats.delta * 18; // extra padding just makes numbers look good
	}	
	ScoreBoidPerRound(b) {
		let div = this.settings.time;
		if ( b.total_movement_cost ) {
			b.total_fitness_score /= (b.total_movement_cost || 0) / div;
		}
	}	
	Update(delta) {
		super.Update(delta);
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
	}	
}