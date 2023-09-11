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
		this.val = 0; // reset
		// output depends on what we are detecting
		switch ( this.detect ) {
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
						this.val += proximity;
					}
				}
				this.val = utils.clamp( this.val, 0, 1 );
				// this.geo.fill = this.val ? ('#AAEEAA'+utils.DecToHex(Math.trunc(this.val*128))) : 'transparent';
				break;
			}
			case 'energy' : {
				this.val = this.owner.energy / this.owner.max_energy;
				break;
			} 
			case 'inertia' : {
				this.val = (this.owner.inertia + this.owner.maxspeed) / (2*this.owner.maxspeed)
				break;
			} 
			case 'spin' : {
				this.val = (this.owner.angmo + this.owner.maxrot) / (2*this.owner.maxrot);
				break;
			} 
			case 'angle-cos' : {
				this.val = Math.cos(this.owner.angle)*0.5 + 0.5;
				break;
			} 
			case 'angle-sin' : {
				this.val = Math.sin(this.owner.angle)*0.5 + 0.5;
				break;
			} 
			case 'edges' : {
				const margin = 150;
				this.val += this.owner.x < margin ? (margin - this.owner.x) : 0;
				this.val += this.owner.x > (window.vc.tank.width-margin) ? (margin-(window.vc.tank.width - this.owner.x)) : 0;
				this.val += this.owner.y < margin ? (margin - this.owner.y ) : 0;
				this.val += this.owner.y > (window.vc.tank.height-margin) ? (margin-(window.vc.tank.height - this.owner.y)) : 0;
				this.val /= margin*2;
				break;
			} 
			case 'world-x' : {
				this.val = this.owner.x / window.vc.tank.width;
				break;
			} 
			case 'world-y' : {
				this.val = this.owner.y / window.vc.tank.height;
				break;
			} 
			case 'chaos' : {
				this.val = Math.random();
				break;
			} 
			case 'friends' : {
				this.val = 0
				// use box for better accuracy, worse CPU
				let friends = this.owner.tank.grid.GetObjectsByCoords( this.owner.x, this.owner.y );
				if ( friends ) {
					friends = friends.filter( x => 
						(x instanceof Boid) 
						&& x.species==this.owner.species 
					);
					this.val = Math.max( friends.length - 1, 0 );
					this.val = Math.min( 1.0, Math.log10( this.val + 1 ) );
				}
				break;
			} 
			case 'enemies' : {
				this.val = 0
				// use box for better accuracy, worse CPU
				let friends = this.owner.tank.grid.GetObjectsByCoords( this.owner.x, this.owner.y );
				if ( friends ) {
					friends = friends.filter( x => 
						(x instanceof Boid) 
						&& x.species!=this.owner.species 
					);
					this.val = Math.max( friends.length - 1, 0 );
					this.val = Math.min( 1.0, Math.log10( this.val + 1 ) );
				}
				break;
			} 
			case 'obstacles' : {
				this.val = 0;
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
						this.val = Math.max( v, this.val );
					}
				}
				this.val = utils.clamp( this.val, 0, 1 );
			}
		}
		return this.val;
	}
	CreateGeometry() {
		// this can be differentiated by geometry type later. just circles for now.
		let geo = window.two.makeCircle(this.x, this.y, this.r);
		geo.fill = 'transparent';
		geo.linewidth = 1;
		geo.stroke = this.detect=='obstacles' ? '#FF22BB77' : '#AAEEAA77';	
		return geo;
	}
}
