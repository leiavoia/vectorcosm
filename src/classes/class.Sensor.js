import * as utils from '../util/utils.js'

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
		// this can be differentiated by geometry type later. just circles for now.
		this.geo = window.two.makeCircle(this.x, this.y, this.r);
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
				let objs = this.owner.tank.foods;
				for ( let obj of objs ) { 
					const dx = Math.abs(obj.x - sx);
					const dy = Math.abs(obj.y - sy);
					const d = Math.sqrt(dx*dx + dy*dy);
					this.val += utils.clamp( 1 - (d / (this.r + obj.r)), 0, 1 );
				}
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
				this.val += this.owner.x > (window.vc.width-margin) ? (margin-(window.vc.width - this.owner.x)) : 0;
				this.val += this.owner.y < margin ? (margin - this.owner.y ) : 0;
				this.val += this.owner.y > (window.vc.height-margin) ? (margin-(window.vc.height - this.owner.y)) : 0;
				this.val /= margin*2;
				break;
			} 
			case 'world-x' : {
				this.val = this.owner.x / window.vc.width;
				break;
			} 
			case 'world-y' : {
				this.val = this.owner.y / window.vc.height;
				break;
			} 
			case 'chaos' : {
				this.val = Math.random();
				break;
			} 
		}
		this.val = utils.clamp( this.val, 0, 1 );
		return this.val;
	}
}
