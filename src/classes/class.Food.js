import Two from "two.js";
import * as utils from '../util/utils.js'
import {Circle, Polygon, Result} from 'collisions';
import Rock from '../classes/class.Rock.js'

export default class Food {
	constructor(x=0,y=0,params) {
		this.x = x;
		this.y = y;
		this.vx = Math.random() * 10 - 5;
		this.vy = Math.random() * 100 - 50;
		this.value = 300;
		this.age = 0;
		this.lifespan = 60 + Math.random() * 120;
		this.hue = Math.random();
		this.colorval = Math.random();
		this.edibility = Math.random() * 0.5;
		this.frictionless = false;
		Object.assign( this, params );
		this.r = Math.sqrt( 2 * this.value / Math.PI );
		this.geo = window.two.makeCircle(this.x,this.y,this.r);
		// this.geo.linewidth=2;
		// this.geo.stroke = 'white';
		this.geo.noStroke();
		// let stops = [ new Two.Stop(0, '#FA06'), new Two.Stop(1, '#FA0F') ];
		// this.geo.fill = new Two.RadialGradient(0, 0, 1, stops, -0.25, -0.25);
		this.geo.fill = `hsl(${this.hue*255},${(Math.min(1,this.edibility+0.5))*100}%,${this.colorval*100}%)`;
		this.geo.stroke = `hsl(${this.hue*255},${(Math.min(1,this.edibility+0.5))*100}%,50%)`;
		this.geo.linewidth = 4;
		this.geo.dashes = [3,3];
		window.vc.AddShapeToRenderLayer(this.geo); // main layer
		// this.geo.fill.units = 'objectBoundingBox';
		this.dead = false;		
		this.collision = { radius: this.r }	;
	}
	Update(delta) {
		if ( !delta ) { return; }
		if ( delta > 1 ) { delta /= 1000; }
		this.age += delta;
		if ( this.age > this.lifespan && !this.permafood ) {
			this.Kill();
			return;
		}
		// brownian motion
		// const brownian_velocity = 200;
		// if ( Math.random() > 0.5 ) {
		// 	this.vx += Math.random() * brownian_velocity - (brownian_velocity*0.5);
		// 	this.vy += Math.random() * brownian_velocity - (brownian_velocity*0.5);
		// }
		// move
		this.x += this.vx * delta;
		this.y += this.vy * delta;
		// drag slows us down
		if ( !this.frictionless ) { 
			let drag = ( 
				window.vc.tank.viscosity +
				( Math.min(Math.abs(this.vx) + Math.abs(this.vy),200) / 200 ) +
				( Math.min(this.r,200) / 200 )
			) / 3;
			drag *= Math.pow( delta, 0.12 ); // magic tuning number
			drag = 1 - drag;
			this.vx *= drag;
			this.vy *= drag;
		}
		// bounce off edges
		const margin = 0;
		if ( this.x < margin ) { this.vx = -this.vx; }
		if ( this.y < margin ) { this.vy = -this.vy; }
		if ( this.x > window.vc.tank.width-margin ) { this.vx = -this.vx; }
		if ( this.y > window.vc.tank.height-margin ) { this.vy = -this.vy; }
		// stay in tank
		this.x = utils.clamp( this.x, margin, window.vc.tank.width-margin );
		this.y = utils.clamp( this.y, margin, window.vc.tank.height-margin );
		// update the object in space
		this.r = Math.sqrt( 2 * this.value / Math.PI );
		this.collision.radius = this.r;
		// collision detection with obstacles
		// things i might collide with:
		let candidates = window.vc.tank.grid.GetObjectsByBox( 
			this.x - this.r,
			this.y - this.r,
			this.x + this.r,
			this.y + this.r,
			Rock
		);
		// narrow phase collision detection
		for ( let o of candidates ) {
			const circle  = new Circle(this.x, this.y, this.r);
			const polygon = new Polygon(o.x, o.y, o.collision.hull);
			const result  = new Result();
			let gotcha = circle.collides(polygon, result);
			// response
			if ( gotcha ) {
				this.x -= result.overlap * result.overlap_x;
				this.y -= result.overlap * result.overlap_y;
				this.vx = utils.Clamp( -this.vx + utils.RandomFloat(-this.vx*0.5,this.vx*0.5), -300, 300 );
				this.vy = utils.Clamp( -this.vy + utils.RandomFloat(-this.vy*0.5,this.vy*0.5), -300, 300 );
			}
		}
		// drawing
		// if ( !window.vc?.simulation?.turbo ) {
			this.geo.radius = Math.max(this.r,5);
			this.geo.position.x = this.x;
			this.geo.position.y = this.y;
		// }
			
	}
	// returns the amount eaten
	Eat(amount) { 
		if ( this.dead || !this.value ) { return 0; }
		const eaten = Math.min( this.value, amount );
		if ( !this.permafood ) { this.value -= eaten; }
		if ( this.value <= 0 ) { this.Kill(); }
		return eaten;
	}
	Kill() {
		this.geo.remove();
		this.dead = true;
	}
	// returns TRUE if the food hue is inside the boid's dietary range
	IsEdibleBy( boid ) {
		let diff = boid.diet - boid.diet_range*0.5;
		let max = (boid.diet + boid.diet_range*0.5) - diff;
		let target1 = utils.mod( (this.hue - diff) - (this.edibility*0.5), 1 ).toPrecision(8); // javascript modulus can't handle negatives
		let target2 = utils.mod( (this.hue - diff) + (this.edibility*0.5), 1 ).toPrecision(8); // javascript modulus can't handle negatives
		const result =  target1 <= max || target2 <= max || target1 >= target2;	// beware floating point imprecision on comparison
		return result;
	}			
}