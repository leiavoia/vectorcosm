/* <AI>
Sensor — perception system for boids. Reads the world and outputs floats for brain inputs.

SENSOR TYPES
- 'sense'     — geometric sweep (circle or arc). Integrates `sense[]` channels from nearby objects
                (boids, food, marks, rocks). `segments` splits arc into directional bands.
                Labels: "name/seg-channel". Pre-allocated Float64Array `_detection` for hot-path speed.
                Two optimized paths: `_senseSegmented()` for arc sensors, `_senseSimple()` for omni.
                Output sigmoid: `x/(1+x)` with threshold guard (x>50 → 1).
- 'whisker'   — thin ray probes. N rays at spread angles; returns 1-normalized_dist when near obstacle.
                Pre-computes whisker endpoints once, uses AABB rejection per rock before edge tests.
                Labels: "whiskernameN".
- 'proprio'   — reads boid's own motor outputs back as inputs. Labels: "motor_0", "motor_1", ...
- 'energy'    — boid's own energy level (0..1).
- 'edge'      — distance to each wall: top, right, bottom, left.
- 'current'   — datagrid fluid current vector at boid position.
- 'datagrid'  — any datagrid cell attribute (light, heat, matter) at boid position.
- 'locater'   — legacy directional food finder (deprecated; do not extend).

KEY METHODS
- `Sense(nearby)` — main update; receives pre-fetched nearby objects from boid's batched grid query.
                     Uses monomorphic switch dispatch on `_type_code` (avoids megamorphic penalty).
- `setupSenseFunction()` — maps `this.type` to the internal sense implementation + sets `_type_code`.
- `setupLabels()` — builds `labels[]` array; must match output array length exactly.

PERFORMANCE
- Single grid query per boid in class.Boids.js; `nearby` array passed to all sensors.
- `_detection` (Float64Array) reused each frame for 'sense' type; avoids per-frame allocation.
- Precomputed constants: `_inv_r`, `_inv_seglength`, `_detect_inv_lengths`.
- _senseSegmented: fast modulo (conditional wrap), hoisted falloff, narrowed segment range, prox*prox.
- _senseSimple: removed eyestock, linear FOV, binary attenuation, prox*prox falloff.
- senseWhiskers: pre-computed endpoints, AABB fast-reject per rock.
- Dispatch via `_type_code` switch in Sense() — each case is a monomorphic call site for V8.
</AI> */

import * as utils from '../util/utils.js'
import { Boid } from '../classes/class.Boids.js'
import Rock from '../classes/class.Rock.js'
import Food from '../classes/class.Food.js'
import { testCirclePolygon, createResult } from './collision.js';

export default class Sensor {

	static _coll_result = createResult();

    constructor(data, owner) {
        this.owner = owner;
		this.name = null;
        if (data) { Object.assign(this, data); } 
        this.outputs = [];
        this.labels = [];
        this.setupSenseFunction();
        this.setupLabels(); // must go after setupSenseFunction
        // pre-allocate reusable arrays for sense-type sensors (after labels are built)
        if ( this.type === 'sense' ) {
			const n = this.labels.length;
			this._detection = new Float64Array(n);
			this._outputs = new Array(n);
		}
    }

	setupLabels() {
		// whiskers for physical obstacle detection
		if ( this.type === 'whisker' ) {
			let n = this.whiskers.length || 3;
			for ( let i=0; i < n; i++ ) {
				this.labels.push( ( this.name || 'whisker' ) + i );
			}
		}
		
		// general purpose geometric sensor for vision, smell, and audio
		else if ( this.type === 'sense' ) {
			let channelmap = {
				0: 'R',
				1: 'G',
				2: 'B',
				3: '1',
				4: '2',
				5: '3',
				6: '4',
				7: '5',
				8: '6',
				9: '7',
				10: '8',
				11: '9',
				12: 'ɑ',
				13: 'β',
				14: 'γ',
				15: 'δ',
			};
			let num_segments = this.segments || 1;
			for ( let i=0; i < num_segments; i++ ) {
				for ( let sensation of this.detect ) {
					let name = ( this.name || 'sense' ) + '/' + i + '-';
					if ( Array.isArray(sensation) ) {
						for ( let channel of sensation ) {
							name += channelmap[channel];
						}
					}
					else {
						name += channelmap[sensation];
					}
					this.labels.push( name );
				}
			}
		}
		
		// legacy vision sensor
		else if ( this.type === 'locater' ) {
			// /!\ KLUNKY - specific order matters
			let look_for = ['food_cos', 'food_sine', 'food_angle', 'food_dist', 'food_density'];
			for ( let x of look_for ) {
				if ( this.detect.contains(x) ) { this.labels.push(x); }
			}
		}
		
		// proprioception - label each motor
		else if ( this.detect == 'proprio' ) {
			for ( let i=0; i < this.owner.motors.length; i++ ) {
				this.labels.push( ( this.name || 'proprio' ) + i );
			}
		}
		
		// special purpose sensors
		else if ( this.detect ) {
			const name = this.name || this.detect;
			this.labels.push( name );
		}
		
		// default
		else {
			this.labels.push( this.name || 'sensor' );
		}
	}
	
    setupSenseFunction() {
	
		// whisker lines - multiple detection schemes
		if ( this.type === 'whisker' ) {
			if ( !this.whiskers ) {
				this.whiskers = [ {a:this?.a??0, l:this?.l??100, v:0} ];
			}			
		}
		
		// this is a general purpose sensor for vision, smell, and audio
		if ( this.type === 'sense' ) {
			// precompute some stuff for segmented vision
			if ( this.segments && !this.segdata ) {
				this.segdata = [];
				const start = Math.PI - this.cone * 0.5;
				this.seglength = this.cone / this.segments;
				for ( let i=0; i<this.segments; i++ ) {
					this.segdata.push({
						left: start + (this.seglength * i),
						right: start + (this.seglength * (i+1))
					});
				}
			}
			// force all detections into array format
			for ( let i=0; i<this.detect.length; i++ ) {
				this.detect[i] = this.detect[i]?.length ? this.detect[i] : [this.detect[i]]; 
			}
			// --- PRE-COMPUTE CONSTANTS FOR HOT PATH ---
			this._r_sq = this.r * this.r;
			this._inv_r = 1 / this.r;
			this._sensitivity = this.sensitivity || 1;
			this._has_falloff = this.falloff ? this.falloff : 0; // 0 = no falloff, else the exponent
			this._has_fov = !!this.fov;
			this._has_attenuation = !!(this.attenuation && (this.x || this.y));
			// flatten detect structure: array-of-arrays → typed flat arrays
			let total_channels = 0;
			for ( let d of this.detect ) { total_channels += d.length; }
			this._num_detections = this.detect.length;
			this._detect_flat = new Uint8Array(total_channels);
			this._detect_starts = new Uint8Array(this._num_detections);
			this._detect_lengths = new Uint8Array(this._num_detections);
			this._detect_inv_lengths = new Float64Array(this._num_detections);
			let offset = 0;
			for ( let d=0; d<this.detect.length; d++ ) {
				this._detect_starts[d] = offset;
				this._detect_lengths[d] = this.detect[d].length;
				this._detect_inv_lengths[d] = 1 / this.detect[d].length;
				for ( let c=0; c<this.detect[d].length; c++ ) {
					this._detect_flat[offset++] = this.detect[d][c];
				}
			}
			// assign the correct optimized function + type code for monomorphic dispatch
			if ( this.segments ) {
				this.senseFunction = this._senseSegmented;
				this._type_code = 0;
				// flatten segdata into typed arrays for inner loop
				this._segdata_lefts = new Float64Array(this.segments);
				this._segdata_rights = new Float64Array(this.segments);
				for ( let i=0; i<this.segments; i++ ) {
					this._segdata_lefts[i] = this.segdata[i].left;
					this._segdata_rights[i] = this.segdata[i].right;
				}
				this._seg0_left = this.segdata[0].left;
				this._segN_right = this.segdata[this.segments-1].right;
				this._inv_seglength = 1 / this.seglength;
			} else {
				this.senseFunction = this._senseSimple;
				this._type_code = 1;
			}
		}
		
		// if this is an old-style vision sensor, it return multiple values and is handled differently
		else if (  this.type === 'locater' ) {
			this.senseFunction = this.senseLegacyVision;
			this._type_code = 2;
		}
		
		// small special purpose sensors
		else {
			switch (this.detect) {
				case 'whisker':
					this.senseFunction = this.senseWhiskers;
					this._type_code = 3;
					break;
				case 'light':
					this.senseFunction = this.senseLight;
					this._type_code = 4;
					break;
				case 'heat':
					this.senseFunction = this.senseHeat;
					this._type_code = 5;
					break;
				case 'displacement':
					this.senseFunction = this.senseDisplacement;
					this._type_code = 6;
					break;
				case 'proprio':
					this.senseFunction = this.senseProprio;
					this._type_code = 7;
					break;
				case 'food':
					this.senseFunction = this.senseFood;
					this._type_code = 8;
					break;
				case 'energy':
					this.senseFunction = this.senseEnergy;
					this._type_code = 9;
					break;
				case 'inertia':
					this.senseFunction = this.senseInertia;
					this._type_code = 10;
					break;
				case 'spin':
					this.senseFunction = this.senseSpin;
					this._type_code = 11;
					break;
				case 'angle-cos':
					this.senseFunction = this.senseAngleCos;
					this._type_code = 12;
					break;
				case 'angle-sin':
					this.senseFunction = this.senseAngleSin;
					this._type_code = 13;
					break;
				case 'world-x':
					this.senseFunction = this.senseWorldX;
					this._type_code = 14;
					break;
				case 'world-y':
					this.senseFunction = this.senseWorldY;
					this._type_code = 15;
					break;
				case 'lifespan':
					this.senseFunction = this.senseLifespan;
					this._type_code = 16;
					break;
				case 'chaos':
					this.senseFunction = this.senseChaos;
					this._type_code = 17;
					break;
				case 'pulse':
					this.senseFunction = this.sensePulse;
					this._type_code = 18;
					break;
				case 'friends':
					this.senseFunction = this.senseFriends;
					this._type_code = 19;
					break;
				case 'enemies':
					this.senseFunction = this.senseEnemies;
					this._type_code = 20;
					break;
				case 'obstacles':
					this.senseFunction = this.senseObstacles;
					this._type_code = 21;
					break;
				case 'hormone':
					this.senseFunction = this.senseHormones;
					this._type_code = 22;
					break;
				default:
					this.senseFunction = this.senseDefault;
					this._type_code = 23;
					break;
			}
        }
    }

	// monomorphic dispatch via switch — avoids V8 megamorphic penalty on dynamic senseFunction
    Sense( nearby ) {
		switch ( this._type_code ) {
			case 0:  this.outputs = this._senseSegmented( nearby ); return this.outputs;
			case 1:  this.outputs = this._senseSimple( nearby ); return this.outputs;
			case 2:  this.outputs = this.senseLegacyVision( nearby ); return this.outputs;
			case 3:  this.outputs = this.senseWhiskers( nearby ); return this.outputs;
			case 4:  this.outputs = this.senseLight( nearby ); return this.outputs;
			case 5:  this.outputs = this.senseHeat( nearby ); return this.outputs;
			case 6:  this.outputs = this.senseDisplacement( nearby ); return this.outputs;
			case 7:  this.outputs = this.senseProprio( nearby ); return this.outputs;
			case 8:  this.outputs = this.senseFood( nearby ); return this.outputs;
			case 9:  this.outputs = this.senseEnergy( nearby ); return this.outputs;
			case 10: this.outputs = this.senseInertia( nearby ); return this.outputs;
			case 11: this.outputs = this.senseSpin( nearby ); return this.outputs;
			case 12: this.outputs = this.senseAngleCos( nearby ); return this.outputs;
			case 13: this.outputs = this.senseAngleSin( nearby ); return this.outputs;
			case 14: this.outputs = this.senseWorldX( nearby ); return this.outputs;
			case 15: this.outputs = this.senseWorldY( nearby ); return this.outputs;
			case 16: this.outputs = this.senseLifespan( nearby ); return this.outputs;
			case 17: this.outputs = this.senseChaos( nearby ); return this.outputs;
			case 18: this.outputs = this.sensePulse( nearby ); return this.outputs;
			case 19: this.outputs = this.senseFriends( nearby ); return this.outputs;
			case 20: this.outputs = this.senseEnemies( nearby ); return this.outputs;
			case 21: this.outputs = this.senseObstacles( nearby ); return this.outputs;
			case 22: this.outputs = this.senseHormones( nearby ); return this.outputs;
			default: this.outputs = this.senseDefault( nearby ); return this.outputs;
		}
    }
	
	senseLegacyVision( nearby ) {
		let outputs = [];
		let sinAngle = Math.sin(this.owner.angle);
		let cosAngle = Math.cos(this.owner.angle);				
		// calc sensor x/y coords in world space
		let sx = this.owner.x + ((this.x * cosAngle) - (this.y * sinAngle));
		let sy = this.owner.y + ((this.x * sinAngle) + (this.y * cosAngle));
		// filter pre-fetched nearby objects for edible food
		const objs = nearby
			? nearby.filter( o => o instanceof Food && o.IsEdibleBy(this.owner) && !( this.owner.ignore_list && this.owner.ignore_list.has(o) ) )
			: [];
		let nearest_dist = Infinity;
		let nearest_angle = 0;
		let num_edible_foods=0;
		for ( let obj of objs ) { 
			const dx = Math.abs(obj.x - sx);
			const dy = Math.abs(obj.y - sy);
			const d = Math.sqrt(dx*dx + dy*dy);
			if ( d < nearest_dist ) {
				let proximity = utils.clamp( 1 - (d / (this.r + obj.r)), 0, 1 );
				if ( proximity ) {
					// distance to boid is not the same as distance to center of sensor
					const dx = obj.x - this.owner.x;
					const dy = obj.y - this.owner.y;
					nearest_dist = Math.sqrt(dx*dx + dy*dy);							
					nearest_angle = utils.mod( Math.atan2(dy, dx) + this.owner.angle, 2 * Math.PI );
					num_edible_foods++;
				}
			}
		}
		// normalize outputs for neural network consumption
		nearest_dist = Number.isFinite(nearest_dist) ? (1-utils.Clamp( nearest_dist / this.r, 0, 1)) : 0;
		const density = Math.min( 1, num_edible_foods / 7 ); // [!]MAGICNUMBER
		if ( this.detect.contains('food_cos') ) {
			outputs.push( (nearest_angle?((Math.cos(nearest_angle)+1)/2):0) );
		}
		if ( this.detect.contains('food_sine') ) {
			outputs.push( (nearest_angle?((Math.sin(nearest_angle)+1)/2):0) );
		}
		if ( this.detect.contains('food_angle') ) {
			outputs.push( (nearest_angle?(nearest_angle/(2*Math.PI)):0) );
		}
		if ( this.detect.contains('food_dist') ) {
			outputs.push( nearest_dist );
		}
		if ( this.detect.contains('food_density') ) {
			outputs.push( density );
		}
		if ( outputs.length != this.detect.length ) {
			console.warn('legacy vision sensor expected more outputs than it produced:', this, outputs);
		}
		return outputs;
	}

	senseWhiskers( nearby ) {
		let outputs = [];
		const whiskers = this.whiskers;
		const num_whiskers = whiskers.length;
		const sx = this.owner.x;
		const sy = this.owner.y;
		const boid_r = this.owner.collision.radius;
		const sensor_r = this.r;
		const boid_angle = this.owner.angle;
		
		// pre-compute whisker endpoints and lengths (shared across all rocks)
		const w_ax2 = new Float64Array(num_whiskers);
		const w_ay2 = new Float64Array(num_whiskers);
		const w_len = new Float64Array(num_whiskers);
		for ( let i=0; i<num_whiskers; i++ ) {
			const w = whiskers[i];
			w.v = sensor_r; // reset collected values
			const wl = Math.max( boid_r * 1.5, sensor_r * (w.l || 1) );
			const wa = boid_angle + (w.a || 0);
			w_len[i] = wl;
			w_ax2[i] = sx + (wl * Math.cos(wa));
			w_ay2[i] = sy + (wl * Math.sin(wa));
		}
		
		// filter pre-fetched nearby objects for rocks only
		const candidates = nearby ? nearby.filter( o => o instanceof Rock ) : [];
		for ( let o of candidates ) {
			const result = Sensor._coll_result;
			if ( testCirclePolygon(sx, sy, sensor_r, o.collision, result) ) {
				// rock AABB for fast whisker-ray rejection
				const aabb = o.collision.aabb;
				const poly_edges = o.collision.edges;
				const poly_coords = o.collision.coords;
				
				for ( let wi=0; wi<num_whiskers; wi++ ) {
					const w = whiskers[wi];
					if ( !w.v ) { continue; } // already at contact
					const ax2 = w_ax2[wi];
					const ay2 = w_ay2[wi];
					const wl = w_len[wi];
					
					// fast AABB rejection: check if whisker ray bbox overlaps rock bbox
					const rmin_x = sx < ax2 ? sx : ax2;
					const rmax_x = sx > ax2 ? sx : ax2;
					const rmin_y = sy < ay2 ? sy : ay2;
					const rmax_y = sy > ay2 ? sy : ay2;
					if ( rmax_x < aabb.x1 || rmin_x > aabb.x2 || rmax_y < aabb.y1 || rmin_y > aabb.y2 ) { continue; }
					
					for( let ix = 0, iy = 1; ix < poly_edges.length; ix += 2, iy += 2 ) {
						const next	= ix + 2 < poly_edges.length ? ix + 2 : 0;
						const bx1	= poly_coords[ix];
						const by1	= poly_coords[iy];
						const bx2	= poly_coords[next];
						const by2	= poly_coords[next + 1];
						const intersect = utils.getLineIntersection(sx, sy, ax2, ay2, bx1, by1, bx2, by2);
						if ( intersect ) {
							const ddx = intersect.x - sx;
							const ddy = intersect.y - sy;
							const d = Math.sqrt( ddx*ddx + ddy*ddy );
							const v = ( d - boid_r ) / wl;
							if ( v < w.v ) { 
								w.v = v; 
								// can't do better than zero
								if ( v < 0.005 ) { w.v=0; break; }
							}
						}
					}
				}
			}
		}
		// also check tank edges
		let lines = [];
		if ( sx - sensor_r < 0 ) { // left 
			lines.push([0,0,0,globalThis.vc.tank.height]);
		}
		else if ( sx + sensor_r > globalThis.vc.tank.width ) { // right
			lines.push([globalThis.vc.tank.width,0,globalThis.vc.tank.width,globalThis.vc.tank.height]);
		}
		if ( sy - sensor_r < 0 ) { // top 
			lines.push([0,0,globalThis.vc.tank.width,0]);
		}
		else if ( sy + sensor_r > globalThis.vc.tank.height ) { // bottom
			lines.push([0,globalThis.vc.tank.height,globalThis.vc.tank.width,globalThis.vc.tank.height]);
		}
		if ( lines.length ) {
			for ( let wi=0; wi<num_whiskers; wi++ ) {
				const w = whiskers[wi];
				if ( !w.v ) { continue; }
				const ax2 = w_ax2[wi];
				const ay2 = w_ay2[wi];
				const wl = w_len[wi];
				for( let l of lines ) {
					const intersect = utils.getLineIntersection(sx, sy, ax2, ay2, ...l);
					if ( intersect ) {
						const ddx = intersect.x - sx;
						const ddy = intersect.y - sy;
						const d = Math.sqrt( ddx*ddx + ddy*ddy );
						const v = ( d - boid_r ) / wl;
						if ( v < w.v ) { 
							w.v = v; 
							// can't do better than zero
							if ( v < 0.005 ) { w.v=0; break; }
						}
					}
				}
			}
							
		}
		// publish the final values
		for ( let i=0; i < this.whiskers.length; i++ ) {
			// note inversion: signal goes up as whisker gets shorter
			this.whiskers[i].v = 1 - utils.clamp( this.whiskers[i].v, 0, 1 );
			outputs.push( this.whiskers[i].v||0 );
		}
		return outputs;
	}
	
	senseGeneral() {
		// legacy entry point — dispatches to the optimized variant
		// NOTE: these are heavily optimized for CPU speed, not friendly reading.
		return this._type_code === 0 ? this._senseSegmented() : this._senseSimple();
	}
	
	// ── OPTIMIZED SEGMENTED VISION ──────────────────────────────────────────
	_senseSegmented( nearby ) {
		// cache all property accesses as locals
		const owner = this.owner;
		const ox = owner.x, oy = owner.y, oa = owner.angle;
		const r = this.r;
		const segments = this.segments;
		const seglength = this.seglength, inv_seglength = this._inv_seglength;
		const falloff = this._has_falloff;
		const sensitivity = this._sensitivity;
		const detect_flat = this._detect_flat;
		const detect_starts = this._detect_starts;
		const detect_lengths = this._detect_lengths;
		const detect_inv_lengths = this._detect_inv_lengths;
		const num_detections = this._num_detections;
		const segdata_lefts = this._segdata_lefts;
		const segdata_rights = this._segdata_rights;
		const seg0_left = this._seg0_left;
		const segN_right = this._segN_right;
		const detection = this._detection;
		const outputs = this._outputs;
		const TWO_PI = 6.283185307179586; // 2 * Math.PI
		const PI = 3.141592653589793;
		const inv_r = this._inv_r;
		
		const sinAngle = Math.sin(oa);
		const cosAngle = Math.cos(oa);
		
		// calc sensor x/y coords in world space
		const sx = ox + ((this.x * cosAngle) - (this.y * sinAngle));
		const sy = oy + ((this.x * sinAngle) + (this.y * cosAngle));
		
		// zero out detection buffer (reused allocation)
		const det_len = detection.length;
		for ( let i=0; i<det_len; i++ ) { detection[i] = 0; }
		
		// cache ignore settings
		const ignore_boids = globalThis.vc.simulation.settings?.ignore_other_boids === true;
		const ignore_list = owner.ignore_list;
		
		// use pre-fetched nearby objects from boid's batched grid query
		const objs = nearby || [];
		
		for ( let oi=0, olen=objs.length; oi<olen; oi++ ) {
			const obj = objs[oi];
			
			// inline test: has sense data? is self? simulation override? ignore list?
			if ( !obj.sense || obj === owner ) { continue; }
			if ( ignore_boids && obj.otype === 1 ) { continue; }
			if ( ignore_list && ignore_list.has(obj) ) { continue; }
			
			// use pre-computed senseSize or fall back to computing it
			let objsize, objx, objy;
			if ( obj.senseSize !== undefined ) {
				objsize = obj.senseSize;
				objx = obj.senseCenterX !== undefined ? obj.senseCenterX : obj.x;
				objy = obj.senseCenterY !== undefined ? obj.senseCenterY : obj.y;
			}
			else {
				objsize = 0;
				objx = obj.x;
				objy = obj.y;
				const coll = obj.collision;
				if ( coll ) {
					if ( coll.shape === 'circle' ) { objsize = coll.radius * 2; }
					else if ( coll.shape === 'polygon' ) {
						const aabb = coll.aabb;
						objsize = ( Math.abs(aabb.x2 - aabb.x1) + Math.abs(aabb.y2 - aabb.y1) ) * 0.5;
						objx += objsize * 0.5;
						objy += objsize * 0.5;
					}
				}
			}
			
			// squared distance check — avoid sqrt until we need it
			const ddx = objx - sx;
			const ddy = objy - sy;
			const dist_sq = ddx*ddx + ddy*ddy;
			const threshold = r + objsize * 0.5;
			if ( dist_sq > threshold * threshold ) { continue; }
			
			// distance from boid center for angle calculation
			const dx = objx - ox;
			const dy = objy - oy;
			const d = Math.sqrt(dx*dx + dy*dy);
			const touchdist = d - (objsize*0.5);
			// prevent "inside" blinding for large objects (rocks)
			if ( touchdist <= 0 ) { objsize = d * 0.49; }
			// angular half-width: fast approx valid for small angles
			const theta = objsize * 0.5 / d;
			
			// angle to object — fast positive modulo (one % + conditional replaces ((x%m)+m)%m)
			let a = -Math.atan2( -dy, dx ); // clockwise angle
			a = a - oa + PI; // align sensor + rotate butt-forward
			a = a % TWO_PI;
			if ( a < 0 ) { a += TWO_PI; }
			// object angular extent — conditional wrap instead of double modulo
			let obj_left = a - theta;
			if ( obj_left < 0 ) { obj_left += TWO_PI; }
			let obj_right = a + theta;
			if ( obj_right >= TWO_PI ) { obj_right -= TWO_PI; }
			
			// check if object is in our viewing cone
			const wraps = obj_right < obj_left;
			const in_cone = wraps
				? ( obj_right >= seg0_left || obj_left <= segN_right )
				: ( obj_right >= seg0_left && obj_left <= segN_right );
			if ( !in_cone ) { continue; }
			
			// falloff: hoist out of segment loop (same for all segments of this object)
			let prox_factor = 1;
			if ( falloff ) {
				let prox = 1 - ( d * inv_r );
				if ( prox < 0.01 ) { continue; }
				prox_factor = prox * prox; // cheap quadratic replaces Math.pow(prox, falloff)
			}
			
			// grab the sense array ref once
			const sense = obj.sense;
			
			// narrow segment range for non-wrapping objects (most common case)
			let s_start, s_end;
			if ( !wraps ) {
				s_start = ((obj_left - seg0_left) * inv_seglength) | 0;
				if ( s_start < 0 ) { s_start = 0; }
				s_end = ((obj_right - seg0_left) * inv_seglength) | 0;
				if ( s_end >= segments ) { s_end = segments - 1; }
			}
			else {
				s_start = 0;
				s_end = segments - 1;
			}
			
			// check overlapping segments
			for ( let s=s_start; s<=s_end; s++ ) {
				const seg_right = segdata_rights[s];
				const seg_left = segdata_lefts[s];
				// inline Clamp: (n < 0 ? 0 : n > max ? max : n)
				let ov1 = seg_right - obj_left;
				ov1 = ov1 < 0 ? 0 : ov1 > seglength ? seglength : ov1;
				let ov2 = obj_right - seg_left;
				ov2 = ov2 < 0 ? 0 : ov2 > seglength ? seglength : ov2;
				const overlap = wraps ? ( ov1 + ov2 ) : ( ov1 - ( seglength - ov2 ) );
				let overlap_pct = overlap * inv_seglength;
				if ( overlap_pct < 0.001 ) { continue; } // skip negligible overlap
				
				overlap_pct *= prox_factor;
				
				// accumulate signals — flat typed array traversal
				const base = s * num_detections;
				for ( let di=0; di<num_detections; di++ ) {
					const start = detect_starts[di];
					const len = detect_lengths[di];
					let value = 0;
					for ( let c=start, end=start+len; c<end; c++ ) {
						value += sense[detect_flat[c]] || 0;
					}
					detection[base + di] += value * detect_inv_lengths[di] * overlap_pct;
				}
			}
		}
		
		// fast rational sigmoid: x/(1+x) — threshold guard replaces isFinite
		for ( let i=0; i<det_len; i++ ) {
			const x = detection[i] * sensitivity;
			outputs[i] = x > 50 ? 1 : x > 0 ? x / (1 + x) : 0;
		}
		return outputs;
	}
	
	// ── OPTIMIZED SIMPLE (NON-SEGMENTED) VISION ─────────────────────────────
	_senseSimple( nearby ) {
		// cache all property accesses as locals
		const owner = this.owner;
		const ox = owner.x, oy = owner.y, oa = owner.angle;
		const r = this.r;
		const sensitivity = this._sensitivity;
		const falloff = this._has_falloff;
		const has_fov = this._has_fov;
		const has_attenuation = this._has_attenuation;
		const detect_flat = this._detect_flat;
		const detect_starts = this._detect_starts;
		const detect_lengths = this._detect_lengths;
		const detect_inv_lengths = this._detect_inv_lengths;
		const num_detections = this._num_detections;
		const detection = this._detection;
		const outputs = this._outputs;
		const inv_r = this._inv_r;
		const inv_r2 = 1 / (r * 2);
		
		const sinAngle = Math.sin(oa);
		const cosAngle = Math.cos(oa);
		
		// calc sensor x/y coords in world space
		const sx = ox + ((this.x * cosAngle) - (this.y * sinAngle));
		const sy = oy + ((this.x * sinAngle) + (this.y * cosAngle));
		
		// for attenuation: direction from boid center to sensor (constant per call)
		const fwd_x = sx - ox;
		const fwd_y = sy - oy;
		
		// zero out detection buffer (reused allocation)
		const det_len = detection.length;
		for ( let i=0; i<det_len; i++ ) { detection[i] = 0; }
		
		// cache ignore settings
		const ignore_boids = globalThis.vc.simulation.settings?.ignore_other_boids === true;
		const ignore_list = owner.ignore_list;
		
		// use pre-fetched nearby objects from boid's batched grid query
		const objs = nearby || [];
		
		for ( let oi=0, olen=objs.length; oi<olen; oi++ ) {
			const obj = objs[oi];
			
			// inline test
			if ( !obj.sense || obj === owner ) { continue; }
			if ( ignore_boids && obj.otype === 1 ) { continue; }
			if ( ignore_list && ignore_list.has(obj) ) { continue; }
			
			// use pre-computed senseSize or fall back
			let objsize, objx, objy;
			if ( obj.senseSize !== undefined ) {
				objsize = obj.senseSize;
				objx = obj.senseCenterX !== undefined ? obj.senseCenterX : obj.x;
				objy = obj.senseCenterY !== undefined ? obj.senseCenterY : obj.y;
			}
			else {
				objsize = 0;
				objx = obj.x;
				objy = obj.y;
				const coll = obj.collision;
				if ( coll ) {
					if ( coll.shape === 'circle' ) { objsize = coll.radius * 2; }
					else if ( coll.shape === 'polygon' ) {
						const aabb = coll.aabb;
						objsize = ( Math.abs(aabb.x2 - aabb.x1) + Math.abs(aabb.y2 - aabb.y1) ) * 0.5;
						objx += objsize * 0.5;
						objy += objsize * 0.5;
					}
				}
			}
			
			// squared distance check from sensor center — avoid sqrt for rejection
			const ddx = objx - sx;
			const ddy = objy - sy;
			const dist_sq = ddx*ddx + ddy*ddy;
			const threshold = r + objsize * 0.5;
			if ( dist_sq > threshold * threshold ) { continue; }
			
			// actual distance from sensor center
			const d = Math.sqrt(dist_sq);
			let percent_nearness = 1 - ( d * inv_r );
			if ( percent_nearness < 0.01 ) { continue; }
			
			// signal falloff: cheap quadratic replaces Math.pow(prox, falloff)
			if ( falloff ) { percent_nearness = percent_nearness * percent_nearness; }
			
			// Field of View: linear apparent size replaces Math.pow(virtual_size, 1+prox)
			let signal_strength = percent_nearness;
			if ( has_fov ) {
				const virtual_size = objsize > 20 ? objsize : 20;
				signal_strength *= virtual_size * inv_r2;
			}
			
			// Attenuation: binary front/back penalty (no sqrt needed)
			if ( has_attenuation ) {
				const v2x = objx - ox;
				const v2y = objy - oy;
				const dot = fwd_x * v2x + fwd_y * v2y;
				signal_strength *= dot > 0 ? 1 : 0.25;
			}
			
			// grab the sense array ref once
			const sense = obj.sense;
			
			// accumulate signals — flat typed array traversal
			for ( let di=0; di<num_detections; di++ ) {
				const start = detect_starts[di];
				const len = detect_lengths[di];
				let value = 0;
				for ( let c=start, end=start+len; c<end; c++ ) {
					value += sense[detect_flat[c]] || 0;
				}
				detection[di] += value * detect_inv_lengths[di] * signal_strength;
			}
		}
		
		// fast rational sigmoid: x/(1+x) — threshold guard replaces isFinite
		for ( let i=0; i<det_len; i++ ) {
			const x = detection[i] * sensitivity;
			outputs[i] = x > 50 ? 1 : x > 0 ? x / (1 + x) : 0;
		}
		return outputs;
	}
	
    senseDisplacement() {
        let val = 0;
        if (!this.owner.x && !this.owner.y) return [val];
        if (this.next_update && this.next_update > globalThis.vc.simulation.stats.round_time) {
            val = this.last_val || 0;
            return [val];
        }
        this.next_update = (this.next_update || globalThis.vc.simulation.stats.round_time) + (this.interval || 1);
        if (!this.history) this.history = [];
        this.history.push([this.owner.x, this.owner.y]);
        if (this.history.length > (this.intervals || 3)) this.history.shift();
        let x = this.history ? this.history[0][0] : 0;
        let y = this.history ? this.history[0][1] : 0;
        let diff_x = this.owner.x - x;
        let diff_y = this.owner.y - y;
        let diff = Math.abs(diff_x + diff_y);
        val = Math.round(diff);
        val /= (this.intervals || 3) * (this.interval || 1) * 100;
        val = utils.Clamp(val, 0, 1);
        if (this.invert) val = 1 - val;
        this.last_val = val;
        return [val];
    }

    senseProprio() {
    	return this.owner.motors.map( m => m.this_stroke_time ? m.last_amount : 0 );
    }

    senseFood( nearby ) {
        let val = 0;
        if ( !nearby ) { return [val]; }
        const owner = this.owner;
        const sinAngle = Math.sin(owner.angle);
        const cosAngle = Math.cos(owner.angle);
        const sx = owner.x + ((this.x * cosAngle) - (this.y * sinAngle));
        const sy = owner.y + ((this.x * sinAngle) + (this.y * cosAngle));
        const r = this.r;
        const ignore_list = owner.ignore_list;
        // iterate nearby objects inline — no intermediate .filter() allocation
        for ( let i = 0, len = nearby.length; i < len; i++ ) {
            const obj = nearby[i];
            if ( obj.otype !== 2 ) { continue; } // 2 = Food
            if ( !obj.IsEdibleBy(owner) ) { continue; }
            if ( ignore_list && ignore_list.has(obj) ) { continue; }
            const dx = Math.abs(obj.x - sx);
            const dy = Math.abs(obj.y - sy);
            const d = Math.sqrt(dx * dx + dy * dy);
            const proximity = 1 - (d / (r + obj.r));
            if ( proximity > 0 ) { val += proximity > 1 ? 1 : proximity; }
        }
        if ( val > 1 ) { val = 1; }
        return [val];
    }

    senseEnergy() {
        let val = this.owner.metab.energy / this.owner.metab.max_energy;
        return [val];
    }

    senseInertia() {
		const speed = Math.sqrt( this.owner.vel_x * this.owner.vel_x + this.owner.vel_y * this.owner.vel_y );
        let val = (speed + Boid.maxspeed) / (2 * Boid.maxspeed);
        return [val];
    }

    senseSpin() {
        let val = (this.owner.ang_vel + Boid.maxrot) / (2 * Boid.maxrot);
        return [val];
    }

    senseAngleCos() {
        let val = Math.cos(this.owner.angle) * 0.5 + 0.5;
        return [val];
    }

    senseAngleSin() {
        let val = Math.sin(this.owner.angle) * 0.5 + 0.5;
        return [val];
    }

    senseWorldX() {
        let val = utils.Clamp( this.owner.x / globalThis.vc.tank.width, 0, globalThis.vc.tank.width );
        return [val];
    }

    senseWorldY() {
        let val = utils.Clamp( this.owner.y / globalThis.vc.tank.height, 0, globalThis.vc.tank.height );
        return [val];
    }

    senseLifespan() {
        let val = 1 - utils.Clamp(this.owner.life_credits / this.owner.traits.life_credits, 0, 1);
        return [val];
    }

    sensePulse() {
		// if phase is zero, use a constant value instead
		let val = this.power;
		if ( this.phase ) {
			val = Math.abs( Math.sin( globalThis.vc.simulation.stats.round_time / this.phase ) );
		}
        return [val /* * this.power */];
    }

    senseChaos() {
        let val = !this.last_val || Math.random() > 0.95 ? Math.random() : this.last_val;
        this.last_val = val;
        return [val];
    }

    senseFriends() {
        let val = 0;
        if (globalThis.vc.simulation.settings?.ignore_other_boids === true) return [val];
        let friends = globalThis.vc.tank.grid.GetObjectsByCoords(this.owner.x, this.owner.y);
        if (friends) {
            friends = friends.filter(x => (x instanceof Boid) && x.species == this.owner.species);
            val = Math.max(friends.length - 1, 0);
            val = Math.min(1.0, Math.log10(val + 1));
        }
        return [val];
    }

    senseEnemies() {
        let val = 0;
        if (globalThis.vc.simulation.settings?.ignore_other_boids === true) return [val];
        let friends = globalThis.vc.tank.grid.GetObjectsByCoords(this.owner.x, this.owner.y);
        if (friends) {
            friends = friends.filter(x => (x instanceof Boid) && x.species != this.owner.species);
            val = Math.max(friends.length - 1, 0);
            val = Math.min(1.0, Math.log10(val + 1));
        }
        return [val];
    }

    senseHormones() {
        let val = this.owner.endocrine.hormones[this.hormone] || 0;
        return [val];
    }

    senseLight() {
		let whiskers = this.whiskers || [];
		if ( !whiskers.length ) {
			whiskers.push( { l:this?.l??500, a:this?.a??0, v:0 } );
		}
		const output = [];
		for ( let w of whiskers ) { 
			const x2 = this.owner.x + w.l * Math.cos(this.owner.angle + w.a);
			const y2 = this.owner.y + w.l * Math.sin(this.owner.angle + w.a);
			const grid = globalThis.vc.tank.datagrid;
			const v1 = grid.InterpolatedGridValue( this.owner.x, this.owner.y, 'light' );
			const v2 = grid.InterpolatedGridValue( x2, y2, 'light' );
			w.v = 0.5 + 0.5 * Math.tanh( 2 * ( v2 - v1 ) ); // tanh unnecessary but gives a more prompting signal
			output.push( w.v );
		}
		return output; 
	}		

    senseHeat() {
		let whiskers = this.whiskers || [];
		if ( !whiskers.length ) {
			whiskers.push( { l:this?.l??500, a:this?.a??0, v:0 } );
		}
		const output = [];
		const grid = globalThis.vc.tank.datagrid;
		// temperature gradient
		if ( this.scheme==='relative' ) {
			for ( let w of whiskers ) { 
				const x2 = this.owner.x + w.l * Math.cos(this.owner.angle + w.a);
				const y2 = this.owner.y + w.l * Math.sin(this.owner.angle + w.a);
				const v1 = grid.InterpolatedGridValue( this.owner.x, this.owner.y, 'heat' );
				const v2 = grid.InterpolatedGridValue( x2, y2, 'heat' );
				w.v = 0.5 + 0.5 * Math.tanh( 2 * ( v2 - v1 ) ); // tanh unnecessary but gives a more prompting signal
				output.push( w.v );
			}
			return output; 
		}
		// absolute temperature
		else {
			for ( let w of whiskers ) { 
				const x2 = this.owner.x + w.l * Math.cos(this.owner.angle + w.a);
				const y2 = this.owner.y + w.l * Math.sin(this.owner.angle + w.a);
				const v = grid.InterpolatedGridValue( x2, y2, 'heat' );
				output.push( v );
			}
			return output; 
		
		}
	}		

    senseObstacles( nearby ) {
        let val = 0;
        let sinAngle = Math.sin(this.owner.angle);
        let cosAngle = Math.cos(this.owner.angle);
        let sx = this.owner.x + ((this.x * cosAngle) - (this.y * sinAngle));
        let sy = this.owner.y + ((this.x * sinAngle) + (this.y * cosAngle));
        // filter pre-fetched nearby objects for rocks
        const candidates = nearby ? nearby.filter( o => o instanceof Rock ) : [];
        for (let o of candidates) {
            const result = Sensor._coll_result;
            if (testCirclePolygon(sx, sy, this.r, o.collision, result)) {
                let v = result.overlap / (this.r * 2);
                val = Math.max(v, val);
            }
        }
        const most_edge = Math.abs(Math.max(
            (sx < this.r ? (this.r - sx) : 0),
            (sx > (globalThis.vc.tank.width - this.r) ? (this.r - (globalThis.vc.tank.width - sx)) : 0),
            (sy < this.r ? (this.r - sy) : 0),
            (sy > (globalThis.vc.tank.height - this.r) ? (this.r - (globalThis.vc.tank.height - sy)) : 0)
        ) / (this.r * 2));
        val = Math.max(val, most_edge);
        val = utils.clamp(val, 0, 1);
        return [val];
    }

    senseDefault() {
        return [];
    }

 	CreateGeometry() {
		let container = { type:'group', children:[] };
		
		// segmented vision
		if ( this.segments ) {
			// outer circle 
			container.children.push({
				type:'circle',
				x: this.x, 
				y: this.y, 
				r: this.r,
				fill: 'transparent',
				linewidth: 1,
				stroke: this.color || '#AAEEAA77'
			});
			// segment lines 
			for ( let i=0; i<this.segdata.length; i++ ) {
				const x2 = this.x + (this.r * Math.cos(Math.PI + this.segdata[i].left)); 
				const y2 = this.y + (this.r * Math.sin(Math.PI + this.segdata[i].left));			
				container.children.push({
					type:'line',
					x1: this.x, 
					y1: this.y, 
					x2, 
					y2, 
					fill: 'transparent',
					stroke: this.color || '#AAEEAA77',
					linewidth: 1,
					dashes: ( i ? [2,8] : [] ),
				});
			}
			// final line
			const x2 = this.x + (this.r * Math.cos(Math.PI + this.segdata[this.segdata.length-1].right)); 
			const y2 = this.y + (this.r * Math.sin(Math.PI + this.segdata[this.segdata.length-1].right));			
			container.children.push({
				type:'line',
				x1: this.x, 
				y1: this.y, 
				x2, 
				y2, 
				fill: 'transparent',
				stroke: this.color || '#AAEEAA77',
				linewidth: 1,
			});
		}
		
		// whisker lines
		else if ( this.whiskers ) {
			for ( let w of this.whiskers ) {
				let whisker_length = this.r ? (this.r * (w?.l || 1)) : w.l;
				whisker_length = Math.max( this.owner.collision.radius * 1.5, whisker_length );
				const whisker_angle = w?.a || 0;
				const sx = 0;
				const sy = 0;
				const ax2 = sx + (whisker_length * Math.cos(whisker_angle)); 
				const ay2 = sy + (whisker_length * Math.sin(whisker_angle));
				container.children.push({
					type:'line',
					x1: sx, 
					y1: sy, 
					x2: ax2, 
					y2: ay2, 
					fill: 'transparent',
					stroke: this.color || '#AAEEAA77',
					linewidth: 2,
				});
			}
		}
		
		// basic circle
		else if ( this.r ) {
			container.children.push({
				type:'circle',
				x: this.x, 
				y: this.y, 
				r: this.r,
				fill: 'transparent',
				linewidth: 1,
				stroke: this.color || '#AAEEAA77'
			});
		}

		return container;
	}
}