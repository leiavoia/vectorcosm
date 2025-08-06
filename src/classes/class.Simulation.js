import Tank from '../classes/class.Tank.js'
import TankMaker from '../classes/class.TankMaker.js'
import Food from '../classes/class.Food.js'
import Rock from '../classes/class.Rock.js'
import * as utils from '../util/utils.js'
import { BoidFactory } from '../classes/class.Boids.js'
import SimulationLibrary from "./SimulationLibrary.js"
import {Circle} from 'collisions'
import { RandomPlant } from '../classes/class.Plant.js'
import PubSub from 'pubsub-js'
import {CompoundStatTracker} from '../classes/class.StatTracker.js'

export function SimulationFactory( tank, name_or_settings ) {
	// random pick from the library
	if ( name_or_settings == 'random' ) {
		name_or_settings = Object.values( SimulationLibrary )
			// don't include perpetual stuff or natural tank
			.filter( x => x.rounds > 0 && x.rounds < 1000 )
			.pickRandom();
	}
	// named sim
	else if ( name_or_settings in SimulationLibrary ) {
		name_or_settings = SimulationLibrary[name_or_settings];
	}
	let our_settings = structuredClone(name_or_settings);
	let simtype = our_settings?.simtype || 'Simulation';
	switch ( simtype ) {
		case 'NaturalTankSimulation': return new NaturalTankSimulation( tank, our_settings );
		case 'FoodChaseSimulation': return new FoodChaseSimulation( tank, our_settings );
		case 'TurningSimulation': return new TurningSimulation( tank, our_settings );
		case 'AvoidEdgesSimulation': return new AvoidEdgesSimulation( tank, our_settings );
		case 'CombatSimulation': return new CombatSimulation( tank, our_settings );
		case 'FinishingSimulation': return new FinishingSimulation( tank, our_settings );
		default: return new Simulation( tank, our_settings );
	}
}

export default class Simulation {

	constructor( tank, settings ) {
		this.tank = tank || new Tank( tank.width, tank.height );
		this.settings = {
			max_mutation: 0.1, // 0..1
			cullpct: 0.6, // 0..1
			min_score: null,
			num_boids: 40,
			num_foods: 1,
			num_plants: 0,
			num_rocks: 0,
			add_decor: false,
			timeout: 30, // in seconds
			// 	rounds: 5,
			// 	min_avg_score: 10,	
			// 	min_avg_score_rounds: 5
			species: 'random',
			fruiting_speed: 1.0,
			onExtinction: 'random',
			speciation_rate: 0,
			tally_freq: 5 // how often to flush the tally and record stats
		};
		if ( settings ) {
			this.settings = Object.assign(this.settings, settings);
		}
		this.stats = {
			best_score: 0,
			best_avg_score: 0,
			best_brain: null,
			round_time:0,
			round_num: 0,
			round_best_score: 0,
			round_avg_score: 0,
			framenum: 0,
			delta: 0,
			chartdata: {
				averages: [],
				highscores: []
			},
			// at 10-second intervals, we get about 3 hours of recording
			records: new CompoundStatTracker( 
				{ numLayers: 4, base: 10, recordsPerLayer: 30, stats:[
				'boids',
				'foods',
				'plants',
				'boid_mass',
				'food_mass',
				'species',
				'avg_age',
				'births',
				'deaths',
				'food_eaten',
				'energy_used',
				'bites',
				'kills',
			] }),
			tally: {}, // accumulator for point-in-time stats which get recorded periodically
			last_tally: 0, // tracks to time next tally flush
		};
		// send record updates to the frontend if anyone cares
		this.stats.records.onInsert = ( data, layer ) => {
			PubSub.publishSync('records.push', {data, layer} );
		};
		this.complete = false;
	}
	
	// records a numerical statistic to the tally sheet / accumulator
	RecordStat( name, value ) {
		if ( !this.stats.tally[ name ] ) { this.stats.tally[ name ] = 0; }
		this.stats.tally[ name ] += value;
	}
	
	// add all tally sheet data to the long term records
	FlushTally() {
		const time_since_last_flush = this.stats.round_time - this.stats.last_tally;
		if ( time_since_last_flush >= this.settings.tally_freq ) {
			this.CalculatePeriodicStats();
			this.stats.records.Insert( this.stats.tally );
			for ( let k in this.stats.tally ) {
				this.stats.tally[k] = 0;
			};	
			this.stats.last_tally = this.stats.round_time;
		}
	}
	
	// surveys all objects in the tank and records stats that observe totals and averages.
	// if you need accumulated stats (calories burned, kills, deaths, births, etc),
	// then use RecordStat() throughout the code to record events when they happen.
	CalculatePeriodicStats() {
		this.RecordStat( 'boids', this.tank.boids.length );
		this.RecordStat( 'foods', this.tank.foods.length );
		this.RecordStat( 'plants', this.tank.plants.length );
		this.RecordStat( 'boid_mass', this.tank.boids.reduce( (a,c) => a + c.mass, 0 ) );
		this.RecordStat( 'food_mass', this.tank.foods.reduce( (a,c) => a + c.value, 0 ) );
		this.RecordStat( 'avg_age', this.tank.boids.reduce( (a,c) => a + c.age, 0 ) );
		let species = new Set();
		for ( let b of globalThis.vc.tank.boids ) {
			species.add(b.species);
		}
		this.RecordStat( 'species', species.size );
	}
	
	// inherit me	
	Setup() {
		// clean up any residual messes from the previous sim
		this.tank.marks.forEach( x => x.Kill() );	
		this.tank.marks.length = 0;		
		this.tank.obstacles.forEach( x => x.Kill() );
		this.tank.obstacles.length = 0;		
		this.tank.foods.forEach( x => x.Kill() );
		this.tank.foods.length = 0;		
		// resize tank for the new sim	
		if ( this.settings?.volume ) {
			globalThis.vc.ResizeTankByVolume( this.settings.volume );
		}
		PubSub.publish('sim.new', this);
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
	
	UpdateTankEnvironment(delta) {
		// circular current
		if ( this.settings?.current ) {
			const max_current = 5000; 
			for ( let b of this.tank.boids ) {
				const cell = this.tank.datagrid.CellAt(b.x,b.y);
				if ( cell ) { 
					b.momentum_x -= cell.current_x * this.settings.current * max_current * delta;
					b.momentum_y -= cell.current_y * this.settings.current * max_current * delta;
				}
			}
			for ( let b of this.tank.foods ) {
				if ( !b.frictionless ) { 
					const cell = this.tank.datagrid.CellAt(b.x,b.y);
					if ( cell ) { 
						b.vx -= cell.current_x * this.settings.current * max_current * delta;
						b.vy -= cell.current_y * this.settings.current * max_current * delta;
					}
				}
			}
		}
		// invasive species
		if ( this.settings?.invasives ) {
			const freq = this.settings?.invasives_freq || 500;
			const next = this.next_invasive ?? freq;
			const t = Math.floor( this.stats.round_time );
			if ( t > next ) {
				for ( let i=0; i < this.settings.invasives; i++ ) { 
					this.AddNewBoidToTank();
				}
				this.next_invasive = next + freq;
			}
		}
		// tide
		if ( this.settings?.tide ) {
			const tide_freq = this.settings.tide;
			const tide_duration = 3;
			const wave_reps = 5;
			if ( (tide_freq/2 + this.stats.round_time) % tide_freq < tide_duration * wave_reps ) {
				const tidal_force = this.tank.height * Math.random() + this.tank.height * Math.random() + this.tank.height * Math.random();
				const t = (tide_freq/2 + this.stats.round_time) % tide_freq;
				const scale = Math.sin( (t * Math.PI) / (tide_duration * wave_reps) );
				for ( let b of this.tank.boids ) {
					const y_off = b.y / this.tank.height;
					const x_off = b.x / this.tank.width;
					let wave = ( t * Math.PI * 2 ) / ( tide_duration );
					wave *= x_off;
					wave = Math.sin(wave);
					b.momentum_y -= wave * scale * tidal_force * delta;
					b.momentum_x -= wave * scale * tidal_force * delta * 0.2;
				}
				for ( let b of this.tank.foods ) {
					if ( !b.frictionless ) { 
						const y_off = b.y / this.tank.height;
						const x_off = b.x / this.tank.width;
						let wave = ( t * Math.PI * 2 ) / ( tide_duration );
						wave *= x_off;
						wave = Math.sin(wave);
						b.vy -= wave * scale * tidal_force * delta;
						b.vx -= wave * scale * tidal_force * delta * 0.2;
					}
				}
			}		
		}	
	}
	
	Update( delta ) {
		if ( this.complete ) { return; }
		if ( this.killme ) {
			PubSub.publishSync('sim.complete', this);
			return;
		}
		// extinction check
		if ( this.tank.boids.length === 0 ) {
			if ( typeof(this.settings.onExtinction) === 'function' ) {
				this.settings.onExtinction();
			}
			else if ( this.settings.onExtinction === 'random' ) {
				this.SetNumBoids( this.settings.num_boids );
			}
		}
		// run of the mill
		this.UpdateTankEnvironment(delta);
		// house keeping
		this.stats.round_time += delta;
		this.stats.delta = delta;
		this.stats.framenum++;
		this.FlushTally();
		// score boids on performance
		if ( this.settings.timeout ) { // endless sims (time=0) don't need to waste CPU cycles
			for ( let b of this.tank.boids ) { this.ScoreBoidPerFrame(b); }
		}
		// reset the round if we hit time
		if ( this.settings.timeout && this.stats.round_time && this.stats.round_time >= this.settings.timeout ) { 
			// final scoring
			for ( let b of this.tank.boids ) { this.ScoreBoidPerRound(b); }
			// record stats
			this.stats.round_num++;
			this.stats.round_time = 0;
			this.stats.round_best_score = 0;
			this.stats.round_avg_score = 0;
			let avg = 0;
			let best = 0;
			for ( let b of this.tank.boids ) {
				avg += b.total_fitness_score || 0;
				best = Math.max(b.total_fitness_score||0, best);
			}
			avg /= this.tank.boids.length || 1;
			this.stats.round_avg_score = avg;
			this.stats.round_best_score = best;
			// if this is the first round, record the raw value instead of comparing
			if ( this.stats.round_num===1 ) {
				this.stats.best_score = this.stats.round_best_score;
				this.stats.best_avg_score = this.stats.round_avg_score;
			}
			// otherwise pick the best of the bunch
			else {
				this.stats.best_score = Math.max(this.stats.best_score, this.stats.round_best_score);
				this.stats.best_avg_score = Math.max(this.stats.best_avg_score, this.stats.round_avg_score);
			}
			this.stats.chartdata.averages.push(avg);
			this.stats.chartdata.highscores.push(best);
			
			let segments = this.settings?.segments || 1;
			let per_segment = Math.floor( this.settings.num_boids / segments );
			
			// separate the entire population into equal portions
			let populations = [];
			if ( segments > 1 ) {
				for ( let i=0; i < segments; i++ ) {
					if ( this.tank.boids.length ) {
						populations.push(
							this.tank.boids.splice(0,per_segment)
						);
					}
				}
				// if there are any extra, they just die
				if ( this.tank.boids.length ) {
					populations[ populations.length-1 ].push( ...this.tank.boids.splice(0,this.tank.boids.length) );
				}	
			}
			// shortcut for single segment simulations
			else {
				populations.push( this.tank.boids ); // alias
			}
				
			// treat each population separately								
			for ( let population of populations ) {
				// remove deadbeats
				if ( this.settings.min_score !== null ) {
					population.filter( x => x.total_fitness_score < this.settings.min_score ).forEach( x => x.Kill('culled') );
				}
				population.filter( x => !x.dead );
				// sort boids by fitness score ASC
				population.sort( (a,b) => a.total_fitness_score - b.total_fitness_score );
				// cull the herd, keep the winners
				const numkill = Math.trunc(population.length * this.settings.cullpct);
				population.splice(0,numkill).forEach( x=> x.Kill('culled') );
				// create boids to make up the difference
				let diff = per_segment - population.length;	
				if ( diff > 0 ) {
					const mutation_rate = utils.Clamp( this.settings?.max_mutation || 0, 0, 1 );
					const dna_mutation_rate = utils.Clamp( this.settings?.dna_mutation_rate || mutation_rate, 0, 1 );
					const brain_mutation_rate = utils.Clamp( this.settings?.brain_mutation_rate || mutation_rate, 0, 1 );
					const speciation_rate = utils.Clamp( globalThis.vc?.simulation?.settings?.speciation_rate || 0, 0, 1 );
					const parent_selection = population.slice();
					const parentPicker = new utils.RandomPicker(
						parent_selection.map( b => [b,b.total_fitness_score]) 
					);
					for ( let i=0; i < diff; i++ ) {
						let parent = parent_selection.length ? parentPicker.Pick() : null;
						let species = parent ? parent.species : this.settings?.species;
						let b = parent 
							? parent.Copy(true, dna_mutation_rate, brain_mutation_rate, speciation_rate) 
							: BoidFactory( species, 0, 0, this.tank ) ;
						// if no survivors, it automatically has a randomly generated brain
						population.push(b);
					}			
				}
				// put the separate populations back into the tank
				if ( segments > 1 ) {
					this.tank.boids.push( ...population );
				}
			}
			
		
			this.Reset();
			PubSub.publishSync('sim.round', this);
			// check if entire simulation is over
			let end_sim = false; // you can mark "killme" to terminate early 
			if ( this.settings.rounds && this.stats.round_num > this.settings.rounds ) {
				end_sim = true;
			}
			else if ( this.settings?.min_avg_score && this.stats.round_avg_score > this.settings?.min_avg_score ) {
				// check if there is a minimum number of rounds we need to sustain this average
				if ( !this.settings?.min_avg_score_rounds ) { this.settings.min_avg_score_rounds = 0; }
				this.stats.min_avg_score_round = (this.stats.min_avg_score_round || 0) + 1;
				if ( this.stats.min_avg_score_round >= this.settings.min_avg_score_rounds ) {
					end_sim = true;
				}
			}
			if ( end_sim ) {
				this.complete = true;
				PubSub.publishSync('sim.complete', this);
			}
		}
		PubSub.publishSync('sim.update', this);
	}	
	
	SetNumBoids(x) {
		this.settings.num_boids = parseInt(x);
		// if this simulation has segments, total population must be a multiple
		if ( this.settings.segments ) {
			let diff = this.settings.num_boids % this.settings.segments;
			if ( diff ) { this.settings.num_boids -= diff; }
		} 
		let diff = this.settings.num_boids - this.tank.boids.length;
		if ( diff > 0 ) {
			for ( let i=0; i < diff; i++ ) {
				this.AddNewBoidToTank();
			}			
		}
		else if ( diff < 0 ) {		
			this.tank.boids.splice(0,-diff).forEach( x => x.Kill('overpopulated') );
		}
	}
	
	AddNewBoidToTank() {
		const b = BoidFactory(this.settings?.species, 0, 0, this.tank);
		this.AddBoidToTank(b);
	}
	
	AddBoidToTank(b) {
		b.angle = Math.random() * Math.PI * 2;
		b.x = (Math.random() * this.tank.width * 0.8) + this.tank.width * 0.1; // stay away from edges
		b.y = (Math.random() * this.tank.height * 0.6) + this.tank.height * 0.1; // stay away from edges
		if ( this.settings?.safe_spawn && this.tank.safe_pts?.length ) {
			const p = this.tank.safe_pts.pickRandom();
			b.x = p[0] + ( Math.random() * p[2]*1.4 - p[2]*0.7 ); 
			b.y = p[1] + ( Math.random() * p[2]*1.4 - p[2]*0.7 ); 
		}		
		this.tank.boids.push(b);	
	}
	
	SetNumRocks(x) {
		this.settings.num_rocks = parseInt(x).clamp(0,200);
		this.tank.obstacles.forEach( x => x.Kill() );
		this.tank.obstacles.length = 0;	
		if ( this.settings?.num_rocks ) {
			let margin = 150;
			const xscale = utils.RandomFloat(0.2,1.2);
			const yscale = 1.4-xscale; // utils.RandomFloat(0.2,1.5);
			const blunt = Math.random() > 0.5;
			const max_size = Math.min( this.tank.width*0.6, this.tank.height*0.6 );
			const min_size = Math.max( max_size * 0.05, 150 );
			for ( let i =0; i < this.settings.num_rocks; i++ ) {
				let rock = new Rock( {
					x: utils.RandomInt(margin,this.tank.width-margin)-200, 
					y: utils.RandomInt(margin,this.tank.height-margin)-150, 
					w: xscale * utils.MapToRange( utils.shapeNumber( Math.random(), 0, 1, 0.75, 1.5 ), 0, 1, min_size, max_size ), 
					h: yscale * utils.MapToRange( utils.shapeNumber( Math.random(), 0, 1, 0.5, 1.5 ), 0, 1, min_size, max_size ), 
					complexity: utils.RandomInt(0,2),
					new_points_respect_hull: false,
					blunt
				})
				this.tank.obstacles.push(rock);
			}
			if ( Math.random() > 0.5 ) {
				this.tank.SeparateRocks(margin);
			}
		}
		// substrate and placed stones
		if ( this.settings?.add_decor ) {
			// we can also take a random chance to add decor
			if ( this.settings.add_decor === true || Math.random() <= parseFloat( this.settings.add_decor ) ) {
				this.tank.MakePrettyDecor();
			}
		}
		// redefine safe spawn points now that landscape has changed
		this.tank.FindSafeZones();
		
		// plants grow on rocks, so resetting rocks resets plants too
		this.SetNumPlants(this.settings.num_plants || 0);
	}
	
	SetNumPlants(x) {
		this.settings.num_plants = parseInt(x).clamp(0,200);
		this.tank.plants.forEach( x => x.Kill() );
		this.tank.plants.length = 0;
		for ( let n=0; n < this.settings.num_plants; n++ ) {
			const rock = this.tank.obstacles.pickRandom();
			if ( rock ) {
				// with safe spawning
				if ( this.tank.safe_pts?.length ) {
					// create a ray from a random safe point to the random rock
					const safe_pt = this.tank.safe_pts.pickRandom();
					// find the widest points of the rock to create an arc to shoot between
					let least_angle = 10000;
					let most_angle = -10000;
					let most_x = 0;
					let most_y = 0;
					for ( let p of rock.pts ) {
						let dx = (rock.x + p[0]) - safe_pt[0]; 
						let dy = (rock.y + p[1]) - safe_pt[1];
						const angle = Math.atan2( dy, dx ); // y goes first
						if ( angle < least_angle ) { least_angle = angle; }  
						if ( angle > most_angle ) { most_angle = angle; }  
						if ( Math.abs(dx) > most_x ) { most_x = dx; }  
						if ( Math.abs(dy) > most_y ) { most_y = dy; }  
						// if the difference between angles is greater than pi, object is in the rear.
						// wrap the least angle around so it makes numeric sense on the next step. 
						if ( most_angle - least_angle > Math.PI ) {
							const tmp = most_angle;
							most_angle = least_angle + Math.PI  * 2;
							least_angle = tmp;
						}
					}
					// pick the final striking angle
					const angle = utils.RandomFloat( least_angle, most_angle );
					
					// iterate over all rocks that might collide with the ray
					let length = Math.abs(most_x) + Math.abs(most_y); // work down from here.
					let target_x = 0;
					let target_y = 0; 
					let candidates = this.tank.grid.GetObjectsByBox( 
						Math.min( safe_pt[0], safe_pt[0] + most_x ),
						Math.min( safe_pt[1], safe_pt[1] + most_y ),
						Math.max( safe_pt[0], safe_pt[0] + most_x ),
						Math.max( safe_pt[1], safe_pt[1] + most_y ),
						o => o instanceof Rock
					);
					for ( let o of candidates ) {
						const ax1 = safe_pt[0];
						const ay1 = safe_pt[1];
						const ax2 = safe_pt[0] + (length * Math.cos(angle)); 
						const ay2 = safe_pt[1] + (length * Math.sin(angle));
						for( let i=0; i < o.collision.hull.length; i++ ) {
							const next	= i+1 >= o.collision.hull.length ? 0 : i+1;
							const bx1	= o.x + o.collision.hull[i][0];
							const by1	= o.y + o.collision.hull[i][1];
							const bx2	= o.x + o.collision.hull[next][0];
							const by2	= o.y + o.collision.hull[next][1];
							const intersect = utils.getLineIntersection(ax1, ay1, ax2, ay2, bx1, by1, bx2, by2);
							if ( intersect ) {
								// console.log(intersect);
								// calculate distance to intersect point
								const dx = Math.abs( intersect.x - ax1 );
								const dy = Math.abs( intersect.y - ay1 );
								const d = Math.sqrt( dx * dx + dy * dy );
								if ( d < length ) {
									length = d;
									target_x = intersect.x;	
									target_y = intersect.y;	
								}
							}
						}
					}
					// now make the actual plant
					const plant = RandomPlant( target_x, target_y );
					if ( 'RandomizeAge' in plant ) { plant.RandomizeAge(); }
					this.tank.plants.push(plant);
				}
				// no safe spawning
				else {
					const p = rock.pts.pickRandom(); 
					const plant = RandomPlant( rock.x+p[0], rock.y+p[1] );
					if ( 'RandomizeAge' in plant ) { plant.RandomizeAge(); }
					this.tank.plants.push(plant);
				}
			}
		}
	}
}

export class NaturalTankSimulation extends Simulation {
	Setup() {
		// rounds is always zero
		this.settings.rounds = 0;
		this.settings.timeout = 0;
		super.Setup();
		this.Reset();
	}
	Reset() {
		// make default decor
		if ( this.settings?.random_terrain ) {
			const tm = new TankMaker( this.tank, {} );
			tm.Make();
		}
		// randomize rocks
		else if ( this.settings?.num_rocks ) {
			this.SetNumRocks(this.settings?.num_rocks);
		}
		// substrate and placed stones
		if ( this.settings?.add_decor ) { 
			this.tank.MakePrettyDecor();
		}
		// plants
		if ( this.settings?.num_plants ) { 
			this.SetNumPlants(this.settings?.num_plants);
		}
		// clean up any messes
		this.tank.marks.forEach( x => x.Kill() );		
		this.tank.foods.forEach( x => x.Kill() );
		this.tank.foods.length = 0;			
		// reset existing population
		let spawn_x = (Math.random() > 0.5 ? 0.25 : 0.75) * this.tank.width; 
		let spawn_y = (Math.random() > 0.5 ? 0.25 : 0.75) * this.tank.height; 			
		let new_angle = Math.random() * Math.PI * 2;
		for ( let b of this.tank.boids ) {
			if ( this.settings?.random_boid_pos ) {
				spawn_x = Math.random() * this.tank.width; 
				spawn_y = Math.random() * this.tank.height; 			
				if ( this.settings?.safe_spawn && this.tank.safe_pts?.length ) {
					const p = this.tank.safe_pts.pickRandom();
					spawn_x = p[0] + ( Math.random() * p[2]*1.4 - p[2]*0.7 ); 
					spawn_y = p[1] + ( Math.random() * p[2]*1.4 - p[2]*0.7 ); 
				}
			}
			b.Reset();
			b.angle = ( this.settings?.random_boid_angle ? (Math.random() * Math.PI * 2) : new_angle ),
			b.x = spawn_x;
			b.y = spawn_y;
			b.total_fitness_score = 0;
			b.fitness_score = 0;
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
			this.tank.boids.push(b);
		}
		this.Reset();
	}
	Reset() {
		// clean up any messes
		this.tank.marks.forEach( x => x.Kill() );		
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
			b.angle = ( this.settings?.random_boid_angle ? (Math.random() * Math.PI * 2) : new_angle ),
			b.x = spawn_x;
			b.y = spawn_y;
			b.total_fitness_score = 0;
			b.fitness_score = 0;
		}
		// respawn food
		this.tank.foods.forEach( x => x.Kill() );
		this.tank.foods.length = 0;
		for ( let i=0; i < this.settings.num_foods; i++ ) {
			if ( this.settings?.random_food_pos ) {
				spawn_x = Math.random() * this.tank.width; 
				spawn_y = Math.random() * this.tank.height; 			
			}
			let food_speed = this.settings?.food_speed || 100;
			let food = new Food( {
				x: this.tank.width - spawn_x, 
				y: this.tank.height - spawn_y,
				value: (this.settings?.food_value || 500),
				vx: Math.random() * food_speed - (food_speed*0.5),
				vy: Math.random() * food_speed - (food_speed*0.5),
				edibility: this.settings?.edibility ?? 0,
				permafood: this.settings?.permafood ?? false,
				phantomfood: this.settings?.phantomfood ?? false,
				lifespan: this.settings?.food_lifespan ?? 1000,
			} );
			this.tank.foods.push(food);
		}
		// randomize rocks
		if ( this.settings?.num_rocks ) {
			this.SetNumRocks(this.settings?.num_rocks);
		}
		// substrate and placed stones
		else if ( this.settings?.add_decor ) { 
			this.tank.MakePrettyDecor();
		}
		// plants
		if ( this.settings?.num_plants ) { 
			this.SetNumPlants(this.settings?.num_plants);
		}
	}	
	ScoreBoidPerFrame(b) {
		// calculate score for this frame	
		b.fitness_score = 0;
		// record travel distance or lack thereof
		if ( !b.total_fitness_score ) { 
			b.startx = b.x;
			b.starty = b.y;
			b.total_fitness_score = 0.01; // wink
		}
		else if ( this.settings?.score_on_travel ) {
			b.max_travel = b.max_travel || 0;
			let travel = Math.abs(b.x - b.startx) + Math.abs(b.y - b.starty);
			if ( travel >  b.max_travel ) {
				b.total_fitness_score += (travel - b.max_travel) / 500;
				b.max_travel = travel;
			}
		}
		// eat food, get win!
		b.fitness_score = 0;
		for ( let food of this.tank.foods ) {
			if ( !food.IsEdibleBy(b) ) { continue; }
		 	if ( b.ignore_list && b.ignore_list.has(food) ) { continue; }
			const dx = Math.abs(food.x - b.x);
			const dy = Math.abs(food.y - b.y);
			const d = Math.sqrt(dx*dx + dy*dy);
			let touching = b.collision.radius + food.collision.radius;
			const margin = 150;
			if ( this.settings?.score_on_proximity && d < touching + margin ) {
				// small bonus for getting close
				let score = ( margin - ( d - touching ) ) / margin ;
				b.fitness_score += score * ( 20 / Math.max( b.body.width, b.body.length ) );  // bigger creatures get less score
			}
			// big points if touching
			if ( d <= touching ) { 
				b.fitness_score += 5 * ( 20 / Math.max( b.body.width, b.body.length ) );  // bigger creatures get less score
			}
						
		}		
		// total score		
		b.total_fitness_score += b.fitness_score * this.stats.delta * 18; // extra padding just makes numbers look good
	}	
	ScoreBoidPerRound(b) {

	}	
	Update(delta) {
		super.Update(delta);
		const food_friction = typeof(this.settings?.food_friction) === 'boolean' ? this.settings.food_friction : false;
		// keep the food coming
		if ( this.settings.num_foods && this.tank.foods.length < this.settings.num_foods ) {
			let diff = this.settings.num_foods - this.tank.foods.length;
			for ( let i=0; i < diff; i++ ) {
				let food_speed = this.settings?.food_speed ?? 100;
				let food = new Food( {
					x: this.tank.width * Math.random(), 
					y: this.tank.height * Math.random(),
					value: (this.settings?.food_value || 500),
					vx: Math.random() * food_speed - (food_speed*0.5),
					vy: Math.random() * food_speed - (food_speed*0.5),
					edibility: this.settings?.edibility ?? 0,
					frictionless: !food_friction,
					permafood: this.settings?.permafood ?? false,
					phantomfood: this.settings?.phantomfood ?? false,
					lifespan: this.settings?.food_lifespan ?? 1000,
				} );				
				this.tank.foods.push(food);
			}	
		}
		// enable food to bounce around the map to create a chase target	
		if ( !food_friction  ) {
			const margin = this.settings?.food_bounce_margin ?? 250;
			for ( let f of this.tank.foods ) {
				if ( f.x < margin ) { f.vx = -f.vx; }
				if ( f.y < margin ) { f.vy = -f.vy; }
				if ( f.x > this.tank.width-margin ) { f.vx = -f.vx; }
				if ( f.y > this.tank.height-margin ) { f.vy = -f.vy; }
				f.frictionless = !food_friction;
			}
		}
	}	
}

export class FinishingSimulation extends Simulation {
	Setup() {
		super.Setup();
		// starting population
		let spawn_x = (Math.random() > 0.5 ? 0.25 : 0.75) * this.tank.width; 
		let spawn_y = (Math.random() > 0.5 ? 0.25 : 0.75) * this.tank.height; 	
		for ( let i=this.tank.boids.length; i < this.settings.num_boids; i++ ) {
			const b = BoidFactory(this.settings?.species, spawn_x, spawn_y, this.tank );
			this.tank.boids.push(b);
		}
		this.Reset();
	}
	Reset() {
		// clean up any messes
		this.tank.marks.forEach( x => x.Kill() );		
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
			b.angle = ( this.settings?.random_boid_angle ? (Math.random() * Math.PI * 2) : new_angle ),
			b.x = spawn_x;
			b.y = spawn_y;
			b.total_fitness_score = 0;
			b.fitness_score = 0;
		}
		// respawn food
		this.tank.foods.forEach( x => x.Kill() );
		this.tank.foods.length = 0;
		for ( let i=0; i < this.settings.num_foods; i++ ) {
			if ( this.settings?.random_food_pos ) {
				spawn_x = Math.random() * this.tank.width; 
				spawn_y = Math.random() * this.tank.height; 			
			}
			let food_speed = this.settings?.food_speed || 100;
			let food = new Food( {
				x: this.tank.width - spawn_x, 
				y: this.tank.height - spawn_y,
				value: (this.settings?.food_value || 500),
				vx: Math.random() * food_speed - (food_speed*0.5),
				vy: Math.random() * food_speed - (food_speed*0.5),
				edibility: this.settings?.edibility ?? 0,
				permafood: this.settings?.permafood ?? false,
				phantomfood: this.settings?.phantomfood ?? false,
				lifespan: this.settings?.food_lifespan ?? 1000,
			} );
			this.tank.foods.push(food);
		}
		// randomize rocks
		if ( this.settings?.num_rocks ) {
			this.SetNumRocks(this.settings?.num_rocks);
		}
		// substrate and placed stones
		else if ( this.settings?.add_decor ) { 
			this.tank.MakePrettyDecor();
		}
		// plants
		if ( this.settings?.num_plants ) { 
			this.SetNumPlants(this.settings?.num_plants);
		}
	}	
	ScoreBoidPerFrame(b) {
		// fecundity
		let index = -1;
		for ( let i=0; i < b.sensor_labels.length; i++ ) {
			if ( b.sensor_labels[i].match('itosis') ) {
				index = i;
				break;
			}
		}
		if ( index ) {
			// find corresponding motor minimum action required
			for ( let m of b.motors ) {
				if ( m.hasOwnProperty('mitosis') && b.sensor_outputs[index] >= m.min_act ) {
					b.total_fitness_score += this.stats.delta;
					break;
				}
			}
		}
	}	
	ScoreBoidPerRound(b) {
		// food
		b.total_fitness_score += 5 * b.stats.food.bites;
		b.total_fitness_score += 3 * ( b.stats.food.required / b.mass ) * 10;
		b.total_fitness_score -= 1 * ( b.stats.food.toxin_dmg / b.mass ) * 10;
		b.total_fitness_score -= 1 * ( b.stats.food.deficit_dmg / b.mass ) * 10;
		// attacks
		// b.total_fitness_score += 2 * b.stats.combat.attacks;
		// b.total_fitness_score -= 2 * b.stats.combat.attacks_received;
	}	
	Update(delta) {
		super.Update(delta);
		const food_friction = typeof(this.settings?.food_friction) === 'boolean' ? this.settings.food_friction : false;
		// keep the food coming
		if ( this.settings.num_foods && this.tank.foods.length < this.settings.num_foods ) {
			let diff = this.settings.num_foods - this.tank.foods.length;
			for ( let i=0; i < diff; i++ ) {
				let food_speed = this.settings?.food_speed ?? 100;
				let food = new Food( {
					x: this.tank.width * Math.random(), 
					y: this.tank.height * Math.random(),
					value: (this.settings?.food_value || 500),
					vx: Math.random() * food_speed - (food_speed*0.5),
					vy: Math.random() * food_speed - (food_speed*0.5),
					edibility: this.settings?.edibility ?? 0,
					frictionless: !food_friction,
					permafood: this.settings?.permafood ?? false,
					phantomfood: this.settings?.phantomfood ?? false,
					lifespan: this.settings?.food_lifespan ?? 1000,
				} );				
				this.tank.foods.push(food);
			}	
		}
	}	
}

export class CombatSimulation extends Simulation {
	Setup() {
		super.Setup();
		this.Reset();
	}
	Reset() {
		// randomize rocks
		if ( this.settings?.num_rocks ) {
			this.SetNumRocks(this.settings?.num_rocks);
		}
		// reset entire population
		this.SetNumBoids( this.settings.num_boids ); // top up the population
		let spawn_x = (Math.random() > 0.5 ? 0.25 : 0.75) * this.tank.width; 
		let spawn_y = (Math.random() > 0.5 ? 0.25 : 0.75) * this.tank.height; 			
		let new_angle = Math.random() * Math.PI * 2;
		for ( let b of this.tank.boids ) {
			if ( this.settings?.random_boid_pos ) {
				spawn_x = Math.random() * this.tank.width; 
				spawn_y = Math.random() * this.tank.height; 			
			}
			b.Reset();
			b.angle = ( this.settings?.random_boid_angle ? (Math.random() * Math.PI * 2) : new_angle ),
			b.x = spawn_x;
			b.y = spawn_y;
			b.total_fitness_score = 0;
			b.fitness_score = 0;
		}
	}	
	ScoreBoidPerRound(b) {
		let per_segment = Math.floor( this.settings.num_boids / ( this.settings.segments || 1 ) );
		let segment = Math.floor( this.tank.boids.indexOf(b) / per_segment );
		let has_attack = b.motors.find( m => m.hasOwnProperty('attack') );
		// defenders - even numbered segments
		if ( segment % 2 === 0 ) {
			// filter out attackers entirely
			if ( has_attack ) { 
				b.total_fitness_score = 0;
			}
			else {
				b.total_fitness_score = ( this.settings.timeout / 2 ) - b.stats.combat.attacks_received;
			}
		}
		// attackers - odd numbered segments
		else {
			if ( !has_attack ) { 
				b.total_fitness_score = 0;
			}
			else {
				b.total_fitness_score = b.stats.combat.attacks;
			}
		}
	}	
}

export class TurningSimulation extends Simulation {
	Setup() {
		super.Setup();
		this.Reset();
	}
	Reset() {
		// randomize rocks
		if ( this.settings?.num_rocks ) {
			this.SetNumRocks(this.settings?.num_rocks);
		}	
		// clean up any messes
		this.tank.marks.forEach( x => x.Kill() );
		// respawn food
		this.tank.foods.forEach( x => x.Kill() );
		this.tank.foods.length = 0;
		const num_foods = this.settings?.num_foods || 1;
		let angle = Math.random() * Math.PI * 2;
		for ( let i=1; i <= num_foods; i++ ) { 
			const distance = (this.settings?.distance || 300 ) * i;
			const distance_variance = (this.settings?.distance_variance || 0.3);
			const distance_offset = distance * distance_variance * Math.random();
			let r = distance - distance_offset * 0.5;
			if ( i===1 ) { this.min_distance_to_score = r; }
			else {
				angle = angle + /* (this.settings?.angle_spread || 1 ) *  */utils.RandomFloat(-0.45,0.45);
			}
			let dx = r * Math.cos(angle); 
			let dy = r * Math.sin(angle);
			let food = new Food( this.tank.width*0.5 + dx, this.tank.height*0.5 + dy );
			food.vx = 0;
			food.vy = 0;
			food.edibility = 1; // universal edibility
			food.value = 1000;
			food.permafood = true;
			this.tank.foods.push(food);
		}
		// reset entire population
		this.SetNumBoids( this.settings.num_boids ); // top up the population
		let spawn_x = 0.5 * this.tank.width; 
		let spawn_y = 0.5 * this.tank.height; 	
		let angle_spread = (this.settings?.angle_spread || 0 ) * utils.RandomFloat(0.25,1);
		this.last_side = Math.random() < 0.5 ? -1 : 1; // alternate randomly between right and left
		angle_spread = angle_spread * this.last_side;
		angle += utils.mod( angle_spread, Math.PI * 2 );
		for ( let b of this.tank.boids ) {
			b.Reset();
			b.angle = angle;
			b.x = spawn_x;
			b.y = spawn_y;
			b.total_fitness_score = this.min_distance_to_score * this.tank.foods.length; // golf!
			b.fitness_score = 0;
			b.food_scores = new Array( this.tank.foods.length ).fill(this.min_distance_to_score);
		}
	}	
	ScoreBoidPerFrame(b) {
		// record minimum distance to food circle that is LESS than the scoring threshold
		if ( !b.food_scores ) { 
			b.food_scores = new Array( this.tank.foods.length ).fill(this.min_distance_to_score); 
		}
		for ( let i=0; i < this.tank.foods.length; i++ ) {
			const food = this.tank.foods[i];
			const dx = Math.abs(food.x - b.x);
			const dy = Math.abs(food.y - b.y);
			const d = Math.sqrt(dx*dx + dy*dy);
			b.food_scores[i] = Math.min( d, b.food_scores[i], this.min_distance_to_score );
		}
	}	
	ScoreBoidPerRound(b) { // golf!
		let food_score = b.food_scores.reduce( (a,c) => a+c, 0 );
		const base = this.min_distance_to_score * this.tank.foods.length;
		// we need to flip the score upside down so it look good on a graph
		b.total_fitness_score = ( base - food_score ) / base * 100;
	}	
}

export class AvoidEdgesSimulation extends Simulation {
	Setup() {
		super.Setup();
		this.Reset();
	}
	Reset() {
		// top up the population
		this.SetNumBoids( this.settings.num_boids );
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
		}
		
		// clear food
		this.tank.foods.forEach( x => x.Kill() );
		this.tank.foods.length = 0;
				
		if ( this.settings.spiral) {
			let max_size = this.settings?.max_segment_spread || 200;
			let tunnel_width = max_size * Math.random() + 120;
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
			);
			// interior
			let rock_height = ( h - ( 2*edge_size + 3*tunnel_width) ) / 2;
			this.tank.obstacles.push(
				new Rock( { 
					y: edge_size + tunnel_width,
					x: 0,
					hull: [
						[ 0, 0 ],
						[ w - (edge_size + tunnel_width), 0 ],
						[ w - (edge_size + tunnel_width), rock_height ],
						[ 0, rock_height ]
					],
					complexity: 0
				}),
				new Rock( { 
					y: edge_size + 2*tunnel_width + rock_height,
					x: edge_size + tunnel_width,
					hull: [
						[ 0, 0 ],
						[ w - (edge_size + tunnel_width), 0 ],
						[ w - (edge_size + tunnel_width), rock_height ],
						[ 0, rock_height ]
					],
					complexity: 0
				}),
			);
				
			// food goes along tunnel with special data to act as progress markers
			let food_num = 0;
			let food_spacing = 250;
			for ( let x = (edge_size + tunnel_width/2); x < w - (edge_size + tunnel_width/2); x += food_spacing ) {
				let food = new Food( x, (edge_size + tunnel_width/2) );
				food.vx = 0;
				food.vy = 0;
				food.goal = food_num++;
				food.edibility = 1; // universal edibility
				food.permafood = true;
				this.tank.foods.push(food);
			}
			for ( let y = (edge_size + tunnel_width); y < h*0.5; y += food_spacing ) {
				let food = new Food( w - (edge_size + tunnel_width/2), y );
				food.vx = 0;
				food.vy = 0;
				food.goal = food_num++;
				food.edibility = 1; // universal edibility
				food.permafood = true;
				this.tank.foods.push(food);
			}
			for ( let x = w - (edge_size + tunnel_width/2); x > (edge_size + tunnel_width/2) ; x -= food_spacing ) {
				let food = new Food( x, (edge_size + tunnel_width/2) + (rock_height + tunnel_width) );
				food.vx = 0;
				food.vy = 0;
				food.goal = food_num++;
				food.edibility = 1; // universal edibility
				food.permafood = true;
				this.tank.foods.push(food);
			}
			for ( let y = h*0.5; y < h - (edge_size + tunnel_width); y += food_spacing ) {
				let food = new Food( (edge_size + tunnel_width/2), y );
				food.vx = 0;
				food.vy = 0;
				food.goal = food_num++;
				food.edibility = 1; // universal edibility
				food.permafood = true;
				this.tank.foods.push(food);
			}
			for ( let x = (edge_size + tunnel_width/2); x < w - (edge_size + tunnel_width/2); x += food_spacing ) {
				let food = new Food( x, (edge_size + tunnel_width/2) + 2 * (rock_height + tunnel_width) );
				food.vx = 0;
				food.vy = 0;
				food.goal = food_num++;
				food.edibility = 1; // universal edibility
				food.permafood = true;
				this.tank.foods.push(food);
			}
		}
		
		else if ( this.settings.tunnel ) {
			// randomize rocks
			this.tank.obstacles.forEach( x => x.Kill() );
			this.tank.obstacles.length = 0;
			
			let max_size = this.settings?.max_segment_spread || 200;
			let min_size = this.settings?.min_segment_spread || 70;
			let joints = this.settings?.joints || 7;
			let jwidth = this.tank.width / joints;
			let last_shift = 0;
			let size = Math.random() * max_size + min_size;
			for ( let j=0; j < joints; j++ ) { 
				let shift = Math.random() > 0.5 ? size : -size;
				let nudge = Math.random() > 0.5 ? (shift/6) : (-shift/6);
				// shift is zero if first point
				if ( j==0 ) { shift = 0; }
				this.tank.obstacles.push(
					new Rock( { 
						x: jwidth * j,
						y: 0,
						hull: [
							[ 0, 0 ],
							[ jwidth, 0 ],
							[ jwidth, (this.tank.height/2 + shift + nudge)-size ],
							[ 0, (this.tank.height/2 + last_shift + nudge)-size, ]
						],
						complexity: 2
					}),
					new Rock( { 
						x: jwidth * j,
						y: this.tank.height / 2,
						hull: [
							[ 0, last_shift+size + nudge ],
							[ jwidth, shift+size + nudge ],
							[ jwidth, this.tank.height/2 ],
							[ 0, this.tank.height/2 ]
						],
						complexity: 2
					})
				);	
				last_shift = shift;	
			}	
			// food goes at the end of the tunnel
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
			let food = new Food( 
				this.tank.width,
				this.tank.height/2
			);
			food.vx = 0;
			food.vy = 0;
			food.edibility = 1; // universal edibility
			food.permafood = true;
			this.tank.foods.push(food);
		}
	}	
	ScoreBoidPerFrame(b) {
		
		// score by furthest marker
		if ( this.settings.spiral ) {
			// manually check to see if we are touching a marker
			let my_radius = 100; // Math.max(b.length, b.width) * 0.5;
			let candidates = this.tank.grid.GetObjectsByBox( 
				b.x - my_radius,
				b.y - my_radius,
				b.x + my_radius,
				b.y + my_radius,
				o => o instanceof Food
			);
			for ( let o of candidates ) {
				const circle  = new Circle(b.x, b.y, my_radius);
				const circle2  = new Circle(o.x, o.y, o.r);
				if ( circle.collides(circle2) ) {
					b.best_goal = Math.max(b.best_goal||0,o.goal||0);
				}
			}
			// punished for getting close to the edge
			if ( b.collision.contact_obstacle ) {
				b.punishment = (b.punishment || 0) + ( this.settings?.punishment || 0.2 ); 
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
				// punished for getting close to the edge
				if ( d > 100 && b.collision.contact_obstacle ) {
					b.punishment = (b.punishment || 0) + ( this.settings?.punishment || 0.2 ); 
				}
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
		b.total_fitness_score -= b?.punishment || 0;
	}	
	Update(delta) {
		super.Update(delta);
		// keep the food coming
		for ( let f of this.tank.foods ) {
			f.value = 1000; // artificially inflate the food instead of respawning new ones.
		}
	}	
}
		
		