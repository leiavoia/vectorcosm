import * as utils from '../util/utils.js'
import { Boid } from '../classes/class.Boids.js'
import Rock from '../classes/class.Rock.js'
import Food from '../classes/class.Food.js'
import {Circle, Polygon, Result} from 'collisions';

export default class Sensor {
	constructor( data, owner ) {
		// 'fromJSON' style single data bundle 
		this.owner = owner;
		if ( data ) { Object.assign( this, data ); }
		// normal settings
		else {
			this.name = 'sensor';
			this.shape = 'circle'; // line, circle, or null
			this.x = 0; // fixed point, used if angle and length not available
			this.y = 0; // fixed point, used if angle and length not available
			this.r = 100; // radius for circles
			this.a = 0; // angle for lines, or starting point for circles
			this.l = 0; // length for lines, or starting point for circles
			this.detect = 'food'; // what to sense
		}
		this.val = 0; // output value of sensation, 0..1, used as input for neural networks
	}
	// does sensor checks and puts detected values into this.val
	Sense() {
		let outputs = [];
		// compound touch sensor
		if ( this.type === 'whisker' ) {
			if ( !this.whiskers ) {
				this.whiskers = [
					{a:0, l:1, v:0},
					{a:-1, l:0.75, v:0},
					{a:1, l:0.75, v:0}
				];
			}
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
				Rock
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
				lines.push([0,0,0,window.vc.tank.height]);
			}
			else if ( sx + this.r > window.vc.tank.width ) { // right
				lines.push([window.vc.tank.width,0,window.vc.tank.width,window.vc.tank.height]);
			}
			if ( sy - this.r < 0 ) { // top 
				lines.push([0,0,window.vc.tank.width,0]);
			}
			else if ( sy + this.r > window.vc.tank.height ) { // bottom
				lines.push([0,window.vc.tank.height,window.vc.tank.width,window.vc.tank.height]);
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
				let name = ( this.name || 'whisker' ) + i;
				outputs.push( {val:(this.whiskers[i].v||0), name} );
			}
		}
		
		// this is a general purpose sensor for vision, smell, and audio
		else if ( this.type === 'sense' ) {
			
			let sinAngle = Math.sin(this.owner.angle);
			let cosAngle = Math.cos(this.owner.angle);				
			
			// calc sensor x/y coords in world space
			let sx = this.owner.x + ((this.x * cosAngle) - (this.y * sinAngle));
			let sy = this.owner.y + ((this.x * sinAngle) + (this.y * cosAngle));
			
			// accumulate sensory levels on each channel that we need to detect
			let detection = new Array( (this?.segments || 1) * (this.detect?.length || 1) ).fill(0);
			
			// force all detections into array format: NOTE: should do this once on creation of sensor
			for ( let i=0; i<this.detect.length; i++ ) {
				this.detect[i] = this.detect[i]?.length ? this.detect[i] : [this.detect[i]]; 
			}
			
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
			
			// find all objects that are detected by this sensor
			let objs = this.owner.tank.grid.GetObjectsByBox( sx - this.r, sy - this.r, sx + this.r, sy + this.r );
			for ( let obj of objs ) {
				// is self?
				if ( obj === this.owner ) { continue; }
				// does this object have sensory data?
				if ( !obj.sense ) { continue; }
				// simulation override?
				if ( obj instanceof Boid && window.vc.simulation.settings?.ignore_other_boids===true ) { continue; }
				// on the ignore list?
				if ( this.owner.ignore_list && this.owner.ignore_list.has(obj) ) { continue; }
				
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
				let name = ( this.name || 'sense' );
				const segments = this.segments || 1;
				const segment = Math.trunc( i / this.detect.length );
				name = name + 's' + segment;
				let namemap = {
					0: 'R',
					1: 'G',
					2: 'B',
					3: 'A',
					4: 'B',
					5: 'C',
					6: 'D',
					7: 'E',
					8: 'F',
					9: 'G',
					10: 'H',
					11: 'I',
					12: '1',
					13: '2',
					14: '3',
					15: '4',
				};
				for ( let c of this.detect[i%this.detect.length]) {
					name = name + namemap[c];
				}
				name += sensitivity.toFixed(1);
				// CAUTION: naming conventions might change if we change number of channels available for senses
				// TODO: optimize this out of the main game loop
				outputs.push( {val:(val||0), name} );
			}
		}		
			
		// if this is an old-style vision sensor, it return multiple values and is handled differently
		else if ( Array.isArray(this.detect) ) {
			let sinAngle = Math.sin(this.owner.angle);
			let cosAngle = Math.cos(this.owner.angle);				
			// calc sensor x/y coords in world space
			let sx = this.owner.x + ((this.x * cosAngle) - (this.y * sinAngle));
			let sy = this.owner.y + ((this.x * sinAngle) + (this.y * cosAngle));
			// find objects that are detected by this sensor
			let objs = this.owner.tank.foods.length < 20 // runs faster on small sets
				? this.owner.tank.foods
				: this.owner.tank.grid.GetObjectsByBox( sx - this.r, sy - this.r, sx + this.r, sy + this.r, Food );
			let nearest_dist = Infinity;
			let nearest_obj = null;
			let nearest_angle = 0;
			let num_edible_foods=0;
			for ( let obj of objs ) { 
				if ( !obj.IsEdibleBy(this.owner) ) { continue; }
				if ( this.owner.ignore_list && this.owner.ignore_list.has(obj) ) { continue; }
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
						nearest_obj = obj;
						nearest_angle = utils.mod( Math.atan2(dy, dx) + this.owner.angle, 2 * Math.PI );
						num_edible_foods++;
					}
				}
			}
			// normalize outputs for neural network consumption
			nearest_dist = Number.isFinite(nearest_dist) ? (1-utils.Clamp( nearest_dist / this.r, 0, 1)) : 0;
			const density = Math.min( 1, num_edible_foods / 7 ); // [!]MAGICNUMBER
			if ( this.detect.contains('near_food_cos') ) {
				outputs.push( {val:(nearest_angle?((Math.cos(nearest_angle)+1)/2):0), name:'near_food_cos'} );
			}
			if ( this.detect.contains('near_food_sine') ) {
				outputs.push( {val:(nearest_angle?((Math.sin(nearest_angle)+1)/2):0), name:'near_food_sine'} );
			}
			if ( this.detect.contains('near_food_angle') ) {
				outputs.push( {val:(nearest_angle?(nearest_angle/(2*Math.PI)):0), name:'near_food_angle'} );
			}
			if ( this.detect.contains('near_food_dist') ) {
				outputs.push( {val:nearest_dist, name:'near_food_dist'} );
			}
			if ( this.detect.contains('food_density') ) {
				outputs.push( {val:density, name:'food_density'} );
			}
		}

		// regular non-geometric sensors
		else {
			let detections = Array.isArray(this.detect) ? this.detect : [this.detect];
			for ( let detect of detections ) {
				let val = 0; // reset
				// output depends on what we are detecting
				switch ( detect ) {
					case 'displacement' : {
						if ( !this.owner.x && !this.owner.y ) { break; }
						if ( this.next_update && this.next_update > window.vc.simulation.stats.round.time ) { 
							val = this.last_val || 0;
							break; 
						}
						this.next_update = ( this.next_update || window.vc.simulation.stats.round.time ) + ( this.interval || 1 );
						if ( !this.history ) { this.history = []; }
						this.history.push([this.owner.x,this.owner.y]);
						if ( this.history.length > ( this.intervals || 3 ) ) { this.history.shift(); }
						let x = this.history ? this.history[0][0] : 0;
						let y = this.history ? this.history[0][1] : 0;
						let diff_x = this.owner.x - x;
						let diff_y = this.owner.y - y;
						let diff = Math.abs(diff_x + diff_y); // manhatten is fine
						val = Math.round( diff );
						val /= ( this.intervals || 3 ) * ( this.interval || 1 ) * 100; // 100 pixels per second
						val = utils.Clamp( val, 0, 1 );
						if ( this.invert ) { val = 1-val; }
						this.last_val = val;
						break;
					}
					case 'proprio' : {
						let i=0;
						for ( let m of this.owner.motors ) { 
							const val = m.this_stoke_time ? m.last_amount : 0;
							outputs.push( {val:val, name:`proprio_${++i}`} ); 
						}
						val = null; // don't output self
						break;
					}
					// TODO: refactor this into named functions to avoid switch statement
					case 'food'	: {
						let sinAngle = Math.sin(this.owner.angle);
						let cosAngle = Math.cos(this.owner.angle);				
						// calc sensor x/y coords in world space
						let sx = this.owner.x + ((this.x * cosAngle) - (this.y * sinAngle));
						let sy = this.owner.y + ((this.x * sinAngle) + (this.y * cosAngle));
						// find objects that are detected by this sensor
						let objs = this.owner.tank.foods.length < 20 // runs faster on small sets
							? this.owner.tank.foods
							: this.owner.tank.grid.GetObjectsByBox( sx - this.r, sy - this.r, sx + this.r, sy + this.r, Food );
						for ( let obj of objs ) { 
							if ( !obj.IsEdibleBy(this.owner) ) { continue; }
							if ( this.owner.ignore_list && this.owner.ignore_list.has(obj) ) { continue; }
							const dx = Math.abs(obj.x - sx);
							const dy = Math.abs(obj.y - sy);
							const d = Math.sqrt(dx*dx + dy*dy);
							let proximity = utils.clamp( 1 - (d / (this.r + obj.r)), 0, 1 );
							if ( proximity ) {
								// do not factor in food quality. This sensor only detects direction.
								val += proximity;
							}
						}
						val = utils.clamp( val, 0, 1 );
						break;
					}
					case 'energy' : {
						val = this.owner.metab.energy / this.owner.metab.max_energy;
						break;
					} 
					case 'inertia' : {
						val = (this.owner.inertia + Boid.maxspeed) / (2*Boid.maxspeed)
						break;
					} 
					case 'spin' : {
						val = (this.owner.angmo + Boid.maxrot) / (2*Boid.maxrot);
						break;
					} 
					case 'angle-cos' : {
						val = Math.cos(this.owner.angle)*0.5 + 0.5;
						break;
					} 
					case 'angle-sin' : {
						val = Math.sin(this.owner.angle)*0.5 + 0.5;
						break;
					} 
					case 'world-x' : {
						val = this.owner.x / window.vc.tank.width;
						break;
					} 
					case 'world-y' : {
						val = this.owner.y / window.vc.tank.height;
						break;
					} 
					case 'lifespan' : {
						val = utils.Clamp( this.owner.age / this.owner.lifespan, 0, 1 );
						break;
					}
					case 'toxins' : {
						val = this.owner.metab.toxins ? 1 : 0;
						break;
					}
					case 'malnourished' : {
						val = this.owner.metab.deficient ? 1 : 0;
						break;
					}
					case 'chaos' : {
						val = !this.last_val || Math.random() > 0.95 ? Math.random() : this.last_val;
						this.last_val = val;
						break;
					} 
					case 'friends' : {
						val = 0
						if ( window.vc.simulation.settings?.ignore_other_boids===true ) { break; }
						// use box for better accuracy, worse CPU
						let friends = this.owner.tank.grid.GetObjectsByCoords( this.owner.x, this.owner.y );
						if ( friends ) {
							friends = friends.filter( x => 
								(x instanceof Boid) 
								&& x.species==this.owner.species 
							);
							val = Math.max( friends.length - 1, 0 );
							val = Math.min( 1.0, Math.log10( val + 1 ) );
						}
						break;
					} 
					case 'enemies' : {
						val = 0
						if ( window.vc.simulation.settings?.ignore_other_boids===true ) { break; }
						// use box for better accuracy, worse CPU
						let friends = this.owner.tank.grid.GetObjectsByCoords( this.owner.x, this.owner.y );
						if ( friends ) {
							friends = friends.filter( x => 
								(x instanceof Boid) 
								&& x.species!=this.owner.species 
							);
							val = Math.max( friends.length - 1, 0 );
							val = Math.min( 1.0, Math.log10( val + 1 ) );
						}
						break;
					} 
					case 'obstacles' : {
						val = 0;
						let sinAngle = Math.sin(this.owner.angle);
						let cosAngle = Math.cos(this.owner.angle);				
						// calc sensor x/y coords in world space
						let sx = this.owner.x + ((this.x * cosAngle) - (this.y * sinAngle));
						let sy = this.owner.y + ((this.x * sinAngle) + (this.y * cosAngle));
						// find objects that are detected by this sensor
						let candidates = this.owner.tank.grid.GetObjectsByBox( 
							sx - this.r,
							sy - this.r,
							sx + this.r,
							sy + this.r,
							Rock
						);
						for ( let o of candidates ) {
							const circle  = new Circle(sx, sy, this.r);
							const polygon = new Polygon(o.x, o.y, o.collision.hull);
							const result  = new Result();
							if ( circle.collides(polygon, result) ) {
								let v = result.overlap / ( this.r * 2 );
								val = Math.max( v, val );
							}
						}
						// also check tank edges
						const most_edge = Math.abs( Math.max(
							(sx < this.r ? (this.r - sx) : 0),
							(sx > (window.vc.tank.width-this.r) ? (this.r-(window.vc.tank.width - sx)) : 0),
							(sy < this.r ? (this.r - sy ) : 0),
							(sy > (window.vc.tank.height-this.r) ? (this.r-(window.vc.tank.height - sy)) : 0)
						) / (this.r * 2) );
						val = Math.max(val,most_edge);
						val = utils.clamp( val, 0, 1 );
					}
				}
				if ( val !== null ) {
					let name = this.name || detect;
					outputs.push({val,name});
				}
			}
		}
		this.val = outputs.length===1 ? outputs[0] : outputs;
		return this.val;
	}
	CreateGeometry() {
		let container = window.two.makeGroup();
		
		// segmented vision
		if ( this.segments) {
			let geo = window.two.makeCircle(this.x, this.y, this.r);
			geo.fill = 'transparent';
			geo.linewidth = 1;
			geo.stroke = this.color || '#AAEEAA77';
			container.add(geo);
			// segment lines 
			for ( let i=0; i<this.segdata.length; i++ ) {
				const x2 = this.x + (this.r * Math.cos(Math.PI + this.segdata[i].left)); 
				const y2 = this.y + (this.r * Math.sin(Math.PI + this.segdata[i].left));			
				let line = window.two.makeLine(this.x, this.y, x2, y2);
				line.fill = 'transparent';
				if ( i > 0 ) { line.dashes = [2,8]; }
				line.linewidth = 1;
				line.stroke = this.color || '#AAEEAA77';
				container.add(line);	
			}
			// final line
			const x2 = this.x + (this.r * Math.cos(Math.PI + this.segdata[this.segdata.length-1].right)); 
			const y2 = this.y + (this.r * Math.sin(Math.PI + this.segdata[this.segdata.length-1].right));			
			let line = window.two.makeLine(this.x, this.y, x2, y2);
			line.fill = 'transparent';
			// line.dashes = [2,8];
			line.linewidth = 1;
			line.stroke = this.color || '#AAEEAA77';
			container.add(line);	
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
				let line = window.two.makeLine(sx, sy, ax2, ay2);
				line.fill = 'transparent';
				line.linewidth = 2;
				line.stroke = this.color || '#AAEEAA77';
				container.add(line);
			}
		}
		
		// basic circle
		else {
			let geo = window.two.makeCircle(this.x, this.y, this.r);
			geo.fill = 'transparent';
			geo.linewidth = 1;
			geo.stroke = this.color || '#AAEEAA77';
			container.add(geo);
		}
						
		return container;
	}
}
