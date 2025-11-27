import * as utils from '../util/utils.js'
import { Boid } from '../classes/class.Boids.js'
import Rock from '../classes/class.Rock.js'
import Food from '../classes/class.Food.js'
import {Circle, Polygon, Result} from 'collisions';

export default class Sensor {

    constructor(data, owner) {
        this.owner = owner;
		this.name = null;
        if (data) { Object.assign(this, data); } 
        this.outputs = [];
        this.labels = [];
        this.setupSenseFunction();
        this.setupLabels(); // must go after setupSenseFunction
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
			let look_for = ['near_food_cos', 'near_food_sine', 'near_food_angle', 'near_food_dist', 'food_density'];
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
			this.labels.push( this.name || this.detect );
		}
		
		// default
		else {
			this.labels.push( this.name || 'sensor' );
		}
	}
	
    setupSenseFunction() {
	
		// whiskers for physical obstacle detection
		if ( this.type === 'whisker' ) {
			this.senseFunction = this.senseWhiskers;
			// setup and precompute stuff
			if ( !this.whiskers ) {
				this.whiskers = [
					{a:0, l:1, v:0},
					{a:-1, l:0.75, v:0},
					{a:1, l:0.75, v:0}
				];
			}			
		}
		
		// this is a general purpose sensor for vision, smell, and audio
		else if ( this.type === 'sense' ) {
			this.senseFunction = this.senseGeneral;
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
			// force all detections into array format: NOTE: should do this once on creation of sensor
			for ( let i=0; i<this.detect.length; i++ ) {
				this.detect[i] = this.detect[i]?.length ? this.detect[i] : [this.detect[i]]; 
			}
		}
		
		// if this is an old-style vision sensor, it return multiple values and is handled differently
		else if (  this.type === 'locater' ) {
			this.senseFunction = this.senseLegacyVision;
		}
		
		// small special purpose sensors
		else {
			switch (this.detect) {
				case 'displacement':
					this.senseFunction = this.senseDisplacement;
					break;
				case 'proprio':
					this.senseFunction = this.senseProprio;
					break;
				case 'food':
					this.senseFunction = this.senseFood;
					break;
				case 'energy':
					this.senseFunction = this.senseEnergy;
					break;
				case 'inertia':
					this.senseFunction = this.senseInertia;
					break;
				case 'spin':
					this.senseFunction = this.senseSpin;
					break;
				case 'angle-cos':
					this.senseFunction = this.senseAngleCos;
					break;
				case 'angle-sin':
					this.senseFunction = this.senseAngleSin;
					break;
				case 'world-x':
					this.senseFunction = this.senseWorldX;
					break;
				case 'world-y':
					this.senseFunction = this.senseWorldY;
					break;
				case 'lifespan':
					this.senseFunction = this.senseLifespan;
					break;
				case 'toxins':
					this.senseFunction = this.senseToxins;
					break;
				case 'malnourished':
					this.senseFunction = this.senseMalnourished;
					break;
				case 'chaos':
					this.senseFunction = this.senseChaos;
					break;
				case 'pulse':
					this.senseFunction = this.sensePulse;
					break;
				case 'friends':
					this.senseFunction = this.senseFriends;
					break;
				case 'enemies':
					this.senseFunction = this.senseEnemies;
					break;
				case 'obstacles':
					this.senseFunction = this.senseObstacles;
					break;
				default:
					this.senseFunction = this.senseDefault;
					break;
			}
        }
    }

    Sense() {
        this.outputs = this.senseFunction();
        return this.outputs;
    }
	
	senseLegacyVision() {
		let outputs = [];
		let sinAngle = Math.sin(this.owner.angle);
		let cosAngle = Math.cos(this.owner.angle);				
		// calc sensor x/y coords in world space
		let sx = this.owner.x + ((this.x * cosAngle) - (this.y * sinAngle));
		let sy = this.owner.y + ((this.x * sinAngle) + (this.y * cosAngle));
		// find objects that are detected by this sensor
		let objs = this.owner.tank.foods; // runs faster on small sets
		if ( objs.length > 20 ) {
			const test = o => { return o instanceof Food && o.IsEdibleBy(this.owner) && !( this.owner.ignore_list && this.owner.ignore_list.has(o) ) };
			objs = this.owner.tank.grid.GetObjectsByBox( sx - this.r, sy - this.r, sx + this.r, sy + this.r, test );				
		}
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
		if ( this.detect.contains('near_food_cos') ) {
			outputs.push( (nearest_angle?((Math.cos(nearest_angle)+1)/2):0) );
		}
		if ( this.detect.contains('near_food_sine') ) {
			outputs.push( (nearest_angle?((Math.sin(nearest_angle)+1)/2):0) );
		}
		if ( this.detect.contains('near_food_angle') ) {
			outputs.push( (nearest_angle?(nearest_angle/(2*Math.PI)):0) );
		}
		if ( this.detect.contains('near_food_dist') ) {
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

	senseWhiskers() {
		let outputs = [];
		this.whiskers.forEach( w => w.v=this.r ); // reset collected values
		// calc sensor x/y coords in world space
		let sx = this.owner.x; // + ((this.x * cosAngle) - (this.y * sinAngle));
		let sy = this.owner.y; // + ((this.x * sinAngle) + (this.y * cosAngle));
		// find objects that are detected by this sensor
		let candidates = this.owner.tank.grid.GetObjectsByBox( 
			sx - this.r,
			sy - this.r,
			sx + this.r,
			sy + this.r,
			o => o instanceof Rock
		);
		for ( let o of candidates ) {
			const circle  = new Circle(sx, sy, this.r);
			const polygon = new Polygon(o.x, o.y, o.collision.hull);
			const result  = new Result();
			if ( circle.collides(polygon, result) ) {
				for ( let w of this.whiskers ) {
					// if we are in immediate contact, break. we can't do better. 
					if ( !w.v ) { continue; }
					const whisker_length = Math.max( this.owner.collision.radius * 1.5, this.r * (w?.l || 1) );
					const whisker_angle = this.owner.angle + (w?.a || 0);
					const ax1 = sx;
					const ay1 = sy;
					const ax2 = sx + (whisker_length * Math.cos(whisker_angle)); 
					const ay2 = sy + (whisker_length * Math.sin(whisker_angle));
					for( let ix = 0, iy = 1; ix < polygon._edges.length; ix += 2, iy += 2 ) {
						const next	= ix + 2 < polygon._edges.length ? ix + 2 : 0;
						const bx1	= polygon._coords[ix];
						const by1	= polygon._coords[iy];
						const bx2	= polygon._coords[next];
						const by2	= polygon._coords[next + 1];
						const intersect = utils.getLineIntersection(ax1, ay1, ax2, ay2, bx1, by1, bx2, by2);
						if ( intersect ) {
							// calculate distance to intersect point
							const d = Math.sqrt( (intersect.x - sx) * (intersect.x - sx) + (intersect.y - sy) * (intersect.y - sy) );
							const v = ( d - this.owner.collision.radius ) / whisker_length;
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
		if ( sx - this.r < 0 ) { // left 
			lines.push([0,0,0,globalThis.vc.tank.height]);
		}
		else if ( sx + this.r > globalThis.vc.tank.width ) { // right
			lines.push([globalThis.vc.tank.width,0,globalThis.vc.tank.width,globalThis.vc.tank.height]);
		}
		if ( sy - this.r < 0 ) { // top 
			lines.push([0,0,globalThis.vc.tank.width,0]);
		}
		else if ( sy + this.r > globalThis.vc.tank.height ) { // bottom
			lines.push([0,globalThis.vc.tank.height,globalThis.vc.tank.width,globalThis.vc.tank.height]);
		}
		if ( lines.length ) {
			for ( let w of this.whiskers ) {
				if ( !w.v ) { continue; } // if we are in immediate contact, break. we can't do better. 
				const whisker_length = Math.max( this.owner.collision.radius * 1.5, this.r * (w?.l || 1) );
				const whisker_angle = this.owner.angle + (w?.a || 0);
				const ax1 = sx;
				const ay1 = sy;
				const ax2 = sx + (whisker_length * Math.cos(whisker_angle)); 
				const ay2 = sy + (whisker_length * Math.sin(whisker_angle));
				for( let l of lines ) {
					const intersect = utils.getLineIntersection(ax1, ay1, ax2, ay2, ...l);
					if ( intersect ) {
						// calculate distance to intersect point
						const d = Math.sqrt( (intersect.x - sx) * (intersect.x - sx) + (intersect.y - sy) * (intersect.y - sy) );
						const v = ( d - this.owner.collision.radius ) / whisker_length;
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
		let outputs = [];
		
		let sinAngle = Math.sin(this.owner.angle);
		let cosAngle = Math.cos(this.owner.angle);				
		
		// calc sensor x/y coords in world space
		let sx = this.owner.x + ((this.x * cosAngle) - (this.y * sinAngle));
		let sy = this.owner.y + ((this.x * sinAngle) + (this.y * cosAngle));
		
		// accumulate sensory levels on each channel that we need to detect
		let detection = new Array( this.labels.length ).fill(0);
		
		// find all objects that are detected by this sensor
		let testfn = ( o ) => {
			// does this object have sensory data?
			return o.sense
			// is self?
			&& o !== this.owner
			// simulation override?
			&& !( o instanceof Boid && globalThis.vc.simulation.settings?.ignore_other_boids===true )
			// on the ignore list?
			&& !( this.owner.ignore_list && this.owner.ignore_list.has(o) )
		};
		let objs = this.owner.tank.grid.GetObjectsByBox( sx - this.r, sy - this.r, sx + this.r, sy + this.r, testfn );
		for ( let obj of objs ) {
			
			// if this is a circle object, get the radius
			let objsize = 0;
			let objx = obj.x;
			let objy = obj.y;
			
			// TODO: it would be better if objects pre-compute this value
			if ( obj?.collision?.shape == 'circle' ) { objsize = 2 * obj?.collision?.radius; }
			else if ( obj?.collision?.shape == 'polygon' ) {
				// let's just average the height and width of the AABB and call that the size
				objsize = ( 
					Math.abs( obj.collision.aabb.x2 - obj.collision.aabb.x1 )
						+ Math.abs( obj.collision.aabb.y2 - obj.collision.aabb.y1 )
					) * 0.5;
				// polygonal objects use 0,0 as top left corner, not the center of the object
				objx += objsize * 0.5;
				objy += objsize * 0.5;
			}
			
			// is the object inside the sensor circle?
			const obj_dist_x = Math.abs(objx - sx);
			const obj_dist_y = Math.abs(objy - sy);
			const obj_dist = Math.sqrt(obj_dist_x*obj_dist_x + obj_dist_y*obj_dist_y);
			const on_sensor = obj_dist <= (this.r + objsize/2);
			if ( !on_sensor ) { continue; }	
			
			if ( this.segments ) {
				// calculate angle to boid (not circle center)
				const dx = objx - this.owner.x;
				const dy = objy - this.owner.y;
				const d = Math.sqrt(dx*dx + dy*dy);
				const touchdist = d - (objsize*0.5);
				// if we are dealing with a rock, we need to go back to treating it like a polygon and not a circle.
				// otherwise the collision circle engulfs the sensor and we get blinded. We can fake the data by
				// using a smaller circle in that general direction. This hack prevents us from ever being "inside".
				if ( touchdist <= 0 ) { objsize = d * 0.49; }
				const theta = Math.abs( Math.tan( objsize*0.5 / d ) ); // angle of view from center of object to tangent edge of object 
				let a = -Math.atan2( -dy, dx ); // note reversal for clockwise calculation (-π .. +π)
				a -= this.owner.angle; // align sensor with boid direction
				a += Math.PI; // rotate so that zero starts at butt and positive numbers are clockwise
				a = utils.mod( (a + Math.PI * 2), (Math.PI * 2) ); // now in range of 0..2π
				const obj_left = utils.mod( a - theta, Math.PI * 2 );
				const obj_right = utils.mod( a + theta, Math.PI * 2 );
				// check if object is in our viewing cone
				const proceed = 
					( obj_right > obj_left && obj_right >= this.segdata[0].left && obj_left <= this.segdata[this.segdata.length-1].right ) ||
					( obj_right < obj_left && obj_right >= this.segdata[0].left || obj_left <= this.segdata[this.segdata.length-1].right ) ;
				if ( proceed ) {
					// check each segment for overlap
					for ( let s=0; s<this.segments; s++ ) {
						const overlap1 = utils.Clamp( this.segdata[s].right - obj_left, 0, this.seglength );
						const overlap2 = utils.Clamp( obj_right - this.segdata[s].left, 0, this.seglength );
						const overlap = ( obj_right > obj_left )
							? ( overlap1 - ( this.seglength - overlap2 ) ) // normal situation for most small objects
							: ( overlap1 + overlap2 ) ; // spans 2π
						let overlap_pct = overlap / this.seglength;
						// signal falloff exponent
						if ( this.falloff ) {
							let prox = 1 - ( d / this.r );
							if ( prox < 0.01 ) { continue; } // not worth calculating
							prox = Math.pow( prox, this.falloff );
							overlap_pct *= prox;
						}
						// add up signals - signals can be either a single channel or an average of several channels
						let detection_index = 0;
						for ( let sensation of this.detect ) {
							let value = 0;
							for ( let channel of sensation ) {
								value += (obj.sense[channel]||0) * overlap_pct;
							}
							detection[detection_index+(s*this.detect.length)] += value / sensation.length; // average multiple channels
							detection_index++;
						}
					}
				}
			}
			
			else {
				
				// distance from center of object to boid.
				// stereo sensors that both calculate to the boid's location produce the same result.
				// to create a stereoscopic effect, measure to a reference point instead, 
				// a small distance away from boid along a line to center of sensor.
				// Think of a snail's eyestocks.
				const sensor_eyestock_pct = 0.1; // this could be genetic
				const sense_pt_x = this.owner.x + (sx - this.owner.x) * sensor_eyestock_pct;
				const sense_pt_y = this.owner.y + (sy - this.owner.y) * sensor_eyestock_pct;
				const dx = Math.abs(objx - sense_pt_x);
				const dy = Math.abs(objy - sense_pt_y);
				let d = Math.sqrt(dx*dx + dy*dy); // OPTIMIZE: can factor out square root
				const max_dist = this.r + Math.abs(this.x) + Math.abs(this.y); // not correct math but good enough to cover most situations.
				let percent_nearness = 1 - ( d / max_dist );
				if ( percent_nearness < 0.01 ) { continue; } // not worth calculating
				
				// signal falloff exponent
				if ( this.falloff ) {
					percent_nearness = Math.pow( percent_nearness, this.falloff );
				}
				
				// Field of View: reduce sensation based on physical size of target and distance.
				let pct_field_of_view = percent_nearness;
				if ( this.fov ) { 
					// apparent size is a number we can fudge and still get decent results.
					// simple division is a cheat. you can use square-of-distance for more accuracy.
					// for signal purposes, objects have a minimum size
					const virtual_size = Math.max( objsize, 20 );
					const apparent_size = Math.min( 4, Math.pow(virtual_size,1+percent_nearness) / (this.r*2) );
					pct_field_of_view = apparent_size / 8; // 0..1
				}
				
				// Attenuation: signal falls off based on difference of sensor angle to object angle.
				// used for peripheral vision curve.
				let attenuation = 1;
				if ( this.attenuation ) { 
					// only calculate if we don't have a perfectly centered circle.
					if ( this.x || this.y ) {
						const v1x = sense_pt_x - this.owner.x;
						const v1y = sense_pt_y - this.owner.y;
						const v2x = objx - this.owner.x;
						const v2y = objy - this.owner.y;
						const dotProduct = v1x * v2x + v1y * v2y;
						const magnitude1 = Math.sqrt(v1x * v1x + v1y * v1y) || 0.001;
						const magnitude2 = Math.sqrt(v2x * v2x + v2y * v2y) || 0.001;
						const cosTheta = dotProduct / (magnitude1 * magnitude2); // -1 .. 1
						attenuation = 1 - ( Math.cos( (0.5 + 0.5 * cosTheta) * Math.PI ) / 2 + 0.5 );
					}
				}
				
				// add up signals - signals can be either a single channel or an average of several channels
				let detection_index = 0;
				for ( let sensation of this.detect ) {
					let value = 0;
					for ( let channel of sensation ) {
						value += (obj.sense[channel]||0) * pct_field_of_view /* * attention */ * attenuation;
					}
					detection[detection_index] += value / sensation.length;
					detection_index++;
				}
			}
		}
		// sigmoid squash signals to prevent blinding.
		// TANH function tends to effectively max out around value of 2,
		// so it helps to scale the signal back to produce a more effective value for the AI
		const global_sensitivity_tuning_number = 1; // many sense values are too low to create meaningful signals
		const sensitivity = ( this.sensitivity || 1 ) * global_sensitivity_tuning_number;
		for ( let i=0; i<detection.length; i++ ) {
			// TANH(LOG(x)) makes a nice curve pretty much no matter what you throw at it
			// but works best in the 0..20 range. 
			let val = Math.min( 1, Math.tanh( Math.log( 1 + detection[i] * sensitivity ) ) ); 
			outputs.push( val||0 );
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

    senseFood() {
        let val = 0;
        let sinAngle = Math.sin(this.owner.angle);
        let cosAngle = Math.cos(this.owner.angle);
        let sx = this.owner.x + ((this.x * cosAngle) - (this.y * sinAngle));
        let sy = this.owner.y + ((this.x * sinAngle) + (this.y * cosAngle));
        let objs = this.owner.tank.foods.length < 20
            ? this.owner.tank.foods
            : this.owner.tank.grid.GetObjectsByBox(sx - this.r, sy - this.r, sx + this.r, sy + this.r, 
				o => o instanceof Food && o.IsEdibleBy(this.owner) && !( this.owner.ignore_list && this.owner.ignore_list.has(o) ) );
        for (let obj of objs) {
            const dx = Math.abs(obj.x - sx);
            const dy = Math.abs(obj.y - sy);
            const d = Math.sqrt(dx * dx + dy * dy);
            let proximity = utils.clamp(1 - (d / (this.r + obj.r)), 0, 1);
            if (proximity) {
                val += proximity;
            }
        }
        val = utils.clamp(val, 0, 1);
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
        let val = this.owner.x / globalThis.vc.tank.width;
        return [val];
    }

    senseWorldY() {
        let val = this.owner.y / globalThis.vc.tank.height;
        return [val];
    }

    senseLifespan() {
        let val = 1 - utils.Clamp(this.owner.life_credits / this.owner.traits.life_credits, 0, 1);
        return [val];
    }

    senseToxins() {
        let val = this.owner.metab.toxins ? 1 : 0;
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

    senseMalnourished() {
        let val = this.owner.metab.deficient ? 1 : 0;
        return [val];
    }

    senseChaos() {
        let val = !this.last_val || Math.random() > 0.95 ? Math.random() : this.last_val;
        this.last_val = val;
        return [val];
    }

    senseFriends() {
        let val = 0;
        if (globalThis.vc.simulation.settings?.ignore_other_boids === true) return [val];
        let friends = this.owner.tank.grid.GetObjectsByCoords(this.owner.x, this.owner.y);
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
        let friends = this.owner.tank.grid.GetObjectsByCoords(this.owner.x, this.owner.y);
        if (friends) {
            friends = friends.filter(x => (x instanceof Boid) && x.species != this.owner.species);
            val = Math.max(friends.length - 1, 0);
            val = Math.min(1.0, Math.log10(val + 1));
        }
        return [val];
    }

    senseObstacles() {
        let val = 0;
        let sinAngle = Math.sin(this.owner.angle);
        let cosAngle = Math.cos(this.owner.angle);
        let sx = this.owner.x + ((this.x * cosAngle) - (this.y * sinAngle));
        let sy = this.owner.y + ((this.x * sinAngle) + (this.y * cosAngle));
        let candidates = this.owner.tank.grid.GetObjectsByBox(sx - this.r, sy - this.r, sx + this.r, sy + this.r, o => o instanceof Rock);
        for (let o of candidates) {
            const circle = new Circle(sx, sy, this.r);
            const polygon = new Polygon(o.x, o.y, o.collision.hull);
            const result = new Result();
            if (circle.collides(polygon, result)) {
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
				const whisker_length = Math.max( this.owner.collision.radius * 1.5, this.r * (w?.l || 1) );
				const whisker_angle = /* this.owner.angle + */ (w?.a || 0);
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
		else {
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