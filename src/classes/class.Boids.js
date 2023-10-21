import neataptic from "neataptic";
import BodyPlan from '../classes/class.BodyPlan.js'
import Sensor from '../classes/class.Sensor.js'
import Rock from '../classes/class.Rock.js'
import Food from '../classes/class.Food.js'
import DNA from '../classes/class.DNA.js'
import * as utils from '../util/utils.js'
import {Circle, Polygon, Result} from 'collisions';
const { architect, Network } = neataptic;
import Two from "two.js";

neataptic.methods.mutation.MOD_ACTIVATION.mutateOutput = false;
neataptic.methods.mutation.SWAP_NODES.mutateOutput = false;

export function BoidFactory( type, x, y, tank ) {
	return Boid.Random(x, y, tank);
}
	
export class Boid {

	static mutationOptionPicker = new utils.RandomPicker( [
		[ neataptic.methods.mutation.ADD_NODE, 			16 ],
		[ neataptic.methods.mutation.SUB_NODE, 			20 ],
		[ neataptic.methods.mutation.ADD_CONN, 			34 ],
		[ neataptic.methods.mutation.SUB_CONN, 			40 ],
		[ neataptic.methods.mutation.MOD_WEIGHT, 		1000 ],
		[ neataptic.methods.mutation.MOD_BIAS, 			500 ],
		[ neataptic.methods.mutation.MOD_ACTIVATION, 	15 ],
		[ neataptic.methods.mutation.ADD_GATE, 			10 ],
		[ neataptic.methods.mutation.SUB_GATE, 			10 ],
		[ neataptic.methods.mutation.ADD_SELF_CONN, 	10 ],
		[ neataptic.methods.mutation.SUB_SELF_CONN, 	10 ],
		[ neataptic.methods.mutation.ADD_BACK_CONN, 	10 ],
		[ neataptic.methods.mutation.SUB_BACK_CONN, 	10 ],
		[ neataptic.methods.mutation.SWAP_NODES, 		12 ],
	] );
	
	Reset() {
		this.x = 0;
		this.y = 0;
		this.energy = this.max_energy;
		this.age = 0; // in seconds
		this.stomach_contents = 0;
		this.angle = Math.random()*Math.PI*2;
		this.inertia = 0; // forward motion power, can be negative
		this.angmo = 0; // angular momentum / rotational inertia
		// zero out all motor timing
		for ( const m of this.motors ) {
			m.t = 0;
			m.last_amount = 0;
			m.this_stoke_time = 0;
			m.strokepow = 0; 
		}				
	}
	
	constructor( x=0, y=0, tank=null, json=null ) {
		this.id = Math.random();
		this.dna = '';
		this.generation = 1;
		this.tank = tank;
		this.species = 'unknown';
		// physical stuff
		this.max_energy = 100;
		this.energy = this.max_energy;
		this.x = x;
		this.y = y;
		this.lifespan = 120; // in seconds
		this.age = 0; // in seconds
		this.maturity_age = this.lifespan * 0.5;
		this.mass = 1; // requires body plan info later
		this.scale = 1; // current mass over body plan mature mass
		this.length = 1; 
		this.width = 1; 
		this.min_mass = 1; // size of organism when starting baby 
		this.base_energy = 1; // max energy per mass
		this.base_rest_metabolism = 0.006; // energy per second per mass
		this.base_digestion_rate = 0.003; // food per second per mass
		this.base_bite_rate = 0.5; // food per second per mass
		this.base_stomach_size = 0.3; // food per mass
		// diet
		this.stomach_size = 100;
		this.stomach_contents = 0;
		this.bite_rate = 100; // food per second
		this.digestion_rate = 1; // food per second
		this.energy_per_food = 15; // energy per food
		this.diet = 0; // 0..1
		this.diet_range = 0.5; // 0..1
		this.rest_metabolism = 0.2; // energy per second
		// collision
		this.collision = {
			shape: 'circle',
			fixed: false,
			radius: 15 // TODO: update
		};
		this.momentum_x = 0; // use momentum with the momentum_based code in Update()
		this.momentum_y = 0;
		this.maxspeed = 2000; // these are global maximum speeds to prevent collision detection from breaking in fringe cases
		this.maxrot = 20;
		this.angle = Math.random()*Math.PI*2;
		this.inertia = 0; // forward motion power, can be negative
		this.angmo = 0; // angular momentum / rotational inertia
		// drawing stuff
		this.outline_color = utils.RandomColor( true, false, true ) + 'AA';
		this.fill_color = utils.RandomColor( true, false, true ) + 'AA';
		this.container = window.two.makeGroup();
		this.container.position.x = x;
		this.container.position.y = y;
		this.container.visible = true;
		window.vc.AddShapeToRenderLayer(this.container); // main layer
		// neuro stuff
		this.brain = null;
		// vision and sensors
		this.sensors = [];
		this.fitness_score = 0; // per frame
		this.total_fitness_score = 0; // accumulates over time
		this.last_movement_cost = 0;
		// motors
		this.motors = [];
		// shimmed in for testing:
		// this.total_movement_cost = 0;
		// this.last_movement_cost = 0;
		
		// rehydrate objects from JSON if supplied
		if ( json && typeof json === 'object' ) {
			Object.assign(this,json);
			this.brain = neataptic.Network.fromJSON(this.brain);
			this.body = new BodyPlan(this.body);
			this.collision.radius = Math.max(this.length, this.width) / 2;
			this.container.add([this.body.geo]);
			this.sensors = this.sensors.map( s => new Sensor(s,this) );
			this.MakeSensors(); // adds geometry and stuff
		}
				
	}
	MakeGeometry() { }
	MakeMotors() {}
	// inherit this function
	MakeSensors() { }
	MakeBrain( inputs, middles, outputs, connections=null, type='random' ) {	
		if ( type=='perceptron' ) {
			this.brain = architect.Perceptron(inputs, middles||1, outputs);			
		}
		else {
			this.brain = architect.Random(inputs, middles, outputs);			
		}
		// prune out default connections that Neataptic likes to set up.
		// NOTE: this could be optimized by building network from scratch.
		if ( connections > 0 ) {
			let sanity = 100; 
			while ( this.brain.connections.length > connections && --sanity ) {
				this.brain.mutate( neataptic.methods.mutation.SUB_CONN );
			}
		}
	}
	
	MutateBrain( mutations=1 ) {
		mutations = utils.Clamp(mutations,0,1000);
		for ( let n=0; n < mutations; n++ ) {
			this.brain.mutate( Boid.mutationOptionPicker.Pick() );
		}
		// this resets output node bias to zero. 
		// letting it run amok can lead to "locked in" brain outputs that never change. 
		// you might specifically want it back someday
		this.brain.nodes.filter(n=>n.type=='output').forEach(n => n.bias = 0 );
	}
	
	Update( delta ) {
	
		const frame_skip = 0; // [!]EXPERIMENTAL TODO: make this a game setting
		
		if ( !delta ) { return; }
		
		// aging out
		this.age += delta;
		if ( this.age > this.lifespan ) {
			this.Kill();
			return;
		}
		
		// metabolism
		this.energy -= this.rest_metabolism * delta;
		const morcel_size = Math.min( delta * this.digestion_rate, this.stomach_contents );
		if ( morcel_size > 0 ) {
			this.stomach_contents -= morcel_size;
			this.energy += morcel_size * this.energy_per_food;
			// eat food, grow big!
			if ( this.mass < this.body.mass && this.energy > this.max_energy ) {
				const excess_food = (this.energy - this.max_energy) / this.energy_per_food;
				this.mass += excess_food * 500; // conversion rate would be meaningful?
				if ( this.mass >= this.body.mass ) { this.mass = this.body.mass; }
				this.ScaleBoidByMass();
			}
			this.energy = Math.min( this.energy, this.max_energy );
		}
		if ( this.energy <= 0 ) {
			this.Kill();
			return;
		}
		
		// sensor collision detection				
		this.collision.contact_obstacle = false;
		if ( !frame_skip || window.two.frameCount % frame_skip === 0 ) {
			for ( let s of this.sensors ) { s.Sense(); }
		}
		
		// UI: toggle collision detection geometry UI
		if ( ( window.vc.show_collision_detection || this.show_sensors ) && !this.sensor_group ) {
			this.sensor_group = window.two.makeGroup();
			this.sensor_group.add( this.sensors.filter( s => s.detect=='food' || s.detect=='obstacles' ).map( i => i.CreateGeometry() ) );
			this.container.add(this.sensor_group);
		}
		else if ( !( window.vc.show_collision_detection || this.show_sensors ) && this.sensor_group ) {
			this.sensor_group.remove();
			this.sensor_group = null;
		}
		
		// CPU optimization: we don't need to run AI every frame
		if ( !frame_skip || window.two.frameCount % frame_skip === 0 ) {
			// movement / motor control 				
			let brain_outputs = this.brain.activate( this.NeuroInputs() );
			for ( let k in brain_outputs ) {
				if ( Number.isNaN(brain_outputs[k]) ) { brain_outputs[k] = 0; }
			}
			// estimate cost of moving to see if we can afford to move at all
			let cost = 0
			for ( let i=0; i < brain_outputs.length; i++ ) {
				cost += this.ActivateMotor( i, brain_outputs[i], delta, true ); // estimate costs
			}
			// activate all motors at once, even if it seems contradictory
			if ( this.energy >= cost ) {
				for ( let i=0; i < brain_outputs.length; i++ ) {
					this.ActivateMotor( i, Math.tanh(brain_outputs[i]), delta );
				}
			}
			this.last_movement_cost = cost; // helps training functions
		}
		// shoot blanks but keep the motors running through strokes
		else {
			for ( let i=0; i < this.motors.length; i++ ) {
				this.ActivateMotor( i, 0, delta );
			}
		}
		
		// [!]EXPERIMENTAL - Animate geometry - proof of concept
		// There is just enough here to be amusing, but its not accurate and needs improvement
		if ( window.vc.animate_boids && !window.vc?.simulation?.turbo ) {
		
			// for ( let m of this.motors ) {
			// 	if ( m.anim.index < 0 || m.anim.index >= this.body.geo.vertices.length ) { break; }
				
			// 	// effect based on stroke power
			// 	const effect1 = ( m.this_stoke_time && m.last_amount )
			// 		? (m.this_stoke_time ? m.last_amount : 0)
			// 		: 0;
			// 	// effect based on stroke time (smoother but less accurate)
			// 	const effect2 = m.this_stoke_time 
			// 		? (Math.sin(((m.t||0)/m.this_stoke_time) * Math.PI))
			// 		: 0;
			// 	// blended result
			// 	const effect = (effect1 + effect2) / 2;
				
			// 	let v = this.body.geo.vertices[m.anim.index];
			// 	if ( !v.origin ) { 
			// 		v.origin = new Two.Vector().copy(v); 
			// 	}
			// 	v.x = v.origin.x + m.anim.xval * effect;
			// 	v.y = v.origin.y + m.anim.yval * effect;
			// }
			
			for ( let m=0; m < this.motors.length; m++ ) {
				if ( m >= this.body.geo.vertices.length ) { break; }
				// effect based on stroke power
				const effect1 = ( this.motors[m].this_stoke_time && this.motors[m].last_amount )
					? (this.motors[m].this_stoke_time ? this.motors[m].last_amount : 0)
					: 0;
				// effect based on stroke time (smoother but less accurate)
				const effect2 = this.motors[m].this_stoke_time 
					? (Math.sin(((this.motors[m].t||0)/this.motors[m].this_stoke_time) * Math.PI))
					: 0;
				// blended result
				const effect = (effect1 + effect2) / 2;
				
				let v = this.body.geo.vertices[m];
				if ( !v.origin ) { 
					v.origin = new Two.Vector().copy(v); 
					v.xoff = (0.1 + Math.random()) * 0.25 * this.body.length * (Math.random() > 0.5 ? 1 : -1 );
					v.yoff = (0.1 + Math.random()) * 0.25 * this.body.width * (Math.random() > 0.5 ? 1 : -1 );
				}
				v.x = v.origin.x + v.xoff * effect;
				// do opposing vertex
				const oppo_index = this.body.OppositePoint(m, this.body.geo.vertices.length);
				if ( oppo_index !== m ) { 
					v.y = v.origin.y + v.yoff * effect2;
					const v2 = this.body.geo.vertices[oppo_index]; 
					if ( !v2.origin ) { 
						v2.origin = new Two.Vector().copy(v2); 
						v2.xoff = v.xoff;
						v2.yoff = -v.yoff;
					}
					v2.x = v2.origin.x + v2.xoff * effect;
					v2.y = v2.origin.y + v2.yoff * effect2;
				}
			}
		}
		
		// update position with movement:
		// - The object has angular momentum that changes its pointing angle.
		// - Inertia and angle determine the direction of power generated by motors in pixels per second.
		// - Momentum is the force of direction of the object as a whole, in x/y pixels per second
		
		// MOMENTUM BASED MOVEMENT:
		// To use, make sure boids have .momentum_x and .momentum_y members.
		// Uncomment the block below and comment out the current physics code
		// Momentum is physically more accurate in outer space, but looks weird
		// for "underwater" feel we are going for. Using the simpler inertia/angle
		// system looks more like what you expect from a hydrodynamic system.
		
		// adjust pointing angle based on spin (angular momentum)
		this.angle = utils.mod( this.angle + (delta * this.angmo), 2*Math.PI );
		// apply current forward power to our momentum
		const sinAngle = Math.sin(this.angle);
		const cosAngle = Math.cos(this.angle);		
		this.momentum_x += this.inertia * cosAngle; // don't factor in delta here, motor functions have already applied it
		this.momentum_y += this.inertia * sinAngle; // don't factor in delta here, motor functions have already applied it
		// translate position based on momentum
		this.x += this.momentum_x * delta;
		this.y += this.momentum_y * delta;
		// dragging on walls kill momentum / inertia
		if ( this.x < 0 ) { this.inertia *= 0.75; this.momentum_x = 0; }
		if ( this.y < 0 ) { this.inertia *= 0.75; this.momentum_y = 0; }
		if ( this.x > this.tank.width ) { this.inertia *= 0.75; this.momentum_x = 0; }
		if ( this.y > this.tank.height ) { this.inertia *= 0.75; this.momentum_y = 0; }	
		// stay inside tank			
		this.x = utils.clamp( this.x, 0, this.tank.width );
		this.y = utils.clamp( this.y, 0, this.tank.height );
		// drag slows us down.
		// REFERENCE: Real world drag formula (which we don't actually use) :
		// drag = 0.5 * coefficient * face_area * fluid_density * speed^2
		let drag = ( 
			this.tank.viscosity +
			( Math.min(Math.abs(this.inertia),200) / 200 ) +
			( Math.min(this.width,100) / 100 )
		) / 3;
		drag *= Math.pow( delta, 0.08 ); // magic tuning number
		drag = 1 - drag;
		this.momentum_x *= drag;
		this.momentum_y *= drag;
		this.inertia *= drag;
		this.angmo *= drag;
		// max speed caps
		const absolute_max_speed = 2000;
		this.momentum_x = utils.Clamp( this.momentum_x, -absolute_max_speed, absolute_max_speed );
		this.momentum_y = utils.Clamp( this.momentum_y, -absolute_max_speed, absolute_max_speed );
		this.inertia = utils.Clamp( this.inertia, -absolute_max_speed, absolute_max_speed );
		this.angmo = utils.Clamp( this.angmo, -this.maxrot, this.maxrot );
		if ( this.inertia > -5 && this.inertia < 5 ) { this.inertia = 0; } // come to a stop before end of universe
		if ( this.angmo > -0.05 && this.angmo < 0.05 ) { this.angmo = 0; }
		
			
		// INERTIA-BASED MOVEMENT: ignores momentum physics
		
		// // update pointing angle based on spin
		// let sinAngle = Math.sin(this.angle);
		// let cosAngle = Math.cos(this.angle);
		// // [!]TECHNICAL: Javascript `%` operator is NOT mathematically strict modulus and behaves badly on negative numbers!
		// this.angle = utils.mod( this.angle + (delta * this.angmo), 2*Math.PI );
		// // move forward or backward
		// this.x += delta * this.inertia * cosAngle;
		// this.y += delta * this.inertia * sinAngle;
		// // hitting walls causes artificial drag
		// if ( this.x < 0 ) { this.inertia *= 0.75; }
		// if ( this.y < 0 ) { this.inertia *= 0.75; }
		// if ( this.x > this.tank.width ) { this.inertia *= 0.75; }
		// if ( this.y > this.tank.height ) { this.inertia *= 0.75; }				
		// // stay inside world bounds
		// this.x = utils.clamp( this.x, 0, this.tank.width );
		// this.y = utils.clamp( this.y, 0, this.tank.height );
		// // viscosity slows down inertia over time
		// this.inertia *= (1 - ( this.tank.viscosity * delta * 10 ) );
		// this.angmo *= (1 - ( this.tank.viscosity * delta * 10 ) );
		// // speed caps
		// if ( this.inertia > this.maxspeed ) { this.inertia = this.maxspeed; }
		// if ( this.inertia < -this.maxspeed ) { this.inertia = -this.maxspeed; }
		// if ( this.inertia > -5 && this.inertia < 5 ) { this.inertia = 0; } // come to a stop before end of universe
		// if ( this.angmo > this.maxrot ) { this.angmo = this.maxrot; }
		// if ( this.angmo < -this.maxrot ) { this.angmo = -this.maxrot; }
		// if ( this.angmo > -0.05 && this.angmo < 0.05 ) { this.angmo = 0; }
		
		
		// collision detection with obstacles
		// things i might collide with:
		let my_radius = Math.max(this.length, this.width) * 0.5;
		let candidates = this.tank.grid.GetObjectsByBox( 
			this.x - my_radius,
			this.y - my_radius,
			this.x + my_radius,
			this.y + my_radius,
			Rock
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
				this.inertia *= 0.75; // what a drag
				// this.body.geo.fill = '#D11';
				this.collision.contact_obstacle = true;
			}
		}
		
		// update drawing geometry
		// optimization: if turbo is enabled, draw nothing
		// if ( !window.vc?.simulation?.turbo ) {
			this.container.position.x = this.x;
			this.container.position.y = this.y;
			this.container.rotation = this.angle;
		// }
				
		// eat food
		if ( this.stomach_contents / ( this.stomach_size * this.scale ) < 0.98 ) { // prevents wasteful eating
			const grace = 4;
			const r = this.collision.radius + grace;
			let foods = this.tank.foods.length < 50 // runs faster on small sets
				? this.tank.foods			
				: this.tank.grid.GetObjectsByBox( this.x - r, this.y - r, this.x + r, this.y + r, Food );				
			for ( let food of foods ) { 
				const dx = Math.abs(food.x - this.x);
				const dy = Math.abs(food.y - this.y);
				const d = Math.sqrt(dx*dx + dy*dy);
				if ( d <= this.collision.radius + food.r && food.IsEdibleBy(this) ) { 
					const morcel = food.Eat(delta*this.bite_rate*this.scale);
					this.stomach_contents = Math.min( this.stomach_contents + morcel, this.stomach_size * this.scale );
					break; // one bite only!
				}
			}
		}
		
	}
	// use estimate=true if you want a cost value returned instead of the actual movement 
	ActivateMotor( i, amount /* -1..1 */, delta, estimate = false ) {
		// sometimes neataptic can output nan and infinities. 
		if ( Number.isNaN(amount) || !Number.isFinite(amount) ) { return 0; }
		let m = this.motors[i];
		if ( m ) {
			// start a timer if there isnt one
			if ( !m.hasOwnProperty('t') ) { m.t = 0; }
			// shift amount to halfway point for wheel motors (0..1 becomes -1..1)
			if ( m.wheel ) { amount = (amount - 0.5) * 2; } 
			// sanity check
			amount = utils.clamp(amount,-1,1);
			// new stroke
			if ( m.t==0 ) { 
				// check for minimum activation
				if ( m.min_act && Math.abs(amount) < m.min_act ) { 
					m.last_amount = 0;
					m.this_stoke_time = 0;
					return 0; 
				}
				// age restricted
				if ( m.hasOwnProperty('min_age') && this.age < m.min_age ) { 
					m.last_amount = 0;
					m.this_stoke_time = 0;
					return 0; 
				}
				// you must be this tall to enter
				if ( m.hasOwnProperty('min_scale') && this.scale < m.min_scale ) { 
					m.last_amount = 0;
					m.this_stoke_time = 0;
					return 0; 
				}
				// tank capacity sanity cap
				if ( m.hasOwnProperty('mitosis') && this.tank.boids.length >= (window.vc?.simulation?.settings?.num_boids || 100) ) {
					m.last_amount = 0;
					m.this_stoke_time = 0;
					return 0; 
				}
				// mitosis and other triggers must use the full amount, regardless of activation
				if ( m.hasOwnProperty('use_max') ) {
					amount = 1; 
				}
				// if we decided to activate a new stroke, record the power it was
				// activated with instead of using a varying stroke each frame.
				m.strokepow = amount; 
				// use this if you want the stroke time to coordinate with the power
				// i.e. a quick flick versus a hard push
				// m.this_stoke_time = m.stroketime * amount;
				// use this modified version to make sure stroke times are "kinda normalized"
				// and can't get too low with very short power values
				m.this_stoke_time = m.stroketime * ( Math.abs(amount) + ((1-Math.abs(amount))*0.5) );
				// use this if you want a constant stroke time,
				// however this tends to look a bit robotic
				// m.this_stoke_time = m.stroketime;
			}
			else { 
				amount = m.strokepow; 
			}
			// don't allow overtaxing
			delta = Math.min( delta, m.this_stoke_time - m.t ); 
			// cost of doing business
			let cost = ( m.cost * Math.abs(m.strokepow) * delta * this.mass ) / 800;
			// if they just want an cost estimate, return now
			if ( estimate ) { return cost; }
			// otherwise commit to the motion
			this.energy -= cost;
			// increase stroke time
			m.t = utils.clamp(m.t+delta, 0, m.this_stoke_time); 
			// stroke power function modifies the power withdrawn per frame
			switch ( m.strokefunc ) {
				case 'linear_down' : amount *= (m.this_stoke_time - m.t) / m.this_stoke_time; break;
				case 'linear_up' : amount *= 1 - ((m.this_stoke_time - m.t) / m.this_stoke_time); break;
				case 'bell' : amount *= 0.5 * Math.sin( (m.t/m.this_stoke_time) * Math.PI * 2 + Math.PI * 1.5 ) + 0.5; break;
				case 'step_up' : amount = (m.t >= m.this_stoke_time*0.5) ? amount : 0 ; break;
				case 'step_down' : amount = (m.t < m.this_stoke_time*0.5) ? amount : 0 ; break;
				case 'burst' : amount = (m.t >= m.this_stoke_time*0.8) ? amount : 0 ; break;
				case 'spring' : amount = (m.t < m.this_stoke_time*0.2) ? amount : 0 ; break;
				// case 'complete' : ;;  // alias for 'constant', but no results until it completes
				// default: ;; // the default is constant time output
			}
			// record how much power was activated this stroke - mostly for UI and animation
			m.last_amount = amount;
			// adjust for body size - larger organisms provide more power
			amount *= Math.pow( this.mass / 800, 0.75 ); 
			// apply power for this frame
			amount *= delta;
			if ( m.hasOwnProperty('linear') ) {
				this.inertia += m.linear * amount;
			}
			if ( m.hasOwnProperty('angular') ) {
				this.angmo += m.angular * amount;
			}
			if ( m.hasOwnProperty('brake') ) {
				let v = (this.inertia > 0)
					? utils.clamp(-amount*m.brake,-this.inertia,0)
					: utils.clamp(amount*m.brake,0,-this.inertia);
				this.inertia += v;
			}
			if ( m.hasOwnProperty('color') ) {
				let c = utils.HexColorToRGBArray(this.path.stroke);
				this.path.fill = `rgba(${c[0]},${c[1]},${c[2]},${utils.clamp(amount,0,1)})`;
			}
			if ( m.hasOwnProperty('mitosis') && m.t >= m.this_stoke_time ) {
				for ( let n=0; n < m.mitosis; n++ ) { 
					let offspring = this.Copy(true,true); // mutate body and reset state variables
					offspring.x = this.x;
					offspring.y = this.y;
					offspring.angle = utils.RandomFloat(0, Math.PI*2);
					offspring.mass = offspring.body.mass / ( m.mitosis + 1 );
					offspring.ScaleBoidByMass();
					//offspring.energy = this.max_energy / ( m.mitosis + 1 ); // good luck, kid
					// TODO: brain mutate based on some kind of parameter - simulation or DNA
					offspring.MutateBrain( window.vc?.simulation?.settings?.max_mutation || 3 );
					this.tank.boids.push(offspring);
				}
				// babies aren't free. we just lost a lot of mass.
				this.mass /= ( m.mitosis + 1 );
				this.ScaleBoidByMass();
			}
			// reset stroke when complete
			if ( m.t >= m.this_stoke_time ) { 
				m.t = 0; 
				m.this_stoke_time = 0;
			} 
		}
	}
	ScaleBoidByMass() {
		this.scale = this.mass / this.body.mass; // square scale
		this.length = Math.sqrt(this.scale) * this.body.length;
		this.width = Math.sqrt(this.scale) * this.body.width;	
		this.body.geo.scale = this.length / this.body.length; // linear scale
		this.stomach_size = this.base_stomach_size * this.mass;
		this.bite_rate = this.base_bite_rate * this.mass;
		this.digestion_rate = this.base_digestion_rate * this.mass;
		this.rest_metabolism = Math.pow( this.base_rest_metabolism * this.mass, 0.75 ); // discount for large organisms 
		this.max_energy = this.base_energy * this.mass;
		if ( this.energy > this.max_energy ) { this.energy = this.max_energy; }
		if ( this.stomach_contents > this.stomach_size ) { this.stomach_contents = this.stomach_size; }
		this.collision.radius = Math.max(this.length, this.width) / 2;
	}
	Kill() {
		this.body.geo.remove();
		this.container.remove();
		this.dead = true;
	}
	NeuroInputs() {
		return this.sensors.map(s=>s.val);
	}
	NeuroInputLabels() {
		return this.sensors.map(s=>s.name||s.detect);
	}	
	static Random(x,y,tank) {
		let b = new Boid(x,y,tank);
		b.dna = DNA.Random();
		b.species = utils.RandomName(12);
		b.max_energy = Math.random() * 500 + 100;
		b.lifespan = utils.RandomInt( 60, 600 );
		b.maturity_age = utils.BiasedRandInt( 0.1 * b.lifespan, 0.9 * b.lifespan, 0.25 * b.lifespan, 0.8 );
		b.age = utils.RandomInt( 0, b.lifespan * 0.5 );
		b.energy = b.max_energy;
		b.maxspeed = 600;
		b.maxrot = 20;
		b.diet = Math.random();
		b.diet_range = Math.max( Math.random()*0.5, 0.1 );
		b.body = BodyPlan.Random();
		b.min_mass = b.body.mass * 0.3;
		b.mass = b.body.mass; // random boids start adult size
		// base rates per unit of mass - grows as organism grows
		b.base_energy = utils.RandomFloat( 0.25, 2.0 ); // max energy per mass
		b.base_rest_metabolism = utils.RandomFloat( 0.004, 0.008 ); // energy per second per mass
		b.base_digestion_rate = utils.RandomFloat( 0.003, 0.008 ); // food per second per mass
		b.base_bite_rate = utils.RandomFloat( 0.3, 0.8 ); // food per second per mass
		b.base_stomach_size = utils.RandomFloat( 0.1, 0.5 ); // food per mass;		
		b.ScaleBoidByMass();
		// drawing and collisions data
		b.container.add([b.body.geo]);
		b.collision.radius = Math.max(b.length, b.width) / 2;
		
		// sensors:
		// food and obstacle sensors are mandatory - its just a matter of how many
		const my_max_dim = Math.max( b.body.length, b.body.width );
		const max_sensor_distance = Math.sqrt(my_max_dim) * 65;
		const max_sensor_radius = Math.sqrt(my_max_dim) * 50;
		const min_sensor_distance = Math.min( my_max_dim, max_sensor_distance );
		const min_sensor_radius = Math.min( my_max_dim, max_sensor_radius );
		for ( let detect of ['food','obstacles'] ) {
			const base_num_sensors = utils.BiasedRandInt(1,3,1.5,0.5);
			for ( let n=0; n < base_num_sensors; n++ ) {
				let sx = 0;
				let sy = 0;
				let r = utils.RandomInt(min_sensor_radius, max_sensor_radius) * (detect=='obstacles' ? 0.6 : 1.0);
				let d = utils.RandomInt(min_sensor_radius, max_sensor_radius);
				// prefer sensors in front
				let a = ( utils.BiasedRand(0, Math.PI * 2, Math.PI, 0.5) + Math.PI ) % (Math.PI * 2);
				// TODO: update b when we revise body plan symmetry
				// decide if sensor is going to be axially aligned or symmetrical
				// axial / symmetry = 0
				if ( Math.random() < 0.33 ) {
					b.sensors.push( new Sensor({ x:d, y:sy, r, angle:0, detect, name:detect }, b ) );			
				}
				// symmetry = 1
				else {
					for ( let angle of [a, Math.PI*2-a] ) {
						sx = d * Math.cos(angle);
						sy = d * Math.sin(angle);				
						b.sensors.push( new Sensor({ x:sx, y:sy, r, angle, detect, name:detect }, b ) );			
					}
				}
			}
		}
		b.MakeSensors();
		// random chance to get any of the non-collision sensors	
		const non_coll_sensors = ['energy', 'inertia', 'spin', 'angle-sin', 'angle-cos', 
			'edges', 'world-x', 'world-y', 'chaos', 'friends', 'enemies'];
		const num_non_coll_sensors = utils.RandomInt(0, non_coll_sensors.length, non_coll_sensors.length / 3, 0.3 ); 
		for ( let n=0; n < num_non_coll_sensors; n++ ) {
			const i = Math.floor( Math.random() * non_coll_sensors.length );
			const detect = non_coll_sensors.splice(i,1).pop();
			b.sensors.push( new Sensor({detect}, b) );
		}
		
		// motors
		const num_motors = utils.BiasedRandInt(1,6,3,0.65) * ( Math.random() > 0.995 ? 2 : 1 ) ;
		let has_linear = false;
		let has_angular = false;
		for ( let n=0; n < num_motors; n++ ) {
			let strokefunc = Math.random();
			let wheel = Math.random() > 0.75 ? true : false;
			// let cost = utils.BiasedRand(0.05, 5.0, 0.25, 0.6);
			const stroketime = utils.BiasedRand(0.1, 3.5, 1, 0.6); 
			const min_act = utils.BiasedRand(0,0.9,0.1,0.6);
			if ( strokefunc < 0.4 ) { strokefunc = 'linear_down'; }
			else if ( strokefunc < 0.5 ) { strokefunc = 'linear_up'; }
			else if ( strokefunc < 0.65 ) { strokefunc = 'bell'; }
			else if ( strokefunc < 0.7 ) { strokefunc = 'step_down'; }
			else if ( strokefunc < 0.75 ) { strokefunc = 'step_up'; }
			else if ( strokefunc < 0.78 ) { strokefunc = 'burst'; }
			else if ( strokefunc < 0.84 ) { strokefunc = 'spring'; }
			else { strokefunc = 'constant'; }
			let motor = { min_act, stroketime, t:0, strokefunc, wheel };
			let linear = utils.BiasedRandInt( 80, 1800, 600, 0.6 );
			let angular = utils.BiasedRandInt( 3, 100, 20, 0.5 );
			if ( Math.random() > 0.65 ) { linear = -linear; }
			if ( Math.random() > 0.65 ) { angular = -angular; }
			// all organisms must have ability to move forward and turn
			if ( num_motors > 1 ) {
				const combo_chance = Math.random();
				if ( combo_chance > 0.75 && ( n < num_motors-1 || has_linear ) ) { linear = 0; }
				else if ( combo_chance < 0.25 && ( n < num_motors-1 || has_angular ) ) { angular = 0; }
			}
			if ( linear ) { motor.linear = linear; has_linear = true; }
			if ( angular ) { motor.angular = angular; has_angular = true; }
			// certain stroke functions alter the power to make sure things dont go bonkers
			if ( strokefunc == 'burst' || strokefunc == 'spring' ) {
				if ( motor.linear ) { motor.linear *= 2.5; }
				if ( motor.angular ) { motor.angular *= 2.5; }
			}
			if ( strokefunc == 'constant' ) {
				if ( motor.linear ) { motor.linear *= 0.6; }
				if ( motor.angular ) { motor.angular *= 0.6; }
			}
			// cost of motor: baseline scales with body mass. random element to represent unique adaptation.
			motor.cost = (Math.abs(motor.linear||0) / 1800) + (Math.abs(motor.angular||0) / 100);
			motor.cost += ( motor.cost * Math.random() ) - (motor.cost * 0.5);
			// animation
			motor.anim = {
				index:b.motors.length, // to be changed after body plan is created
				xval: 10 + Math.random() * 25, 
				yval: 10 + Math.random() * 25,
				xfunc: Math.random() > 0.5 ? 'time' : 'blend',
				yfunc: Math.random() > 0.5 ? 'time' : 'blend',
			};
			// naming
			motor.name = (motor.linear && motor.angular) ? 'Combo' : (motor.linear ? 'Linear' : 'Angular');
			if ( motor.wheel ) { motor.name += ' Wheel'; }
			b.motors.push( motor );
			// if non-wheel motor has angular movement, create a symmetrical counterpart
			if ( !motor.wheel && motor.angular ) {
				let motor2 = Object.assign( {}, motor );
				motor2.angular = -motor.angular;
				motor2.name = motor.name + ' B';
				motor.name = motor.name + ' A';
				motor2.anim = Object.assign( {}, motor.anim );
				motor2.anim.yval = -motor2.anim.yval;
				b.motors.push(motor2);
				motor.sym = b.motors.length - 1; // index links to each partner
				motor2.sym = b.motors.length - 2;
			} 
		}
			
		// make the body complexity loosely match ability
		let complexity_variance = Math.random() * 0.2 - 0.1;
		b.body.complexity_factor = complexity_variance + ( (b.sensors.length + b.motors.length) / 30 ); // magic numbers
		b.body.complexity_factor = utils.Clamp( b.body.complexity_factor, 0, 1 ); 
		b.body.RandomizePoints();
		b.min_mass = b.body.mass * 0.3;
		b.mass = b.body.mass;
		b.ScaleBoidByMass();
			
		// reproductive motors
		const mitosis_num = utils.BiasedRandInt(1,5,1,0.95);
		const stroketime = utils.BiasedRandInt(mitosis_num*b.lifespan*0.02,mitosis_num*b.lifespan*0.06,mitosis_num*b.lifespan*0.04,0.5) * mitosis_num;
		b.motors.push({
			mitosis: mitosis_num, // number of new organisms
			min_act: utils.BiasedRand(0.22,0.9,0.6,0.5),
			cost: ( b.max_energy * utils.BiasedRand(0.51,1,0.65,0.5) ) / stroketime, 
			stroketime: stroketime, 
			strokefunc: 'complete', 
			name: 'mitosis',
			min_age: b.maturity_age,
			min_scale: 0.65, // prevents infinite subdivision
			use_max: true // prevents cheating on time
			// brake: 1
		});
					
		// // connect motor animations to specific points
		// let leftside_motors = b.motors.filter( m => typeof(m.sym)=='undefined' || m.sym < b.motors[m.sym].sym );
		// for ( let i=0; i < leftside_motors.length; i++ ) {
		// 	const m = leftside_motors[i];
		// 	const p = i+1;
		// 	// not enough points to give each one a different motor
		// 	if ( p >= Math.trunc((b.body.points.length)/2) ) {
		// 		m.anim.index = -1;
		// 	}
		// 	// assign the motor to the next point on the body
		// 	else {
		// 		// if there is a twin, assign that to the symmetrical point
		// 		if ( m.sym ) {
		// 			m.anim.index = p;
		// 			const opp = b.body.OppositePoint(p, b.body.points.length);
		// 			b.motors[m.sym].anim.index = opp; 
		// 		}
		// 		// singles use the nose or toe point
		// 		else {
		// 			m.anim.index = 0;
		// 		}
		// 	}
		// }
					
		// neuro stuff
		b.brain_complexity = utils.BiasedRand(0.5,5,2,0.8);
		let middle_nodes = utils.BiasedRandInt(0,12,3,0.3);
		let connections = Math.trunc(  b.brain_complexity * ( b.sensors.length + middle_nodes + b.motors.length ) );
		let network_type = Math.random() > 0.5 ? 'perceptron' : 'random';
		b.MakeBrain( b.sensors.length, middle_nodes, b.motors.length, connections, network_type );
		// crazytown
		b.MutateBrain( 50 );
		for ( let n=0; n< 50; n++ ) {
			b.brain.mutate( neataptic.methods.mutation.MOD_WEIGHT );
		}
		
		return b;
	}
			
	Copy( mutate_body=false, reset=false ) {
		let b = new Boid(this.x, this.y, this.tank);
		// POD we can just copy over
		let datakeys = ['species','max_energy','energy','maxspeed','maxrot',
			'brain_complexity','diet','diet_range','dna','maturity_age',
			'lifespan','age','stomach_size','stomach_contents','bite_rate','digestion_rate','energy_per_food','rest_metabolism',
			'mass', 'scale', 'length', 'width', 'min_mass',
			'base_energy', 'base_rest_metabolism', 'base_digestion_rate', 'base_energy', 'base_bite_rate', 'base_stomach_size',
			'generation',
		];
		for ( let k of datakeys ) { b[k] = this[k]; }
		b.collision.radius = this.collision.radius;
		// body plan stuff
		if ( b?.body?.geo ) b.body.geo.remove(); // out with the old
		b.body = this.body.Copy(); // in with the new
		b.container.add([b.body.geo]);
		b.sensors = this.sensors.map( s => {
			let data = JSON.parse( JSON.stringify(s,['x','y','r','l','a','angle','detect','name']) );
			return new Sensor(data,b);
		} );
		b.MakeSensors();
		b.motors = JSON.parse( JSON.stringify(this.motors) );
		b.brain = neataptic.Network.fromJSON(this.brain.toJSON());
		if ( mutate_body ) {
			b.body.Mutate();
			b.collision.radius = Math.max(b.body.length, b.body.width) / 2;
		}
		b.generation = this.generation + 1;
		if ( reset ) { b.Reset(); }
		return b;
	}
			
	Export( as_JSON=false ) {
		let b = {};
		// POD we can just copy over
		let datakeys = ['id','x','y','species','max_energy','energy','maxspeed','maxrot',
			'brain_complexity','diet','diet_range','dna','maturity_age',
			'lifespan','age','stomach_size','stomach_contents','bite_rate','digestion_rate','energy_per_food','rest_metabolism',
			'mass', 'scale', 'length', 'width', 'min_mass',
			'base_energy', 'base_rest_metabolism', 'base_digestion_rate', 'base_energy', 'base_bite_rate', 'base_stomach_size',
			'generation',
		];		
		for ( let k of datakeys ) { b[k] = this[k]; }
		b.body = {};
		for ( let k of Object.keys(this.body).filter( _ => !['geo'].includes(_) ) ) { b.body[k] = this.body[k]; }
		b.sensors = this.sensors.map( s => {
			return JSON.parse( JSON.stringify(s,['x','y','r','l','a','angle','detect','name']) );
		} );
		b.motors = JSON.parse( JSON.stringify(this.motors) );
		b.brain = this.brain.toJSON(); // misnomor, its not actually JSON, its POD object
		let output = b;
		// trim insignificant digits to save space
		if ( as_JSON ) {
			output = JSON.stringify(b).replace(/\d+\.\d+/g, x => parseFloat(x).toPrecision(6) );
		}
		return output;
	}
	
	// For debugging collision and bodyplan stuff
	DrawBounds( on=true ) {
		if ( this.bounds1 ) { this.bounds1.remove(); this.bounds1 = null; }
		if ( this.bounds2 ) { this.bounds2.remove(); this.bounds2 = null; }
		if ( this.bounds3 ) { this.bounds3.remove(); this.bounds3 = null; }
		if ( this.bounds4 ) { this.bounds4.remove(); this.bounds4 = null; }
		
		if ( on ) {
			// actual shape size
			let pts = [
				[ -this.length/2, this.width/2 ],
				[ this.length/2, this.width/2 ],
				[ this.length/2, -this.width/2 ],
				[ -this.length/2, -this.width/2 ],
			]			
			let anchors = pts.map( p => new Two.Anchor( p[0], p[1] ) );
			this.bounds1 = window.two.makePath(anchors);
			this.bounds1.linewidth = 1;
			this.bounds1.stroke = 'pink';
			this.bounds1.fill = 'transparent';
			this.container.add([this.bounds1]);
			
			// max genomic size
			let pts2 = [
				[ -this.body.max_length/2, this.body.max_width/2 ],
				[ this.body.max_length/2, this.body.max_width/2 ],
				[ this.body.max_length/2, -this.body.max_width/2 ],
				[ -this.body.max_length/2, -this.body.max_width/2 ],
			];
			let anchors2 = pts2.map( p => new Two.Anchor( p[0], p[1] ) );
			this.bounds2 = window.two.makePath(anchors2);
			this.bounds2.linewidth = 1;
			this.bounds2.stroke = 'lime';
			this.bounds2.fill = 'transparent';
			this.container.add([this.bounds2]);
					
			// min genomic size				
			let pts3 = [
				[ -this.body.min_length/2, this.body.min_width/2 ],
				[ this.body.min_length/2, this.body.min_width/2 ],
				[ this.body.min_length/2, -this.body.min_width/2 ],
				[ -this.body.min_length/2, -this.body.min_width/2 ],
			];
			let anchors3 = pts3.map( p => new Two.Anchor( p[0], p[1] ) );
			this.bounds3 = window.two.makePath(anchors3);
			this.bounds3.linewidth = 1;
			this.bounds3.stroke = 'cyan';
			this.bounds3.fill = 'transparent';
			this.container.add([this.bounds3]);
			
			// collision circle
			this.bounds4 = window.two.makeCircle(0,0,Math.max(this.length,this.width)/2);
			this.bounds4.linewidth = 1;
			this.bounds4.stroke = 'red';
			this.bounds4.fill = 'transparent';
			this.container.add([this.bounds4]);
		}
	}
	
};