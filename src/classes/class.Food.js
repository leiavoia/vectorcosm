import Two from "two.js";
import * as utils from '../util/utils.js'
import {Circle, Polygon, Result} from 'collisions';
import Rock from '../classes/class.Rock.js'
// import DNAPlant from '../classes/class.Plant.js'
import { DNAPlant } from '../classes/class.Plant.js'

export default class Food {
	constructor(x=0,y=0,params) {
		// first param can be JSON to rehydrate entire object from save
		if ( x && typeof x === 'object' ) {
			params = x;
		}
		// defaults
		this.x = x;
		this.y = y;
		this.vx = Math.random() * 10 - 5;
		this.vy = Math.random() * 100 - 50;
		this.value = 300;
		this.age = 0;
		this.lifespan = 60 + Math.random() * 120;
		this.hue = Math.random();
		this.colorval = 1; // Math.random(); // colorval doesnt currently do anything
		this.edibility = Math.random() * 0.5;
		this.frictionless = false;
		this.sense = new Array(16).fill(0);
		this.buoy = 0;
		this.buoy_start = 0;
		this.buoy_end = 0;
		Object.assign( this, params );
		this.r = Math.sqrt( 2 * this.value / Math.PI );
		this.geo = window.two.makeCircle(this.x,this.y,this.r);
		let h = this.hue;
		let s = Math.min(1,this.edibility+0.5);
		let l = this.colorval * 0.8; // 0.8 keeps it from blowing out
		// sensory data
		let rgbs = utils.hsl2rgb(h, s, l);
		this.sense[0] = rgbs[0] * 2; // hack for "brightness"
		this.sense[1] = rgbs[1] * 2; // hack for "brightness"
		this.sense[2] = rgbs[2] * 2; // hack for "brightness"
		// SHIM: SMELL - this should come from DNA / be provided from outside
		for ( let i=0; i<9; i++ ) { 
			this.sense[i+3] = Math.random();
		}
		// rendering
		this.geo.noStroke();
		this.geo.fill = `hsl(${h*255},${s*100}%,${l*100}%)`;
		this.geo.stroke = `hsl(${h*255},${s*100}%,50%)`;
		this.geo.linewidth = 4;
		this.geo.dashes = [3,3];
		window.vc.AddShapeToRenderLayer(this.geo); // main layer
		// this.geo.fill.units = 'objectBoundingBox';
		this.dead = false;		
		this.collision = { radius: this.r, shape: 'circle' };
	}
	Export( as_JSON=false ) {
		let output = {};
		let datakeys = ['x','y','value','age','lifespan','hue','colorval','edibility','seed','max_germ_density','germ_distance','frictionless','sense'];		
		for ( let k of datakeys ) { 
			if ( k in this ) {
				output[k] = this[k]; 
			}
		}
		if ( as_JSON ) { output = JSON.stringify(output); }
		return output;
	}	
	Update(delta) {
		if ( !delta ) { return; }
		if ( delta > 1 ) { delta /= 1000; }
		this.age += delta;
		if ( this.age > this.lifespan && !this.permafood ) {
			this.Kill();
			return;
		}
		// buoyancy
		this.buoy = this.buoy_start;// + ( this.buoy_end - this.buoy_start ) * Math.max(1, this.age / this.lifespan) ; 
		this.vy += -this.buoy;
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
		// stay in tank
		this.x = utils.clamp( this.x, 0, window.vc.tank.width );
		this.y = utils.clamp( this.y, 0, window.vc.tank.height );
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
		let touching_rock = false;
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
			touching_rock = touching_rock || gotcha;
		}
		// if an object pushed us out of bounds and we gets stuck outside tank, remove
		if ( touching_rock ) {
			if ( this.x < 0 || this.x > window.vc.tank.width ) { this.Kill(); return; };
			if ( this.y < 0 || this.y > window.vc.tank.height ) { this.Kill(); return; };
		}
		// plant a seed
		if ( touching_rock && this.seed && this.age > 5 && Math.random() > 0.9999 && 
			window.vc.tank.plants.length < window.vc.simulation.settings.num_plants ) {
			// only plant the seed if there are not too many other plants in the local area
			let plant_the_seed = true;
			if ( this.max_germ_density && this.germ_distance ) {
				// [1] plants are not in the collision detection space, so we need to check all of them for now ;-(
				let found = 0;
				const csqrd = this.germ_distance * this.germ_distance;
				for ( let p of window.vc.tank.plants ) {
					const xdiff = p.x - this.x;
					const ydiff = p.y - this.y;
					const absqrd = xdiff * xdiff + ydiff * ydiff; // dont need to sqrt here
					if ( absqrd < csqrd ) {
						found++;
						if ( found >= this.max_germ_density ) {
							plant_the_seed = false;
							break; // too many plants in the local area - stop here
						}
					}
				}				
			}
			if ( plant_the_seed ) {
				const plant = new DNAPlant( {dna:this.seed} );
				plant.x = this.x;
				plant.y = this.y;
				plant.geo.position.x = this.x; // this is really ugly
				plant.geo.position.y = this.y;
				plant.age = 0; // shim
				window.vc.tank.plants.push(plant);
				// [!] inconsistent behavior with rocks which automatically place themselves
				window.vc.AddShapeToRenderLayer( plant.geo, Math.random() > 0.5 ? '0' : '-1' );			
				this.Kill();
			}
		}
		// drawing
		else {
			this.geo.radius = Math.max(this.r,5);
			this.geo.position.x = this.x;
			this.geo.position.y = this.y;
		}
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