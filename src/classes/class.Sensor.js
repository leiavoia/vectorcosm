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
		// if this is a vision sensor, it return multiple values and is handled differently
		if ( Array.isArray(this.detect) ) {
			// food sniffing
			// TODO: this is a janky way to do this. think of something cleaner and faster.
			const food_related_queries = ['near_food_cos', 'near_food_sine', 'near_food_dist', 'food_density'];
			const vision_related_queries = ['color_r', 'color_g', 'color_b', 'color_i'];
			const do_vision_stuff = this.detect.filter( x => vision_related_queries.includes(x) ).length; 
			const sniff_for_food = this.detect.filter( x => food_related_queries.includes(x) ).length; 
			if ( sniff_for_food ) {
				let sinAngle = Math.sin(this.owner.angle);
				let cosAngle = Math.cos(this.owner.angle);				
				// calc sensor x/y coords in world space
				let sx = this.owner.x + ((this.x * cosAngle) - (this.y * sinAngle));
				let sy = this.owner.y + ((this.x * sinAngle) + (this.y * cosAngle));
				// find objects that are detected by this sensor
				let objs = this.owner.tank.foods.length < 50 // runs faster on small sets
					? this.owner.tank.foods
					: this.owner.tank.grid.GetObjectsByBox( sx - this.r, sy - this.r, sx + this.r, sy + this.r, Food );
				let nearest_dist = Infinity;
				let nearest_obj = null;
				let nearest_angle = 0;
				let num_edible_foods=0;
				for ( let obj of objs ) { 
					const dx = Math.abs(obj.x - sx);
					const dy = Math.abs(obj.y - sy);
					const d = Math.sqrt(dx*dx + dy*dy);
					if ( d < nearest_dist ) {
						let proximity = utils.clamp( 1 - (d / (this.r + obj.r)), 0, 1 );
						if ( proximity && obj.IsEdibleBy(this.owner) ) {
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
			// vision sensors - these grab all objects in the sensor circle and report colors and smells, per channel
			if ( do_vision_stuff ) {
				let sinAngle = Math.sin(this.owner.angle);
				let cosAngle = Math.cos(this.owner.angle);				
				// calc sensor x/y coords in world space
				let sx = this.owner.x + ((this.x * cosAngle) - (this.y * sinAngle));
				let sy = this.owner.y + ((this.x * sinAngle) + (this.y * cosAngle));
				// accumulate light levels on each channel
				let light_r = 0;
				let light_g = 0;
				let light_b = 0;
				// find all objects that are detected by this sensor
				let objs = this.owner.tank.grid.GetObjectsByBox( sx - this.r, sy - this.r, sx + this.r, sy + this.r );
				for ( let obj of objs ) {
					if ( obj === this.owner ) { continue; }
					// does this object have a visible color?
					if ( !obj.sensor_color ) { continue; }
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
					const sdx = Math.abs(objx - sx);
					const sdy = Math.abs(objy - sy);
					const sd = Math.sqrt(sdx*sdx + sdy*sdy); // OPTIMIZE: can factor out square root
					const on_sensor = sd <= (this.r + objsize/2);
					if ( !on_sensor ) { continue; }	
					
					// distance from center of object to reference point, 
					// a small distance away from boid along a line to center of sensor
					const sensor_eyestock_pct = 0.1; // this could be genetic
					const sense_pt_x = this.owner.x + (sx - this.owner.x) * sensor_eyestock_pct;
					const sense_pt_y = this.owner.y + (sy - this.owner.y) * sensor_eyestock_pct;
					const dx = Math.abs(objx - sense_pt_x);
					const dy = Math.abs(objy - sense_pt_y);
					let d = Math.sqrt(dx*dx + dy*dy); // OPTIMIZE: can factor out square root
					const max_dist = this.r * 2;
					const percent_nearness = 1 - ( d / max_dist );
					if ( percent_nearness < 0.01 ) { continue; }
					
					// apparent size is a number we can fudge and still get decent results.
					// simple division is a cheat. you can use square-of-distance for more accuracy.
					const apparent_size = Math.min( 4, Math.pow(objsize,1+percent_nearness) / (this.r*2) );
					const pct_field_of_view = apparent_size / 8; // 0..1
					
					// peripheral vision curve: attenuate based on difference of sensor angle to object angle.
					// we could also enable/disable this with a genetic trait.
					let angleMod = 1;
					if ( this.x || this.y ) { // only calculate if we don't have a perfectly centered circle.
						const v1x = sense_pt_x - this.owner.x;
						const v1y = sense_pt_y - this.owner.y;
						const v2x = objx - this.owner.x;
						const v2y = objy - this.owner.y;
						const dotProduct = v1x * v2x + v1y * v2y;
						const magnitude1 = Math.sqrt(v1x * v1x + v1y * v1y) || 0.001;
						const magnitude2 = Math.sqrt(v2x * v2x + v2y * v2y) || 0.001;
						const cosTheta = dotProduct / (magnitude1 * magnitude2); // -1 .. 1
						angleMod = 1 - ( Math.cos( (0.5 + 0.5 * cosTheta) * Math.PI ) / 2 + 0.5 );
					}
					
					// attention lets us hilite certain objects of more importance, like food
					let attention = 1.0;
					if ( obj instanceof Food ) { attention = 10.0; }
					
					// final contribution
					const channels = utils.HexColorToRGBArray( obj.sensor_color );
					light_r += ( channels[0] / 0xFF ) * pct_field_of_view * attention * angleMod;
					light_g += ( channels[1] / 0xFF ) * pct_field_of_view * attention * angleMod;
					light_b += ( channels[2] / 0xFF ) * pct_field_of_view * attention * angleMod;
				}
				// sigmoid squash light signals to prevent blinding.
				// TANH function tends to effectively max out around value of 2,
				// so it helps to scale the signal back to produce a more effective value for the AI
				const light_scaling = 0.75; // NOTE: You could make this a genetic trait
				light_r = Math.tanh( light_r * light_scaling );
				light_g = Math.tanh( light_g * light_scaling );
				light_b = Math.tanh( light_b * light_scaling );
				if ( this.detect.contains('color_r') ) { outputs.push( {val:light_r, name:'color_r'} ); }
				if ( this.detect.contains('color_g') ) { outputs.push( {val:light_g, name:'color_g'} ); }
				if ( this.detect.contains('color_b') ) { outputs.push( {val:light_b, name:'color_b'} ); }
				if ( this.detect.contains('color_i') ) {
					const intensity = ( light_r + light_g + light_b ) / 3;
					outputs.push( {val:intensity, name:'color_i'} ); 
				}
			}			
		}
		else {
			let detections = Array.isArray(this.detect) ? this.detect : [this.detect];
			for ( let detect of detections ) {
				let val = 0; // reset
				// output depends on what we are detecting
				switch ( detect ) {
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
						let objs = this.owner.tank.foods.length < 50 // runs faster on small sets
							? this.owner.tank.foods
							: this.owner.tank.grid.GetObjectsByBox( sx - this.r, sy - this.r, sx + this.r, sy + this.r, Food );
						for ( let obj of objs ) { 
							const dx = Math.abs(obj.x - sx);
							const dy = Math.abs(obj.y - sy);
							const d = Math.sqrt(dx*dx + dy*dy);
							let proximity = utils.clamp( 1 - (d / (this.r + obj.r)), 0, 1 );
							if ( proximity && obj.IsEdibleBy(this.owner) ) {
								// do not factor in food quality. This sensor only detects direction.
								val += proximity;
							}
						}
						val = utils.clamp( val, 0, 1 );
						// this.geo.fill = val ? ('#AAEEAA'+utils.DecToHex(Math.trunc(val*128))) : 'transparent';
						break;
					}
					case 'energy' : {
						val = this.owner.energy / this.owner.max_energy;
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
					case 'chaos' : {
						val = Math.random();
						break;
					} 
					case 'friends' : {
						val = 0
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
					outputs.push({val,name:detect});
				}
			}
		}
		this.val = outputs.length===1 ? outputs[0] : outputs;
		return this.val;
	}
	CreateGeometry() {
		// this can be differentiated by geometry type later. just circles for now.
		let geo = window.two.makeCircle(this.x, this.y, this.r);
		geo.fill = 'transparent';
		geo.linewidth = 1;
		geo.stroke = this.detect=='obstacles' ? '#FF22BB77' : (this.name=='vision' ? '#33AAFFAA' : '#AAEEAA77');	
		return geo;
	}
}
