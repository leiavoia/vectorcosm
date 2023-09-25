import Tank from '../classes/class.Tank.js'
import Food from '../classes/class.Food.js'
import Rock from '../classes/class.Rock.js'
import * as utils from '../util/utils.js'
import { BoidFactory } from '../classes/class.Boids.js'
import neataptic from "neataptic";
import {Circle} from 'collisions';
import { PendantLettuce, VectorGrass } from '../classes/class.Plant.js'

export default class Simulation {

	constructor( tank, settings ) {
		this.tank = tank || new Tank( this.tank.width, this.tank.height );
		this.settings = {
			max_mutation: 8, // up to
			cullpct: 0.6, // 0..1
			min_score: null,
			// width: 0,
			// height: 0,
			num_boids: 40,
			num_foods: 1,
			time: 30, // in seconds
			// end: {
			// 	rounds: 5,
			// 	avg_score: 10,	
			// 	avg_score_rounds: 5
			// },
			species: 'Boid',
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
		this.complete = false;
		this.onUpdate = null;
		this.onRound = null;
		this.onComplete = null; // not implemented
	}
	
	Sterilize() {
		// sterilize the tank
		this.tank.boids.forEach( x => x.Kill() );
		this.tank.boids.length = 0;
		this.tank.foods.forEach( x => x.Kill() );
		this.tank.foods.length = 0;
		this.tank.plants.forEach( x => x.Kill() );
		this.tank.plants.length = 0;
	}
	
	// inherit me	
	Setup() {
		if ( this.settings?.scale ) {
			window.vc.SetViewScale( this.settings.scale );
			window.vc.ResizeTankToWindow();
		}	
	}
	
	Reset() {
		// inherit me	
	}
	
	ScoreBoidPerFrame(b) {
		// inherit me
	}
	
	ScoreBoidPerRound(b) {
		// inherit me
	}
	
	Update( delta ) {
		if ( this.complete ) { return; }
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
			// if this is the first round, record the raw value instead of comparing
			if ( this.stats.round.num===1 ) {
				this.stats.best_score = this.stats.round.best_score;
				this.stats.best_avg_score = this.stats.round.avg_score;
			}
			// otherwise pick the best of the bunch
			else {
				this.stats.best_score = Math.max(this.stats.best_score, this.stats.round.best_score);
				this.stats.best_avg_score = Math.max(this.stats.best_avg_score, this.stats.round.avg_score);
			}
			this.stats.chartdata.averages.push(avg);
			this.stats.chartdata.highscores.push(best);
			
			// remove deadbeats
			if ( this.settings.min_score !== null ) {
				this.tank.boids.filter( x => x.total_fitness_score < this.settings.min_score ).forEach( x => x.Kill() );
			}
			this.tank.boids = this.tank.boids.filter( x => !x.dead );
			// sort boids by fitness score ASC
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
					// pick from the end of the selection
					let parent = parent_selection.length 
						? parent_selection[ utils.BiasedRandInt(0,parent_selection.length-1,parent_selection.length-1,0.8) ] 
						: null;
					let species = parent ? parent.species : this.settings?.species;
					let b = parent ? parent.Copy(true,true) : BoidFactory( species, 0, 0, this.tank );
					if ( parent ) {
						b.MutateBrain( utils.BiasedRandInt( 0, this.settings.max_mutation, this.settings.max_mutation, 0.8 ) );
					}
					// if no survivors, it automatically has a randomly generated brain
					this.tank.boids.push(b);
				}			
			}
			this.Reset();
			if ( typeof(this.onRound) === 'function' ) { this.onRound(this); }
			// check if entire simulation is over
			let end_sim = false;
			if ( this.settings.end?.rounds && this.stats.round.num > this.settings.end.rounds ) {
				end_sim = true;
			}
			else if ( this.settings.end?.avg_score && this.stats.round.avg_score > this.settings.end.avg_score ) {
				// check if there is a minimum number of rounds we need to sustain this average
				if ( !this.settings.end?.avg_score_rounds ) { this.settings.end.avg_score_rounds = 0; }
				this.stats.end_avg_score_round = (this.stats.end_avg_score_round || 0) + 1;
				if ( this.stats.end_avg_score_round >= this.settings.end.avg_score_rounds ) {
					end_sim = true;
				}
			}
			if ( end_sim ) {
				this.complete = true;
				if ( typeof(this.onComplete) === 'function' ) { this.onComplete(this); }
			}
		}
		if ( typeof(this.onUpdate) === 'function' ) { this.onUpdate(this); }
	}	
	
	SetNumBoids(x) {
		this.settings.num_boids = parseInt(x);
		let diff = this.settings.num_boids - this.tank.boids.length;
		if ( diff > 0 ) {
			for ( let i=0; i < diff; i++ ) {
				// const b = BoidFactory(world.use_species, Math.random()*world.width, Math.random()*world.height );
				const b = BoidFactory(this.settings?.species, this.tank.width*0.25, this.tank.height*0.25, this.tank );
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
		super.Setup();
		// starting population
		let spawn_x = (Math.random() > 0.5 ? 0.25 : 0.75) * this.tank.width; 
		let spawn_y = (Math.random() > 0.5 ? 0.25 : 0.75) * this.tank.height; 	
		for ( let i=this.tank.boids.length; i < this.settings.num_boids; i++ ) {
			const b = BoidFactory(this.settings?.species, spawn_x, spawn_y, this.tank );
			// b.angle = 0;
			this.tank.boids.push(b);
		}
		this.Reset();
	}
	Reset() {
		// reset entire population
		let spawn_x = (Math.random() > 0.5 ? 0.25 : 0.75) * this.tank.width; 
		let spawn_y = (Math.random() > 0.5 ? 0.25 : 0.75) * this.tank.height; 			
		let new_angle = Math.random() * Math.PI * 2;
		for ( let b of this.tank.boids ) {
			if ( this.settings?.random_boid_pos ) {
				spawn_x = Math.random() * this.tank.width; 
				spawn_y = Math.random() * this.tank.height; 			
			}
			b.Reset();
			b.angle = new_angle;
			b.x = spawn_x;
			b.y = spawn_y;
			b.total_fitness_score = 0;
			b.fitness_score = 0;
			b.total_movement_cost = 0;
		}
		// respawn food
		this.tank.foods.forEach( x => x.Kill() );
		this.tank.foods.length = 0;
		for ( let i=0; i < this.settings.num_foods; i++ ) {
			if ( this.settings?.random_food_pos ) {
				spawn_x = Math.random() * this.tank.width; 
				spawn_y = Math.random() * this.tank.height; 			
			}
			let food = new Food( this.tank.width - spawn_x, this.tank.height - spawn_y );
			let food_speed = this.settings?.food_speed || 100;
			food.vx = Math.random() * food_speed - (food_speed*0.5);
			food.vy = Math.random() * food_speed - (food_speed*0.5);
			food.edibility = this.settings?.edibility ?? food.edibility;
			this.tank.foods.push(food);
		}
		// randomize rocks
		this.tank.obstacles.forEach( x => x.Kill() );
		this.tank.obstacles.length = 0;	
		let num_rocks = this.settings?.num_rocks || 0;
		let margin = 200;
		for ( let i =0; i < num_rocks; i++ ) {
			const xscale = utils.RandomFloat(0.2,1.0);
			const yscale = utils.RandomFloat(0.2,1.0);
			let rock = new Rock( {
				x: utils.RandomInt(margin,this.tank.width-margin)-200, 
				y: utils.RandomInt(margin,this.tank.height-margin)-150, 
				w: xscale * Math.sqrt( utils.BiasedRandInt(150,this.tank.width*0.5, 400, 0.9) * utils.BiasedRandInt(150,this.tank.width*0.5, 400, 0.9) ), 
				h: yscale * Math.sqrt( utils.BiasedRandInt(150,this.tank.height*0.5, 400, 0.9) * utils.BiasedRandInt(150,this.tank.height*0.5, 400, 0.9) ), 
				complexity: 2
			})
			this.tank.obstacles.push(rock);
		}
		// plants
		this.tank.plants.forEach( x => x.Kill() );
		this.tank.plants.length = 0;
		const num_plants = this.settings?.num_plants;
		if ( num_plants > 0 ) {
			for ( let n=0; n < num_plants; n++ ) {
				const rock = this.tank.obstacles.pickRandom();
				if ( rock ) {
					const p = rock.pts.pickRandom(); 
					const type = Math.random() < 0.30 ? PendantLettuce : VectorGrass;
					const plant = new type( rock.x+p[0], rock.y+p[1] );
					this.tank.plants.push(plant);
					window.vc.AddShapeToRenderLayer( plant.geo, /* Math.random() > 0.5 ? '+1' : */ '-2' );
				}
			}
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
				b.fitness_score += s.val * ( 20 / Math.max( b.body.width, b.body.length ) ); // bigger creatures get less score
			}
		}
		b.fitness_score /= score_div;
		// eat food, get win!
		for ( let food of this.tank.foods ) { 
			const dx = Math.abs(food.x - b.x);
			const dy = Math.abs(food.y - b.y);
			const d = Math.sqrt(dx*dx + dy*dy);
			let r = Math.max( b.body.width, b.body.length ) / 2;
			let touching = r + food.r;
			const margin = 150;
			if ( d < touching + margin && food.IsEdibleBy(b) ) {
				// small bonus for getting close
				let score = ( margin - ( d - touching ) ) / margin ;
				b.fitness_score += score * ( 20 / Math.max( b.body.width, b.body.length ) );  // bigger creatures get less score
				// big points if touching
				if ( d <= touching ) { 
					b.fitness_score += 5 * ( 20 / Math.max( b.body.width, b.body.length ) );  // bigger creatures get less score
				}
			}
						
		}		
		// total score		
		b.total_fitness_score += b.fitness_score * this.stats.delta * 18; // extra padding just makes numbers look good
	}	
	ScoreBoidPerRound(b) {
		if ( b.total_movement_cost ) {
			let cps = (b.total_movement_cost || 0) / this.settings.time; // cost per second
			b.total_fitness_score *= utils.Clamp(5/cps,0.1,3); // /!\ MAGICNUMBERZ
		}
	}	
	Update(delta) {
		super.Update(delta);
		const food_friction = typeof(this.settings?.food_friction) === 'boolean' ? this.settings.food_friction : false;
		// keep the food coming
		if ( this.tank.foods.length < this.settings.num_foods ) {
			let diff = this.settings.num_foods - this.tank.foods.length;
			for ( let i=0; i < diff; i++ ) {
				let food = new Food( this.tank.width * Math.random(), this.tank.height * Math.random() );
				let food_speed = this.settings?.food_speed ?? 100;
				food.vx = Math.random() * food_speed - (food_speed*0.5);
				food.vy = Math.random() * food_speed - (food_speed*0.5);
				food.edibility = this.settings?.edibility ?? food.edibility;
				food.frictionless = !food_friction;
				this.tank.foods.push(food);
			}	
		}	 
		const margin = this.settings?.food_bounce_margin ?? 250;
		for ( let f of this.tank.foods ) {
			if ( f.x < margin ) { f.vx = -f.vx; }
			if ( f.y < margin ) { f.vy = -f.vy; }
			if ( f.x > this.tank.width-margin ) { f.vx = -f.vx; }
			if ( f.y > this.tank.height-margin ) { f.vy = -f.vy; }
			f.frictionless = !food_friction;
		}
		// river current
		if ( this.settings?.current ) { 
			for ( const b of this.tank.boids ) {
				b.momentum_x -= Math.pow( ( 1-(b.y / this.tank.height) ), 3 ) * delta * this.settings.current;
				if ( b.x <= 5 ) { b.Kill(); } // left edge death
			}
			for ( const b of this.tank.foods ) {
				if ( !b.frictionless ) { 
					b.vx -= Math.pow( ( 1-(b.y / this.tank.height) ), 3 ) * delta * this.settings.current;
				}
				if ( b.x <= b.r ) { b.Kill(); } // left edge death
			}
		}
		
	}	
}

export class BasicTravelSimulation extends Simulation {
	Setup() {
		super.Setup();
		this.Reset();
	}
	Reset() {
		this.SetNumBoids( this.settings.num_boids ); // top up the population
		// reset entire population
		let spawn_x = 0.05 * this.tank.width; 
		let spawn_y = 0.5 * this.tank.height; 	
		for ( let b of this.tank.boids ) {
			let angle_spread = this.settings?.angle_spread || 0;
			let angle = 0 + (Math.random()*angle_spread*2 - angle_spread);
			b.Reset();
			b.angle = angle;
			b.x = spawn_x;
			b.y = spawn_y;
			b.total_fitness_score = this.tank.width; // golf!
			b.fitness_score = 0;
			b.total_movement_cost = 0;
		}
		// check for deflection angle settings
		let target_spread = this.settings?.target_spread || 0;
		// respawn food
		this.tank.foods.forEach( x => x.Kill() );
		this.tank.foods.length = 0;
		let food = new Food( 
			this.tank.width * 0.7 + (Math.random()*target_spread*2 - target_spread), 
			this.tank.height * 0.5 + (Math.random()*target_spread*2 - target_spread)
		);
		food.vx = 0;
		food.vy = 0;
		food.edibility = 1; // universal edibility
		this.tank.foods.push(food);
	}	
	ScoreBoidPerFrame(b) {
		// record minimum distance to food circle
		const food = this.tank.foods[0];
		if ( food ) { 
			const dx = Math.abs(food.x - b.x);
			const dy = Math.abs(food.y - b.y);
			const d = Math.sqrt(dx*dx + dy*dy);
			b.total_fitness_score = Math.min( d, b.total_fitness_score );
		}
	}	
	ScoreBoidPerRound(b) {
		b.total_fitness_score = -b.total_fitness_score || 0; // golf!
	}	
	Update(delta) {
		super.Update(delta);
		// keep the food coming
		this.tank.foods[0].value = 80; // artificially inflate the food instead of respawning new ones.
		if ( !this.tank.foods.length ) {
			let target_spread = this.settings?.target_spread || 0;
			let food = new Food( 
				this.tank.width * 0.7 + (Math.random()*target_spread*2 - target_spread), 
				this.tank.height * 0.5 + (Math.random()*target_spread*2 - target_spread)
			);
			food.vx = 0;
			food.vy = 0;
			food.edibility = 1; // universal edibility
			this.tank.foods.push(food);	
		}	 
	}		
}

export class TurningSimulation extends Simulation {
	Setup() {
		super.Setup();
		this.Reset();
	}
	Reset() {
		this.SetNumBoids( this.settings.num_boids ); // top up the population
		// reset entire population
		let spawn_x = 0.5 * this.tank.width; 
		let spawn_y = 0.5 * this.tank.height; 	
		let angle = Math.random() * Math.PI * 2;
		for ( let b of this.tank.boids ) {
			b.Reset();
			b.angle = angle;
			b.x = spawn_x;
			b.y = spawn_y;
			b.total_fitness_score = 10000; // golf!
			b.fitness_score = 0;
			b.total_movement_cost = 0;
		}
		// respawn food
		this.tank.foods.forEach( x => x.Kill() );
		this.tank.foods.length = 0;
		let r = 100 + Math.random() * 200;
		angle = Math.random() * Math.PI * 2;
		let dx = r * Math.cos(angle); 
		let dy = r * Math.sin(angle);
		let food = new Food( this.tank.width*0.5 + dx, this.tank.height*0.5 + dy );
		food.vx = 0;
		food.vy = 0;
		food.edibility = 1; // universal edibility
		this.tank.foods.push(food);
	}	
	ScoreBoidPerFrame(b) {
		// record minimum distance to food circle
		const food = this.tank.foods[0];
		if ( food ) { 
			const dx = Math.abs(food.x - b.x);
			const dy = Math.abs(food.y - b.y);
			const d = Math.sqrt(dx*dx + dy*dy);
			b.total_fitness_score = Math.min( d, b.total_fitness_score );
		}
	}	
	ScoreBoidPerRound(b) {
		b.total_fitness_score = -b.total_fitness_score || 0; // golf!
	}	
	Update(delta) {
		super.Update(delta);
		// keep the food coming
		this.tank.foods[0].value = 80; // artificially inflate the food instead of respawning new ones.
		if ( !this.tank.foods.length ) {
			let r = 100 + Math.random() * 200;
			let angle = Math.random() * Math.PI * 2;
			let dx = r * Math.cos(angle); 
			let dy = r * Math.sin(angle);
			let food = new Food( this.tank.width*0.5 + dx, this.tank.height*0.5 + dy );
			food.vx = 0;
			food.vy = 0;
			food.edibility = 1; // universal edibility
			this.tank.foods.push(food);
		}	 
	}		
}

export class AvoidEdgesSimulation extends Simulation {
	Setup() {
		super.Setup();
		this.Reset();
	}
	Reset() {
		this.SetNumBoids( this.settings.num_boids ); // top up the population
		// reset entire population
		let spawn_x = 0.05 * this.tank.width; 
		let spawn_y = 0.5 * this.tank.height; 	
		for ( let b of this.tank.boids ) {
			let angle_spread = this.settings?.angle_spread || 0;
			let angle = 0 + (Math.random()*angle_spread*2 - angle_spread);
			b.Reset();
			b.angle = angle;
			b.x = spawn_x;
			b.y = spawn_y;
			b.total_fitness_score = this.tank.width; // golf!
			b.fitness_score = 0;
			b.total_movement_cost = 0;
		}
		
		if ( this.settings.spiral) {
			let max_size = this.settings?.max_segment_spread || 200;
			let tunnel_width = max_size * Math.random() + 60;
			let w = this.tank.width;
			let h = this.tank.height;
			let edge_size = 20;
			
			// put boids in the bottom left corner
			let spawn_x = (edge_size + tunnel_width/2);
			let spawn_y = (edge_size + tunnel_width/2); 
			for ( let b of this.tank.boids ) {
				b.x = spawn_x;
				b.y = spawn_y;
			}
			
			// make a c-shape obstacle course
			this.tank.obstacles.forEach( x => x.Kill() );
			this.tank.obstacles.length = 0;
			
			// edge the map
			this.tank.obstacles.push(
				new Rock( { 
					x: 0,
					y: 0,
					hull: [
						[ 0, 0 ],
						[ w, 0 ],
						[ w, edge_size ],
						[ 0, edge_size ]
					],
					complexity: 0
				}),
				new Rock( { 
					x: 0,
					y: h - edge_size,
					hull: [
						[ 0, 0 ],
						[ w, 0 ],
						[ w, edge_size ],
						[ 0, edge_size ]
					],
					complexity: 0
				}),
				new Rock( { 
					x: 0,
					y: 0,
					hull: [
						[ 0, 0 ],
						[ edge_size, 0 ],
						[ edge_size, h ],
						[ 0, h ]
					],
					complexity: 0
				}),
				new Rock( { 
					x: w - edge_size,
					y: 0,
					hull: [
						[ 0, 0 ],
						[ edge_size, 0 ],
						[ edge_size, h ],
						[ 0, h ]
					],
					complexity: 0
				}),
				// interior
				new Rock( { 
					y: edge_size + tunnel_width,
					x: 0,
					hull: [
						[ 0, 0 ],
						[ w - (edge_size + tunnel_width), 0 ],
						[ w - (edge_size + tunnel_width), h - (2*(edge_size + tunnel_width)) ],
						[ 0, h - (2*(edge_size + tunnel_width)) ]
					],
					complexity: 0
				}),
			);
				
			// food goes along tunnel with special data to act as progress markers
			this.tank.foods.forEach( x => x.Kill() );
			this.tank.foods.length = 0;
			let food_num = 0;
			let food_spacing = 100;
			for ( let x = (edge_size + tunnel_width/2); x < w - (edge_size + tunnel_width/2); x += food_spacing ) {
				let food = new Food( x, (edge_size + tunnel_width/2) );
				food.vx = 0;
				food.vy = 0;
				food.goal = food_num++;
				food.edibility = 1; // universal edibility
				this.tank.foods.push(food);
			}
			for ( let y = (edge_size + tunnel_width/2); y < h - (edge_size + tunnel_width/2); y += food_spacing ) {
				let food = new Food( w - (edge_size + tunnel_width/2), y );
				food.vx = 0;
				food.vy = 0;
				food.goal = food_num++;
				food.edibility = 1; // universal edibility
				this.tank.foods.push(food);
			}
			for ( let x = w - (edge_size + tunnel_width/2); x > (edge_size + tunnel_width/2); x -= food_spacing ) {
				let food = new Food( x, h- (edge_size + tunnel_width/2) );
				food.vx = 0;
				food.vy = 0;
				food.goal = food_num++;
				food.edibility = 1; // universal edibility
				this.tank.foods.push(food);
			}
			
		
		}
		
		else if ( this.settings.tunnel ) {
			// randomize rocks
			this.tank.obstacles.forEach( x => x.Kill() );
			this.tank.obstacles.length = 0;
			
			let max_size = this.settings?.max_segment_spread || 200;
			let joints = this.settings?.segments || 7;
			let jwidth = this.tank.width / joints;
			let last_shift = 0;
			let size = Math.random() * max_size + 50;
			for ( let j=0; j < joints; j++ ) { 
				let shift = Math.random() > 0.5 ? size : -size;
				// shift is zero if first point
				if ( j==0 ) { shift = 0; }
				this.tank.obstacles.push(
					new Rock( { 
						x: jwidth * j,
						y: 0,
						hull: [
							[ 0, 0 ],
							[ jwidth, 0 ],
							[ jwidth, (this.tank.height/2 + shift)-size ],
							[ 0, (this.tank.height/2 + last_shift)-size, ]
						],
						complexity: 2
					}),
					new Rock( { 
						x: jwidth * j,
						y: this.tank.height / 2,
						hull: [
							[ 0, last_shift+size ],
							[ jwidth, shift+size ],
							[ jwidth, this.tank.height/2 ],
							[ 0, this.tank.height/2 ]
						],
						complexity: 2
					})
				);	
				last_shift = shift;	
			}	
			// food goes at the end of the tunnel
			this.tank.foods.forEach( x => x.Kill() );
			this.tank.foods.length = 0;
			let food = new Food( 
				this.tank.width,
				this.tank.height/2 + last_shift
			);
			food.vx = 0;
			food.vy = 0;
			food.edibility = 1; // universal edibility
			this.tank.foods.push(food);
		}
		else {
			this.tank.obstacles.forEach( x => x.Kill() );
			this.tank.obstacles.length = 0;
			let num_rocks = this.settings?.num_rocks || 0;
			for ( let j=0; j < num_rocks; j++ ) { 
				this.tank.obstacles.push(
					new Rock( { 
						x: (this.tank.width / 2) + (Math.random() * (this.tank.width / 4)),
						y: (this.tank.height / 4) + (Math.random() * (this.tank.height / 4)),
						w: (Math.random() * 200 + 50),
						h: (Math.random() * 100 + 50),
						force_corners: false,
						complexity: 2
					}),
				);	
			}	
			// food goes at the end of the tunnel
			this.tank.foods.forEach( x => x.Kill() );
			this.tank.foods.length = 0;
			let food = new Food( 
				this.tank.width,
				this.tank.height/2
			);
			food.vx = 0;
			food.vy = 0;
			food.edibility = 1; // universal edibility
			this.tank.foods.push(food);
		}
	}	
	ScoreBoidPerFrame(b) {
		// punished for getting close to the edge
		// b.sensors.filter( s => s.detect=='obstacles' )
		// .forEach( s => b.punishment = (b.punishment||0) + s.val );
		if ( b.collision.contact_obstacle ) {
			b.punishment = (b.punishment || 0) + ( this.settings?.punishment || 0.2 ); 
		}
		
		// score by furthest marker
		if ( this.settings.spiral ) {
			// manually check to see if we are touching a marker
			let my_radius = 100; // Math.max(b.length, b.width) * 0.5;
			let candidates = this.tank.grid.GetObjectsByBox( 
				b.x - my_radius,
				b.y - my_radius,
				b.x + my_radius,
				b.y + my_radius
			);
			// console.log(candidates.length + ' cand');
			for ( let o of candidates ) {
				const circle  = new Circle(b.x, b.y, my_radius);
				const circle2  = new Circle(o.x, o.y, o.r);
				if ( circle.collides(circle2) ) {
					b.best_goal = Math.max(b.best_goal||0,o.goal||0);
				}
			}
		}
		
		// record minimum distance to food circle
		else {
			const food = this.tank.foods[0];
			if ( food ) { 
				const dx = Math.abs(food.x - b.x);
				const dy = Math.abs(food.y - b.y);
				const d = Math.sqrt(dx*dx + dy*dy);
				b.total_fitness_score = Math.min( d, b.total_fitness_score );
			}
		}		
		
		
	}	
	ScoreBoidPerRound(b) {
		if ( this.settings.spiral ) {
			b.total_fitness_score = b.best_goal * 100;
		}
		else {
			let food_proximity_bonus = this.settings?.food_proximity_bonus || 1;
			b.total_fitness_score = food_proximity_bonus * (this.tank.width - (b.total_fitness_score || 0)); // golf!
		}
		b.total_fitness_score -= b.punishment;
	}	
	Update(delta) {
		super.Update(delta);
		// keep the food coming
		for ( let f of this.tank.foods ) {
			f.value = 80; // artificially inflate the food instead of respawning new ones.
		}
		// if ( !this.tank.foods.length ) {
		// 	let r = 100 + Math.random() * 200;
		// 	let angle = Math.random() * Math.PI * 2;
		// 	let dx = r * Math.cos(angle); 
		// 	let dy = r * Math.sin(angle);
		// 	let food = new Food( this.tank.width*0.5 + dx, this.tank.height*0.5 + dy );
		// 	food.vx = 0;
		// 	food.vy = 0;
		//	food.edibility = 1; // universal edibility
		// 	this.tank.foods.push(food);
		// }	 
	}	
}
		
		