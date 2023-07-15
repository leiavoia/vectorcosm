import Two from "two.js";
import * as utils from '../util/utils.js'

class Poison {
	constructor(x=0,y=0) {
		this.x = x;
		this.y = y;
		this.vx = Math.random() * 10 - 5;
		this.vy = Math.random() * 100 - 50;
		this.value = 70;
		this.r = this.value;
		this.geo = window.two.makePolygon(this.x,this.y,this.r,8);
		this.geo.linewidth = 2;
		this.geo.stroke = '#FAF';
		this.geo.fill = 'transparent';
		this.dead = false;			
	}
	Update(delta) {
		const margin = 200;
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
		this.geo.position.x = this.x;
		this.geo.position.y = this.y;
		this.geo.radius = this.value;
	}
	Kill() {
		this.geo.remove();
		this.dead = true;
		let i = foods.indexOf(this);
		if ( i >= 0 ) { foods.splice(i,1); }
	}			
}