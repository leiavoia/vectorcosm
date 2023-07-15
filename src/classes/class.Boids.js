import neataptic from "neataptic";
import BodyPlan from '../classes/class.BodyPlan.js'
import Sensor from '../classes/class.Sensor.js'
import * as utils from '../util/utils.js'
const { architect, Network, methods } = neataptic;

export function BoidFactory( type, x, y, tank ) {
	// if ( type == 'Kayak' ) { return new Kayak(x,y); }
	// if ( type == 'Simpleton' ) { return new Simpleton(x,y); }
	if ( type == 'Boid' ) { return new Boid(x,y,tank); }
	// random!
	let n = Math.random(); 
	// if ( n > 0.67 ) { return new Simpleton(x,y); }
	// if ( n > 0.33 ) { return new Kayak(x,y); }
	return new Boid(x,y,tank);
}
	
export class ProtoBoid {
	constructor( x=0, y=0, tank=null ) {
		this.tank = tank;
		this.species = 'prototype';
		// physical stuff
		this.max_energy = 100;
		this.energy = this.max_energy;
		this.x = x;
		this.y = y;
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
		this.path = null;
		this.container = window.two.makeGroup();
		this.container.position.x = x;
		this.container.position.y = y;
		this.container.add([this.path]);
		this.container.visible = true;
		// neuro stuff
		this.brain = null;
		// vision and sensors
		this.sensors = [];
		this.fitness_score = 0; // per frame
		this.total_fitness_score = 0; // accumulates over time
	}
	MakeGeometry() { }
	MakeMotors() {}
	// inherit this function, then call super.MakeSensors to do the geometry visualization stuff.
	MakeSensors() { 
		// visualization	
		this.sensor_group = window.two.makeGroup();
		this.sensor_group.add( this.sensors.map( i => i.geo ) );
		this.sensor_group.linewidth = 1;
		this.sensor_group.stroke = '#AAEEAA55';
		this.sensor_group.fill = 'transparent';
		this.sensor_group.visible = window.world.ui.show_collision_detection;
		this.container.add(this.sensor_group);
	}
	MakeBrain( inputs, middles, outputs, connections ) {
		// training_data.push( { input: sensors, output: [expect] } );
		// const result = net.train(CreateTrainingData(10000), options);
		// this.brain = architect.Random(inputs, middles, outputs , {
		// 	connections: (connections || ((middles * outputs * inputs)/2).toFixed() ),
		// 	gates: (middles * Math.random() * 0.5 ).toFixed(),
		// 	selfconnections: (middles * Math.random() * 0.18 ).toFixed()
		// 	} );			
		this.brain = architect.Perceptron(inputs, middles, outputs);			
	}
	NeuroInputs() { return []; }
	Update( delta ) {
		if ( !delta ) { return; }
		// record travel distance or lack thereof
		if ( !this.total_fitness_score ) { 
			this.startx = this.x;
			this.starty = this.y;
			this.total_fitness_score = 0.01; // wink
		}
		else {
			this.max_travel = this.max_travel || 0;
			let travel = Math.abs(this.x - this.startx) + Math.abs(this.y - this.starty);
			if ( travel >  this.max_travel ) {
				this.total_fitness_score += (travel - this.max_travel) / 500;
				this.max_travel = travel;
			}
		}
		// sensor collision detection				
		this.fitness_score = 0;
		let score_div = 0;
		for ( let s of this.sensors ) {
			s.Sense();
			if ( s.detect=='food' ) { 
				score_div++;
				this.fitness_score += s.val;
				// inner sensor is worth more
				if ( s.name=="touch" ) { this.fitness_score += s.val * 4; }
				// outer awareness sensor is worth less.
				if ( s.name=="awareness" ) { this.fitness_score -= s.val * 0.9; }
				// s.geo.fill = s.val ? `rgba(150,255,150,${s.val*0.5})` : 'transparent';
			}
		}
		this.fitness_score /= score_div;
		
		// COLLISION RESPONSE GOES HERE
		// [!]HACK to make food work
		for ( let food of this.tank.foods ) { 
			const dx = Math.abs(food.x - this.x);
			const dy = Math.abs(food.y - this.y);
			const d = Math.sqrt(dx*dx + dy*dy);
			let r = Math.max( this.width, this.length ) * 0.5;
			if ( d <= r + food.r ) { food.Eat(delta);  }
		}
		
		// if ( this.sensors.filter(s=>s.val).length ) {
		// 	let c = utils.HexColorToRGBArray(this.path.stroke);
		// 	this.path.fill = `rgba(${c[0]},${c[1]},${c[2]},${this.fitness_score*2})`;
		// }
		// else { this.path.fill = 'transparent'; }
		
		// experiment: punishment for hugging the edges. bad boid! bad!
		// edge detection - to be removed later - replace with actual collision detection
		// const margin = 150;
		// let nearness = 0; 
		// nearness += this.x < margin ? (margin - this.x) : 0;
		// nearness += this.x > (world.width-margin) ? (margin-(world.width - this.x)) : 0;
		// nearness += this.y < margin ? (margin - this.y ) : 0;
		// nearness += this.y > (world.height-margin) ? (margin-(world.height - this.y)) : 0;
		// nearness /= margin*2;
		// this.fitness_score -= (nearness / margin) * delta * 4;
		
		
		this.total_fitness_score += this.fitness_score * delta * 18; // the extra padding is just to make numbers look good
		
		
		
		// UI: toggle collision detection geometry UI
		if ( this.sensor_group.visible != window.world.ui.show_collision_detection ) {
			this.sensor_group.visible = window.world.ui.show_collision_detection;
		}
		
		// energy generation
		// TODO: metabolize food
		this.energy += delta + Math.random() * delta;
		this.energy = Math.min( this.energy, this.max_energy || 100 );
		
		// movement / motor control 				
		let brain_outputs = this.brain.activate( this.NeuroInputs() );
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
		// if ( this.x > window.world.width ) { this.inertia *= 0.75; this.momentum_x = 0; }
		// if ( this.y > window.world.height ) { this.inertia *= 0.75; this.momentum_y = 0; }	
		// // stay inside window.world bounds			
		// this.x = utils.clamp( this.x, 0, window.world.width );
		// this.y = utils.clamp( this.y, 0, window.world.height );
		// // viscosity slows down inertia over time
		// const drag = (1 - ( window.world.settings.viscosity * delta * 10 ) );
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
		if ( this.x > window.world.width ) { this.inertia *= 0.75; }
		if ( this.y > window.world.height ) { this.inertia *= 0.75; }				
		// stay inside world bounds
		this.x = utils.clamp( this.x, 0, window.world.width );
		this.y = utils.clamp( this.y, 0, window.world.height );
		// update drawing geometry
		this.container.position.x = this.x;
		this.container.position.y = this.y;
		this.container.rotation = this.angle;
		// viscosity slows down inertia over time
		this.inertia *= (1 - ( window.world.settings.viscosity * delta * 10 ) );
		this.angmo *= (1 - ( window.world.settings.viscosity * delta * 10 ) );
		// speed caps
		if ( this.inertia > this.maxspeed ) { this.inertia = this.maxspeed; }
		if ( this.inertia < -this.maxspeed ) { this.inertia = -this.maxspeed; }
		if ( this.inertia > -5 && this.inertia < 5 ) { this.inertia = 0; } // come to a stop before end of universe
		if ( this.angmo > this.maxrot ) { this.angmo = this.maxrot; }
		if ( this.angmo < -this.maxrot ) { this.angmo = -this.maxrot; }
		if ( this.angmo > -0.05 && this.angmo < 0.05 ) { this.angmo = 0; }
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
			//
			// TODO: insert stroke power function
			// amount = some_function(amount);
			// For testing, assume constant power output
			// amount = Math.sin(amount) / Math.PI;
			// amount *= (m.stroketime - m.t) / m.stroketime; // linear downslope
			amount = amount * 0.64; // magic number
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
		window.two.remove([this.path,this.container]);
		window.two.remove(this.sensors.map(x=>x.geo));
		this.dead = true;
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
		this.MakeBrain( this.sensors.length, 12, this.motors.length );
	}
	MakeGeometry() {
		this.bodyplan = new BodyPlan([
			[this.length/2, 0],
			[-this.length/2, this.width/2],
			[-this.length/2, -this.width/2]
		])
		this.bodyplan.stroke = 'transparent';
		this.bodyplan.fill = '#AEA9';
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
			{name:'Forward', linear:3000, min_act:0.12, cost: 0.5, stroketime:1, t:0, strokefunc:null },
			{name:'Backward', linear:-1000, min_act:0.35, cost: 2, stroketime:0.65, t:0, strokefunc:null },
			{name:'Rotate CW', angular:30, min_act:0.55, cost: 0.25, stroketime:0.3, t:0, strokefunc:null },
			{name:'Rotate CCW', angular:-30, min_act:0.55, cost: 0.25, stroketime:0.3, t:0, strokefunc:null },
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
		super.MakeSensors();
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
// 		nearness += this.x > (window.world.width-margin) ? (margin-(window.world.width - this.x)) : 0;
// 		nearness += this.y < margin ? (margin - this.y ) : 0;
// 		nearness += this.y > (window.world.height-margin) ? (margin-(window.world.height - this.y)) : 0;
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
// 		inputs.push(this.x / window.world.width);
// 		inputs.push(this.y / window.world.height);
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
