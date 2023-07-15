import Two from "two.js";
import * as utils from '../util/utils.js'

export default class Food {
	constructor(x=0,y=0) {
		this.x = x;
		this.y = y;
		this.vx = Math.random() * 10 - 5;
		this.vy = Math.random() * 100 - 50;
		this.value = 80;
		this.r = this.value * 0.25;
		this.geo = window.two.makeCircle(this.x,this.y,this.r);
		// this.geo.linewidth=2;
		// this.geo.stroke = 'white';
		this.geo.noStroke();
		let stops = [ new Two.Stop(0, '#FA06'), new Two.Stop(1, '#FA0F') ];
		this.geo.fill = new Two.RadialGradient(0, 0, 1, stops, -0.25, -0.25);
		// this.geo.fill.units = 'objectBoundingBox';
		this.dead = false;			
	}
	Update(delta) {
		const margin = 300;
		if ( !delta ) { return; }
		if ( delta > 1 ) { delta /= 1000; }
		this.x += this.vx * delta;
		this.y += this.vy * delta;
		if ( this.x < margin ) { this.vx = -this.vx; }
		if ( this.y < margin ) { this.vy = -this.vy; }
		if ( this.x > window.vc.width-margin ) { this.vx = -this.vx; }
		if ( this.y > window.vc.height-margin ) { this.vy = -this.vy; }
		this.x = utils.clamp( this.x, margin, window.vc.width-margin );
		this.y = utils.clamp( this.y, margin, window.vc.height-margin );
		// update the object in space
		this.r = this.value * 0.25;
		this.geo.radius = this.r;
		this.geo.position.x = this.x;
		this.geo.position.y = this.y;
	}
	// returns the amount eaten
	Eat(amount) { 
		if ( this.dead || !this.value ) { return 0; }
		let eaten = Math.min( this.value, amount );
		this.value -= eaten;
		if ( this.value <= 0 ) { 
			this.Kill();
			return true;
		}
		return 0;
	}
	Kill() {
		this.geo.remove();
		this.dead = true;
	}			
}