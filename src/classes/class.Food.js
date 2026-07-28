/* <AI>
Food — consumable resource. Extends PhysicsObject.

OVERVIEW
- `otype = 2` (numeric type tag used in hot-path checks instead of instanceof).
- Spawned by tank, simulation spawn logic, or plant fruiting. Falls and drifts by default.
- `value` — energy content; determines radius `r = sqrt(2*value/PI) * 10`.
- `flavor` (0..1) — determines color and smell channels auto-filled in `sense[]`.
- `complexity` (1..8) — encoded in `sense[11]`; matched against boid food preference.
- `sense[]` (15 channels) — Fourier identity layout: [0..2] v1 (visual h1: cos,sin,amp), [3..5] v2 (visual h2), [6..8] s1 (smell h1), [9..11] s2 (smell h2; amp=complexity), [12..14] audio (silent).
- `lifespan` — seconds before expiry; `dead` = true when killed.
- `frictionless` — if true, ignores surface friction (useful for wall-hugging spawn patterns).

PLANT SEEDS
- If spawned from a Plant, carries `seed` DNA string for germination on contact.

UPDATE
- `Update(delta)` — moves, applies buoyancy, ages, kills when expired.
- `GeoData()` — returns render shape data (circle, color derived from sense[]).
</AI> */

import Two from "two.js";
import * as utils from '../util/utils.js'
import { createCircleCollider, testCirclePolygon, testCircleCircle, createResult } from './collision.js';
import Rock from '../classes/class.Rock.js'
import PhysicsObject from '../classes/class.PhysicsObject.js'
import Plant from '../classes/class.Plant.js'

const friction = 0.92; // physics friction when sliding
const bounce = 0.38; // physics bounce when colliding with rocks and walls
const _food_coll_result = createResult();


export default class Food extends PhysicsObject {

	static FOOD_COMPLEXITY_LEVELS = 8;
	
	constructor(x=0,y=0,params) {
		super();
		this.oid = ++globalThis.vc.next_object_id;
		this.otype = 2; // numeric type tag for fast checks (1=Boid, 2=Food, 3=Rock)
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
		this.complexity = utils.RandomInt(1,Food.FOOD_COMPLEXITY_LEVELS);
		this.frictionless = false;
		this.sense = new Array(15).fill(0);
		this.buoy = 0;
		this.buoy_start = 0;
		this.buoy_end = 0;
		this.dead = false;		
		Object.assign( this, params );
		this.r = Math.sqrt( 2 * this.value / Math.PI ) * 10;
		this.collision = createCircleCollider( this.r );
		this.senseSize = this.r * 2; // pre-computed for sensor hot path		
		
		// sensory data comes from food flavor unless overridden by creator
		if ( !params || !params?.sense ) {
			// Fourier identity encoding: flavor angle maps to spectral fingerprint.
			// sense[] layout: [v1c,v1s,v1a, v2c,v2s,v2a, s1c,s1s,s1a, s2c,s2s,s2a, ac,as,aa]
			const hue_angle = this.flavor * 2 * Math.PI;
			const visual_buff = 10; // amplitude multiplier to help boids see food
			let smell_scale = utils.Clamp( Math.pow(this.value,0.5) * 0.2, 0, 3 );
			// visual harmonic 1 [0,1,2]: cos/sin unit vector + amplitude
			this.sense[0] = Math.cos(hue_angle);
			this.sense[1] = Math.sin(hue_angle);
			this.sense[2] = visual_buff;
			// visual harmonic 2 [3,4,5]: 2nd spectral peak (iridescence)
			this.sense[3] = Math.cos(2 * hue_angle);
			this.sense[4] = Math.sin(2 * hue_angle);
			this.sense[5] = visual_buff * 0.5;
			// smell harmonic 1 [6,7,8]: odor identity + strength
			this.sense[6] = Math.cos(hue_angle);
			this.sense[7] = Math.sin(hue_angle);
			this.sense[8] = smell_scale;
			// smell harmonic 2 [9,10,11]: 2nd odor overtone; amplitude encodes complexity
			this.sense[9]  = Math.cos(2 * hue_angle);
			this.sense[10] = Math.sin(2 * hue_angle);
			this.sense[11] = smell_scale * (this.complexity || 0) / Food.FOOD_COMPLEXITY_LEVELS;
			// audio [12,13,14]: food is silent
			this.sense[12] = 0;
			this.sense[13] = 0;
			this.sense[14] = 0;
		}

	}
	Export( as_JSON=false ) {
		let output = {};
		let datakeys = ['x','y','value','age','lifespan','seed','frictionless','sense','flavor','complexity'];		
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
		this.senseSize = this.r * 2; // pre-computed for sensor hot path	

		// buoyancy
		if ( !this?.frictionless ) { 
			this.buoy = this.buoy_start + ( this.buoy_end - this.buoy_start ) * Math.max(1, this.age / this.lifespan) ; 
			this.ApplyForce(0, -this.buoy * this.mass); // buoyancy force scales with mass
		}
		
		// Modified Euler: integrate motor forces into velocity, apply drag, then step position.
		// Drag is applied between velocity and position updates so position uses the
		// fully-resolved (post-drag) velocity — consistent with angular integration.
		this.UpdateVelocity(delta);
		if ( !this?.frictionless ) {
			this.DampLinearVelocity( this.r, globalThis.vc.simulation.settings.viscosity, 60, delta );
		}
		this.StepPosition(delta);
		
		// update the object in space
		this.collision.radius = this.r;
		// collision detection with obstacles
		// things i might collide with:
		let candidates = globalThis.vc.tank.grid.GetObjectsByBox( 
			this.x - this.r,
			this.y - this.r,
			this.x + this.r,
			this.y + this.r,
			o => ( o.otype === 3 || o.otype === 4 ) // rocks and plants
		);
		// narrow phase collision detection
		let touching_rock = false;
		for ( let o of candidates ) {
			if ( o.otype === 3 ) { // rock
				let gotcha = testCirclePolygon(this.x, this.y, this.r, o.collision, _food_coll_result);
				// response
					if ( gotcha ) {
					// retract from collision object
					this.x -= _food_coll_result.overlap * _food_coll_result.overlap_x;
					this.y -= _food_coll_result.overlap * _food_coll_result.overlap_y;
					// just bounce hardcoded foods used in training
					if ( this.frictionless ) {
						this.vel_x = -this.vel_x;
						this.vel_y = -this.vel_y;
					}
					// slide along walls with slight bounce
					else {
						this.SlideAndBounce( _food_coll_result.overlap_x, _food_coll_result.overlap_y, friction, bounce );
					}
				}
				touching_rock = touching_rock || gotcha;
			}
			// largely copied form Boid collision detection
			else if ( o.otype === 4 ) { // plant
				// narrow phase collision detection:
				// skip the built in test because we only care about distance to center, not overlap
				const dist_x = this.x - o.x;
				const dist_y = this.y - o.y;
				const x_sq = dist_x * dist_x;
				const y_sq = dist_y * dist_y;
				const dist_sq = x_sq + y_sq;
				// we are inside the plant
				// response: plants use a "soft push" from center to simulate foliage density.
				// this applies a force to the object instead of hard relocation.
				if ( dist_sq < o.r * o.r ) {
					const dist = Math.sqrt( dist_sq );
					// repelling force scales with plant mass: seedlings get trampled, shrubs fight back
					let intensity = o.mass * Plant.STIFFNESS;
					// repelling force also scales with object width.
					// TODO: Ideally this affects local viscosity, not a repulsive force.
					const width_ratio = this.r * 0.04;
					intensity *= width_ratio * width_ratio;
					// force increases with penetration depth
					const pen = o.r - dist;
					const impulse_x = intensity * pen * ( dist_x / dist );
					const impulse_y = intensity * pen * ( dist_y / dist );
					this.ApplyForce(impulse_x, impulse_y);
				}		
			}
		}

		// stay in tank
 		this.Constrain(bounce);
		
		// plant a seed
		if ( this.seed && this.age > 5 && Math.random() > 0.9992 && 
			globalThis.vc.tank.plants.length < globalThis.vc.simulation.settings.num_plants ) {
			// check for local light and heat to be in reasonable range
			const cell = globalThis.vc.tank.datagrid.CellAt( this.x, this.y );
			const light_ok = Math.abs( cell.light - this.light_pref ) <= 0.5; // magic - you could make 0.5 a setting
			const heat_ok = Math.abs( cell.heat - this.heat_pref ) <= 0.5; 
			// only plant the seed under the right conditions
			let plant_the_seed = light_ok && heat_ok;
			// check if there are not too many other plants in the local area
			if ( plant_the_seed ) {
				// plants are not in the collision detection space, so we need to check all of them for now ;-(
				const csqrd = 200*200; // TODO: replace when we have circles later
				for ( let p of globalThis.vc.tank.plants ) {
					const xdiff = p.x - this.x;
					const ydiff = p.y - this.y;
					const absqrd = xdiff * xdiff + ydiff * ydiff; // dont need to sqrt here
					// inside another plant circle, cant germinate here
					if ( absqrd < csqrd ) {
						plant_the_seed = false;
						break;
					}
				}				
			}
			if ( plant_the_seed ) {
				const plant = new Plant( {dna:this.seed} );
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
		const masked = (1 << (this.complexity-1)) & boid.traits.food_mask;
		return masked || this.dead || this.edibility >= 1; // legacy hack
	}	
	GeoData() {
		let geodata = { 
			type:'circle', 
			r:this.r,
			lifespan:this.lifespan,
			permafood:this.permafood,
			complexity:this.complexity,
		};
		geodata.fill = `hsl(${this.flavor*360},85%,70%)`;
		geodata.stroke = `hsl(${this.flavor*360},70%,35%)`;
		geodata.linewidth = this.r/2;
		geodata.rotation = Math.random() * Math.PI; // aesthetic rotation
		// make dash pattern create a number of "pips" to represent food complexity.
		// this is aesthetically better than using polygons to represent complexity.
		if ( this.complexity >= 2 ) { 
			let points = this.complexity;
			if ( this.complexity==7 ) { points=8 } // unicode doesnt have heptagons ;-( 
			else if ( this.complexity==8 ) { points=12; } // getting hard to discern at this point 
			let circ = this.r * 2 * Math.PI;
			let segment = circ / ( points * 2 );
			// special case for complexity==2
			if ( points == 2 ) { geodata.dashes = [segment*0.5,segment*1.5]; }
			else { geodata.dashes = [segment,segment]; }
		}
		return geodata;
	}	
}