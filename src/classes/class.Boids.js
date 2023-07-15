import neataptic from "neataptic";
import BodyPlan from '../classes/class.BodyPlan.js'
import Sensor from '../classes/class.Sensor.js'
import Rock from '../classes/class.Rock.js'
import * as utils from '../util/utils.js'
import {Circle, Polygon, Result} from 'collisions';
const { architect, Network } = neataptic;

export function BoidFactory( type, x, y, tank ) {
	if ( type == 'random' ) { return ProtoBoid.Random(x, y, tank); }
	return new Boid(x,y,tank);
}
	
export class ProtoBoid {

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
			
			
	constructor( x=0, y=0, tank=null, json=null ) {
		this.id = Math.random();
		this.generation = 1;
		this.tank = tank;
		this.species = 'prototype';
		// physical stuff
		this.max_energy = 100;
		this.energy = this.max_energy;
		this.x = x;
		this.y = y;
		// collision
		this.collision = {
			shape: 'circle',
			fixed: false,
			radius: 15 // TODO: update
		};
		// this.momentum_x = 0; // use momentum with the momentum_based code in Update()
		// this.momentum_y = 0;
		this.maxspeed = 600;
		this.maxrot = 8;
		this.angle = Math.random()*Math.PI*2;
		this.length = 30;
		this.width = 15;
		this.inertia = 0; // forward motion power, can be negative
		this.angmo = 0; // angular momentum / rotational inertia
		this.energy_cost = 0.15;
		// drawing stuff
		this.outline_color = utils.RandomColor( true, false, true ) + 'AA';
		this.fill_color = utils.RandomColor( true, false, true ) + 'AA';
		this.path = null;
		this.container = window.two.makeGroup();
		this.container.position.x = x;
		this.container.position.y = y;
		this.container.add([this.path]);
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
		if ( !delta ) { return; }
		
		this.collision.contact_obstacle = false;
		
		// sensor collision detection				
		for ( let s of this.sensors ) { s.Sense(); }
		
		// UI: toggle collision detection geometry UI
		if ( this.sensor_group.visible != window.vc.show_collision_detection ) {
			this.sensor_group.visible = window.vc.show_collision_detection;
		}
		
		// energy generation
		// TODO: metabolize food
		this.energy += delta + Math.random() * delta;
		this.energy = Math.min( this.energy, this.max_energy || 100 );
		
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
				food.Eat(delta*5);  
				}
		}
		
	}
	// use estimate=true if you want a cost value returned instead of the actual movement 
	ActivateMotor( i, amount /* -1..1 */, delta, estimate = false ) {
		// sometimes neataptic can output nan and infinities. 
		if ( Number.isNaN(amount) || !Number.isFinite(amount) ) { return; }
		let m = this.motors[i];
		if ( m ) {
			// shift amount to halfway point for wheel motors
			if ( m.wheel ) { amount = (amount - 0.5) * 2; } 
			// check for minimum activation
			if ( m.t==0 && m.min_act && (m.wheel ? Math.abs(amount) : amount) < m.min_act ) { return 0; }
			// sanity check
			amount = utils.clamp(amount,-1,1);
			// if we decided to activate a new stroke, record the power it was
			//  activated with instead of using a varying stroke each frame.
			if ( m.t==0 ) { m.strokepow = amount; }
			else { amount = m.strokepow; }
			// don't allow overtaxing
			delta = Math.min( delta, m.stroketime - m.t ); 
			// apply power
			amount *= delta;
			// increase stroke time
			m.t = utils.clamp(m.t+delta, 0, m.stroketime); 
			// cost of doing business
			let cost = m.cost * delta; 
			if ( estimate ) { return cost; }
			this.energy -= cost;
			// stroke power function
			switch ( m.strokefun ) {
				case 'linear_down' : amount *= (m.stroketime - m.t) / m.stroketime; break;
				case 'linear_up' : amount *= 1 - ((m.stroketime - m.t) / m.stroketime); break;
				case 'bell' : amount = Math.sin(amount) / Math.PI; break;
				// constant-time output
				default: amount = amount * 0.64; // magic number to keep inline with others
			}
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
			if ( m.t == m.stroketime ) { m.t = 0; } // reset stroke
		}
	}
	Kill() {
		this.bodyplan.geo.remove();
		this.sensors.forEach(x=>x.geo.remove());
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
		let b = new ProtoBoid(x,y,tank);
		b.species = utils.RandomName(12);
		b.max_energy = Math.random() * 500 + 100;
		b.energy = b.max_energy;
		b.maxspeed = 600;
		b.maxrot = 20;
		b.collision.radius = Math.max(b.length, b.width) / 2;
		b.energy_cost = 0.15;
		
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
		const num_motors = utils.BiasedRandInt(1,8,3,0.5);
		for ( let n=0; n < num_motors; n++ ) {
			let strokefunc = Math.random();
			let wheel = Math.random() > 0.75 ? true : false;
			const cost = utils.BiasedRand(0.05, 5.0, 0.25, 0.8);
			const stroketime = utils.BiasedRand(0.1, 5.0, 1, 0.6); 
			const min_act = utils.BiasedRand(0,0.9,0.1,0.95);
			if ( strokefunc < 0.5 ) { strokefunc = 'linear_down'; }
			else if ( strokefunc < 0.7 ) { strokefunc = 'linear_up'; }
			else if ( strokefunc < 0.85 ) { strokefunc = 'bell'; }
			let motor = { min_act, cost, stroketime, t:0, strokefunc, wheel };
			let linear = utils.BiasedRandInt( 10, 2000, 800, 0.25 );
			let angular = utils.BiasedRandInt( 1, 100, 20, 0.5 );
			if ( Math.random() > 0.65 ) { linear = -linear; }
			if ( Math.random() > 0.65 ) { angular = -angular; }
			// if we roll a 1, it MUST be a combo
			if ( num_motors > 1 ) {
				const combo_chance = Math.random();
				if ( combo_chance > 0.75 ) { linear = 0; }
				else if ( combo_chance < 0.25 ) { angular = 0; }
			}
			if ( linear ) { motor.linear = linear; }
			if ( angular ) { motor.angular = angular; }
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
		let network_type = 'perceptron'; // Math.random() > 0.65 ? 'perceptron' : 'random';
		b.MakeBrain( b.sensors.length, middle_nodes, b.motors.length, connections, network_type );
		// crazytown
		for ( let n=0; n< 50; n++ ) {
			b.brain.mutate( ProtoBoid.mutationOptionPicker.Pick() );
		}
		for ( let n=0; n< 50; n++ ) {
			b.brain.mutate( neataptic.methods.mutation.MOD_WEIGHT );
		}
		
		return b;
	}
			
	Copy( mutate=false ) {
		let b = new ProtoBoid(this.x, this.y, this.tank);
		// POD we can just copy over
		let datakeys = ['species','max_energy','energy','maxspeed','maxrot','length','width','energy_cost','brain_complexity'];
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
		let datakeys = ['id','x','y','species','max_energy','energy','maxspeed','maxrot','length','width','energy_cost','brain_complexity','generation'];
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

export class Boid extends ProtoBoid {
	constructor( x=0, y=0, tank=null ) {
		super(x,y,tank);
		this.max_energy = 100;
		this.energy = this.max_energy;
		this.species = 'Boid';
		this.maxspeed = 600;
		this.maxrot = 8;
		this.length = 30;
		this.width = 15;
		this.energy_cost = 0.15;
		this.bodyplan = null;
		this.MakeGeometry();
		this.MakeMotors();
		this.MakeSensors();
		let brain_complexity = 2; // 0 .. 5
		let middle_nodes = 6;
		let connections = brain_complexity * ( this.sensors.length + middle_nodes + this.motors.length );
		this.MakeBrain( this.sensors.length, middle_nodes, this.motors.length, connections );
	}
	MakeGeometry() {
		this.bodyplan = new BodyPlan([
			[this.length/2, 0],
			[-this.length/2, this.width/2],
			[-this.length/2, -this.width/2]
		]);
		// this.bodyplan.stroke = this.outline_color;
		this.bodyplan.stroke = 'transparent'; // remove this one day when outlines come back into fashion
		// this.bodyplan.fill = this.fill_color;
		this.bodyplan.fill = '#AEA9'; // original "Dart green" test color
		this.bodyplan.linewidth = 0;
		this.bodyplan.complexity_factor = 0.3; // 0..1
		this.bodyplan.max_jitter_pct = 0.08; // max deviation percentage from current width/height
		this.bodyplan.augmentation_pct = 0.1;
		this.bodyplan.UpdateGeometry();
		this.container.add([this.bodyplan.geo]);
		// let c = '#'
			// + utils.DecToHex(parseInt(128 + 128 * Math.random()))
			// + utils.DecToHex(parseInt(128 + 128 * Math.random()))
			// + utils.DecToHex(parseInt(128 + 128 * Math.random()));
		// this.path.stroke = c;
	}
	MakeMotors() {
		this.motors = [
			// {name:'Front/Back', linear:3000, min_act:0.1, cost: 0.2, stroketime:0.5, t:0, strokefunc:null, wheel:0.5 },
			// {name:'Rotate', angular:30, min_act:0.1, cost: 0.12, stroketime:0.35, t:0, strokefunc:null, wheel:0.5 },
			{name:'Forward', linear:3000, min_act:0.10, cost: 0.5, stroketime:1, t:0, strokefunc:null },
			{name:'Backward', linear:-1000, min_act:0.10, cost: 2, stroketime:0.65, t:0, strokefunc:null },
			{name:'Rotate CW', angular:30, min_act:0.10, cost: 0.25, stroketime:0.3, t:0, strokefunc:null },
			{name:'Rotate CCW', angular:-30, min_act:0.10, cost: 0.25, stroketime:0.3, t:0, strokefunc:null },
			// {name:'Brake', brake:3000, min_act:0.7, cost: 0.5, stroketime:0.8, t:0, strokefunc:null },
			// {name:'Color', color:1, min:0, cost: 0 },
		];
	}
	MakeSensors() { 
		const max_sensor_distance = 2.5;
		const sensor_radius = Math.max(this.length,this.width) * max_sensor_distance;
		const sensor_radius_scale = 1.25;
		// radial directional awareness sensors
		for ( let i=0, n=6; i < n; i++ ) {
			let angle = 2 * i * (Math.PI / n);
			this.sensors.push( new Sensor({
				x: 2 * sensor_radius * Math.cos(angle), 
				y: 2 * sensor_radius * Math.sin(angle), 
				r: sensor_radius * sensor_radius_scale,
				angle: angle,
				detect:'food',
				name:"proximity",
			}, this ) );
		}
		// inner proximity sensor
		this.sensors.push( new Sensor({
			x: 0, 
			y: 0, 
			r: sensor_radius,
			angle: 0,
			detect: 'food',
			name:"touch",
		}, this) );	
		// outer general awareness sensor			
		const outerlimit = 2 * ( 2*sensor_radius + sensor_radius*sensor_radius_scale );
		this.sensors.push( new Sensor({
			x: 0, 
			y: 0, 
			r: outerlimit,
			angle: 0,
			detect: 'food',
			name:"awareness",
		}, this) );	
		this.sensors.push( new Sensor({detect:'inertia'}, this) );
		this.sensors.push( new Sensor({detect:'spin'}, this) );
		this.sensors.push( new Sensor({detect:'angle-cos'}, this) );
		this.sensors.push( new Sensor({detect:'angle-sin'}, this) );
		this.sensors.push( new Sensor({detect:'edges'}, this) );
		// this.sensors.push( new Sensor({detect:'world-x'}, this) );
		// this.sensors.push( new Sensor({detect:'world-y'}, this) );
		// this.sensors.push( new Sensor({detect:'chaos'}, this) );
		// obstacle detection whiskers
		this.sensors.push( new Sensor({
			x: 50, 
			y: -50, 
			r: 80,
			detect: 'obstacles',
			name:"FL whisker",
		}, this) );	
		this.sensors.push( new Sensor({
			x: 50, 
			y: 50, 
			r: 80,
			detect: 'obstacles',
			name:"FR whisker",
		}, this) );	
		super.MakeSensors();
	}
};

// export class Simpleton extends ProtoBoid {
// 	constructor(x,y) {
// 		super(x,y);
// 		this.species = 'Simpleton';
// 		this.maxspeed = 400;
// 		this.maxrot = 8;
// 		this.length = 12;
// 		this.width = 20;
// 		this.energy_cost = 0.3;
// 		this.MakeGeometry();
// 		this.MakeMotors();
// 		this.MakeSensors();				
// 		this.MakeBrain( 5, 7, 3, 40 );
// 	}
// 	MakeGeometry() {
// 		this.path = window.two.makeRectangle(0,0,this.width,this.length); 
// 		this.path.stroke = '#2DF';
// 		this.path.fill = 'transparent';
// 		this.path.linewidth = 2;
// 		this.container.add([this.path]);
// 	}			
// 	MakeMotors() {
// 		this.motors = [
// 			{name:'Forward', linear:100, on:false },
// 			{name:'Rotate CW', angular:4, on:false },
// 			{name:'Rotate CCW', angular:-4, on:false },
// 			// {name:'Color', color:1 },
// 		];
// 	}
// 	MakeSensors() {
// 		const max_sensor_distance = 2.5;
// 		const sensor_radius = Math.max(this.length,this.width) * max_sensor_distance;
// 		const sensor_radius_scale = 0.75;
// 		// inner touch sensor
// 		this.sensors.push( {
// 			x: 0, 
// 			y: 0, 
// 			r: sensor_radius * sensor_radius_scale,
// 			angle: 0,
// 			val:0,
// 			type:"touch",
// 			geo: window.two.makeCircle(0,0,sensor_radius * sensor_radius_scale)
// 		});	
// 		// forward proximity sensor
// 		this.sensors.push( {
// 			x: sensor_radius * max_sensor_distance, 
// 			y: 0, 
// 			r: sensor_radius * 1.5,
// 			angle: 0,
// 			val:0,
// 			type:"touch",
// 			geo: window.two.makeCircle(sensor_radius * max_sensor_distance,0,sensor_radius * 1.5)
// 		});	
// 		// outer general awareness sensor			
// 		const outerlimit = 1.5 * ( 2*sensor_radius + sensor_radius*sensor_radius_scale );
// 		this.sensors.push( {
// 			x: 0, 
// 			y: 0, 
// 			r: outerlimit,
// 			angle: 0,
// 			val:0,
// 			type:"awareness",
// 			geo: window.two.makeCircle(0,0,outerlimit)
// 		});				
// 		// visualization	
// 		this.sensor_group.add( this.sensors.map( i => i.geo ) );
// 		this.sensor_group.linewidth = 1;
// 		this.sensor_group.stroke = '#AAEEAA55';
// 		this.sensor_group.fill = 'transparent';							
// 	}
// 	NeuroInputs() {
// 		const inputs = this.sensors.map(s=>s.val);
// 		inputs.push(this.angle / (2*Math.PI) );
// 		// inputs.push((this.angmo + this.maxrot) / (2*this.maxrot));
// 		// inputs.push((this.inertia + this.maxspeed) / (2*this.maxspeed));
// 		// edge detection - to be removed later - replace with actual collision detection
// 		const margin = 100;
// 		let nearness = 0; 
// 		nearness += this.x < margin ? (margin - this.x) : 0;
// 		nearness += this.x > (window.vc.width-margin) ? (margin-(window.vc.width - this.x)) : 0;
// 		nearness += this.y < margin ? (margin - this.y ) : 0;
// 		nearness += this.y > (window.vc.height-margin) ? (margin-(window.vc.height - this.y)) : 0;
// 		nearness /= margin*2;
// 		inputs.push(nearness);
// 		// inputs.push(Math.random()); // chaos to prevent one-track minds
// 		return inputs;
// 	}		
// 	NeuroInputLabels() {
// 		return [
// 			'inner',
// 			'front',
// 			'outer',
// 			'edges',
// 			// 'chaos'
// 		];
// 	}				
// }

// export class Kayak extends ProtoBoid {
// 	constructor(x,y) {
// 		super(x,y);
// 		this.species = 'Kayak';
// 		this.maxspeed = 400;
// 		this.maxrot = 10;
// 		this.length = 18;
// 		this.width = 18;
// 		this.energy_cost = 0.88;
// 		this.MakeGeometry();
// 		this.MakeMotors();
// 		this.MakeSensors();				
// 		this.MakeBrain( 6, 7, 2, 50 );
// 	}
// 	MakeGeometry() {
// 		this.path = window.two.makePath( 
// 			-this.length/2,
// 			this.width/2,
// 			this.length/2,
// 			0, 
// 			-this.length/2,
// 			-this.width/2 ,
// 			-this.length/4,
// 			0, 
// 			);
// 		this.path.stroke = '#E94';
// 		this.path.fill = 'transparent';
// 		this.path.linewidth = 2;
// 		this.container.add([this.path]);
// 	}			
// 	MakeMotors() {
// 		this.motors = [
// 			{name:'Left Stroke', linear:200, angular:12, on:false },
// 			{name:'Right Stroke', linear:200, angular:-12, on:false },
// 			// {name:'Color', color:1 },
// 		];
// 	}
// 	MakeSensors() {
// 		const max_sensor_distance = 2.5;
// 		const sensor_radius = Math.max(this.length,this.width) * max_sensor_distance;
// 		const sensor_radius_scale = 0.75;
// 		// inner touch sensor
// 		this.sensors.push( {
// 			x: 0, 
// 			y: 0, 
// 			r: sensor_radius * sensor_radius_scale,
// 			angle: 0,
// 			val:0,
// 			type:"touch",
// 			geo: window.two.makeCircle(0,0,sensor_radius * sensor_radius_scale)
// 		});	
// 		// forward proximity sensor
// 		this.sensors.push( {
// 			x: sensor_radius * max_sensor_distance, 
// 			y: 0, 
// 			r: sensor_radius * 1.5,
// 			angle: 0,
// 			val:0,
// 			type:"touch",
// 			geo: window.two.makeCircle(sensor_radius * max_sensor_distance,0,sensor_radius * 1.5)
// 		});	
// 		// outer general awareness sensor			
// 		const outerlimit = 1.5 * ( 2*sensor_radius + sensor_radius*sensor_radius_scale );
// 		this.sensors.push( {
// 			x: 0, 
// 			y: 0, 
// 			r: outerlimit,
// 			angle: 0,
// 			val:0,
// 			type:"awareness",
// 			geo: window.two.makeCircle(0,0,outerlimit)
// 		});				
// 		// visualization	
// 		this.sensor_group.add( this.sensors.map( i => i.geo ) );
// 		this.sensor_group.linewidth = 1;
// 		this.sensor_group.stroke = '#AAEEAA55';
// 		this.sensor_group.fill = 'transparent';							
// 	}
// 	NeuroInputs() {
// 		const inputs = this.sensors.map(s=>s.val);
// 		inputs.push(this.angle / (2*Math.PI) );
// 		inputs.push(this.x / window.vc.width);
// 		inputs.push(this.y / window.vc.height);
// 		// inputs.push(Math.random()); // chaos to prevent one-track minds
// 		return inputs;
// 	}	
// 	NeuroInputLabels() {
// 		return [
// 			'inner',
// 			'front',
// 			'outer',
// 			'angle',
// 			'world X',
// 			'world Y',
// 			// 'chaos'
// 		];
// 	}						
// }
