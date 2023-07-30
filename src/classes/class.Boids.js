import neataptic from "neataptic";
import BodyPlan from '../classes/class.BodyPlan.js'
import Sensor from '../classes/class.Sensor.js'
import Rock from '../classes/class.Rock.js'
import * as utils from '../util/utils.js'
import {Circle, Polygon, Result} from 'collisions';
const { architect, Network } = neataptic;
import Two from "two.js";

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

	static RandomDNA( chars=64 ) {
		// const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz+/';
		const alphabet = '0123456789ABCDEF';
		let str = '';
		for ( let i=0; i < chars; i++ ) {
			str += alphabet.charAt( utils.RandomInt(0,15) );			
		}
		return str;
	}
		
	// `z` causes the reading to skip characters if "2" or higher or go backwards ("-1").
	ReadDNA( i, length=4, to_min=null, to_max=null, z=1 ) {
		z = z ? z : 1;
		length = utils.Clamp( length, 1, 16 ); // needs to fit into a 64bit Number data type
		if ( to_max < to_min ) { [to_min,to_max] = [to_max,to_min] ; }
		let str = '';
		for ( let n=0; n < length; n++ ) {
			str += this.dna.charAt( utils.mod(i+n*z, this.dna.length) ); 
		}
		let n= parseInt(str, 16);
		if ( to_min !== null && to_max !== null ) {
			const range_min = 0;
			const range_max = Math.pow( 16, length );
			n = (to_max-to_min) * Math.abs( (n-range_min) / (range_max-range_min) ) + to_min;
		}
		return n;
	}
		
	BiasedRandFromDNA( min, max, bias, influence, i, length=4, z=0  /* 0.0..1.0 more influence = less range */) {
		const r1 = this.ReadDNA( i, length, 0, 1, z );
		const r2 = this.ReadDNA( i+length, length, 0, 1, z );
		let rnd = r1 * (max - min) + min;   // random in range
		let mix = r2 * influence;   // random mixer - higher influence number means more spread
		return rnd * (1 - mix) + bias * mix;// mix full range and bias
	}
		
	BiasedRandIntFromDNA( min, max, bias, influence, i, length=4, z=0 ) {
		return Math.floor( this.BiasedRandFromDNA(min, max+0.99999, bias, influence, i, length, z) );
	}
	
	constructor( x=0, y=0, tank=null, json=null ) {
		this.id = Math.random();
		this.dna = ''; // Boid.RandomDNA();
		this.generation = 1;
		this.tank = tank;
		this.species = 'unknown';
		// physical stuff
		this.max_energy = 100;
		this.energy = this.max_energy;
		this.x = x;
		this.y = y;
		// diet
		this.diet = 0; // 0..1
		this.diet_range = 0.5; // 0..1
		// collision
		this.collision = {
			shape: 'circle',
			fixed: false,
			radius: 15 // TODO: update
		};
		// this.momentum_x = 0; // use momentum with the momentum_based code in Update()
		// this.momentum_y = 0;
		this.maxspeed = 2000; // these are global maximum speeds to prevent collision detection from breaking in fringe cases
		this.maxrot = 20;
		this.angle = Math.random()*Math.PI*2;
		this.length = 30;
		this.width = 15;
		this.inertia = 0; // forward motion power, can be negative
		this.angmo = 0; // angular momentum / rotational inertia
		this.energy_cost = 0.15;
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
			this.collision.radius = Math.max(this.length,this.width);
			this.brain = neataptic.Network.fromJSON(this.brain);
			this.bodyplan = new BodyPlan(this.bodyplan);
			this.container.add([this.bodyplan.geo]);
			this.sensors = this.sensors.map( s => new Sensor(s,this) );
			this.MakeSensors(); // adds geometry and stuff
		}
				
	}
	MakeGeometry() { }
	MakeMotors() {}
	// inherit this function, then call super.MakeSensors to do the geometry visualization stuff.
	MakeSensors() { 
		// visualization	
		this.sensor_group = window.two.makeGroup();
		this.sensor_group.add( this.sensors.filter( s => s.detect=='food' || s.detect=='obstacles' ).map( i => i.geo ) );
		this.sensor_group.visible = window.vc.show_collision_detection;
		this.container.add(this.sensor_group);
	}
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
	Update( delta ) {
	
		const frame_skip = 0; // [!]EXPERIMENTAL TODO: make this a game setting
		
		if ( !delta ) { return; }
		
		this.collision.contact_obstacle = false;
		
		// sensor collision detection				
		if ( !frame_skip || window.two.frameCount % frame_skip === 0 ) {
			for ( let s of this.sensors ) { s.Sense(); }
		}
		
		// UI: toggle collision detection geometry UI
		if ( this.sensor_group.visible != window.vc.show_collision_detection ) {
			this.sensor_group.visible = window.vc.show_collision_detection;
		}
		
		// energy generation
		// TODO: metabolize food
		this.energy += delta + Math.random() * delta;
		this.energy = Math.min( this.energy, this.max_energy || 100 );
		
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
		if ( window.vc.animate_boids ) {
			for ( let m=0; m < this.motors.length; m++ ) {
				if ( m >= this.bodyplan.geo.vertices.length ) { break; }
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
				
				let v = this.bodyplan.geo.vertices[m];
				if ( !v.origin ) { 
					v.origin = new Two.Vector().copy(v); 
					v.xoff = (0.1 + Math.random()) * 0.25 * this.length * (Math.random() > 0.5 ? 1 : -1 );
					v.yoff = (0.1 + Math.random()) * 0.25 * this.width * (Math.random() > 0.5 ? 1 : -1 );
				}
				v.x = v.origin.x + v.xoff * effect;
				// do opposing vertex
				const oppo_index = this.bodyplan.OppositePoint(m, this.bodyplan.geo.vertices.length);
				if ( oppo_index !== m ) { 
					v.y = v.origin.y + v.yoff * effect;
					const v2 = this.bodyplan.geo.vertices[oppo_index]; 
					if ( !v2.origin ) { 
						v2.origin = new Two.Vector().copy(v2); 
						v2.xoff = v.xoff;
						v2.yoff = -v.yoff;
					}
					v2.x = v2.origin.x + v2.xoff * effect;
					v2.y = v2.origin.y + v2.yoff * effect;
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
		// for "underwater" feel we are going for. Using the simpler intertia/angle
		// system looks more like what you expect from a hydrodynamic system.
		
		// adjust pointing angle based on spin (angular momentum)
		// this.angle += (delta * this.angmo) % Math.PI;
		// // apply current inertia to our momentum
		// sinAngle = Math.sin(this.angle);
		// cosAngle = Math.cos(this.angle);
		// this.momentum_x += delta * this.inertia * cosAngle;
		// this.momentum_y += delta * this.inertia * sinAngle;
		// // translate position based on momentum
		// this.x += delta * this.momentum_x;
		// this.y += delta * this.momentum_y;
		// // dragging on walls kill momentum / intertia
		// if ( this.x < 0 ) { this.inertia *= 0.75; this.momentum_x = 0; }
		// if ( this.y < 0 ) { this.inertia *= 0.75; this.momentum_y = 0; }
		// if ( this.x > window.vc.width ) { this.inertia *= 0.75; this.momentum_x = 0; }
		// if ( this.y > window.vc.height ) { this.inertia *= 0.75; this.momentum_y = 0; }	
		// // stay inside window.vc bounds			
		// this.x = utils.clamp( this.x, 0, window.vc.width );
		// this.y = utils.clamp( this.y, 0, window.vc.height );
		// // viscosity slows down inertia over time
		// const drag = (1 - ( this.tank.viscosity * delta * 10 ) );
		// this.momentum_x *= drag;
		// this.momentum_y *= drag;
		// this.inertia *= drag;
		// this.angmo *= drag;
		// // max speed caps
		// const absolute_max_speed = 2000;
		// if ( this.momentum_x > absolute_max_speed ) { this.momentum_x = absolute_max_speed; }
		// if ( this.momentum_x < -absolute_max_speed ) { this.momentum_x = -absolute_max_speed; }
		// if ( this.momentum_y > absolute_max_speed ) { this.momentum_y = absolute_max_speed; }
		// if ( this.momentum_y < -absolute_max_speed ) { this.momentum_y = -absolute_max_speed; }
		// if ( this.inertia > this.maxspeed ) { this.inertia = this.maxspeed; }
		// if ( this.inertia < -this.maxspeed ) { this.inertia = -this.maxspeed; }
		// if ( this.inertia > -5 && this.inertia < 5 ) { this.inertia = 0; } // come to a stop before end of universe
		// if ( this.angmo > this.maxrot ) { this.angmo = this.maxrot; }
		// if ( this.angmo < -this.maxrot ) { this.angmo = -this.maxrot; }
		// if ( this.angmo > -0.05 && this.angmo < 0.05 ) { this.angmo = 0; }
		
		// INERTIA-BASED MOVEMENT: ignores momentum physics
		
		// update pointing angle based on spin
		let sinAngle = Math.sin(this.angle);
		let cosAngle = Math.cos(this.angle);
		// [!]TECHNICAL: Javascript `%` operator is NOT mathematically strict modulus and behaves badly on negative numbers!
		this.angle = utils.mod( this.angle + (delta * this.angmo), 2*Math.PI );
		// move forward or backward
		this.x += delta * this.inertia * cosAngle;
		this.y += delta * this.inertia * sinAngle;
		// hitting walls causes artificial drag
		if ( this.x < 0 ) { this.inertia *= 0.75; }
		if ( this.y < 0 ) { this.inertia *= 0.75; }
		if ( this.x > this.tank.width ) { this.inertia *= 0.75; }
		if ( this.y > this.tank.height ) { this.inertia *= 0.75; }				
		// stay inside world bounds
		this.x = utils.clamp( this.x, 0, this.tank.width );
		this.y = utils.clamp( this.y, 0, this.tank.height );
		// update drawing geometry
		this.container.position.x = this.x;
		this.container.position.y = this.y;
		this.container.rotation = this.angle;
		// viscosity slows down inertia over time
		this.inertia *= (1 - ( this.tank.viscosity * delta * 10 ) );
		this.angmo *= (1 - ( this.tank.viscosity * delta * 10 ) );
		// speed caps
		if ( this.inertia > this.maxspeed ) { this.inertia = this.maxspeed; }
		if ( this.inertia < -this.maxspeed ) { this.inertia = -this.maxspeed; }
		if ( this.inertia > -5 && this.inertia < 5 ) { this.inertia = 0; } // come to a stop before end of universe
		if ( this.angmo > this.maxrot ) { this.angmo = this.maxrot; }
		if ( this.angmo < -this.maxrot ) { this.angmo = -this.maxrot; }
		if ( this.angmo > -0.05 && this.angmo < 0.05 ) { this.angmo = 0; }
		
		
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
			// debugger;
			const circle  = new Circle(this.x, this.y, my_radius);
			const polygon = new Polygon(o.x, o.y, o.collision.hull);
			const result  = new Result();
			let gotcha = circle.collides(polygon, result);
			// response
			if ( gotcha ) {
				this.x -= result.overlap * result.overlap_x;
				this.y -= result.overlap * result.overlap_y;
				this.inertia *= 0.75; // what a drag
				this.container.position.x = this.x;
				this.container.position.y = this.y;
				// this.bodyplan.geo.fill = '#D11';
				this.collision.contact_obstacle = true;
			}
		}
		
		// [!]HACK to make food work - eat the food you stupid llama
		for ( let food of this.tank.foods ) { 
			const dx = Math.abs(food.x - this.x);
			const dy = Math.abs(food.y - this.y);
			const d = Math.sqrt(dx*dx + dy*dy);
			let r = Math.max( this.width, this.length );
			if ( d <= r + food.r ) { 
				if ( food.IsEdibleBy(this) ) {
					food.Eat(delta*5);  
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
			// shift amount to halfway point for wheel motors
			if ( m.wheel ) { amount = (amount - 0.5) * 2; } 
			// check for minimum activation
			if ( m.t==0 && m.min_act && (m.wheel ? Math.abs(amount) : amount) < m.min_act ) { 
				m.last_amount = 0;
				m.this_stoke_time = 0;
				return 0; 
				}
			// sanity check
			amount = utils.clamp(amount,-1,1);
			// if we decided to activate a new stroke, record the power it was
			//  activated with instead of using a varying stroke each frame.
			if ( m.t==0 ) { 
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
			// increase stroke time
			m.t = utils.clamp(m.t+delta, 0, m.this_stoke_time); 
			// cost of doing business
			let cost = m.cost * delta; 
			if ( estimate ) { return cost; }
			this.energy -= cost;
			// stroke power function
			switch ( m.strokefunc ) {
				case 'linear_down' : amount *= (m.this_stoke_time - m.t) / m.this_stoke_time; break;
				case 'linear_up' : amount *= 1 - ((m.this_stoke_time - m.t) / m.this_stoke_time); break;
				case 'bell' : amount = amount * (Math.sin((m.t/m.this_stoke_time) * Math.PI)); break;
				case 'step_up' : amount = (m.t >= m.this_stoke_time*0.5) ? amount : 0 ; break;
				case 'step_down' : amount = (m.t < m.this_stoke_time*0.5) ? amount : 0 ; break;
				case 'burst' : amount = (m.t >= m.this_stoke_time*0.8) ? amount : 0 ; break;
				case 'spring' : amount = (m.t < m.this_stoke_time*0.2) ? amount : 0 ; break;
				// constant-time output
				// default: amount = amount * 0.64; // magic number to keep inline with others
				// ^ feels weird to use magic numbers. TODO: instead increase cost of 100% output by 1/0.64 
			}
			m.last_amount = amount; // mostly for UI and animation
			// apply power
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
				// console.log(`braking: i = ${this.inertia}, v= ${v}, a = ${amount}`);
				this.inertia += v;
				// this.angmo *= (1-amount);
			}
			if ( m.hasOwnProperty('color') ) {
				let c = utils.HexColorToRGBArray(this.path.stroke);
				this.path.fill = `rgba(${c[0]},${c[1]},${c[2]},${utils.clamp(amount,0,1)})`;
			}
			if ( m.t >= m.this_stoke_time ) { m.t = 0; } // reset stroke
		}
	}
	Kill() {
		this.bodyplan.geo.remove();
		this.sensors.forEach(x=> x?.geo ? x.geo.remove() : null );
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
		b.dna = Boid.RandomDNA();
		b.species = utils.RandomName(12);
		b.max_energy = Math.random() * 500 + 100;
		b.energy = b.max_energy;
		b.maxspeed = 600;
		b.maxrot = 20;
		b.collision.radius = Math.max(b.length, b.width) / 2;
		b.energy_cost = 0.15;
		b.diet = Math.random();
		b.diet_range = Math.max( Math.random()*0.5, 0.05 );
		b.bodyplan = BodyPlan.Random();
		b.container.add([b.bodyplan.geo]);
		// [!]temporary?:
		b.length = b.bodyplan.length;
		b.width = b.bodyplan.width;
		
		// sensors:
		// food and obstacle sensors are mandatory - its just a matter of how many
		const my_max_dim = Math.max( b.length, b.width );
		const max_sensor_distance = Math.sqrt(my_max_dim) * 40;
		const max_sensor_radius = Math.sqrt(my_max_dim) * 35;
		const min_sensor_distance = Math.min( my_max_dim, max_sensor_distance );
		const min_sensor_radius = Math.min( my_max_dim, max_sensor_radius );
		for ( let detect of ['food','obstacles'] ) {
			const base_num_sensors = utils.BiasedRandInt(1,3,1.5,0.5);
			for ( let n=0; n < base_num_sensors; n++ ) {
				let sx = 0;
				let sy = 0;
				let r = utils.RandomInt(min_sensor_radius, max_sensor_radius) * (detect=='obstacles' ? 0.6 : 1.0);
				let d = utils.RandomInt(min_sensor_radius, max_sensor_radius);
				let a = Math.random() * Math.PI * 2;
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
		const non_coll_sensors = ['inertia', 'spin', 'angle-sin', 'angle-cos', 'edges', 'world-x', 'world-y', 'chaos', 'friends', 'enemies'];
		const num_non_coll_sensors = utils.RandomInt(0, non_coll_sensors.length, non_coll_sensors.length / 3, 0.3 ); 
		for ( let n=0; n < num_non_coll_sensors; n++ ) {
			const i = Math.floor( Math.random() * non_coll_sensors.length );
			const detect = non_coll_sensors.splice(i,1).pop();
			b.sensors.push( new Sensor({detect}, b) );
		}
		
		// motors
		const num_motors = utils.BiasedRandInt(1,8,3,0.5) * ( Math.random() > 0.99 ? 2 : 1 ) ;
		let has_linear = false;
		let has_angular = false;
		for ( let n=0; n < num_motors; n++ ) {
			let strokefunc = Math.random();
			let wheel = Math.random() > 0.75 ? true : false;
			const cost = utils.BiasedRand(0.05, 5.0, 0.25, 0.6);
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
			let motor = { min_act, cost, stroketime, t:0, strokefunc, wheel };
			let linear = utils.BiasedRandInt( 10, 2000, 800, 0.4 );
			let angular = utils.BiasedRandInt( 1, 100, 20, 0.5 );
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
			// certain stroke functions alter the power to make sure things do go bonkers
			if ( strokefunc == 'burst' || strokefunc == 'spring' ) {
				if ( motor.linear ) { motor.linear *= 3; }
				if ( motor.angular ) { motor.angular *= 3; }
			}
			if ( strokefunc == 'constant' ) {
				if ( motor.linear ) { motor.linear *= 0.64; }
				if ( motor.angular ) { motor.angular *= 0.64; }
			}
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
				b.motors.push(motor2);
			} 
		}
			
		// make the body complexity loosely match ability
		let complexity_variance = Math.random() * 0.2 - 0.1;
		b.bodyplan.complexity_factor = complexity_variance + ( (b.sensors.length + b.motors.length) / 30 ); // magic numbers
		b.bodyplan.complexity_factor = utils.Clamp( b.bodyplan.complexity_factor, 0, 1 ); 
		b.bodyplan.RandomizePoints();
			
		// neuro stuff
		b.brain_complexity = utils.BiasedRand(0.5,5,2,0.8);
		let middle_nodes = utils.BiasedRandInt(0,12,3,0.3);
		let connections = Math.trunc(  b.brain_complexity * ( b.sensors.length + middle_nodes + b.motors.length ) );
		let network_type = Math.random() > 0.5 ? 'perceptron' : 'random';
		b.MakeBrain( b.sensors.length, middle_nodes, b.motors.length, connections, network_type );
		// crazytown
		for ( let n=0; n< 50; n++ ) {
			b.brain.mutate( Boid.mutationOptionPicker.Pick() );
		}
		for ( let n=0; n< 50; n++ ) {
			b.brain.mutate( neataptic.methods.mutation.MOD_WEIGHT );
		}
		
		return b;
	}
			
	Copy( mutate=false ) {
		let b = new Boid(this.x, this.y, this.tank);
		// POD we can just copy over
		let datakeys = ['species','max_energy','energy','maxspeed','maxrot','length','width','energy_cost','brain_complexity','diet','diet_range','dna'];
		for ( let k of datakeys ) { b[k] = this[k]; }
		b.collision.radius = this.collision.radius;
		// body plan stuff
		if ( b?.bodyplan?.geo ) b.bodyplan.geo.remove(); // out with the old
		b.bodyplan = this.bodyplan.Copy(); // in with the new
		b.container.add([b.bodyplan.geo]);
		b.sensors = this.sensors.map( s => {
			let data = JSON.parse( JSON.stringify(s,['x','y','r','l','a','angle','detect','name']) );
			return new Sensor(data,b);
		} );
		b.MakeSensors();
		b.motors = JSON.parse( JSON.stringify(this.motors) );
		b.brain = neataptic.Network.fromJSON(this.brain.toJSON());
		if ( mutate ) {
			b.bodyplan.Mutate();
		}
		b.generation = this.generation + 1;
		return b;
	}
			
	Export( as_JSON=false ) {
		let b = {};
		// POD we can just copy over
		let datakeys = ['id','x','y','species','max_energy','energy','maxspeed','maxrot','length','width','energy_cost','brain_complexity','generation','diet','diet_range','dna'];
		for ( let k of datakeys ) { b[k] = this[k]; }
		b.bodyplan = {};
		for ( let k of Object.keys(this.bodyplan).filter( _ => !['geo'].includes(_) ) ) { b.bodyplan[k] = this.bodyplan[k]; }
		b.sensors = this.sensors.map( s => {
			return JSON.parse( JSON.stringify(s,['x','y','r','l','a','angle','detect','name']) );
		} );
		b.motors = this.motors;
		b.brain = this.brain.toJSON(); // misnomor, its not actually JSON, its POD object
		let output = b;
		// trim insignificant digits to save space
		if ( as_JSON ) {
			output = JSON.stringify(b).replace(/\d+\.\d+/g, x => parseFloat(x).toPrecision(6) );
		}
		return output;
	}
	
};