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

	static maxspeed = 2000; // these are global maximum speeds to prevent collision detection from breaking in fringe cases
	static maxrot = 14;
		
	static mutationOptionPicker = new utils.RandomPicker( [
		[ neataptic.methods.mutation.ADD_NODE, 			16 ],
		[ neataptic.methods.mutation.SUB_NODE, 			20 ],
		[ neataptic.methods.mutation.ADD_CONN, 			34 ],
		[ neataptic.methods.mutation.SUB_CONN, 			40 ],
		[ neataptic.methods.mutation.MOD_WEIGHT, 		1000 ],
		[ neataptic.methods.mutation.MOD_BIAS, 			100 ],
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
		this.sense = new Array(16).fill(0);
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
		this.angle = Math.random()*Math.PI*2;
		this.inertia = 0; // forward motion power, can be negative
		this.angmo = 0; // angular momentum / rotational inertia
		// drawing stuff
		this.container = window.two.makeGroup();
		this.container.position.x = x;
		this.container.position.y = y;
		this.container.visible = true;
		window.vc.AddShapeToRenderLayer(this.container); // main layer
		// neuro stuff
		this.brain = null;
		// vision and sensors
		this.sensors = [];
		this.sensor_outputs = [];
		this.fitness_score = 0; // per frame
		this.total_fitness_score = 0; // accumulates over time
		// motors
		this.motors = [];
		
		// rehydrate objects from JSON if supplied
		if ( json && typeof json === 'object' ) {
			Object.assign(this,json);
			this.dna = new DNA(this.dna);
			this.RehydrateFromDNA();
			this.brain = neataptic.Network.fromJSON(this.brain);
			this.ScaleBoidByMass();
		}
				
	}
	MakeGeometry() { }
	MakeMotors() {}
	// inherit this function
	MakeBrain() {

		// let inputs = this.sensors.reduce( (n,s) => n + (Array.isArray(s.detect) ? s.detect.length : 1), 0 ) || 1;
		// WARNING: this way of determining number of inputs may be dangerous if the boid is not in a tank yet.
		// ideally we refactor the sensor data structures so that we can know ahead of time what we're dealing with.
		let inputs = 0;
		for ( let s of this.sensors ) { 
			s.Sense(); // need to trigger sensor ince
			inputs += Array.isArray(s.val) ? s.val.length : 1;
		}	
			
		const outputs = this.motors.length || 1;
		
		const act_picker = new utils.RandomPicker( [
			[neataptic.methods.activation.LOGISTIC, 300],
			[neataptic.methods.activation.TANH, 100],
			[neataptic.methods.activation.IDENTITY, 2],
			[neataptic.methods.activation.STEP, 5],
			[neataptic.methods.activation.RELU, 200],
			[neataptic.methods.activation.SOFTSIGN, 10],
			[neataptic.methods.activation.SINUSOID, 8],
			[neataptic.methods.activation.GAUSSIAN, 8],
			[neataptic.methods.activation.BENT_IDENTITY, 2],
			[neataptic.methods.activation.BIPOLAR, 4],
			[neataptic.methods.activation.BIPOLAR_SIGMOID, 6],
			[neataptic.methods.activation.HARD_TANH, 8],
			[neataptic.methods.activation.ABSOLUTE, 2],
			[neataptic.methods.activation.INVERSE, 2],
			[neataptic.methods.activation.SELU, 15],
		]);
		
		// threshold to determine if a node exists at all
		const num_node_threshold = this.dna.shapedNumber( [0x3E0A3D, 0xAD7144, 0x1AA1CB], 0.05, 0.5, 0.28, 0.5 );
		// threshold to determine if a connection between two nodes is made
		const connectivity = this.dna.shapedNumber( [0x3E0A3D, 0xAD7144, 0x1AA1CB], 0.2, 0.6, 0.33, 0.5 );
		
		const hasNode = gene_str => {
			const gene1 = this.dna.geneFor(gene_str + ' g1');
			const gene2 = this.dna.geneFor(gene_str + ' g2');
			const gene3 = this.dna.geneFor(gene_str + ' g3');
			return this.dna.mix( [gene1, gene2, gene3], 0, 1 ) < num_node_threshold;
		};
		const geneConnect = gene_str => {
			const gene = this.dna.geneFor(gene_str);
			return this.dna.read( gene, 0, 1 ) > connectivity;
		};
		const geneWeight = gene_str => {
			const gene = this.dna.geneFor(gene_str);
			return this.dna.read( gene, -1, 1 );
		};
		
		let output_nodes = [];
		let input_nodes = [];
		let middle_nodes = [];
		for ( let i=0; i < inputs; i++ ) {
			input_nodes.push( new neataptic.Node('input') );
		}
		for ( let i=0; i < outputs; i++ ) {
			output_nodes.push( new neataptic.Node('output') );
		}
		for ( let i=0; i < 20; i++ ) { // MAGIC
			if ( hasNode(`has m node ${i}`) ) {
				let n = new neataptic.Node('hidden');
				n.squash = act_picker.Pick( this.dna.biasedRand( this.dna.geneFor(`m node ${i} act`) ) );
				n.bias = geneWeight(`m node ${i} bias`);
				middle_nodes.push( n );
			}
		}
		// input connections
		for ( let [i_index, i] of input_nodes.entries() ) {
			// inputs to middles
			for ( let [m_index, m] of middle_nodes.entries() ) {
				if ( geneConnect(`conn i${i_index}-m${m_index}`) ) {
					i.connect(m, geneWeight(`conn i${i_index}-m${m_index} weight`) );	
				}
			}
			// inputs to outputs
			for ( let [o_index, o] of output_nodes.entries() ) {
				if ( geneConnect(`conn i${i_index}-o${o_index}`) ) {
					i.connect(o, geneWeight(`conn i${i_index}-o${o_index} weight`) );	
				}
			}
		}
		// middle to outputs
		for ( let [m_index, m] of middle_nodes.entries() ) {
			for ( let [o_index, o] of output_nodes.entries() ) {
				if ( geneConnect(`conn m${m_index}-o${o_index}`) ) {
					m.connect(o, geneWeight(`conn m${m_index}-o${o_index} weight`) );	
				}
			}
		}
		// middles to other middles
		for ( let i=0; i < middle_nodes.length; i++ ) {
			for ( let j=i+1; j < middle_nodes.length; j++ ) {
				if ( geneConnect(`conn m${i}-m${j}`) ) {
					middle_nodes[i].connect(middle_nodes[j], geneWeight(`conn m${i}-m${j} weight`) );	
				}
			}
		}
		// connect inputs that are not well connected
		for ( let i=input_nodes.length-1; i>=0; i-- ) {
			if ( !input_nodes[i].connections.out.length ) {
				// input to all middles
				for ( let [m_index, m] of middle_nodes.entries() ) {
					input_nodes[i].connect(m, geneWeight(`conn i${i}-m${m_index} weight`) );	
				}			
				// input to all outputs
				for ( let [o_index, o] of output_nodes.entries() ) {
					input_nodes[i].connect(o, geneWeight(`conn i${i}-o${o_index} weight`) );	
				}			
			}
		}
		// connect outputs that are not well connected
		for ( let o=output_nodes.length-1; o>=0; o-- ) {
			if ( !output_nodes[o].connections.in.length ) {
				// output to all middles
				for ( let [m_index, m] of middle_nodes.entries() ) {
					m.connect(output_nodes[o], geneWeight(`conn o${o}-m${m_index} weight`) );	
				}			
				// output to all inputs
				for ( let [i_index, i] of input_nodes.entries() ) {
					i.connect(output_nodes[o], geneWeight(`conn o${o}-i${i_index} weight`) );	
				}			
			}
		}
		// connect middle nodes that are not well connected
		for ( let i=middle_nodes.length-1; i>=0; i-- ) {
			if ( !middle_nodes[i].connections.in.length ) {
				const n = input_nodes[ i % input_nodes.length ];
				const w = geneWeight(`conn m${i} makeup weight`);
				n.connect(middle_nodes[i], w);
			}
			if ( !middle_nodes[i].connections.out.length ) {
				middle_nodes[i].connect(output_nodes[ i % output_nodes.length ], geneWeight(`conn m${i} makeup weight`));
			}
		}
		
		this.brain = architect.Construct( input_nodes.concat( middle_nodes, output_nodes ) );
	}
		
	Update( delta ) {
	
		const frame_skip = 0; // [!]EXPERIMENTAL TODO: make this a game setting
		
		if ( !delta ) { return; }
		
		// aging out
		this.age += delta;
		if ( this.age > this.lifespan ) {
			// chance to live a while longer
			if ( Math.random() < 0.002 ) {
				this.Kill();
				return;
			}
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
		
		// sensor detection				
		this.collision.contact_obstacle = false;
		if ( !frame_skip || window.two.frameCount % frame_skip === 0 ) {
			this.sensor_outputs = [];
			for ( let s of this.sensors ) { 
				s.Sense();
				if ( Array.isArray(s.val) ) {
					this.sensor_outputs.push( ...s.val );
				}
				else {
					this.sensor_outputs.push( s.val );
				}
			}	
		}
		
		// UI: toggle collision detection geometry UI
		if ( ( window.vc.show_collision_detection || this.show_sensors ) && !this.sensor_group ) {
			this.sensor_group = window.two.makeGroup();
			this.sensor_group.add( this.sensors.filter( s => s.type=='locater' || s.detect=='food' || s.detect=='obstacles' || s.type==='sense' ).map( i => i.CreateGeometry() ) );
			this.container.add(this.sensor_group);
		}
		else if ( !( window.vc.show_collision_detection || this.show_sensors ) && this.sensor_group ) {
			this.sensor_group.remove();
			this.sensor_group = null;
		}
		
		// CPU optimization: we don't need to run AI every frame
		if ( !frame_skip || window.two.frameCount % frame_skip === 0 ) {
			// movement / motor control 				
			let brain_outputs = this.brain.activate( this.sensor_outputs.map(s=>s.val) );
			for ( let k in brain_outputs ) {
				if ( Number.isNaN(brain_outputs[k]) ) { brain_outputs[k] = 0; }
			}
			for ( let i=0; i < brain_outputs.length; i++ ) {
				this.ActivateMotor( i, Math.tanh(brain_outputs[i]), delta ); // FIXME tanh?
			}
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
		if ( this.x < this.collision.radius ) { this.inertia *= 0.75; this.momentum_x = 0; }
		if ( this.y < this.collision.radius ) { this.inertia *= 0.75; this.momentum_y = 0; }
		if ( this.x > this.tank.width - this.collision.radius ) { this.inertia *= 0.75; this.momentum_x = 0; }
		if ( this.y > this.tank.height - this.collision.radius ) { this.inertia *= 0.75; this.momentum_y = 0; }	
		// stay inside tank			
		this.x = utils.clamp( this.x, 0 + this.collision.radius, this.tank.width - this.collision.radius );
		this.y = utils.clamp( this.y, 0 + this.collision.radius, this.tank.height - this.collision.radius );
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
		this.momentum_x = utils.Clamp( this.momentum_x, -Boid.maxspeed, Boid.maxspeed );
		this.momentum_y = utils.Clamp( this.momentum_y, -Boid.maxspeed, Boid.maxspeed );
		this.inertia = utils.Clamp( this.inertia, -Boid.maxspeed, Boid.maxspeed );
		this.angmo = utils.Clamp( this.angmo, -Boid.maxrot, Boid.maxrot );
		if ( this.inertia > -5 && this.inertia < 5 ) { this.inertia = 0; } // come to a stop before end of universe
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
			const circle  = new Circle(this.x, this.y, my_radius);
			const polygon = new Polygon(o.x, o.y, o.collision.hull);
			const result  = new Result();
			let gotcha = circle.collides(polygon, result);
			// response
			if ( gotcha ) {
				this.x -= result.overlap * result.overlap_x;
				this.y -= result.overlap * result.overlap_y;
				this.inertia *= 0.75; // what a drag
				this.collision.contact_obstacle = true;
			}
		}
		// if an object pushed us out of bounds and we gets stuck outside tank, remove
		if ( candidates.length ) {
			if ( this.x < 0 || this.x > window.vc.tank.width ) { this.Kill(); return; };
			if ( this.y < 0 || this.y > window.vc.tank.height ) { this.Kill(); return; };
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

	ActivateMotor( i, amount /* -1..1 */, delta ) {
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
			this.last_cost = ( m.cost * Math.abs(m.strokepow) * delta * this.mass ) / 800;
			this.energy -= this.last_cost;
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
			m.last_amount = Math.abs( amount );
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
			if ( m.hasOwnProperty('mitosis') && m.t >= m.this_stoke_time ) {
				const mutation_rate = utils.Clamp( window.vc?.simulation?.settings?.max_mutation, 0, 1 );
				const speciation_rate = 
					('speciation_rate' in window.vc?.simulation?.settings)
					? utils.Clamp( window.vc?.simulation?.settings?.speciation_rate || 0, 0, 1 )
					: ( window.vc?.simulation?.settings?.allow_speciation ? ( mutation_rate / 1000 ) : 0 ) ;							
				for ( let n=0; n < m.mitosis; n++ ) { 
					let offspring = this.Copy(true, mutation_rate, mutation_rate, speciation_rate); // reset state and mutate organism
					offspring.x = this.x;
					offspring.y = this.y;
					offspring.angle = utils.RandomFloat(0, Math.PI*2);
					offspring.mass = offspring.body.mass / ( m.mitosis + 1 );
					offspring.ScaleBoidByMass();
					//offspring.energy = this.max_energy / ( m.mitosis + 1 ); // good luck, kid
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

	static Random(x,y,tank) {
		let b = new Boid(x,y,tank);
		b.dna = new DNA();
		b.species = utils.RandomName(9);
		b.age = utils.RandomInt( 0, b.lifespan * 0.5 );
		b.RehydrateFromDNA();
		b.MakeBrain();
		b.min_mass = b.body.mass * 0.3;
		b.mass = b.body.mass; // random boids start adult size	
		b.ScaleBoidByMass();	
		b.Reset(); // need this to get state values back to default
		return b;
	}
	
	// fill traits based on values mined from our DNA
	RehydrateFromDNA() {
	
		if ( this?.body?.geo ) { this.body.geo.remove(); }
		this.body = new BodyPlan( this.dna );
		this.sense[0] = this.body.sensor_colors[0];
		this.sense[1] = this.body.sensor_colors[1];
		this.sense[2] = this.body.sensor_colors[2];
		this.sense[3] =  Math.max( 0, this.dna.shapedNumber([0x8B2FC3CE], -0.25, 1, 0.2, 0.2 ) );
		this.sense[4] =  Math.max( 0, this.dna.shapedNumber([0x92C706DE], -0.25, 1, 0.4, 0.2 ) );
		this.sense[5] =  Math.max( 0, this.dna.shapedNumber([0x47A313D3], -0.25, 1, 0.6, 0.2 ) );
		this.sense[6] =  Math.max( 0, this.dna.shapedNumber([0x9C5FE21E], -0.25, 1, 0.8, 0.2 ) );
		this.sense[7] =  Math.max( 0, this.dna.shapedNumber([0xE74231EE], -0.25, 1, 0.7, 0.2 ) );
		this.sense[8] =  Math.max( 0, this.dna.shapedNumber([0x31C75CCA], -0.25, 1, 0.5, 0.2 ) );
		this.sense[9] =  Math.max( 0, this.dna.shapedNumber([0x03F689A8], -0.25, 1, 0.3, 0.2 ) );
		this.sense[10] = Math.max( 0, this.dna.shapedNumber([0x40C66616], -0.25, 1, 0.1, 0.2 ) );
		this.sense[11] = Math.max( 0, this.dna.shapedNumber([0x9BC35358], -0.25, 1, 0.05, 0.2 ) );

		this.container.add([this.body.geo]);
		this.min_mass = this.body.mass * 0.3; // ???
		this.max_energy = this.dna.shapedInt( [0x4A41941A, 0xCA3254B9], 100, 600 );
		this.lifespan = this.dna.shapedInt( [0x306440CD, 0xB949E20B], 60, 600 );
		this.maturity_age = this.dna.shapedInt( [0xDC615877, 0x5016E979], 0.1 * this.lifespan, 0.9 * this.lifespan, 0.25 * this.lifespan, 0.8 );
		if ( !this.energy ) { this.energy = this.max_energy; }
		this.diet = this.dna.shapedNumber( [0x8C729F32, 0xFA886D41] );
		this.diet_range = Math.max( this.dna.shapedNumber( [0x6FA6982D, 0xAE0D5144], 0, 0.5 ), 0.1 );
		// base rates per unit of mass - grows as organism grows
		this.base_energy = this.dna.shapedNumber( [0xC6695977, 0x8F5A8B90], 0.25, 2.0 ); // max energy per mass
		this.base_rest_metabolism = this.dna.shapedNumber( [0x4442A99B, 0xE2531273], 0.004, 0.008 ); // energy per second per mass
		this.base_digestion_rate = this.dna.shapedNumber( [0xB4BF3C40, 0x303120C1], 0.003, 0.008 ); // food per second per mass
		this.base_bite_rate = this.dna.shapedNumber( [0x9667FA3A, 0x34C8159F], 0.3, 0.8 ); // food per second per mass
		this.base_stomach_size = this.dna.shapedNumber( [0x32028415, 0xDB911C34], 0.1, 0.5 ); // food per mass;		

		this.ScaleBoidByMass();

		// SENSORS:
		this.sensors = [];
		
		// experimental: food-locator
		const has_food_locator = this.dna.shapedNumber(0xEF280028) > 0.86;
		if ( has_food_locator ) {
			const radius = this.dna.shapedNumber([0x65F000D2, 0x3D5500CB, 0x4893BADE], 150, 900, 450, 0.25 );
			const xoff = this.dna.shapedNumber([0xED290071, 0xABAB0008, 0x5E0BA7D4], -radius*0.5, radius, radius*0.5, 0.25 );
			const detect = ['near_food_dist'];
			// include density 
			if ( this.dna.shapedNumber(0x6F4A0039) > 0.6 ) { detect.push('food_density'); }
			// use single angle number
			if ( this.dna.shapedNumber(0x7DD800D8) > 0.7 ) { detect.push('near_food_angle'); }
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
		}
		
		// color vision
		const has_vision = this.dna.shapedNumber(0x28FE00B9) > 0.35;
		if ( has_vision ) {
			const radius = this.dna.shapedNumber([0x65F000D2, 0x3D5500CB, 0x4893BADE], 150, 900, 450, 0.25 );
			const xoff = this.dna.shapedNumber([0xED290071, 0xABAB0008, 0x5E0BA7D4], -radius*0.5, radius, radius*0.5, 0.25 );
			const yoff = this.dna.shapedNumber([0x53A1008C, 0x811E0305, 0xC98ECC9A], 0, radius, radius*0.5, 0.25 );
			const chance_r = this.dna.shapedNumber([0x52B500E1, 0xA3E5000E, 0xBCAC00D6], 0, 1, 0.5, 0 );
			const chance_g = this.dna.shapedNumber([0xBA6A00CD, 0xBEDC001E, 0x2E4C00C1], 0, 1, 0.5, 0 );
			const chance_b = this.dna.shapedNumber([0xD93500A8, 0xDF9C007F, 0xEE02001B], 0, 1, 0.5, 0 );
			const chance_i = this.dna.shapedNumber([0x8D1A00A9, 0xD47800C5, 0x5E1800DA], 0, 1, 0.5, 0 );
			const detect = [];
			if ( chance_i < 0.20 ) { detect.push([0,1,2]); } // blended intensity
			else {
				if ( chance_r > 0.20 ) { detect.push([0]); }
				if ( chance_g > 0.20 ) { detect.push([1]); }
				if ( chance_b > 0.20 ) { detect.push([2]); }
			}
			if ( !detect.length ) { detect.push([0,1,2]); }
			this.sensors.push( new Sensor({ type:'sense', name: 'vision1', color: '#AAEEFFBB', sensitivity: 2, fov:true, attenuation:true, detect: detect, x: xoff, y: yoff, r: radius, }, this ) );2
			this.sensors.push( new Sensor({ type:'sense', name: 'vision2', color: '#AAEEFFBB', sensitivity: 2, fov:true, attenuation:true, detect: detect, x: xoff, y: -yoff, r: radius, }, this ) );
		}
		
		// smell
		const has_smell = this.dna.shapedNumber(0xB1570091) > 0.2;
		if ( has_smell ) {
			const radius = this.dna.shapedNumber([0xCE240049, 0x45EC0063, 0x3343345A], 300, 1200, 600, 0.25 );
			const xoff = this.dna.shapedNumber([0x9A22004B, 0x22A000F0, 0x9D2A0107], -radius*0.5, radius, radius*0.5, 0.25 );
			const yoff = this.dna.shapedNumber([0x40C10059, 0xE0570072, 0x2E2FD071], 0, radius, radius*0.5, 0.25 );
			const detect = [];
			const rejects = [];
			// chance to detect indv channels
			for ( let i=0; i<9; i++ ) {
				const g1 = this.dna.geneFor('smell chance ' + i);
				const chance = this.dna.mix(g1, 0, 1);
				if ( chance > 0.5 ) { detect.push(i+3); } // first three indexes are vision
				else { rejects.push(i+3); }
			}
			// random chance to have blended channel detection
			if ( rejects.length ) {
				rejects.shuffle();
				while ( rejects.length ) {
					let num = this.dna.shapedInt( this.dna.geneFor('smell merge ' + rejects.length), 2, 3);
					num = Math.min( rejects.length, num );
					const chance = this.dna.mix(this.dna.geneFor('smell merge chance ' + rejects.length), 0, 1);
					const my_rejects = rejects.splice(0,num);
					if ( chance > 0.5 ) { 
						detect.push(my_rejects);
					}
				}
			}
			if ( detect.length ) {
				const chance = this.dna.shapedNumber([0x293D00E7,0x380A0056,0x615F00E1]);
				// mono
				if ( chance > 0.5 ) {
					this.sensors.push( new Sensor({ type:'sense', name: 'smell', color: '#FFBB00FF', falloff:2, sensitivity: 0.4, detect: detect, x: xoff, y: 0, r: radius, }, this ) );
				} 
				// stereo
				else {
					this.sensors.push( new Sensor({ type:'sense', name: 'smell1', color: '#FFBB00FF', falloff:2, sensitivity: 0.4, detect: detect, x: xoff, y: yoff, r: radius, }, this ) );
					this.sensors.push( new Sensor({ type:'sense', name: 'smell2', color: '#FFBB00FF', falloff:2, sensitivity: 0.4, detect: detect, x: xoff, y: -yoff, r: radius, }, this ) );
				}
			}
		}
		
		// food and obstacle sensors are mandatory - its just a matter of how many
		const my_max_dim = Math.max( this.body.length, this.body.width );
		const max_sensor_distance = Math.sqrt(my_max_dim) * 65;
		const max_sensor_radius = Math.sqrt(my_max_dim) * 50;
		const min_sensor_radius = Math.min( my_max_dim, max_sensor_radius );
		const min_sensor_distance = Math.min( my_max_dim, max_sensor_distance );
		for ( let detect of ['food','obstacles'] ) {
			let base_num_sensors = this.dna.shapedInt( [0xA6940009, 0xAE6200EC],1,3,1.5,0.5); // 1..3
			// if organism already has vision, we limit the extra food sensors
			for ( let n=0; n < base_num_sensors; n++ ) {
				let sx = 0;
				let sy = 0;
				let r = this.dna.shapedNumber( [0x0FD8010D, this.dna.geneFor(`${detect} sensor radius ${n}`)], min_sensor_radius, max_sensor_radius) * (detect=='obstacles' ? 0.6 : 1.0);
				let d = this.dna.biasedRand( this.dna.geneFor(`${detect} sensor distance ${n}`), min_sensor_radius, max_sensor_radius);
				// sensors need to stay close to the body:
				d = Math.min( d, r );
				// prefer sensors in front
				let a = ( this.dna.shapedNumber( [0x0FB756A3, this.dna.geneFor(`${detect} sensor angle ${n}`)], 0, Math.PI * 2) + Math.PI ) % (Math.PI * 2);
				const symmetryGene = this.dna.geneFor(`${detect} sensor symmetry ${n}`,false,true);
				let color = detect==='obstacles' ? '#FF22BB77' : null;
				if ( this.dna.biasedRand(symmetryGene, 0,1,0.5,0) < 0.33 ) {
					this.sensors.push( new Sensor({ x:d, y:sy, r, angle:0, detect, color, name:detect }, this ) );			
				}
				// symmetry = 1
				else {
					for ( let angle of [a, Math.PI*2-a] ) {
						sx = d * Math.cos(angle);
						sy = d * Math.sin(angle);				
						this.sensors.push( new Sensor({ x:sx, y:sy, r, angle, detect, color, name:detect }, this ) );			
					}
				}
			}
		}
		
		// proprioception
		const proprio_chance = this.dna.shapedNumber( [0xA9B100D5, 0xE4F000E6, 0xD5C10073] );
		if ( proprio_chance < 0.45 ) { 
			this.sensors.push( new Sensor({detect:'proprio'}, this) );
		}
		
		// random chance to get any of the non-collision sensors	
		const non_coll_sensors = {
			'energy': 		0.5,
			'inertia': 		0.3,
			'spin': 		0.1,
			'angle-sin': 	0.3,
			'angle-cos': 	0.3,
			'world-x': 		0.3,
			'world-y': 		0.3,
			//'friends': 		0.0,
			//'enemies': 		0.0,
			};
		for ( let k in non_coll_sensors ) {
			const gene1 = this.dna.geneFor(`has sensor ${k} chance 1`, false, true);
			const gene2 = this.dna.geneFor(`has sensor ${k} chance 2`, false, true);
			const n = this.dna.shapedNumber( [gene1, gene2], 0, 1 );
			if ( n < non_coll_sensors[k] ) {
				this.sensors.push( new Sensor({detect:k}, this) );
			}
		}
		// if the organism has no inputs at all, they get energy
		if ( !this.sensors.length ) {
			this.sensors.push( new Sensor({detect:'energy'}, this) );
		}
		
		// motors
		this.motors = [];
		let has_linear = false;
		let has_angular = false;
		// loop through the max number of potential motors and decide on each one individually with a gene.
		// this way if a gene changes it doesnt affect all subsequent motors in the stack.
		const max_num_motors = 5;
		let num_motors = 0;
		const motor_slots = []; // array of booleans to indicate if motor should be created
		// first loop decides if a motor should be created. 
		// this helps us set up defaults in case nothing is created.
		for ( let n=1; n <= max_num_motors; n++ ) {
			const hasMotorGene1 = this.dna.geneFor(`has motor ${n} 1`, false, true);
			const hasMotorGene2 = this.dna.geneFor(`has motor ${n} 2`, false, true);
			const hasMotorGene3 = this.dna.geneFor(`has motor ${n} 3`, false, true);
			const has_motor_chance = this.dna.shapedNumber([hasMotorGene1, hasMotorGene2, hasMotorGene3], 0, 1);
			const gotcha = has_motor_chance <= 1/n; // guaranteed one motor
			motor_slots.push(gotcha);
			num_motors += gotcha ? 1 : 0;
		}
		// second loop creates the motors
		for ( let n=1; n <= motor_slots.length; n++ ) {
			if ( !motor_slots[n-1] ) { continue; } // a blank for your thoughts
			
			const strokeFuncGene =  this.dna.geneFor(`motor stroke function ${n}`);
			let strokefunc = this.dna.shapedNumber([strokeFuncGene], 0, 1);
			
			const wheelChanceGene =  this.dna.geneFor(`motor wheel chance ${n}`, false, true);
			let wheel = this.dna.shapedNumber([wheelChanceGene], 0, 1) > 0.75 ? true : false;
			
			const stroketimeGene =  this.dna.geneFor(`motor stroke time ${n}`);
			const stroketime = this.dna.shapedNumber([stroketimeGene],0.1, 3.5, 0.75, 0.6); 
			
			const minActGene =  this.dna.geneFor(`motor min_act chance ${n}`);
			let min_act = this.dna.shapedNumber([minActGene],0,0.7,0.05,0.95);
			if ( wheel ) { min_act * 0.5; }
			if ( strokefunc < 0.4 ) { strokefunc = 'linear_down'; }
			else if ( strokefunc < 0.5 ) { strokefunc = 'linear_up'; }
			else if ( strokefunc < 0.65 ) { strokefunc = 'bell'; }
			else if ( strokefunc < 0.7 ) { strokefunc = 'step_down'; }
			else if ( strokefunc < 0.75 ) { strokefunc = 'step_up'; }
			else if ( strokefunc < 0.78 ) { strokefunc = 'burst'; }
			else if ( strokefunc < 0.84 ) { strokefunc = 'spring'; }
			else { strokefunc = 'constant'; }
			let motor = { min_act, stroketime, t:0, strokefunc, wheel };
			
			const linearGene =  this.dna.geneFor(`motor linear ${n}`);
			let linear = this.dna.shapedNumber([linearGene],80, 1800, 600, 0.6);
			
			const angularGene =  this.dna.geneFor(`motor angular ${n}`);
			let angular = this.dna.shapedNumber([angularGene],3, 100, 20, 0.5);
			
			const linearFlipGene =  this.dna.geneFor(`motor linear flip ${n}`, false, true);
			if ( this.dna.shapedNumber([linearFlipGene],0,1) > 0.65 ) { linear = -linear; }
			
			const angularFlipGene =  this.dna.geneFor(`motor angular flip ${n}`, false, true);
			if ( this.dna.shapedNumber([angularFlipGene],0,1) > 0.65 ) { angular = -angular; }
			
			// all organisms must have ability to move forward and turn. 
			// If there is only one motor on the organism, make it a combo linear+angular.
			if ( num_motors > 1 ) {
				const comboChanceGene =  this.dna.geneFor(`motor combo_chance ${n}`, false, true);
				const combo_chance = this.dna.shapedNumber([comboChanceGene],0,1)
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
			const motorCostGene =  this.dna.geneFor(`motor cost ${n}`);
			motor.cost = (Math.abs(motor.linear||0) / 1800) + (Math.abs(motor.angular||0) / 100);
			motor.cost += ( motor.cost * this.dna.shapedNumber([motorCostGene],0,1) ) - (motor.cost * 0.5);
			
			// animation
			motor.anim = {
				index:this.motors.length, // to be changed after body plan is created
				xval: 10 + Math.random() * 25, 
				yval: 10 + Math.random() * 25,
				xfunc: Math.random() > 0.5 ? 'time' : 'blend',
				yfunc: Math.random() > 0.5 ? 'time' : 'blend',
			};
			
			// naming
			motor.name = (motor.linear && motor.angular) ? 'Combo' : (motor.linear ? 'Linear' : 'Angular');
			if ( motor.wheel ) { motor.name += ' Wheel'; }
			this.motors.push( motor );
			
			// if non-wheel motor has angular movement, create a symmetrical counterpart
			if ( !motor.wheel && motor.angular ) {
				let motor2 = Object.assign( {}, motor );
				motor2.angular = -motor.angular;
				motor2.name = motor.name + ' B';
				motor.name = motor.name + ' A';
				motor2.anim = Object.assign( {}, motor.anim );
				motor2.anim.yval = -motor2.anim.yval;
				this.motors.push(motor2);
				motor.sym = this.motors.length - 1; // index links to each partner
				motor2.sym = this.motors.length - 2;
			} 
		}
			
		// reproductive motors
		const mitosis_num = this.dna.biasedRandInt( 0xA67200D2, 1,5,1,0.95);
		const stroketime = this.dna.biasedRandInt( 0x30184FA2, mitosis_num*this.lifespan*0.02,mitosis_num*this.lifespan*0.06,mitosis_num*this.lifespan*0.04,0.5) * mitosis_num;
		this.motors.push({
			mitosis: mitosis_num, // number of new organisms
			min_act: this.dna.biasedRand( 0x193D8CF5, 0.22,0.9,0.6,0.5),
			cost: ( this.max_energy * this.dna.biasedRand( 0x5BD35728, 0.51,1,0.65,0.5) ) / stroketime, 
			stroketime: stroketime, 
			strokefunc: 'complete', 
			name: 'mitosis',
			min_age: this.maturity_age,
			min_scale: 0.65, // prevents infinite subdivision
			use_max: true // prevents cheating on time
			// brake: 1
		});
					
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
	}
			
	Copy( reset=false, dna_mutation=0, brain_mutation=0, speciation_chance=0 ) {
		brain_mutation = utils.Clamp( brain_mutation, 0, 1 );
		dna_mutation = utils.Clamp( dna_mutation, 0, 1 );
		let b = new Boid(this.x, this.y, this.tank);
		// POD we can just copy over
		let datakeys = ['species','generation'];
		for ( let k of datakeys ) { b[k] = this[k]; }
		b.dna = new DNA( this.dna.str );
		b.brain = neataptic.Network.fromJSON(this.brain.toJSON());
		if ( b?.body?.geo ) b.body.geo.remove(); // out with the old
		if ( brain_mutation ) {
			const max_nn_muts = 50;
			const nn_mutations = utils.RandomInt( 1, Math.ceil( max_nn_muts * brain_mutation ) );
			for ( let n=0; n < nn_mutations; n++ ) {
				b.brain.mutate( Boid.mutationOptionPicker.Pick() );
			}
			// Neataptic can alter output node bias. We don't want this.
			// This resets output node bias to zero. letting it run amok
			// can lead to "locked in" brain outputs that never change. 
			// You might specifically want it back someday, but not today.
			b.brain.nodes.filter(n=>n.type=='output').forEach(n => n.bias = 0 );
		}
		if ( dna_mutation ) {
			const max_dna_muts = 20;
			b.dna.mutate( 
				utils.RandomInt( 1, Math.ceil( max_dna_muts * dna_mutation ) ),
				(1-speciation_chance)
			); 
			// subspecies names
			if ( b.dna.str.substring(1,256) != this.dna.str.substring(1,256) ) {
				b.species = b.species.replace(/\s+\w+$/g, '') + ' ' + utils.RandomName(9);
				// console.log('new species: ' + b.species);
			}
		}
		b.RehydrateFromDNA();
		b.min_mass = b.body.mass * 0.3;
		b.mass = b.body.mass; // random boids start adult size			
		b.ScaleBoidByMass();			
		b.container.add([b.body.geo]);
		b.collision.radius = this.collision.radius;
		b.generation = this.generation + 1;
		if ( reset ) { b.Reset(); }
		return b;
	}
			
	Export( as_JSON=false ) {
		let b = {};
		// POD we can just copy over
		let datakeys = ['id','x','y','species','age','stomach_contents', 'energy', 'mass', 'scale', 'length', 'width', 'generation' ];		
		for ( let k of datakeys ) { b[k] = this[k]; }
		b.brain = this.brain.toJSON(); // misnomor, its not actually JSON, its POD object
		b.dna = this.dna.str;
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