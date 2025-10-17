import neataptic from "neataptic";
import PhysicsObject from '../classes/class.PhysicsObject.js'
import BodyPlan from '../classes/class.BodyPlan.js'
import Sensor from '../classes/class.Sensor.js'
import Rock from '../classes/class.Rock.js'
import Food from '../classes/class.Food.js'
import DNA from '../classes/class.DNA.js'
import Brain from '../classes/class.Brain.js'
import Mark from '../classes/class.Mark.js'
import * as utils from '../util/utils.js'
import {Circle, Polygon, Result} from 'collisions';

			
// MAGIC NUMBER - tuning number for matter->energy conversion rate
const MAGIC_ENERGY_MULTIPLIER = 10;
			
// things we prefer neataptic not do			
neataptic.methods.mutation.MOD_ACTIVATION.mutateOutput = false;
neataptic.methods.mutation.SWAP_NODES.mutateOutput = false;

export function BoidFactory( type, x, y, tank ) {
	return Boid.Random(x, y, tank);
}
	
export class Boid extends PhysicsObject {

	// physics tuning constants
	static maxspeed = 2800; // sanity caps 
	static maxrot = 20; // sanity caps
	static max_boid_linear_impulse = 120000; // impulses multiplied by boid's motor power (0..1) 
	static min_boid_linear_impulse = 10000; // impulses multiplied by boid's motor power (0..1) 
	static max_boid_angular_impulse = 1600; // impulses multiplied by boid's motor power (0..1) 
	static min_boid_angular_impulse = 200; // impulses multiplied by boid's motor power (0..1) 
	static max_poop_buoy = 50; // some poop floats
	static min_poop_buoy = -500; // most poop sinks
	static ang_drag_coef = 400; // drag on rotation
	static forward_drag_coef = 1.5; // cost of going straight
	static lateral_drag_coef = 8.0; // cost of drifting
	static wall_slide_friction = 0.97; // object collision friction
	static linear_motor_cost_adjust = 1 / 900; // base rate per mass unit per second
	static angular_motor_cost_adjust = 1 / 1200; // base rate per mass unit per second
	static min_motor_cost_adjust = 0.1; // discount for going slow
	static max_motor_cost_adjust = 3.0; // tax for going fast
	static motor_cost_exponent = 1.5; // punishment curve
	static metabolic_scaling_term = 0.75; // controls metabolic scaling speed
	static metabolic_scaling_coef = 3.50; // controls metabolic scaling curve shape
	static physics_max_time_per_step = 1/60; // controls how many physics substeps to perform
	
	Reset() {
		this.x = 0;
		this.y = 0;
		this.vel_x = 0;
		this.vel_y = 0;
		this.accel_x = 0;
		this.accel_y = 0;		
		this.ang_vel = 0;
		this.metab.energy = this.metab.max_energy;
		this.age = 0; // in seconds
		this.metab.stomach.fill(0);
		this.metab.stomach_total = 0;
		this.metab.bowel.fill(0);
		this.metab.bowel_total = 0;
		this.metab.seed_dna = null;
		this.angle = Math.random()*Math.PI*2;
		this.linear_impulse = 0; // forward impulse power, can be negative
		this.torque = 0; // rotational impulse, can be negative for left/right
		// flatline brain
		if ( this.brain ) { this.brain.Reset(); }
		// zero out all motor timing
		for ( const m of this.motors ) {
			m.t = 0;
			m.last_amount = 0;
			m.this_stroke_time = 0;
			m.strokepow = 0; 
		}				
		// simulation-specific settings
		if ( globalThis.vc.simulation.settings?.ignore_lifecycle ) {
			this.mass = this.body.mass;
			this.ScaleBoidByMass();	
		}
		// random age
		if ( !globalThis.vc.simulation.settings?.ignore_lifecycle ) {
			this.age = utils.RandomInt( 0, this.lifespan * 0.5 );
		}
		this.ResetStats();
	}
	
	ResetStats() {
		this.stats = {
			death: {
				cause: null,
				energy_remaining: 0,
				energy_remaining_pct: 0,
				age_remaining: 0,
				age_remaining_pct: 0,
			},
			food: {
				total: 0,
				toxins: 0,
				edible: 0,
				inedible: 0,
				required: 0,
				toxin_dmg: 0,
				deficit_dmg: 0,
				energy: 0,
				bites: 0
			},
			combat: {
				attacks: 0,
				attacks_received: 0,
				dmg_dealt: 0,
				dmg_received: 0,
				kills: 0
			},
			metab: {
				base: 0,
				motors: 0
			}
		};
	}

	constructor( x=0, y=0, tank=null, json=null ) {
		super();
		this.oid = ++globalThis.vc.next_object_id;
		this.ResetStats();
		this.sense = new Array(16).fill(0);
		this.id = utils.RandomInt();
		this.dna = '';
		this.generation = 1;
		this.speciation = 1;
		this.tank = tank;
		this.genus = 'unknown';
		this.species = 'unknown';
		this.x = x;
		this.y = y;
		this.ang_vel = 0;
		this.lifespan = 120; // in seconds
		this.age = 0; // in seconds
		this.maturity_age = this.lifespan * 0.5;
		this.mass = 1; // requires body plan info later
		this.scale = 1; // current mass over body plan mature mass
		this.length = 1; 
		this.width = 1; 
		this.effective_length = 1;
		// [!]TEMPORARY - new stuff goes in the "traits" or other sub-objects to separate from old stuff
		this.traits = {
			nutrition: new Array(8).fill(0.5),// array of nutritional benefit of primary nutrients. 0..1: edible, >1: required, <0: toxic
			growth_min_energy_pct: 0.5,		// minimum fraction of energy required to initiate organism growth
			growth_cost: 0.01, 				// pct energy per second
			growth_rate: 0.01,				// percentage of current mass we can increase per second
			base_stomach_size: 0.1,			// percentage of mass
			base_bowel_size: 0.05,			// percentage of mass
			base_metabolic_rate: 0.003, 	// resting metabolism sans motors, energy per second per mass
			base_digest_rate: 0.01, 		// food per second per mass
			base_energy_meter: 1,			// energy meter per mass
			poop_map: new Array(8).fill(0),	// nutrient conversion on excretion. array of [ [from], [to] ]
			poop_complexity: 0,				// determines food complexity value of resulting poop
			poop_buoy: 0,					// you were going to ask eventually anyway
			base_bite_size: 1,				// amount of food per bite attempt per mass
			bite_speed: 1,					// time in seconds for bite to reset
			boxfit: [],						// [ [ metabolism points, size points, label ] ]
			offspring_investment: 0.5,		// the degree of energy banking a parent puts into offspring
			effective_length_term: 1,		// `p` term for effective length formula, -2..2
			motor_power_strat: 'blended', 	// how a motor converts activation signal to final output amount. One of:
											// 'blended', 'raw' (default)
		};
		this.metab = {
			digest_rate: 1,					// current amount of food digested per second
			metabolic_rate: 1,				// current resting energy required per second, excluding motor actuation
			stomach_size: 1,				// current final size of stomach
			bowel_size: 1,					// current final size of bowels
			stomach_total: 0,				// total mass of stomach contents
			bowel_total: 0,					// total mass of bowel contents
			stomach: new Array(8).fill(0),	// nutrient contents of stomach
			bowel: new Array(8).fill(0),	// nutrient contents of bowel
			max_energy: 1,					// maximum value of energy meter
			energy: 0,						// current energy value
			bite_size: 1,					// amount of food per bite attempt
			bite_time: 0,					// countdown timer. zero if ready to bite. resets to bite_speed on bite.
			deficient: false,				// UI flag. true if any required nutrient is currently causing harm from deficiency
			toxins: false,					// UI flag. true if stomach contains any toxins 
			growing: false,					// UI flag. true if boid actively grew mass on this frame
			seed_dna: null					// DNA str of seed swallowed from food
		};
		// collision
		this.collision = {
			shape: 'circle',
			fixed: false,
			radius: 15, // update later
			qid: 0
		};
		
		this.angle = Math.random()*Math.PI*2;
		this.linear_impulse = 0; // forward motion power, can be negative
		this.torque = 0; // angular momentum / rotational inertia
		// neuro stuff
		this.brain = null;
		// vision and sensors
		this.sensors = [];
		this.sensor_outputs = [];
		this.sensor_labels = [];
		this.fitness_score = 0; // per frame
		this.total_fitness_score = 0; // accumulates over time
		// motors
		this.motors = [];
		
		// rehydrate objects from JSON if supplied
		if ( json && typeof json === 'object' ) {
			Object.assign(this,json);
			this.dna = new DNA(this.dna);
			this.brain = new Brain({json:this.brain});
			this.RehydrateFromDNA();
			if ( json.motor_state ) { // temporary object for storage only
				for ( let i=0; i<this.motors.length; i++ ) {
					let m = this.motors[i];
					let s = json.motor_state[i];
					m.t = s.t;
					m.last_amount = s.last_amount;
					m.this_stroke_time = s.this_stroke_time;
					m.strokepow = s.strokepow;					
				}
				delete json.motor_state;
			}
			this.collision.qid = 0; // must reset this on loaded objects
		}
		
	}
	
	MakeSensorLabels() {
		this.sensor_labels = [];
		for ( let s of this.sensors ) {
			this.sensor_labels.push( ... s.labels );
		}
		if ( this.traits.synesthesia ) {	
			let new_labels = [];
			let num = Math.ceil( this.sensor_labels.length / this.traits.synesthesia ); 
			for ( let i=0; i < num; i++ ) {
				new_labels.push(`syn${this.traits.synesthesia}-${i}`);
			}
			this.sensor_labels = new_labels;
		}	
	}

	Update( delta ) {
	
		if ( !delta ) { return; }
		
		// aging out
		this.age += delta;
		if ( this.age > this.lifespan && !globalThis.vc.simulation.settings?.ignore_lifecycle ) {
			// chance to live a while longer
			if ( Math.random() < 0.002 ) {
				this.Kill('age');
				return;
			}
		}
		
		// METABOLISM ----------------------------\/---------------------------------------
		
		// reduce total energy by resting metabolic rate.
		// motor actuation costs are handled separately.
		let energy_to_burn = this.metab.metabolic_rate * delta;
		// larva get a discount for doing nothing
		if ( !globalThis.vc.simulation.settings?.ignore_lifecycle && this.age < this.larval_age ) { energy_to_burn *= 0.5; }
		this.metab.energy -= energy_to_burn;
		this.stats.metab.base += energy_to_burn;
		globalThis.vc.simulation.RecordStat('energy_used',energy_to_burn);
		
		// digestion (optimized by not processing stomach contents every single frame)
		const digestInterval = 0.5; // we can factor this out when tuning optimization is balanced
		this.nextDigest = (this.nextDigest||0) + delta;
		if ( this.nextDigest >= digestInterval ) {
			
			this.nextDigest -= digestInterval;
			
			// make sure our numbers are right
			this.metab.stomach_total = this.metab.stomach.reduce( (a,c) => a + (c>0?c:0), 0 );
				
			// count the number of non-zero food channels
			const nonZeroFoods = this.metab.stomach.reduce( (a,c) => a + (c>0?1:0), 0 );
			
			// calculate the per-channel digestive rate
			const channelDigestAmount = ( this.metab.digest_rate * digestInterval ) / nonZeroFoods;
			
			// reset flags
			this.metab.deficient = false;
			this.metab.toxins = false;
			this.metab.growing = false;
			
			// digest each food channel
			for ( let i=0; i < this.metab.stomach.length; i++ ) {
				const v = this.metab.stomach[i];
				// if the value is positive, digest it
				if ( v > 0 ) {
					let morsel = Math.min( v, channelDigestAmount );
					this.metab.stomach[i] -= morsel; // can go negative
					this.metab.stomach_total -= morsel;
					let energy_gain = morsel * this.traits.nutrition[i] * MAGIC_ENERGY_MULTIPLIER;
					this.metab.energy += energy_gain;
					this.metab.bowel[ this.traits.poop_map[i] ] += morsel;
					this.metab.bowel_total += morsel;
					this.metab.toxins = this.metab.toxins || ( this.traits.nutrition[i] < 0 ); // flag for UI
					// stat tracking 
					this.stats.food.total += morsel;
					if ( this.traits.nutrition[i] < 0 ) { this.stats.food.toxins += morsel; }
					else if ( this.traits.nutrition[i] >= 2 ) { this.stats.food.required += morsel; }
					else if ( this.traits.nutrition[i] == 0 ) { this.stats.food.inedible += morsel; }
					else { this.stats.food.edible += morsel; }
					if ( energy_gain > 0 ) { this.stats.food.energy += energy_gain; } 
					else if ( energy_gain < 0 ) { this.stats.food.toxin_dmg += energy_gain; } 
				}
				// if we're empty but nutrient is required, check for scurvy
				else if ( v <= 0 && this.traits.nutrition[i] >= 2 ) {
					// below zero values represent deficiency 
					let morsel = ( this.metab.digest_rate * digestInterval ) / this.metab.stomach.length;
					this.metab.stomach[i] -= morsel;
					// check for harm
					// WARNING: MAGIC NUMBER - BASE time in seconds until it starts to hurt
					const timeToHurt = 120;
					// OPTIMIZATION: you could precompute this value - would also be useful for UI indicators
					const dangerLevel = -( ( this.metab.digest_rate * timeToHurt ) / this.traits.nutrition[i] ) 
						/ this.metab.stomach.length;
					if ( v < dangerLevel ) {
						// level of harm scales with level of deficiency and necessity
						let mod = 1 + v / dangerLevel;
						let damage = morsel * this.traits.nutrition[i] * mod;
						this.metab.energy -= damage;
						this.stats.food.deficit_dmg += damage;
						this.metab.deficient = true; // flag for UI
					}
				}
			}
			
			// potty time?
			if ( this.metab.bowel_total >= this.metab.bowel_size ) {
				// TODO: if there's too much crap on the screen, consider just having 
				// it absorb into the background aether instead of ignoring it.
				if ( globalThis.vc.tank.foods.length < 300 && globalThis.vc.simulation.settings?.poop!==false ) {
					const f = new Food( this.x, this.y, { 
						value: this.metab.bowel_total * 0.5, // reduce value to avoid virtuous cycles  
						lifespan: Math.min( 15, this.metab.bowel_total/3 ),
						buoy_start: ( this.traits.poop_buoy + ( this.traits.poop_buoy 
							- (this.traits.poop_buoy * 2 * Math.random()) ) ),
						buoy_end: ( (this.traits.poop_buoy + this.traits.poop_buoy) 
							+ ( this.traits.poop_buoy - (this.traits.poop_buoy * 2 * Math.random()) ) ),
						nutrients: this.metab.bowel.map( v => v / this.metab.bowel_total ),
						complexity: this.traits.poop_complexity,
						seed: this.metab.seed_dna
						} );
					globalThis.vc.tank.foods.push(f);
				}
				this.metab.bowel_total = 0;
				this.metab.bowel.fill(0);
				this.metab.seed_dna = null;
			}			
			
			// if we have enough energy to grow, let's grow
			if ( this.mass < this.body.mass && this.metab.energy / this.metab.max_energy > this.traits.growth_min_energy_pct ) {
				// growth rate increases as we have more energy to spare for growth
				const energy_pct = this.metab.energy / this.metab.max_energy;
				const energy_ramp_pct = ( 1 - this.traits.growth_min_energy_pct ) 
					* ( Math.max(energy_pct,this.traits.growth_min_energy_pct) - this.traits.growth_min_energy_pct );
				// grow faster when young, power curve falloff with age
				const age_ramp_pct = 1 - Math.pow( this.age / this.lifespan, 7 );
				const lump = this.mass * this.traits.growth_rate * digestInterval * energy_ramp_pct * age_ramp_pct;
				// BALANCE NOTE: 
				// Its incredibly difficult to get any traction from random organisms
				// when we stick to the laws of thermodynamics and try to create
				// a constant mass situation in the tank. Instead, energy from food
				// is multiplied, but energy needed for growth is not taxed the same way.
				// Cost of growth SHOULD be the opposite of the energy gain from food:
				// mass->energy vs energy->mass
				// let cost = lump * energy_multiplier;
				let cost = lump; // free energy
				this.mass += lump;
				if ( this.mass >= this.body.mass ) { this.mass = this.body.mass; }
				this.metab.energy -= cost; 
				this.ScaleBoidByMass();
				this.metab.growing = true; // mostly for UI
			}
			
		}		
		
		// min/max energy cap
		this.metab.energy = utils.Clamp( this.metab.energy, 0, this.metab.max_energy );
		
		// you ded?
		if ( this.metab.energy <= 0 && !globalThis.vc.simulation.settings?.ignore_lifecycle ) {
			this.Kill('energy');
			return;
		}
		
		
		// SENSORS ----------------------------\/---------------------------------------
		
		// reset collision detection flags
		this.collision.contact_obstacle = false;
		
		// sensor detection				
		// OPTIMIZATION: we can avoid useless calls to sensors by only sensing when there is
		// one or more motor that is waiting for a signal. If all motors are busy
		// then the sensors have no practical purpose and are only for UI enjoyment.
		let do_sensors = globalThis.vc.boid_sensors_every_frame;
		if ( !do_sensors ) {
			for ( let m of this.motors ) {
				if ( !m.t && !m?.skip_sensor_check ) { do_sensors = true; break; }
			}
		}
		if ( do_sensors ) {
			this.sensor_outputs = [];
			for ( let s of this.sensors ) { 
				this.sensor_outputs.push( ... s.Sense() );
			}
			// if the boid has synesthesia, combine inputs
			if ( this.traits.synesthesia ) {
				const combine = this.traits.synesthesia;
				let new_outputs = new Array( Math.ceil( this.sensor_outputs.length / combine ) ).fill(0);
				for ( let i=this.sensor_outputs.length-1; i >= 0; i-- ) {
					let j = Math.floor(i / combine);
					new_outputs[j] += this.sensor_outputs[i];
					if ( i % combine == 0 ) { new_outputs[j] /= combine; }
				}
				this.sensor_outputs = new_outputs;
			}
		}
		
		// MOTOR ACTIVATION ----------------------------\/---------------------------------------
		
		// reset impulses
		this.linear_impulse = 0;
		this.torque = 0;
		
		// CPU optimization: we don't need to run AI every frame either.
		// Explained: activating a neural network when it cannot be used it wasted cycles.
		// However, because spiking networks incorporate some element of timing patterns,
		// it may give different results running continuously vs. only when necessary.
		const activate_brain = do_sensors 
			|| globalThis.vc.boid_sensors_every_frame
			|| ( globalThis.vc.boid_snn_every_frame && this.brain.type==='snn' );
		if ( activate_brain ) {
			// movement / motor control 				
			let brain_outputs = this.brain.Activate( this.sensor_outputs, globalThis.vc.simulation.stats.round_time );
			for ( let i=0; i < brain_outputs.length; i++ ) {
				let level = Math.tanh(brain_outputs[i]); // FIXME tanh?
				this.ActivateMotor( i, level, delta );
			}
		}
		// shoot blanks and keep the motors running through strokes
		else {
			for ( let i=0; i < this.motors.length; i++ ) {
				this.ActivateMotor( i, 0, delta );
			}
		}
		
		// MOVEMENT ----------------------------\/---------------------------------------
		
		// torque scales with effective body length (2D version of muscle cross-section)
		this.torque *= this.effective_length;
		
		// normalize rotational force by mass
		this.torque /= this.mass;
		
		// apply forward impulse - force scales with effective body length (2D version of muscle cross-section)
		this.linear_impulse *= this.effective_length;
		const sinAngle = Math.sin(this.angle);
		const cosAngle = Math.cos(this.angle);		
		let impulse_x = this.linear_impulse * cosAngle;
		let impulse_y = this.linear_impulse * sinAngle;
		if ( impulse_x > 20000000 || impulse_x < -20000000 || isNaN(impulse_x) ) { impulse_x=0; }
		if ( impulse_y > 20000000 || impulse_y < -20000000 || isNaN(impulse_y) ) { impulse_y=0; }
		this.ApplyForce(impulse_x, impulse_y);
		
		// in order to avoid jittering problems caused by drag forces and high velocities,
		// we need to break the physics into smaller time slices.
		// we generally want 2 or sometimes 3 steps per frame to cover all cases.
		const torque_was = this.torque;
		const accel_x_was = this.accel_x;
		const accel_y_was = this.accel_y;
		const steps = 1 + Math.ceil( delta / Boid.physics_max_time_per_step );
		const subdelta = delta / steps;
		for ( let i=0; i < steps; i++ ) {
			
			// reset force values (UpdatePosition will clear them every time)
			this.torque = torque_was;
			this.accel_x = accel_x_was;
			this.accel_y = accel_y_was;
			
			// apply rotational drag
			const rot_drag = -Boid.ang_drag_coef * this.ang_vel * globalThis.vc.simulation.settings.viscosity * this.body.length;
			this.torque += rot_drag / this.mass;
				
			// calculate angular velocity
			this.ang_vel += this.torque * subdelta;
			
			if ( !isFinite(this.ang_vel) || isNaN(this.ang_vel) ) { this.ang_vel = 0; }
			
			// limit rotation
			this.ang_vel = utils.Clamp( this.ang_vel, -Boid.maxrot, Boid.maxrot );
			
			// apply angular velocity / adjust pointing angle
			this.angle = utils.mod( this.angle + (subdelta * this.ang_vel), 2*Math.PI );
			
			// drag force, otherwise we just go faster and faster.
			// note: we need to use hydrodynamic drag, not regular drag.
			// Regular drag has unrealistic drifting you would not expect in aquatic environments.
			this.ApplyHydrodynamicDrag( 
				this.body.length, 
				this.body.width, 
				this.angle, 
				globalThis.vc.simulation.settings.viscosity,
				Boid.forward_drag_coef,
				Boid.lateral_drag_coef
			);

			// translate position based on all forces
			this.UpdatePosition(subdelta);
			
			// stay inside tank			
			this.x = utils.clamp( this.x, 0 + this.collision.radius, this.tank.width - this.collision.radius );
			this.y = utils.clamp( this.y, 0 + this.collision.radius, this.tank.height - this.collision.radius );
			
			// this.Constrain(bounce);
		}

		
		// collision detection with obstacles
		// things i might collide with:
		let my_radius = Math.max(this.length, this.width) * 0.5;
		let candidates = this.tank.grid.GetObjectsByBox( 
			this.x - my_radius,
			this.y - my_radius,
			this.x + my_radius,
			this.y + my_radius,
			o => o instanceof Rock
		);
		for ( let o of candidates ) {
			// narrow phase collision detection
			const circle  = new Circle(this.x, this.y, my_radius);
			const polygon = new Polygon(o.x, o.y, o.collision.hull);
			const result  = new Result();
			let gotcha = circle.collides(polygon, result);
			// response
			if ( gotcha ) {
				this.x -= result.overlap * result.overlap_x;
				this.y -= result.overlap * result.overlap_y;
				this.Slide( result.overlap_x, result.overlap_y, Boid.wall_slide_friction );
				this.collision.contact_obstacle = true;
			}
		}
		// if an object pushed us out of bounds and we get stuck outside tank, remove
		if ( candidates.length && globalThis.vc.simulation.stats.round_time < 1 ) { // limit to startup
			if ( this.x < -0.01 || this.x > globalThis.vc.tank.width + 0.01 ) { this.Kill('OOB'); return; };
			if ( this.y < -0.01 || this.y > globalThis.vc.tank.height + 0.01 ) { this.Kill('OOB'); return; };
		}		
			
			
		// EATING FOOD ----------------------------\/---------------------------------------
		
		// still chewing
		if ( this.metab.bite_time > 0 ) {
			this.metab.bite_time = Math.max( 0, this.metab.bite_time - delta );
		}
		
		// mouth is available to take a bite
		if ( this.metab.bite_time === 0 ) {
			// already full. stop eating
			if ( this.metab.stomach_total / this.metab.stomach_size < 0.95 ) { 
				const grace = 4; // MAGIC NUMBER
				const r = this.collision.radius + grace;
				// get a list of collision candidates
				let foods = this.tank.foods; // runs faster on small sets
				const test = o => { return o instanceof Food && o.IsEdibleBy(this) && !( this.ignore_list && this.ignore_list.has(o) ) };
				foods = this.tank.grid.GetObjectsByBox( this.x - r, this.y - r, this.x + r, this.y + r, test );				
				// check for collision + edibility
				for ( let food of foods ) { 
					const dx = Math.abs(food.x - this.x);
					const dy = Math.abs(food.y - this.y);
					const d = Math.sqrt(dx*dx + dy*dy);
					if ( d > this.collision.radius + food.r ) { continue; }
					// take a bite - reset bite, regardless of morsel size
					if ( !globalThis.vc.simulation.settings?.ignore_lifecycle ) {
						this.metab.bite_time = this.traits.bite_speed;
					}
					const space_left = this.metab.stomach_size - this.metab.stomach_total;
					const bitesize = Math.min( space_left, this.metab.bite_size );
					const morsel = food.Eat( bitesize );
					// add each nutrient to the stomach by channel
					for ( let i=0; i < food.nutrients.length; i++ ) {
						if ( !food.nutrients[i] ) { continue; }
						// note: channels that are "deficient" are negative here. 
						// If we eat something, it magically jumps back to positive.
						const v = morsel * food.nutrients[i];
						this.metab.stomach[i] = Math.max( v, this.metab.stomach[i] + v );
					}
					// stat tracking
					this.metab.stomach_total = this.metab.stomach.reduce( (a,c) => a + (c>0?c:0), 0 );
					this.stats.food.bites++;
					globalThis.vc.simulation.RecordStat('bites',1);
					globalThis.vc.simulation.RecordStat('food_eaten',morsel);
					// if the food has a seed, save the seed for excretion.
					if ( food.seed ) { this.metab.seed_dna = food.seed; }
					// certain simulations use food for sequential target practice
					if ( globalThis.vc.simulation.settings?.on_bite_ignore ) {
						if ( !this.ignore_list ) {
							this.ignore_list = new WeakSet;
						}
						this.ignore_list.add(food);
					}
					break; // one bite only!
				}
			}		
		}
	}

	ActivateMotor( i, amount /* -1..1 */, delta ) {
		// sometimes neataptic can output nan and infinities. 
		if ( Number.isNaN(amount) || !Number.isFinite(amount) ) { return 0; }
		let m = this.motors[i];
		if ( !m ) { return 0; }
		
		// start a timer if there isnt one
		if ( !m.hasOwnProperty('t') ) { m.t = 0; }
		
		// shift amount to halfway point for wheel motors (0..1 becomes -1..1)
		if ( m.wheel ) { amount = (amount * 2) - 1; } 
		
		// sanity check
		amount = utils.clamp(amount,-1,1);
		
		// new stroke
		if ( m.t==0 ) { 
			// check for minimum activation
			if ( m.min_act && Math.abs(amount) < m.min_act ) { 
				m.last_amount = 0;
				m.this_stroke_time = 0;
				return 0; 
			}
			// age restricted
			if ( m.hasOwnProperty('min_age') && this.age < m.min_age && !globalThis.vc.simulation.settings?.ignore_lifecycle ) { 
				m.last_amount = 0;
				m.this_stroke_time = 0;
				return 0; 
			}
			// you must be this tall to enter
			if ( m.hasOwnProperty('min_scale') && this.scale < m.min_scale ) { 
				m.last_amount = 0;
				m.this_stroke_time = 0;
				return 0; 
			}
			// tank capacity sanity cap
			if ( ( m.hasOwnProperty('bud') || m.hasOwnProperty('mitosis') ) && 
				( this.tank.boids.length >= (globalThis.vc?.simulation?.settings?.num_boids || 100)
				|| globalThis.vc.simulation.settings?.ignore_lifecycle ) ) {
				m.last_amount = 0;
				m.this_stroke_time = 0;
				return 0; 
			}
			// reproduction and other triggers must use the full amount, regardless of activation
			if ( m.hasOwnProperty('use_max') ) {
				amount = 1; 
			}
			// attack executes only on the first frame and only if there is a victim
			if ( m.hasOwnProperty('attack') && !globalThis.vc.simulation.settings?.no_combat ) {
				const power = this.mass * m.attack * amount;
				const gotcha = this.AttemptAttack(power);
				if ( !gotcha ) { 
					m.last_amount = 0;
					m.this_stroke_time = 0;
					return 0; 
				}
			}				
			// if we decided to activate a new stroke, record the power it was
			// activated with instead of using a varying stroke each frame.
			m.strokepow = amount; 
			// use this modified version to make sure stroke times are "kinda normalized"
			// and can't get too low with very short power values
			if ( m?.stroke_time_strategy == 'blend' ) {
				m.this_stroke_time = m.stroketime * ( Math.abs(amount) + ( (1-Math.abs(amount)) * 0.25 ) );
			}
			// use this if you want the stroke time to coordinate with the power
			// i.e. a quick flick versus a hard push
			else {
				m.this_stroke_time = m.stroketime * Math.abs(amount);
			}
		}
		else { 
			amount = m.strokepow; 
		}
		
		// don't allow overtaxing - remainder of stroke may be less than incoming time delta
		delta = Math.min( delta, m.this_stroke_time - m.t ); 
		
		// base cost of doing business
		let cost = m.cost * delta * Boid.metabolic_scaling_coef * Math.pow( this.mass, Boid.metabolic_scaling_term );
		// movement motors have a variable cost to promote efficiency
		if ( m.linear || m.angular ) {
			cost *= Boid.min_motor_cost_adjust 
				+ (Boid.max_motor_cost_adjust - Boid.min_motor_cost_adjust) 
				* Math.pow(Math.abs(m.strokepow),Boid.motor_cost_exponent); // could be optimized if you want simple linear interpolation
		}
		// all other motors use the activation amount as the cost indicator
		else { cost *= Math.abs(m.strokepow); }
		this.metab.energy -= cost;
		this.stats.metab.motors += cost;
		this.stats.metab[m.name] = (this.stats.metab[m.name] || 0) + cost;
		globalThis.vc.simulation.RecordStat('energy_used',cost);
		
		// increase stroke time
		m.t = utils.clamp(m.t+delta, 0, m.this_stroke_time); 
		
		// stroke power function modifies the power withdrawn per frame
		// In addition to the curve shape, we also modify the power by a constant
		// to make sure the total power output of the entire stroke is the same
		// across all stroke types. Assume "constant" stroke has total power of 1.
		let amount_adjust = 1.0; // adjustment to account for power curve shape
		let amount_now = amount; // fraction of power at current point in time
		switch ( m.strokefunc ) {
			case 'linear_down':	{
				amount_adjust = 2;
				amount_now = amount * ( (m.this_stroke_time - m.t) / m.this_stroke_time); 
				break;
			}
			case 'linear_up':	{
				amount_adjust = 2;
				amount_now = amount * ( 1 - ((m.this_stroke_time - m.t) / m.this_stroke_time)); 
				break;
			}
			case 'bell':		{
				amount_adjust = 2;
				amount_now = amount * (0.5 * Math.sin( (m.t/m.this_stroke_time) * Math.PI * 2 + Math.PI * 1.5 ) + 0.5); 
				break;
			}
			case 'step_up':		{
				amount_adjust = 2;
				amount_now = (m.t >= m.this_stroke_time*0.5) ? amount : 0 ; 
				break;
			}
			case 'step_down':	{
				amount_adjust = 2;
				amount_now = (m.t < m.this_stroke_time*0.5)	? amount : 0 ; 
				break;
			}
			case 'burst':		{
				amount_adjust = 5;
				amount_now = (m.t >= m.this_stroke_time*0.8) ? amount : 0 ; 
				break;
			}
			case 'spring':		{
				amount_adjust = 5;
				amount_now = (m.t < m.this_stroke_time*0.2)	?  amount : 0 ; 
				break;
			}
			// the default is constant time output
		}
		
		// record how much power was activated this stroke - mostly for UI and animation
		m.last_amount = Math.abs( amount_now );
		
		// final output calculation
		amount = amount_now * amount_adjust;
		
		// apply forces and effects
		if ( m.hasOwnProperty('linear') ) {
			this.linear_impulse += m.linear * amount * Boid.max_boid_linear_impulse;
		}
		if ( m.hasOwnProperty('angular') ) {
			this.torque += m.angular * amount * Boid.max_boid_angular_impulse;
		}
		else if ( m.hasOwnProperty('sense') && m.t <= delta ) { // first frame
			const radius = (m.r || 100) * m.strokepow;
			const lifespan = ( m.lifespan || ( Math.random() * 10 ) );
			this.CreateMark( m.sense, radius, lifespan );
		}
		if ( m.hasOwnProperty('mitosis') && m.t >= m.this_stroke_time ) {
			this.Mitosis( m.mitosis );
		}
		else if ( m.hasOwnProperty('bud') && m.t >= m.this_stroke_time ) {
			this.Bud();
		}
		// reset stroke when complete
		if ( m.t >= m.this_stroke_time ) { 
			m.t = 0; 
			m.this_stroke_time = 0;
		} 
	}
	
	// true on success, false on whiff
	AttemptAttack( attack_force /* this.mass * m.attack * amount */ ) {
		// find boids in the local area
		let victim = this.tank.grid.GetObjectsByBox( 
			this.x - this.collision.radius, 
			this.y - this.collision.radius,
			this.x + this.collision.radius,
			this.y + this.collision.radius,
			o => o instanceof Boid && o.genus != this.genus && o != this )
		.find( b => {
			let dx = b.x - this.x;
			let dy = b.y - this.y;
			let d = Math.sqrt( dx * dx + dy * dy );
			return d < this.collision.radius + b.collision.radius;
		} );
		if ( !victim ) { return false; }
		// let was = victim.metab.energy;
		victim.metab.energy -= attack_force;
		// console.log(`attacking @ ${attack_force.toFixed()} : ${was.toFixed()} -> ${victim.metab.energy.toFixed()}`);
		this.stats.combat.attacks++;
		this.stats.combat.dmg_dealt += attack_force;
		victim.stats.combat.attacks_received++;
		victim.stats.combat.dmg_received += attack_force;
		let killed = false;
		if ( victim.metab.energy <= 0 && !globalThis.vc.simulation.settings?.ignore_lifecycle ) {
			victim.Kill('attack');
			let killed = true;
			this.stats.combat.kills++;
			globalThis.vc.simulation.RecordStat('kills',1);
			// prizes!
			const f = new Food( victim.x, victim.y, { 
				value: victim.mass * 0.25, // reduce value to avoid virtuous cycles  
				lifespan: ( victim.mass * 0.05),
				buoy_start: 5,
				buoy_end: -20,
				nutrients: victim.traits.nutrition.map( x => x > 0 ? x : 0 ),
				complexity: Math.max( victim.traits.nutrition.filter( x => x > 0 ).length, 6 )
				} );		
			globalThis.vc.tank.foods.push(f);											
		}
		
		// audio mark
		this.tank.marks.push( new Mark({
			x: victim.x,
			y: victim.y,
			r: Math.sqrt( attack_force * 10 * (killed?2:1) ),
			sense: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1], // TODO: room for variety
			lifespan: 2 + 2 * (attack_force / 600),
			type: 'attack'
		}) );
			
		return true;
	}
	
	CreateMark( sense, radius, lifespan ) {
		if ( !globalThis.vc?.simulation?.settings?.no_marks ) {
			this.tank.marks.push( new Mark({
				x: this.x,
				y: this.y,
				r: radius,
				sense: sense,
				lifespan: lifespan
			}) );
		}	
	}
	
	Mitosis( num_offspring ) {
		const mutation_rate = utils.Clamp( globalThis.vc?.simulation?.settings?.max_mutation, 0, 1 );
		const speciation_rate = utils.Clamp( globalThis.vc?.simulation?.settings?.speciation_rate || 0, 0, 1 );
		for ( let n=0; n < num_offspring; n++ ) { 
			let offspring = this.Copy(true, mutation_rate, mutation_rate, speciation_rate); // reset state and mutate organism
			offspring.age = 0; // simulation can assign a random age on Copy
			offspring.x = this.x;
			offspring.y = this.y;
			offspring.angle = utils.RandomFloat(0, Math.PI*2);
			offspring.mass = this.mass / ( num_offspring + 1 );
			offspring.ScaleBoidByMass();
			// the parent decides how much energy to invest into babies. 
			// If they are given max energy, they immediately start to grow 
			// which doesnt make a lot of sense. If they don't have enough
			// energy, they don't stand a chance of surviving.
			offspring.metab.energy = this.traits.offspring_investment * offspring.metab.max_energy;
			this.tank.boids.push(offspring);
		}
		// babies aren't free. we just lost a lot of mass.
		this.mass /= ( num_offspring + 1 );
		this.ScaleBoidByMass();
		globalThis.vc.simulation.RecordStat('births',num_offspring);	
	}
	
	Bud() {
		const mutation_rate = utils.Clamp( globalThis.vc?.simulation?.settings?.max_mutation, 0, 1 );
		const speciation_rate = utils.Clamp( globalThis.vc?.simulation?.settings?.speciation_rate || 0, 0, 1 );
		let offspring = this.Copy(true, mutation_rate, mutation_rate, speciation_rate); // reset state and mutate organism
		offspring.age = 0; // simulation can assign a random age on Copy
		offspring.x = this.x;
		offspring.y = this.y;
		offspring.angle = utils.RandomFloat(0, Math.PI*2);
		offspring.mass = this.mass * this.traits.offspring_investment * 0.5; 
		offspring.ScaleBoidByMass();
		offspring.metab.energy = offspring.metab.max_energy;
		this.tank.boids.push(offspring);
		globalThis.vc.simulation.RecordStat('births',1);	
	}
	
	ScaleBoidByMass() {
		this.scale = this.mass / this.body.mass; // square scale
		this.length = Math.sqrt(this.scale) * this.body.length;
		this.width = Math.sqrt(this.scale) * this.body.width;
		// calculate "effective length" - there are many ways to do this:
		// The obvious method would be to simply average L x W.
		// However we toss a new term in here with an Lp function to give some
		// interesting genetic flavor to this.
		//	p<0 → harmonic-like (favors stubby bodies)
		//	p=1 → arithmetic (favors long bodies)
		//	p=2 → RMS (favors long bodies)
		//	p→0 → geometric (neutral)		
		this.effective_length = Math.pow(
			0.5 * (
				Math.pow(this.length, this.traits.effective_length_term) +
				Math.pow(this.width, this.traits.effective_length_term)
			), 
			1 / this.traits.effective_length_term
			);
		this.metab.stomach_size = this.traits.base_stomach_size * this.mass;
		this.metab.bowel_size = this.traits.base_bowel_size * this.mass;
		this.metab.metabolic_rate = this.traits.base_metabolic_rate * Boid.metabolic_scaling_coef * Math.pow( this.mass, Boid.metabolic_scaling_term );
		this.metab.digest_rate = this.traits.base_digest_rate * this.mass;
		this.metab.bite_size = this.traits.base_bite_size * this.mass;
		this.metab.max_energy = this.traits.base_energy_meter * this.mass;
		if ( this.metab.energy > this.metab.max_energy ) { 
			this.metab.energy = this.metab.max_energy; 
		}
		if ( this.metab.stomach_total > this.metab.stomach_size ) { 
			this.metab.stomach_total = this.metab.stomach_size; 
			// TODO: explosive diarrhea	
		}
		this.collision.radius = Math.max(this.length, this.width) / 2;
	}

	// keeping this here for possible interesting expansions on calculating effective length for use with motor force
	// function effLen(L, W, mode="lp", p=2, perimeterScale=0.5) {
	// switch (mode) {
	// 	case "geo":   return Math.sqrt(L*W);
	// 	case "ari":   return 0.5*(L+W);
	// 	case "har":   return (2*L*W)/(L+W);
	// 	case "rms":   return Math.sqrt(0.5*(L*L + W*W));
	// 	case "perim": return perimeterScale*(L+W); // tweak perimeterScale ~ 0.5
	// 	case "min":   return Math.min(L, W);
	// 	case "max":   return Math.max(L, W);
	// 	case "lp":    return Math.pow(0.5*(Math.pow(L,p)+Math.pow(W,p)), 1/p); // p∈(-∞,∞)
	// 	default:      return Math.sqrt(L*W);
	// }
	// }	
	
	Kill( cause='unknown' ) {
		this.dead = true;
		// if this is a natural tank setting, make food from carcass
		if ( !globalThis.vc.simulation.settings?.ignore_lifecycle ) {
			// BALANCE NOTE: in order to prevent runaway free energy cycles,
			// we need to undo the magic energy multiplier that was applied
			// when we ate food. 
			let value = (this.mass / MAGIC_ENERGY_MULTIPLIER);
			// starving organisms have less meat on the bones
			value = ( 0.5 * value ) + ( 0.5 * value * ( this.metab.energy / this.metab.max_energy ) );
			const f = new Food( this.x, this.y, { 
				value: value,
				lifespan: utils.RandomInt(10,60),
				buoy_start: ( 0.5 * this.traits.poop_buoy + ( this.traits.poop_buoy 
					- (this.traits.poop_buoy * 2 * Math.random()) ) ),
				buoy_end: ( (3 * this.traits.poop_buoy) 
					+ ( this.traits.poop_buoy - (this.traits.poop_buoy * 2 * Math.random()) ) ),
				nutrients: this.traits.nutrition, // arbitrary. reuse interesting data we already have.
				complexity: this.traits.poop_complexity // prevent canabolism
				} );
			globalThis.vc.tank.foods.push(f);	
		}
		// autopsy
		if ( cause ) {
			this.stats.death.cause = cause
		}
		else if ( this.metab.energy < 0.01 ) {
			this.stats.death.cause = 'energy';
		}
		else if ( this.age > this.lifespan ) {
			this.stats.death.cause = 'age';
		}
		else {
			this.stats.death.cause = 'unknown';
		}
		this.stats.death.energy_remaining = Math.floor( this.metab.energy < 0.01 ? 0 : this.metab.energy );
		this.stats.death.energy_remaining_pct = Math.floor( ( this.stats.death.energy_remaining / this.metab.max_energy ) * 100 );
		this.stats.death.age_remaining = Math.floor( this.lifespan - this.age );
		this.stats.death.age_remaining_pct = Math.floor( ( 1 - (this.age / this.lifespan) ) * 100 );
		// console.log(this.stats);
		globalThis.vc.simulation.RecordStat('deaths',1);
		globalThis.vc.simulation.RecordStat('death_from_'+this.stats.death.cause,1);
	}

	static Random(x,y,tank) {
		let b = new Boid(x,y,tank);
		b.dna = new DNA();
		b.genus = utils.RandomName(9);
		b.species = b.genus;
		b.age = utils.RandomInt( 0, b.lifespan * 0.5 );
		b.RehydrateFromDNA();
		// b.mass = b.body.mass; // random boids start adult size / full grown
		b.mass = ( 0.5 +Math.random() * 0.5 ) * b.body.mass; // random size
		b.ScaleBoidByMass();	
		b.Reset(); // need this to get state values back to default
		return b;
	}
	
	// fill traits based on values mined from our DNA
	RehydrateFromDNA() {

		this.lifespan = this.dna.shapedInt( this.dna.genesFor('lifespan',2,1), 60, 800, 300, 2 );
		this.maturity_age = this.dna.shapedInt( this.dna.genesFor('maturity age',2,1), 0.1 * this.lifespan, 0.9 * this.lifespan, 0.25 * this.lifespan, 2.5 );
		this.larval_age = Math.min( this.maturity_age, this.dna.shapedInt( this.dna.genesFor('larval_age',2,1), 2, 25, 5, 4 ) );
		
		// nutrition and metabolism:
		
		// food mask - determines what complexity levels of food we can eat
		this.traits.food_mask = 0;
		for ( let i=0; i < 6; i++ ) {
			const roll = this.dna.shapedNumber( this.dna.genesFor(`foodmask-${i}`,2,true), 0, 1 );
			const push = ( roll > 0.66 + (i * 0.06) ) ? 1 : 0;
			this.traits.food_mask = this.traits.food_mask | (push << i);
		}
		if ( this.traits.food_mask==31 ) { this.traits.food_mask = 30; } // can't have it all
		else if ( !this.traits.food_mask ) { this.traits.food_mask = 1; } // need at least something
		// nutrition profile
		for ( let i=0; i < 8; i++ ) {
			this.traits.nutrition[i] = this.dna.shapedNumber( this.dna.genesFor(`nutrition value ${i}`,2,1), -3, 3, 0.5 - i*0.1, 3 - i*0.2 );
			// inedible zone 0 to -2 clamps to zero
			if ( this.traits.nutrition[i] > -2 && this.traits.nutrition[i] < 0 ) { this.traits.nutrition[i] = 0; } 
		}
		// if nothing is edible, pick one random nutrient
		if ( 0 == this.traits.nutrition.reduce( (a,c) => a+c, 0 ) ) {
			let i = this.dna.shapedInt( this.dna.genesFor(`nutrition fallback index`,2,1), 0, 7, 0, 2 );
			this.traits.nutrition[i] = this.dna.shapedNumber( this.dna.genesFor(`nutrition value fallback`,2,1), 0.2, 3, 1, 5 );
		}
		this.traits.offspring_investment	= this.dna.shapedNumber( this.dna.genesFor('offspring_investment',2,1), 0.1, 1.0, 0.5, 2 );
		this.traits.growth_min_energy_pct	= this.dna.shapedNumber( this.dna.genesFor('growth_min_energy_pct',2,1), 0.1, 0.9, 0.4, 1.8 );
		this.traits.growth_cost				= this.dna.shapedNumber( this.dna.genesFor('growth_cost',2,1), 0.002, 0.05, 0.01, 2 );
		this.traits.growth_rate				= this.dna.shapedNumber( this.dna.genesFor('growth_rate',2,1), 0.01, 0.06, 0.03, 2 );
		this.traits.base_stomach_size		= this.dna.shapedNumber( this.dna.genesFor('base_stomach_size',2,1), 0.5, 0.02, 0.1, 2 );
		this.traits.base_bowel_size			= this.dna.shapedNumber( this.dna.genesFor('base_bowel_size',2,1), 0.01, 0.2, 0.07, 2 );
		// this.traits.base_metabolic_rate		= this.dna.shapedNumber( this.dna.genesFor('base_metabolic_rate',2,1), 0.002, 0.008, 0.004, 1.4 );
		this.traits.base_digest_rate		= this.dna.shapedNumber( this.dna.genesFor('base_digest_rate',2,1), 0.001, 0.008, 0.003, 1.5 );
		this.traits.base_energy_meter		= this.dna.shapedNumber( this.dna.genesFor('base_energy_meter',2,1), 0.4, 2, 1, 2 );
		this.traits.base_bite_size			= this.traits.base_stomach_size * this.dna.shapedNumber( this.dna.genesFor('base_bite_size',2,1), 0.2, 0.8, 0.4, 2 );
		this.traits.bite_speed				= this.dna.shapedNumber( this.dna.genesFor('bite_speed',2,1), 0.5, 5, 2, 2 );	
		this.traits.poop_buoy				= this.dna.shapedNumber( this.dna.genesFor('poop_buoy',2,1), Boid.min_poop_buoy, Boid.max_poop_buoy, 0, 3 );
		this.traits.poop_complexity			= 0;
		// no autotrophy, thats gross - find the first zero bit (simplest shape we cannot eat)
		for ( let i=0; i<6; i++ ) { // note it goes over a bit to make something interesting for species that consume everything else
			if ( !( this.traits.food_mask & (1<<i) ) ) {
				this.traits.poop_complexity = i+1;
				break;
			}
		}
		if ( !this.traits.poop_complexity ) { this.traits.poop_complexity = 1; }
		// poop map converts nutrients into other nutrients
		this.traits.poop_map = [];
		let badfood = this.traits.nutrition.map(_=>_).sort( (a,b) => a-b );
		for ( let i=0; i< this.traits.nutrition.length; i++ ) {
			let to = this.dna.shapedInt( this.dna.genesFor(`poopmap ${i}`, 2, 1 ), 0, 7, 0, 4 );
			this.traits.poop_map[i] = badfood[to];
		}
		
		// do some accounting on the traits we've created
		{
			// total all positive nutrition requirements
			let cost = this.traits.nutrition.reduce( (a,c) => a + (c>0?c:0), 0 );
			this.traits.boxfit.push([ Math.pow(cost,1.5), cost, 'body.nutrition']);
			
			// more food sources costs more
			cost = 0;
			for ( let i = 0; i < 6; i++ ) {
				if ( this.traits.food_mask & (1 << i) ) {
					cost += 3 + i;
				}
			}
			this.traits.boxfit.push([ cost*cost, cost, 'body.diet']);
			
			// lower threshold to grow. lower is better.
			cost = 1 - this.traits.growth_min_energy_pct;
			this.traits.boxfit.push([ cost, cost, 'body.growth_min_energy_pct']);
			
			// growth cost is probably not something we want to include
			cost = 1 - this.traits.growth_min_energy_pct;
			this.traits.boxfit.push([ cost, cost, 'body.growth_cost']);
			
			// faster raw growth rate. higher is better.
			cost = 100 * this.traits.growth_rate;
			this.traits.boxfit.push([ cost, cost, 'body.growth_rate']);
			
			// larger stomach means fewer trips to the fridge - higher is better
			cost = 50 * this.traits.base_stomach_size;
			this.traits.boxfit.push([ 0, cost, 'body.base_stomach_size']);
			
			// bowel size has very little impact
			cost = 20 * this.traits.base_bowel_size;
			this.traits.boxfit.push([ 0, cost, 'body.base_bowel_size']);
			
			// faster digestion speed means more growth - higher is better
			cost = 3 * this.traits.base_digest_rate * 100;
			this.traits.boxfit.push([ 0, cost, 'body.base_digest_rate']);
			
			// larger energy reserves - higher is better
			cost = this.traits.base_energy_meter * 10;
			this.traits.boxfit.push([ cost*0.2, cost, 'body.base_energy_meter']);
			
			// larger bite size means we get while the getting is good - higher is better
			cost = this.traits.base_bite_size * 20;
			this.traits.boxfit.push([ cost*0.2, cost, 'body.base_bite_size']);
			
			// bite speed allows faster eating - higher is better
			cost = this.traits.bite_speed;
			this.traits.boxfit.push([ cost*0.2, cost, 'body.bite_speed']);
		}
		
		// MOTORS ---------------------\/------------------------
		
		// these constants constrain individual motors to range 0..1.
		// we multiply the motor power by global power constants during activiation.
		const min_linear_motor = 0.05;			
		const max_linear_motor = 1.0;			
		const min_angular_motor = 0.03;			
		const max_angular_motor = 1.0;
			
		this.motors = [];
		let has_linear = false;
		let has_angular = false;
		let has_forward = false;
		// loop through the max number of potential motors and decide on each one individually with a gene.
		// this way if a gene changes it doesnt affect all subsequent motors in the stack.
		const max_num_motors = 5;
		let num_motors = 0;
		const motor_slots = []; // array of booleans to indicate if motor should be created
		// first loop decides if a motor should be created. 
		// this helps us set up defaults in case nothing is created.
		for ( let n=1; n <= max_num_motors; n++ ) {
			const has_motor_chance = this.dna.shapedNumber( this.dna.genesFor(`has motor ${n}`, 3, true), 0, 1);
			const gotcha = has_motor_chance <= 1/n; // guaranteed one motor
			motor_slots.push(gotcha);
			num_motors += gotcha ? 1 : 0;
		}
		// second loop creates the motors
		for ( let n=1; n <= motor_slots.length; n++ ) {
			if ( !motor_slots[n-1] ) { continue; } // a blank for your thoughts
			
			const wheelChanceGene = this.dna.genesFor(`motor wheel chance ${n}`,1,true);
			let wheel = this.dna.shapedNumber(wheelChanceGene, 0, 1) > 0.75 ? true : false;
			
			const stroketimeGene = this.dna.genesFor(`motor stroke time ${n}`,2,1);
			let stroketime = this.dna.shapedNumber(stroketimeGene,0.1, 3.5, 0.5, 4); 
			
			const min_ageGene = this.dna.genesFor(`motor min_age ${n}`,2,1);
			const min_age = this.larval_age * this.dna.shapedNumber(min_ageGene, 0.2, 1.0, 0.7, 3 ); 

			const minActGene = this.dna.genesFor(`motor min_act chance ${n}`,2,1);
			let min_act = this.dna.shapedNumber(minActGene,0,0.7,0.05,4);
			if ( wheel ) { min_act *= 0.5; }
			
			const strokeFuncGene = this.dna.genesFor(`motor stroke function ${n}`,2,-1);
			let strokefunc = this.dna.shapedNumber(strokeFuncGene, 0, 1);
			if ( strokefunc < 0.4 ) { strokefunc = 'linear_down'; }
			else if ( strokefunc < 0.5 ) { strokefunc = 'linear_up'; }
			else if ( strokefunc < 0.65 ) { strokefunc = 'bell'; }
			else if ( strokefunc < 0.7 ) { strokefunc = 'step_down'; }
			else if ( strokefunc < 0.75 ) { strokefunc = 'step_up'; }
			else if ( strokefunc < 0.78 ) { strokefunc = 'burst'; }
			else if ( strokefunc < 0.84 ) { strokefunc = 'spring'; }
			else { strokefunc = 'constant'; }
			
			// to prevent crazy acceleration, we need to say that spring-type motors have a longer stroke to reset
			if ( strokefunc == 'step_down' || strokefunc == 'step_up' ) {
				stroketime = Math.max( stroketime * 1.5, 0.4 );
			}
			if ( strokefunc == 'burst' || strokefunc == 'spring' ) {
				stroketime = Math.max( stroketime * 2, 0.6 );
			}
			
			let motor = { min_act, stroketime, t:0, strokefunc, wheel, min_age };
			
			const linearGene = this.dna.genesFor(`motor linear ${n}`, 2, 1);
			let linear = this.dna.shapedNumber(linearGene, min_linear_motor, max_linear_motor, max_linear_motor/3, 2.5);
			
			const angularGene = this.dna.genesFor(`motor angular ${n}`, 2, 1);
			let angular = this.dna.shapedNumber(angularGene, min_angular_motor, max_angular_motor, max_angular_motor/3, 2);
			
			const linearFlipGene = this.dna.genesFor(`motor linear flip ${n}`, 1, true);
			// prefer front-swimmers: don't flip the first motor unless we already have
			// ability to move forward. this helps with sensor placement which prefers the front.
			if ( has_forward && this.dna.shapedNumber(linearFlipGene,0,1) > 0.65 ) { linear = -linear; }
			
			const angularFlipGene = this.dna.genesFor(`motor angular flip ${n}`, 1, true);
			if ( this.dna.shapedNumber(angularFlipGene,0,1) > 0.65 ) { angular = -angular; }
			
			const blendedStrokeGene = this.dna.genesFor(`blendedStrokeGene ${n}`, 1, true);
			if ( this.dna.shapedNumber(blendedStrokeGene,0,1) > 0.4 ) { motor.stroke_time_strategy = 'blend'; }
			
			// all organisms must have ability to move forward and turn. 
			// If there is only one motor on the organism, make it a combo linear+angular.
			if ( num_motors > 1 ) {
				const comboChanceGene = this.dna.genesFor(`motor combo_chance ${n}`, 1, true);
				const combo_chance = this.dna.shapedNumber([comboChanceGene],0,1)
				if ( combo_chance > 0.75 && ( n < num_motors-1 || has_linear ) ) { linear = 0; }
				else if ( combo_chance < 0.25 && ( n < num_motors-1 || has_angular ) ) { angular = 0; }
			}
			
			if ( linear ) { 
				motor.linear = linear / stroketime; // normalize per second
				has_linear = true; 
				if ( wheel || linear > 0 ) has_forward = true;
			}
			if ( angular ) { 
				motor.angular = angular / stroketime; // normalize per second
				has_angular = true; 
			}
						
			// cost of motor is per mass, per second
			motor.cost = 0;
			if ( motor.linear ) { motor.cost += Boid.linear_motor_cost_adjust; }
			if ( motor.angular ) { motor.cost += Boid.angular_motor_cost_adjust; }
			motor.cost /= stroketime; // normalize per-second
			
			// animation
			motor.anim = {
				index:this.motors.length, // to be changed after body plan is created
				xval: 10 + Math.random() * 25, 
				yval: 10 + Math.random() * 25,
				xfunc: Math.random() > 0.5 ? 'time' : 'blend',
				yfunc: Math.random() > 0.5 ? 'time' : 'blend',
			};
			
			// naming - symbols we might use: ↰ ↱ ↲ ↳ ↶ ↷ ↸ ↹ ↺ ↻ ← ↑ → ↓ ↔ ↕ ↖ ↗ ↘ ↙ ⇄ ⇅
			const nameThatMotor = function( m ) {
				let name = '';
				if ( m.linear ) {
					name += m.linear > 0 ? '↑' : '↓';
				}
				if ( angular ) {
					name += m.angular > 0 ? '↷' : '↶'; // ← →
				}
				if ( wheel ) { 
					name = name.replace(/[↑↓]/g,'↕'); 
					name = name.replace(/[↶↷]/g,'↔'); 
				}
				// direction
				name = name.replace(/↑↶/,'↰'); 
				name = name.replace(/↑↷/,'↱'); 
				name = name.replace(/↓↶/,'↲'); 
				name = name.replace(/↓↷/,'↳'); 
				name = name.replace(/↕↔/,'✣'); 
				// power curve
				if ( m.strokefunc == 'constant' ) { name += ' ▻'; }
				else if ( m.strokefunc == 'linear_down' ) { name += ' ◺'; }
				else if ( m.strokefunc == 'linear_up' ) { name += ' ◿'; }
				else if ( m.strokefunc == 'bell' ) { name += ' ⌒'; }
				else if ( m.strokefunc == 'step_down' ) { name += ' ◳'; }
				else if ( m.strokefunc == 'step_up' ) { name += ' ◰'; }
				else if ( m.strokefunc == 'burst' ) { name += ' ∟'; }
				else if ( m.strokefunc == 'spring' ) { name += ' ⯾'; }
				// timing
				if ( m?.stroke_time_strategy == 'blend' ) { name += ' ≈'; }
				return name;
			}

			motor.name = nameThatMotor(motor);
			
			this.motors.push( motor );
			
			// create a symmetrical counterpart if it makes sense
			if ( motor.angular && ( !motor.wheel || motor.linear ) ) {
				let motor2 = Object.assign( {}, motor );
				motor2.angular = -motor.angular;
				if ( motor.wheel && motor.linear ) { motor2.linear = -motor.linear; }
				motor2.name = nameThatMotor(motor2); // + ' B';
				motor.name = motor.name; // + ' A';
				motor2.anim = Object.assign( {}, motor.anim );
				motor2.anim.yval = -motor2.anim.yval;
				if ( motor.wheel && motor.linear ) { motor2.anim.xval = -motor2.anim.xval; }
				this.motors.push(motor2);
				motor.sym = this.motors.length - 1; // index links to each partner
				motor2.sym = this.motors.length - 2;
			} 
		}
		
		// do accounting for regular motors: these mostly influence body size
		for ( let [i,m] of this.motors.entries() ) {
			let cost = 0;
			if ( m.linear ) {
				cost += 10 * ( Math.abs(m.linear) - min_linear_motor ) / ( max_linear_motor - min_linear_motor ) ;
			}
			if ( m.angular ) {
				cost += 4 * ( Math.abs(m.angular) - min_angular_motor ) / ( max_angular_motor - min_angular_motor ) ;
			}
			this.traits.boxfit.push([ 0, cost, `motors.${m.name}`]);
		}
			
		// reproductive motors
		const repro_type_roll = this.dna.shapedInt( this.dna.genesFor('repro_type_roll num',3,true), 0, 1);
		// mitosis
		if ( repro_type_roll < 0.5 ) {
			const mitosis_num = this.dna.shapedInt( this.dna.genesFor('mitosis num',2,true), 1,5,1,3);
			const stroketime = this.dna.shapedInt( this.dna.genesFor('mitosis stroketime',2,true), 
				mitosis_num * this.lifespan * 0.02, 
				mitosis_num * this.lifespan * 0.10,
				mitosis_num * this.lifespan * 0.05,
				2);
			const offspring_tax =  (1/(mitosis_num+2)) * mitosis_num; // 1/3, 2/4, 3/5, 4/6, 5/7
			// Cost is per stroke per unit of mass. The motor activation function will normalize it by mass per second.
			// Cost of mitosis depends on how much energy the parent wants to invest in the offspring.
			// Higher investment gives offspring a higher starting energy level.
			const mitosis_min_cost = (1/1000) * offspring_tax * stroketime; // cost per per mass second times length of gestation
			const mitosis_max_cost = (1/500) * offspring_tax * stroketime; // cost per per mass second times length of gestation
			const mitosis_cost = mitosis_min_cost + ( mitosis_max_cost - mitosis_min_cost ) * this.traits.offspring_investment;
			this.motors.push({
				mitosis: mitosis_num, // number of new organisms
				min_act: this.dna.shapedNumber( this.dna.genesFor('mitosis min act',2), 0.05, 0.9, 0.2, 5),
				cost: mitosis_cost, 
				stroketime: stroketime, 
				strokefunc: 'linear_up', 
				name: `mitosis+${mitosis_num}`,
				min_age: this.maturity_age,
				min_scale: 0.65, // prevents infinite subdivision
				use_max: true, // prevents cheating on time
				skip_sensor_check:true
			});
			// TODO: cost of reproduction depends on variety of factors
			this.traits.boxfit.push([ 0, 2 * mitosis_num * this.traits.offspring_investment, `motors.mitosis`]);
		}
		// budding
		else {
			const max_stroketime = this.lifespan * 0.5;
			const stroketime = max_stroketime * this.traits.offspring_investment;
			const min_cost = (1/1000) * ( 1 + stroketime / max_stroketime );
			const max_cost = (1/500) * ( 1 + stroketime / max_stroketime );
			const cost = min_cost + ( max_cost - min_cost ) * this.traits.offspring_investment;
			const min_act = this.dna.shapedNumber( this.dna.genesFor('bud min act',2), 0.05, 0.9, 0.2, 5);
			this.motors.push({
				bud: 1,
				min_act: min_act,
				cost: cost, 
				stroketime: stroketime, 
				strokefunc: 'linear_up', 
				name: `bud`,
				min_age: this.maturity_age,
				min_scale: (0.65 + 0.35 * this.traits.offspring_investment), // higher than mitosis!
				use_max: true, // prevents cheating on time
				skip_sensor_check:true
			});
			// requiring a large body for budding differentiates this from mitosis method
			this.traits.boxfit.push([ 1 * this.traits.offspring_investment, 20 * this.traits.offspring_investment, `motors.bud`]);
		}
		
		// combat
		const canAttack = this.dna.shapedNumber( this.dna.genesFor(`attack motor chance`,1,1) );
		if ( canAttack > 0.5 ) {
			const attackValue = this.dna.shapedNumber( this.dna.genesFor(`attack motor value`,1,1), 0.2, 2.0, 2, 3 ); 
			const max_stroketime = 10;
			let stroketime = max_stroketime * ( attackValue / 2 );
			const cost = ( Math.sqrt(1 + (max_stroketime - stroketime)) * (1/250) ) / stroketime; // discount for infrequent violence
			this.motors.push({
				attack: attackValue,
				min_act: this.dna.shapedNumber( this.dna.genesFor('attack motor min act',2), 0.25, 0.9, 0.5, 3),
				cost: cost,
				stroketime: stroketime, 
				strokefunc: 'linear_down', 
				name: `attack${attackValue.toFixed(1)}`,
				min_age: this.larval_age * 3,
				skip_sensor_check:true
				// TODO: throttle
			});
			this.traits.boxfit.push([ attackValue, attackValue * 3, `motors.attack`]);
		}
		
		// mark motors (calls, scents, "pheromones", flashes of light, etc...)
		const hasScent1 = this.dna.shapedNumber( 0x08000000 | this.dna.genesFor(`hasScent1`,1,1) );
		if ( hasScent1 > 0.42 ) { 
			let g1 = 0x08000000 | this.dna.genesFor(`scent1 index 1`,1,1); // this needs full length number spread
			let g2 = 0x08000000 | this.dna.genesFor(`scent1 index 2`,1,1); // this needs full length number spread
			let g3 = 0x08000000 | this.dna.genesFor(`scent1 index 3`,1,1); // this needs full length number spread
			const i1 = this.dna.shapedInt( g1, 3, 11 );
			const i2 = this.dna.shapedInt( g2, 3, 11 );
			const i3 = this.dna.shapedInt( g3, 3, 11 );
			let sense = new Array(16).fill(0);
			const strength = this.dna.shapedNumber( this.dna.genesFor(`scent1 strength`,2,1), 1, 10, 2, 3 );
			const radius = this.dna.shapedNumber( this.dna.genesFor(`scent1 radius`,2,1), 50, 650, 125, 3 );
			const time = this.dna.shapedNumber( this.dna.genesFor(`scent1 time`,2,1), 5, 30, 10, 3 );
			const lifespan = this.dna.shapedNumber( this.dna.genesFor(`scent1 lifespan`,2,1), 5, 20, 10, 3 );
			const act = this.dna.shapedNumber( this.dna.genesFor(`scent1 act`,2,1), 0.5, 1.0, 0.6, 3 );
			const cost = (1/500) / time;
			sense[i1] += strength;
			sense[i2] += strength * 0.5;
			sense[i3] += strength * 0.25;
			this.motors.push({
				sense,
				min_act: act,
				cost: cost,
				stroketime: time, 
				strokefunc: 'linear_down', 
				name: `scent-${i1}${i2}${i3}`,
				min_age: this.larval_age * 2,
				lifespan,
				r: radius,
				skip_sensor_check:true
			});		
			const boxcost = strength * radius * 0.001;
			this.traits.boxfit.push([ boxcost * 0.2, boxcost, `motors.scent1`]);
		}
		
		const hasScent2 = this.dna.shapedNumber( 0x08000000 | this.dna.genesFor(`hasScent2`,1,1) );
		if ( hasScent2 > 0.9 ) { 
			let g1 = 0x08000000 | this.dna.genesFor(`scent2 index`,1,1); // this needs full length number spread
			const i = this.dna.shapedInt( g1, 3, 11 );
			let sense = new Array(16).fill(0);
			const strength = this.dna.shapedNumber( this.dna.genesFor(`scent2 strength`,2,1), 1, 10, 2, 4 );
			const radius = this.dna.shapedNumber( this.dna.genesFor(`scent2 radius`,2,1), 50, 850, 125, 3 );
			const time = this.dna.shapedNumber( this.dna.genesFor(`scent2 time`,2,1), 5, 30, 10, 3 );
			const lifespan = this.dna.shapedNumber( this.dna.genesFor(`scent2 lifespan`,2,1), 2, 12, 5, 3 );
			const act = this.dna.shapedNumber( this.dna.genesFor(`scent2 act`,2,1), 0.68, 1.0, 0.78, 3 );
			const cost = (1/550) / time;
			sense[i] = strength;
			this.motors.push({
				sense,
				min_act: act,
				cost: cost,
				stroketime: time, 
				strokefunc: 'linear_down', 
				name: `scent-${i}`,
				min_age: this.larval_age * 2,
				lifespan,
				r: radius,
				skip_sensor_check:true
			});		
			const boxcost = strength * radius * 0.001;
			this.traits.boxfit.push([ boxcost * 0.2, boxcost, `motors.scent2`]);
		}
		
		const hasCall1 = this.dna.shapedNumber( 0x08000000 | this.dna.genesFor(`hasCall1`,1,1) );
		if ( hasCall1 > 0.77 ) { 
			let g1 = 0x08000000 | this.dna.genesFor(`call1 index`,1,1); // this needs full length number spread
			const i = this.dna.shapedInt( g1, 12, 15 );
			let sense = new Array(16).fill(0);
			const strength = this.dna.shapedNumber( this.dna.genesFor(`call1 strength`,2,1), 5, 20, 5, 3 );
			const radius = this.dna.shapedNumber( this.dna.genesFor(`call1 radius`,2,1), 125, 1000, 300, 3 );
			const time = this.dna.shapedNumber( this.dna.genesFor(`call1 time`,2,1), 5, 12, 7, 3 );
			const lifespan = this.dna.shapedNumber( this.dna.genesFor(`call1 lifespan`,2,1), 2, 5, 2, 3 );
			const act = this.dna.shapedNumber( this.dna.genesFor(`call1 act`,2,1), 0.55, 1.0, 0.68, 3 );
			const cost = (1/450) / time;
			sense[i] = strength;
			this.motors.push({
				sense,
				min_act: act,
				cost: cost,
				stroketime: time, 
				strokefunc: 'linear_down', 
				name: `call-${i}`,
				min_age: this.larval_age * 2,
				lifespan,
				r: radius,
				skip_sensor_check:true
			});		
			const boxcost = strength * radius * 0.001;
			this.traits.boxfit.push([ boxcost * 0.2, boxcost, `motors.call1`]);
		}
		
		const hasSignal1 = this.dna.shapedNumber( 0x08000000 | this.dna.genesFor(`hasSignal1`,1,1) );
		if ( hasSignal1 > 0.86 ) { 
			let g1 = 0x08000000 | this.dna.genesFor(`call1 index 1`,1,1); // this needs full length number spread
			let g2 = 0x08000000 | this.dna.genesFor(`call1 index 2`,1,1); // this needs full length number spread
			let g3 = 0x08000000 | this.dna.genesFor(`call1 index 3`,1,1); // this needs full length number spread
			const i1 = this.dna.shapedInt( g1, 0, 2 );
			const i2 = this.dna.shapedInt( g2, 0, 2 );
			const i3 = this.dna.shapedInt( g3, 0, 2 );
			let sense = new Array(16).fill(0);
			const strength = this.dna.shapedNumber( this.dna.genesFor(`signal1 strength`,2,1), 5, 10, 5, 3 );
			const radius = this.dna.shapedNumber( this.dna.genesFor(`signal1 radius`,2,1), 150, 1000, 250, 3 );
			const time = this.dna.shapedNumber( this.dna.genesFor(`signal1 time`,2,1), 3, 10, 5, 3 );
			const lifespan = this.dna.shapedNumber( this.dna.genesFor(`signal1 lifespan`,2,1), 2, 5, 2, 3 );
			const act = this.dna.shapedNumber( this.dna.genesFor(`signal1 act`,2,1), 0.6, 0.9, 0.7, 3 );
			const cost = (1/300) / time;
			sense[i1] += strength;
			sense[i2] += strength;
			sense[i3] += strength;
			this.motors.push({
				sense,
				min_act: act,
				cost: cost,
				stroketime: time, 
				strokefunc: 'linear_down', 
				name: `signal-${i1}${i2}${i3}`,
				min_age: this.larval_age * 2,
				lifespan,
				r: radius,
				skip_sensor_check:true
			});		
			const boxcost = strength * radius * 0.0005;
			this.traits.boxfit.push([ boxcost * 0.2, boxcost, `motors.signal1`]);
		}
		
		// // connect motor animations to specific points
		// let leftside_motors = this.motors.filter( m => typeof(m.sym)=='undefined' || m.sym < this.motors[m.sym].sym );
		// for ( let i=0; i < leftside_motors.length; i++ ) {
		// 	const m = leftside_motors[i];
		// 	const p = i+1;
		// 	// not enough points to give each one a different motor
		// 	if ( p >= Math.trunc((this.body.points.length)/2) ) {
		// 		m.anim.index = -1;
		// 	}
		// 	// assign the motor to the next point on the body
		// 	else {
		// 		// if there is a twin, assign that to the symmetrical point
		// 		if ( m.sym ) {
		// 			m.anim.index = p;
		// 			const opp = this.body.OppositePoint(p, this.body.points.length);
		// 			this.motors[m.sym].anim.index = opp; 
		// 		}
		// 		// singles use the nose or toe point
		// 		else {
		// 			m.anim.index = 0;
		// 		}
		// 	}
		// }	
		

		// SENSORS ------------------------\/--------------------------
		this.sensors = [];
		
		// whiskers
		const has_whiskers = this.dna.shapedNumber(this.dna.genesFor('has whiskers',2,true)) > 0.18;
		if ( has_whiskers ) {
			let whiskers = [];
			// up to three sets of side whiskers
			for ( let i=0; i<3; i++ ) {
				if ( this.dna.shapedNumber(this.dna.genesFor(`side whisker ${i}`,1,true)) < 0.25 ) {
					const length = this.dna.shapedNumber(this.dna.genesFor(`side whisker ${i} length`,2,1), 0.35, 1, 1, 3 );
					let angle = this.dna.shapedNumber(this.dna.genesFor(`side whisker ${i} angle`,2,1), 0, Math.PI);
					// don't get too close to front/rear 
					angle = utils.Clamp( angle, Math.PI/20, Math.PI-(Math.PI/20) );
					whiskers.push({l:length, a:angle});
					whiskers.push({l:length, a:-angle});
				}
			}
			// rear
			if ( this.dna.shapedNumber(this.dna.genesFor('rear whisker',1,true)) > 0.4 ) {
				const length = this.dna.shapedNumber(this.dna.genesFor('rear whisker length',2,1), 0.35, 1, 1, 3 );
				whiskers.push({l:length, a:-Math.PI});
			}
			// front - default if no other rolls
			const radius = this.dna.shapedNumber(this.dna.genesFor('whisker radius',3,2), 80, 700, 300, 3 );
			if ( !whiskers.length || this.dna.shapedNumber(this.dna.genesFor('front whisker',1,true)) > 0.25 ) {
				const length = this.dna.shapedNumber(this.dna.genesFor('front whisker length',2,1), 0.35, 1, 1, 3 );
				whiskers.push({l:length, a:0});
			}
			// normalize length values
			let longest = whiskers.reduce( (a,c) => Math.max(a,c.l), 0 );
			for ( let w of whiskers ) { w.l = w.l / longest; }
			this.sensors.push( new Sensor({ whiskers, x:0, y:0, r:radius, type:'whisker', detect:'whisker', color:'#FF22BB77', name:'whisker' }, this ) );		
			
			// boxfit costs
			const cost = whiskers.reduce( (a,c) => a + c.l, 0 );
			this.traits.boxfit.push([ cost * 0.3, cost, `sensors.whiskers`]);
		}
				
		// experimental: food-locator
		const has_food_locator = this.dna.shapedNumber(this.dna.genesFor('has food locator',1,true)) > 0.86;
		if ( has_food_locator ) {
			const radius = this.dna.shapedNumber(this.dna.genesFor('food locator radius',3,2), 150, 600, 300, 1.5 );
			const xoff = this.dna.shapedNumber(this.dna.genesFor('food locator xoff',3,2), -radius*0.5, radius, radius*0.5, 1.5 );
			const detect = ['near_food_dist'];
			// include density 
			if ( this.dna.shapedNumber(this.dna.genesFor('food locator density',1,true)) > 0.6 ) { detect.push('food_density'); }
			// use single angle number
			if ( this.dna.shapedNumber(this.dna.genesFor('food locator angle',1,true)) > 0.7 ) { detect.push('near_food_angle'); }
			// otherwise use more advanced sine/cosine pair
			else { detect.push('near_food_sine','near_food_cos'); }
			this.sensors.push( new Sensor({ 
				name: 'locate',
				type: 'locater',
				detect: detect, 
				x: xoff,
				y: 0, 
				r: radius,
				color: '#1444DDFF'
				},
			this ) );
			this.traits.boxfit.push([ radius * 0.01, radius * 0.01, `sensors.food_locator`]);
		}
		
		// color vision
		const has_vision = this.dna.shapedNumber(this.dna.genesFor('has vision',1,true)) > 0.35;
		if ( has_vision ) {
			const radius = this.dna.shapedNumber(this.dna.genesFor('vision radius',3,2), 100, 800, 350, 1.5 );
			const xoff = this.dna.shapedNumber(this.dna.genesFor('vision xoff',3,2), -radius*0.5, radius, radius*0.5, 1.5 );
			const yoff = this.dna.shapedNumber(this.dna.genesFor('vision yoff',3,2), 0, radius, radius*0.5, 1.5 );
			const chance_r = this.dna.shapedNumber(this.dna.genesFor('vision chance r',3,true), 0, 1 );
			const chance_g = this.dna.shapedNumber(this.dna.genesFor('vision chance g',3,true), 0, 1 );
			const chance_b = this.dna.shapedNumber(this.dna.genesFor('vision chance b',3,true), 0, 1 );
			const chance_i = this.dna.shapedNumber(this.dna.genesFor('vision chance i',3,true), 0, 1 );
			const detect = [];
			if ( chance_i < 0.20 ) { detect.push([0,1,2]); } // blended intensity
			else {
				if ( chance_r > 0.20 ) { detect.push([0]); }
				if ( chance_g > 0.20 ) { detect.push([1]); }
				if ( chance_b > 0.20 ) { detect.push([2]); }
			}
			if ( !detect.length ) { detect.push([0,1,2]); }
			const sensitivity = this.dna.shapedNumber(this.dna.genesFor('vision sensitivity',2,1), 0.5, 10, 2, 3 );
			
			// segmented vision
			const segmented_vision = this.dna.shapedNumber(this.dna.genesFor('segmented_vision',2,true));
			if ( segmented_vision ) {
				const segments = this.dna.shapedInt(this.dna.genesFor('vision num segments',2,true), 2, 18, 6, 5 );
				const cone = this.dna.shapedNumber(this.dna.genesFor('vision cone',2,true), Math.PI*0.5, Math.PI*2, Math.PI, 2 );
				this.sensors.push( new Sensor({ type:'sense', name: 'v1', segments, cone, color: '#FFFFFFBB', sensitivity:sensitivity/2, detect: detect, x: 0, y: 0, r: radius*1.25, falloff:1.2 }, this ) );
				const cost = segments * cone * radius * 0.0002;
				this.traits.boxfit.push([ cost, cost, `sensors.seg_vision`]);
			}
			// binary vision
			else {
				this.sensors.push( new Sensor({ type:'sense', name: 'v1', color: '#AAEEFFBB', sensitivity, fov:true, attenuation:true, detect: detect, x: xoff, y: yoff, r: radius, }, this ) );2
				this.sensors.push( new Sensor({ type:'sense', name: 'v2', color: '#AAEEFFBB', sensitivity, fov:true, attenuation:true, detect: detect, x: xoff, y: -yoff, r: radius, }, this ) );
				const cost = 2 * radius * 0.0005;
				this.traits.boxfit.push([ cost, cost, `sensors.bin_vision`]);
			}
		}
		
		// smell
		const has_smell = this.dna.shapedNumber(this.dna.genesFor('has smell sense',1,true)) > 0.3;
		if ( has_smell ) {
			const radius = this.dna.shapedNumber( this.dna.genesFor('smell sense radius',3,2), 200, 750, 350, 1.5 );
			const xoff = this.dna.shapedNumber( this.dna.genesFor('smell sense xoff',3,2), -radius*0.5, radius, radius*0.5, 1.5 );
			const yoff = this.dna.shapedNumber( this.dna.genesFor('smell sense yoff',3,2), 0, radius, radius*0.5, 1.5 );
			const detect = [];
			const rejects = [];
			// chance to detect indv channels
			for ( let i=0; i<9; i++ ) {
				const g1 = this.dna.genesFor('smell chance ' + i, 1, true);
				const chance = this.dna.mix(g1, 0, 1);
				if ( chance > 0.65 ) { detect.push(i+3); } // first three indexes are vision
				else { rejects.push(i+3); }
			}
			// random chance to have blended channel detection
			if ( rejects.length ) {
				while ( rejects.length ) {
					let num = this.dna.shapedInt( this.dna.genesFor('smell merge ' + rejects.length, 1, true), 2, 3);
					num = utils.Clamp( num, 1, rejects.length );
					const chance = this.dna.mix(this.dna.genesFor('smell merge chance ' + rejects.length, 1, true), 0, 1);
					const my_rejects = rejects.splice(0,num);
					if ( chance > 0.65 ) { 
						detect.push(my_rejects);
					}
				}
			}
			if ( detect.length ) {
				let sensitivity = this.dna.shapedNumber(this.dna.genesFor('smell sensitivity',2,1), 0.1, 3, 0.5, 3 );
				const chance = this.dna.shapedNumber(this.dna.genesFor('stereo smell',3,true));
				const mono = chance > 0.5;
				// mono
				if ( mono ) {
					this.sensors.push( new Sensor({ type:'sense', name: 'smell', color: '#FFBB00FF', falloff:2, sensitivity, detect: detect, x: xoff, y: 0, r: radius, }, this ) );
				} 
				// stereo
				else {
					this.sensors.push( new Sensor({ type:'sense', name: 'smell1', color: '#FFBB00FF', falloff:2, sensitivity, detect: detect, x: xoff, y: yoff, r: radius, }, this ) );
					this.sensors.push( new Sensor({ type:'sense', name: 'smell2', color: '#FFBB00FF', falloff:2, sensitivity, detect: detect, x: xoff, y: -yoff, r: radius, }, this ) );
				}
				// cost
				const cost = radius * 0.002 * detect.length;
				this.traits.boxfit.push([ cost, cost * (mono?1:1.6) , `sensors.smell`]);
			}
		}
		
		
		// hearing
		const has_hearing = this.dna.shapedNumber(this.dna.genesFor('has hearing sense',1,true)) > 0.6;
		if ( has_hearing ) {
			const radius = this.dna.shapedNumber( this.dna.genesFor('audio sense radius',3,2), 200, 750, 350, 1.5 );
			const xoff = this.dna.shapedNumber( this.dna.genesFor('audio sense xoff',3,2), -radius*0.5, radius, radius*0.5, 1.5 );
			const yoff = this.dna.shapedNumber( this.dna.genesFor('audio sense yoff',3,2), 0, radius, radius*0.5, 1.5 );
			const detect = [];
			const rejects = [];
			// chance to detect indv channels
			for ( let i=0; i<4; i++ ) {
				const g1 = this.dna.genesFor('audio chance ' + i, 1, true);
				const chance = this.dna.mix(g1, 0, 1);
				if ( chance > 0.65 ) { detect.push(i+12); } // indexes 12,13,14,15 are audio channels
				else { rejects.push(i+12); }
			}
			// random chance to have blended channel detection
			if ( rejects.length ) {
				while ( rejects.length ) {
					let num = this.dna.shapedInt( this.dna.genesFor('audio merge ' + rejects.length, 1, true), 2, 3);
					num = utils.Clamp( num, 1, rejects.length );
					const chance = this.dna.mix(this.dna.genesFor('audio merge chance ' + rejects.length, 1, true), 0, 1);
					const my_rejects = rejects.splice(0,num);
					if ( chance > 0.65 ) { 
						detect.push(my_rejects);
					}
				}
			}
			if ( detect.length ) {
				let sensitivity = this.dna.shapedNumber(this.dna.genesFor('audio sensitivity',2,1), 0.1, 3, 0.5, 3 );
				const chance = this.dna.shapedNumber(this.dna.genesFor('stereo audio',3,true));
				const mono = chance > 0.5;
				// mono
				if ( mono ) {
					this.sensors.push( new Sensor({ type:'sense', name: 'audio', color: '#EE3311FF', falloff:2, sensitivity, detect: detect, x: xoff, y: 0, r: radius, }, this ) );
				} 
				// stereo
				else {
					this.sensors.push( new Sensor({ type:'sense', name: 'audio1', color: '#EE3311FF', falloff:2, sensitivity, detect: detect, x: xoff, y: yoff, r: radius, }, this ) );
					this.sensors.push( new Sensor({ type:'sense', name: 'audio2', color: '#EE3311FF', falloff:2, sensitivity, detect: detect, x: xoff, y: -yoff, r: radius, }, this ) );
				}
				// cost
				const cost = radius * 0.005 * detect.length;
				this.traits.boxfit.push([ cost, cost * (mono?1:1.6) , `sensors.hearing`]);
			}
		}
		
		// food sensors
		const my_max_dim = 50;
		const max_sensor_radius = Math.sqrt(my_max_dim) * 50;
		const min_sensor_radius = Math.min( my_max_dim*1.5, max_sensor_radius );
		for ( let detect of ['food'/* ,'obstacles' */] ) {
			let base_num_sensors = this.dna.shapedInt( this.dna.genesFor('base num sensors',2,true) ,0,3,1.5,1.2); // 0..3
			for ( let n=0; n < base_num_sensors; n++ ) {
				let sx = 0;
				let sy = 0;
				let r = this.dna.shapedNumber( this.dna.genesFor(`${detect} sensor radius ${n}`,2,1), min_sensor_radius, max_sensor_radius) * (detect=='obstacles' ? 0.6 : 1.0);
				let d = this.dna.shapedNumber( this.dna.genesFor(`${detect} sensor distance ${n}`,2,1), min_sensor_radius, max_sensor_radius);
				// sensors need to stay close to the body:
				d = Math.min( d, r );
				// prefer sensors in front
				let a = ( this.dna.shapedNumber( this.dna.genesFor(`${detect} sensor angle ${n}`,2,1), 0, Math.PI * 2) + Math.PI ) % (Math.PI * 2);
				const symmetryGene = this.dna.genesFor(`${detect} sensor symmetry ${n}`,2,true);
				let color = detect==='obstacles' ? '#FF22BB77' : null;
				const single = this.dna.shapedNumber(symmetryGene, 0,1,0.5,0) < 0.33;
				// single
				if ( single) {
					this.sensors.push( new Sensor({ x:d, y:sy, r, angle:0, detect, color, name:`${detect}${n}` }, this ) );			
				}
				// double
				else {
					let i = 0;
					for ( let angle of [a, Math.PI*2-a] ) {
						sx = d * Math.cos(angle);
						sy = d * Math.sin(angle);				
						this.sensors.push( new Sensor({ x:sx, y:sy, r, angle, detect, color, name:`${detect}${n}-${i}` }, this ) );
						i++;
					}
				}
				// cost
				const cost = r * 0.01;
				this.traits.boxfit.push([ cost, cost * (single?1:1.6) , `sensors.food${n}`]);
			}
		}
		
		// proprioception
		// NOTE: this only makes sense if there are two or more motors.
		if ( this.motors.length >= 3 ) { // account for mitosis as a motor
			const proprio_chance = this.dna.shapedNumber( this.dna.genesFor('has proprio',3,true) );
			if ( proprio_chance < 0.25 ) { 
				this.sensors.push( new Sensor({detect:'proprio'}, this) );
				const cost = this.motors.length * 0.4;
				this.traits.boxfit.push([ cost, cost * 0.25, `sensors.proprioception`]);
			}
		}
		
		// displacement sensor
		for ( let i=1; i<=3; i++ ) { // short, medium, long
			const roll = this.dna.shapedNumber( this.dna.genesFor(`has disp sensor ${i}`,2,true) );
			if ( roll < 0.36 ) {
				let intervals = i * 3;
				let interval = i + 1;
				let invert = roll < 0.1;
				let name = `disp_${interval}x${intervals}${invert?'i':''}`;
				this.sensors.push( new Sensor({detect:'displacement',name,interval,intervals,invert}, this) );
				const cost = (intervals + interval) * 0.2;
				this.traits.boxfit.push([ cost, cost * 0.25, `sensors.displacement`]);
			}
		}
		
		// Note: copied from Brain.MakeBrain - we need to know brain type to influence sensors
		const brain_type_roll = this.dna.shapedNumber( this.dna.genesFor('brain network type',3), 0, 1, 0.5, 2 );
		let brain_type = 'perceptron';
		if ( brain_type_roll < 0.25 || brain_type_roll > 0.75 ) {
			brain_type = 'snn';
		}
		else if ( brain_type_roll > 0.5 ) {
			brain_type = 'epann';
		}
				
		let pulse_chance_0 = 0.0;
		let pulse_chance_1 = 0.3;
		let pulse_chance_2 = 0.2;
		let pulse_chance_3 = 0.02;
		if ( brain_type == 'snn' ) {
			pulse_chance_0 = 0.7;
			pulse_chance_1 = 0.9;
			pulse_chance_2 = 0.8;
			pulse_chance_3 = 0.2;
		}
		
		// random chance to get any of the non-collision sensors	
		const non_coll_sensors = {
			'pulse0': 		pulse_chance_0,
			'pulse1': 		pulse_chance_1,
			'pulse2': 		pulse_chance_2,
			'pulse3': 		pulse_chance_3,
			'energy': 		0.5,
			'inertia': 		0.3,
			'spin': 		0.1,
			'angle-sin': 	0.3,
			'angle-cos': 	0.3,
			'world-x': 		0.3,
			'world-y': 		0.3,
			'lifespan':		0.1,
			'malnourished':	0.05,
			'toxins': 		0.05,
			'chaos': 		0.03,
			//'friends': 		0.0,
			//'enemies': 		0.0,
			};
		for ( let k in non_coll_sensors ) {
			const n = this.dna.shapedNumber( this.dna.genesFor(`has sensor ${k} chance`,2,true), 0, 1 );
			if ( n < non_coll_sensors[k] ) {
				if ( k.substring(0,5)==='pulse' ) {
					const pulse_num = parseInt( k.substring(5,6) );
					const phase = pulse_num ? this.dna.shapedNumber( this.dna.genesFor(`pulse{$pulse_num} phase`,1), 0, 1 + Math.pow(4,pulse_num) ) : 0;
					const power = this.dna.shapedNumber( this.dna.genesFor(`pulse{$pulse_num} pow`,1), 0, 1, 0.5, 3 );
					const name = k + '/' + Math.ceil(phase);
					this.sensors.push( new Sensor({detect:'pulse', name, power, phase}, this) );
					this.traits.boxfit.push([ 1, 0.5, `sensors.pulse`]);
				}
				else {
					this.sensors.push( new Sensor({detect:k}, this) );
					this.traits.boxfit.push([ 1, 0.5, `sensors.${k}`]);
				}
			}
		}
		
		// if the organism has no inputs at all, they get fun defaults
		if ( !this.sensors.length ) {
			this.sensors.push( new Sensor({detect:'energy'}, this) );
			const n = this.dna.shapedNumber( this.dna.genesFor(`roll for chaos`,2,true), 0, 1 );
			if ( n < 0.5 ) {
				this.sensors.push( new Sensor({detect:'chaos'}, this) );
				this.traits.boxfit.push([ 0.2, 3, `sensors.chaos`]);
			}	
			else {		
				this.sensors.push( new Sensor({detect:'displacement',name:'disp_1x3',interval:1, intervals:3}, this) );
				this.traits.boxfit.push([ 1, 0.5, `sensors.displacement`]);
			}
		}
		
		// syneasthesia combines multiple sensor outputs together for weird results
		const synRoll = ( this.dna.shapedNumber( 0x08000000 | this.dna.genesFor('synesthesia',1,true) )
			+ this.dna.shapedNumber( 0x08000000 | this.dna.genesFor('synesthesia',1,true) ) ) / 2;
		if ( synRoll <= 0.01 ) { this.traits.synesthesia = 4; } // 1%
		else if ( synRoll <= 0.03 ) { this.traits.synesthesia = 3; } // 2%
		else if ( synRoll <= 0.07 ) { this.traits.synesthesia = 2; } // 4%
		
		this.MakeSensorLabels();
		
		this.species_hash = this.CreateSpeciesHash();
		
		// if we are copying from an existing organism, brain has already been mutated and transplanted at this point.
		// otherwise create brain now. brain needs data from this function to create correct number of inputs and outputs,
		// so it will be null at this point. chicken/egg problem.
		if ( this.brain === null ) {
			this.brain = new Brain({boid:this});
		}
		
		// calculate the cost of the brain (which we now definately have!)
		if ( this.brain.type === 'snn' ) {
			const node_cost = this.brain.network.nodes.length;
			this.traits.boxfit.push([ node_cost * 0.1, node_cost * 0.2, `brain.snn_nodes`]);
			const conn_cost = this.brain.network.nodes.reduce( (a,c) => a + (c.conns.length / 2), 0 );
			this.traits.boxfit.push([ conn_cost * 0.04, conn_cost * 0.02, `brain.snn_conns`]);
		}
		else if ( this.brain.type === 'perceptron' ) {
			// middle nodes cost more
			const node_cost = this.brain.network.nodes.reduce( (a,c) => a + ( (c.type=='input' || c.type=='output') ? 1 : 5 ) , 0 );
			this.traits.boxfit.push([ node_cost * 0.1, node_cost * 0.2, `brain.perceptron_nodes`]);
			const conn_cost = this.brain.network.connections.length;
			this.traits.boxfit.push([ conn_cost * 0.05, conn_cost * 0.025, `brain.perceptron_conns`]);
		}
		else if ( this.brain.type === 'epann' ) {
			let node_cost = this.brain.network.nodes.length;
			// middle nodes cost more
			let num_middles = this.brain.network.nodes.length - ( this.brain.network.num_inputs + this.brain.network.num_outputs);
			node_cost += num_middles * 4;
			this.traits.boxfit.push([ node_cost * 0.1, node_cost * 0.2, `brain.epann_nodes`]);
			const conn_cost = this.brain.network.nodes.reduce( (a,c) => a + (c.conns.length / 2), 0 );
			this.traits.boxfit.push([ conn_cost * 0.05, conn_cost * 0.025, `brain.epan_conns`]);
		}
		
		// tally the boxfit costs
		const metab_cost = Math.trunc(this.traits.boxfit.reduce( (a,c) => a + c[0], 0 ));
		const size_cost = 5 * Math.trunc(this.traits.boxfit.reduce( (a,c) => a + c[1], 0 ));
		this.traits.boxfit_metab_cost = metab_cost;
		this.traits.boxfit_size_cost = size_cost; // basically the "area" of the resulting body
		this.traits.base_metabolic_rate = ( metab_cost / 40 ) * 0.0022; // so much magic numberz
		
		// console.log(`M=${metab_cost}, S=${size_cost}`, this.traits.boxfit);
		
		// manually calculate body dimensions to pass to bodyplan
		const size_ratio_l = this.dna.shapedNumber( this.dna.genesFor('body_size_ratio_l',2,1), 1, 10, 6, 2);
		const size_ratio_w = this.dna.shapedNumber( this.dna.genesFor('body_size_ratio_w',2,1), 1, 8, 3, 2);
		const size_ratio = size_ratio_l / size_ratio_w;
		const new_length = Math.sqrt( size_cost * size_ratio );
		const new_width = Math.sqrt( size_cost / size_ratio );

		// now create the body shape
		this.body = new BodyPlan( this.dna, new_length, new_width );
		this.sense[0] = this.body.sensor_colors[0];
		this.sense[1] = this.body.sensor_colors[1];
		this.sense[2] = this.body.sensor_colors[2];
		this.sense[3] =  Math.max( 0, this.dna.shapedNumber( this.dna.genesFor('body odor 1',2,1), -0.25, 1, 0.2, 2 ) );
		this.sense[4] =  Math.max( 0, this.dna.shapedNumber( this.dna.genesFor('body odor 2',2,1), -0.25, 1, 0.4, 2 ) );
		this.sense[5] =  Math.max( 0, this.dna.shapedNumber( this.dna.genesFor('body odor 3',2,1), -0.25, 1, 0.6, 2 ) );
		this.sense[6] =  Math.max( 0, this.dna.shapedNumber( this.dna.genesFor('body odor 4',2,1), -0.25, 1, 0.8, 2 ) );
		this.sense[7] =  Math.max( 0, this.dna.shapedNumber( this.dna.genesFor('body odor 5',2,1), -0.25, 1, 0.7, 2 ) );
		this.sense[8] =  Math.max( 0, this.dna.shapedNumber( this.dna.genesFor('body odor 6',2,1), -0.25, 1, 0.5, 2 ) );
		this.sense[9] =  Math.max( 0, this.dna.shapedNumber( this.dna.genesFor('body odor 7',2,1), -0.25, 1, 0.3, 2 ) );
		this.sense[10] = Math.max( 0, this.dna.shapedNumber( this.dna.genesFor('body odor 8',2,1), -0.25, 1, 0.1, 2 ) );
		this.sense[11] = Math.max( 0, this.dna.shapedNumber( this.dna.genesFor('body odor 9',2,1), -0.25, 1, 0.05, 2 ) );

		// effective length term influences how effective length is calculated in ScaleBoidByMass
		this.traits.effective_length_term = this.dna.shapedNumber( this.dna.genesFor('effective_length_term',1,true), -2, 2, 1, 2);

		// fill out our form	
		this.ScaleBoidByMass();
		
		// reset energy level to max if this is a new organism
		if ( !this.metab.energy ) { this.metab.energy = this.metab.max_energy; }
	}

	// analyzes species-defining features to create a hash for quick comparisons
	CreateSpeciesHash() {			
		return utils.murmurhash3_32_gc(
			// sensor labels
			this.sensor_labels.join() 
			// motors - basic features
			+ this.motors.map( m =>
				// lop off last character which represents the motor timing - this is not a defining feature
				(m.linear || m.angular) 
				? m.name.substring(0, m.name.length - 1)
				: m.name
			).join()
			// diet
			+ ',' + this.traits.food_mask
			+ ',' + this.traits.poop_complexity
		);
	}
	
	Copy( reset=false, dna_mutation=0, brain_mutation=0, speciation_chance=0 ) {
		brain_mutation = utils.Clamp( brain_mutation, 0, 1 );
		dna_mutation = utils.Clamp( dna_mutation, 0, 1 );
		let b = new Boid(this.x, this.y, this.tank);
		// POD we can just copy over
		let datakeys = ['species','genus','generation','speciation'];
		for ( let k of datakeys ) { b[k] = this[k]; }
		b.dna = new DNA( this.dna.str );
		// transplant the brain first to prevent a default DNA brain from growing 
		b.brain = new Brain({brain:this.brain});
		if ( brain_mutation ) {
			const max_nn_muts = 50;
			const nn_mutations = utils.RandomInt( 1, Math.ceil( max_nn_muts * brain_mutation ) );
			b.brain.Mutate(nn_mutations);
		}
		// mutate DNA before rehydratng
		if ( dna_mutation ) {
			const max_dna_muts = 20;
			b.dna.mutate( 
				utils.RandomInt( 1, Math.ceil( max_dna_muts * dna_mutation ) ),
				(1-speciation_chance)
			); 
		}
		// create the boid in full
		b.RehydrateFromDNA();
		// subspecies names
		if ( b.species_hash != this.species_hash ) {
			b.species = utils.RandomName(9);
			b.speciation += 1;
			// remap brain inputs and outputs to align with changes in abilities
			b.brain.Remap(b);
		}
		// b.mass = b.body.mass; // random boids start adult size / full grown
		b.mass = ( 0.5 + Math.random() * 0.5 ) * b.body.mass; // random size
		b.ScaleBoidByMass();			
		b.collision.radius = this.collision.radius;
		b.generation = this.generation + 1;
		if ( reset ) { b.Reset(); }
		return b;
	}

	Export( as_JSON=false ) {
		let b = {};
		// POD we can just copy over
		let datakeys = ['id','x','y','species','genus','age','stomach_contents', 'energy', 'mass', 'scale', 'length', 'width', 'generation','speciation', 'metab' ];		
		for ( let k of datakeys ) { b[k] = this[k]; }
		b.brain = this.brain.toJSON();
		b.dna = this.dna.str;
		// save motor timings - not doing this can mess up sensative mitosis strategies
		b.motor_state = this.motors.map( m => ({
			t: m.t,
			last_amount: m.last_amount,
			this_stroke_time: m.this_stroke_time,
			strokepow: m.strokepow,
		}));
		// trim insignificant digits to save space
		if ( as_JSON ) {
			return JSON.stringify(b).replace(/\d+\.\d+/g, x => parseFloat(x).toPrecision(6) );
		}
		return b;
	}
	
	// For debugging collision and bodyplan stuff
	DrawBounds( on=true ) {
		// if ( this.bounds1 ) { this.bounds1.remove(); this.bounds1 = null; }
		// if ( this.bounds2 ) { this.bounds2.remove(); this.bounds2 = null; }
		// if ( this.bounds3 ) { this.bounds3.remove(); this.bounds3 = null; }
		// if ( this.bounds4 ) { this.bounds4.remove(); this.bounds4 = null; }
		
		// if ( on ) {
		// 	// actual shape size
		// 	let pts = [
		// 		[ -this.length/2, this.width/2 ],
		// 		[ this.length/2, this.width/2 ],
		// 		[ this.length/2, -this.width/2 ],
		// 		[ -this.length/2, -this.width/2 ],
		// 	]			
		// 	let anchors = pts.map( p => new Two.Anchor( p[0], p[1] ) );
		// 	this.bounds1 = globalThis.two.makePath(anchors);
		// 	this.bounds1.linewidth = 1;
		// 	this.bounds1.stroke = 'pink';
		// 	this.bounds1.fill = 'transparent';
		// 	this.container.add([this.bounds1]);
			
		// 	// max genomic size
		// 	let pts2 = [
		// 		[ -this.body.max_length/2, this.body.max_width/2 ],
		// 		[ this.body.max_length/2, this.body.max_width/2 ],
		// 		[ this.body.max_length/2, -this.body.max_width/2 ],
		// 		[ -this.body.max_length/2, -this.body.max_width/2 ],
		// 	];
		// 	let anchors2 = pts2.map( p => new Two.Anchor( p[0], p[1] ) );
		// 	this.bounds2 = globalThis.two.makePath(anchors2);
		// 	this.bounds2.linewidth = 1;
		// 	this.bounds2.stroke = 'lime';
		// 	this.bounds2.fill = 'transparent';
		// 	this.container.add([this.bounds2]);
					
		// 	// min genomic size				
		// 	let pts3 = [
		// 		[ -this.body.min_length/2, this.body.min_width/2 ],
		// 		[ this.body.min_length/2, this.body.min_width/2 ],
		// 		[ this.body.min_length/2, -this.body.min_width/2 ],
		// 		[ -this.body.min_length/2, -this.body.min_width/2 ],
		// 	];
		// 	let anchors3 = pts3.map( p => new Two.Anchor( p[0], p[1] ) );
		// 	this.bounds3 = globalThis.two.makePath(anchors3);
		// 	this.bounds3.linewidth = 1;
		// 	this.bounds3.stroke = 'cyan';
		// 	this.bounds3.fill = 'transparent';
		// 	this.container.add([this.bounds3]);
			
		// 	// collision circle
		// 	this.bounds4 = globalThis.two.makeCircle(0,0,Math.max(this.length,this.width)/2);
		// 	this.bounds4.linewidth = 1;
		// 	this.bounds4.stroke = 'red';
		// 	this.bounds4.fill = 'transparent';
		// 	this.container.add([this.bounds4]);
		// }
	}
	
	GeoData() {
		return {
			type: 'path',
			fill: this.body.fill,
			linewidth: this.body.linewidth,
			curved: this.body.curved,
			stroke: this.body.stroke,
			dashes: this.body.dashes,
			points: this.body.points
		};
	}
};