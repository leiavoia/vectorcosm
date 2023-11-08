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
			const sniff_for_food = this.detect.filter( x => food_related_queries.includes(x) ); 
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
		}
		else {
			let detections = Array.isArray(this.detect) ? this.detect : [this.detect];
			for ( let detect of detections ) {
				let val = 0; // reset
				// output depends on what we are detecting
				switch ( detect ) {
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
					case 'edges' : {
						const margin = 150;
						val += this.owner.x < margin ? (margin - this.owner.x) : 0;
						val += this.owner.x > (window.vc.tank.width-margin) ? (margin-(window.vc.tank.width - this.owner.x)) : 0;
						val += this.owner.y < margin ? (margin - this.owner.y ) : 0;
						val += this.owner.y > (window.vc.tank.height-margin) ? (margin-(window.vc.tank.height - this.owner.y)) : 0;
						val /= margin*2;
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
