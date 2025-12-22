import Two from "two.js";
import * as utils from '../util/utils.js'
import {Circle, Polygon, Result} from 'collisions';
import Rock from '../classes/class.Rock.js'
import PhysicsObject from '../classes/class.PhysicsObject.js'
import { DNAPlant } from '../classes/class.Plant.js'

const friction = 0.92; // physics friction when sliding
const bounce = 0.38; // physics bounce when colliding with rocks and walls

export default class Food extends PhysicsObject {

	constructor(x=0,y=0,params) {
		super();
		this.oid = ++globalThis.vc.next_object_id;
		// first param can be JSON to rehydrate entire object from save
		if ( x && typeof x === 'object' ) {
			params = x;
		}
		// defaults
		this.x = x;
		this.y = y;
		this.vel_x = Math.random() * 10 - 5;
		this.vel_y = Math.random() * 100 - 50;
		this.value = 300;
		this.age = 0;
		this.lifespan = 60 + Math.random() * 120;
		this.flavor = Math.random(); // 0..1
		this.complexity = utils.RandomInt(1,6);
		this.frictionless = false;
		this.sense = new Array(16).fill(0);
		this.buoy = 0;
		this.buoy_start = 0;
		this.buoy_end = 0;
		this.dead = false;		
		Object.assign( this, params );
		this.r = Math.sqrt( 2 * this.value / Math.PI ) * 10;
		this.collision = { radius: this.r, shape: 'circle', qid:0 };		
		
		// sensory data comes from food flavor unless overridden by creator
		if ( !params || !params?.sense ) {
			// visual color
			const rgb = utils.hsl2rgb(this.flavor,1,0.6);
			const visual_buff = 10; // buff to help boids see food
			this.sense[0] = rgb[0] * visual_buff;
			this.sense[1] = rgb[1] * visual_buff;
			this.sense[2] = rgb[2] * visual_buff;
			// smell
			let smell_scale = utils.Clamp( Math.pow(this.value,0.5) * 0.2, 0, 3 ); // arbitrary
			const calcScent = i => smell_scale * Math.max( 0, Math.cos( this.flavor + Math.PI * 2 * (i/8) ) );
			this.sense[3] =  calcScent(0); 
			this.sense[4] =  calcScent(1); 
			this.sense[5] =  calcScent(2); 
			this.sense[6] =  calcScent(3); 
			this.sense[7] =  calcScent(4); 
			this.sense[8] =  calcScent(5); 
			this.sense[9] =  calcScent(6); 
			this.sense[10] = calcScent(7); 
			this.sense[11] = smell_scale * (this.complexity || 0) / 5;
		}

	}
	Export( as_JSON=false ) {
		let output = {};
		let datakeys = ['x','y','value','age','lifespan','seed','max_germ_density','germ_distance','frictionless','sense','flavor','complexity'];		
		for ( let k of datakeys ) { 
			if ( k in this ) {
				output[k] = this[k]; 
			}
		}
		if ( as_JSON ) { output = JSON.stringify(output); }
		return output;
	}	
	Update(delta) {
		if ( !delta ) { return; }
		if ( delta > 1 ) { delta /= 1000; }
		if ( this.value < 0.001 ) {
			this.Kill();
			return;
		}
		this.age += delta;
		if ( this.age > this.lifespan && !this.permafood ) {
			globalThis.vc.tank.AddMatterAt( this.x, this.y, this.value ); // rot
			this.Kill();
			return;
		}
		
		// mass and radius can change as things get eaten
		this.mass = this.value;
		this.r = Math.sqrt( 2 * this.value / Math.PI );

		// buoyancy
		if ( !this?.frictionless ) { 
			this.buoy = this.buoy_start + ( this.buoy_end - this.buoy_start ) * Math.max(1, this.age / this.lifespan) ; 
			this.ApplyForce(0, -this.buoy * this.mass); // buoyancy force scales with mass
		}
		
		// drag force, otherwise we just go faster and faster.
		if ( !this?.frictionless ) {
			// simplified drag function for round objects
			this.AddDrag( this.r, globalThis.vc.simulation.settings.viscosity, 60 ); // arbitrary balance number
		}
		
		// integrate all forces and move
		this.UpdatePosition(delta);
				
		// stay in tank
 		this.Constrain(bounce);
		
		// update the object in space
		this.collision.radius = this.r;
		// collision detection with obstacles
		// things i might collide with:
		let candidates = globalThis.vc.tank.grid.GetObjectsByBox( 
			this.x - this.r,
			this.y - this.r,
			this.x + this.r,
			this.y + this.r,
			o => o instanceof Rock
		);
		// narrow phase collision detection
		let touching_rock = false;
		for ( let o of candidates ) {
			const circle  = new Circle(this.x, this.y, this.r);
			const polygon = new Polygon(o.x, o.y, o.collision.hull);
			const result  = new Result();
			let gotcha = circle.collides(polygon, result);
			// response
			if ( gotcha ) {
				// retract from collision object
				this.x -= result.overlap * result.overlap_x;
				this.y -= result.overlap * result.overlap_y;
				// just bounce hardcoded foods used in training
				if ( this.frictionless ) {
					this.vel_x = -this.vel_x;
					this.vel_y = -this.vel_y;
				}
				// slide along walls with slight bounce
				else {
					this.SlideAndBounce( result.overlap_x, result.overlap_y, friction, bounce );
				}
			}
			touching_rock = touching_rock || gotcha;
		}
		// if an object pushed us out of bounds and gets stuck outside tank, remove
		if ( touching_rock ) {
			if ( this.x < -0.01 || this.x > globalThis.vc.tank.width + 0.01 ) { this.Kill(); return; };
			if ( this.y < -0.01 || this.y > globalThis.vc.tank.height + 0.01 ) { this.Kill(); return; };
		}
		// plant a seed
		if ( touching_rock && this.seed && this.age > 5 && Math.random() > 0.9992 && 
			globalThis.vc.tank.plants.length < globalThis.vc.simulation.settings.num_plants ) {
			// check for local light and heat to be in reasonable range
			const cell = globalThis.vc.tank.datagrid.CellAt( this.x, this.y );
			const light_ok = Math.abs( cell.light - this.light_pref ) <= 0.5; // magic - you could make 0.5 a setting
			const heat_ok = Math.abs( cell.heat - this.heat_pref ) <= 0.5; 
			// only plant the seed under teh right conditions
			let plant_the_seed = light_ok && heat_ok;
			// check if there are not too many other plants in the local area
			if ( plant_the_seed && this.max_germ_density && this.germ_distance ) {
				// [1] plants are not in the collision detection space, so we need to check all of them for now ;-(
				let found = 0;
				const csqrd = this.germ_distance * this.germ_distance;
				for ( let p of globalThis.vc.tank.plants ) {
					const xdiff = p.x - this.x;
					const ydiff = p.y - this.y;
					const absqrd = xdiff * xdiff + ydiff * ydiff; // dont need to sqrt here
					if ( absqrd < csqrd ) {
						found++;
						if ( found >= this.max_germ_density ) {
							plant_the_seed = false;
							break; // too many plants in the local area - stop here
						}
					}
				}				
			}
			if ( plant_the_seed ) {
				const plant = new DNAPlant( {dna:this.seed} );
				plant.x = this.x;
				plant.y = this.y;
				plant.age = 0; // shim
				globalThis.vc.tank.plants.push(plant);
				globalThis.vc.tank.AddMatterAt( this.x, this.y, this.value ); // rot
				this.Kill();
			}
		}
	}
	// returns the amount eaten
	Eat(amount) { 
		if ( this.dead || !this.value ) { return 0; }
		const eaten = Math.min( this.value, amount );
		if ( !this.permafood && !this.phantomfood ) { this.value -= eaten; }
		if ( this.value <= 0.001 ) { this.Kill(); }
		return eaten;
	}
	Kill() {
		this.dead = true;
	}
	// returns TRUE if the food is edible by the boid
	IsEdibleBy( boid ) {
		if ( this.dead ) { return false; }
		if ( this.edibility >= 1 ) { return true; } // legacy hack for simulations
		return (1 << (this.complexity-1)) & boid.traits.food_mask;
	}	
	GeoData() {

		let geodata = { 
			type:'circle', 
			r:this.r,
			lifespan:this.lifespan,
			permafood:this.permafood,
			complexity:this.complexity,
		};
		
		// rendering
		let points = this.complexity+2;
		if ( this.complexity==5 ) { points=8 } // unicode doesnt have heptagons ;-( 
		else if ( this.complexity==6 ) { points=12; } // getting hard to discern at this point 
			
		geodata.fill = `hsl(${this.flavor*360},85%,70%)`;
		geodata.stroke = `hsl(${this.flavor*360},70%,35%)`;
		// make dash pattern create a number of "pips" to represent food complexity.
		// this is aesthetically better than using polygons to represent complexity.
		let circ = this.r * 2 * Math.PI;
		let segment = circ / ( points * 2 );
		geodata.linewidth = this.r/2;
		geodata.dashes = [segment,segment];
		geodata.rotation = Math.random() * Math.PI; // aesthetic rotation
			
		return geodata;
	}	
}