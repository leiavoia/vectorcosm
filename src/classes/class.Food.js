import Two from "two.js";
import * as utils from '../util/utils.js'
import {Circle, Polygon, Result} from 'collisions';
import Rock from '../classes/class.Rock.js'
// import DNAPlant from '../classes/class.Plant.js'
import { DNAPlant } from '../classes/class.Plant.js'

export default class Food {
	constructor(x=0,y=0,params) {
		this.oid = ++globalThis.vc.next_object_id;
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
		this.nutrients = new Array(8); // as percentages. values add to 1
		if ( !params || !params.nutrients ) { 
			for ( let i=0; i < this.nutrients.length; i++ ) {
				this.nutrients[i] = Math.random(); 
			}
		}
		this.complexity = utils.RandomInt(1,6);
		this.frictionless = false;
		this.sense = new Array(16).fill(0);
		this.buoy = 0;
		this.buoy_start = 0;
		this.buoy_end = 0;
		this.dead = false;		
		Object.assign( this, params );
		this.r = Math.sqrt( 2 * this.value / Math.PI ) * 10;
		this.collision = { radius: this.r, shape: 'circle' };		
		// make sure we have exactly 8 nutrient indexes
		if ( this.nutrients.length !== 8 ) {
			for ( let i=0; i < 8; i++ ) {
				this.nutrients[i] = this.nutrients[i] || 0;
			}
		}
		// make sure nutrients add to 1
		let nutrient_total = 0;
		for ( let i=0; i < this.nutrients.length; i++ ) {
			this.nutrients[i] = Math.max( this.nutrients[i], 0 );
			nutrient_total += this.nutrients[i];
		}
		// prevent divide by zero
		if ( nutrient_total == 0 ) { 
			this.nutrients[7] = 1; 
			nutrient_total = 1; 
		}
		// even out the numbers
		else if ( nutrient_total < 0.999 || nutrient_total > 1.001 ) {
			this.nutrients = this.nutrients.map( v => v / nutrient_total );
		}
			
		// colors hardcoded mostly for aesthetics. you could change them.
		let colors = [
			'#C42452',
			'#EB9223',
			'#EBE313',
			'#5DD94D',
			'#2CAED4',
			'#1F4BE3',
			'#991FE3',
			'#FF70E5',
			'#FFFFFF',
			'#666666',
		];
		
		// sort nutrients by contribution
		let components = [];
		for ( let i=0; i < this.nutrients.length; i++ ) {
			if ( this.nutrients[i] ) {
				components.push({
					color: colors[i],
					pct: this.nutrients[i],
				});
			}
		}
		components.sort( (a,b) => a.pct - b.pct );
		
		// this.UpdateGeometry();
		
		// sensory data comes from nutrient composition unless overridden by creator
		if ( !params || !params?.sense ) {
			// visual color comes from mixing the two primary colors
			const maincomp =  components[components.length-1];
			const secondcomp = components.length > 1 ? components[components.length-2] : maincomp;
			const rgb1 = utils.HexColorToRGBArray( maincomp.color );
			const rgb2 = utils.HexColorToRGBArray( secondcomp.color );
			let r = ( rgb1[0] * maincomp.pct ) + ( rgb2[0] * secondcomp.pct ) / 2;
			let g = ( rgb1[1] * maincomp.pct ) + ( rgb2[1] * secondcomp.pct ) / 2;
			let b = ( rgb1[2] * maincomp.pct ) + ( rgb2[2] * secondcomp.pct ) / 2;
			this.sense[0] = ( r / 255 ) * 10 ; // buff to help boids see food
			this.sense[1] = ( g / 255 ) * 10 ; // buff to help boids see food
			this.sense[2] = ( b / 255 ) * 10 ; // buff to help boids see food
			// smell
			let smell_scale = utils.Clamp( Math.pow(this.value,0.5) * 0.2, 0, 3 ); // arbitrary
			this.sense[3] = smell_scale * this.nutrients[0] || 0;
			this.sense[4] = smell_scale * this.nutrients[1] || 0;
			this.sense[5] = smell_scale * this.nutrients[2] || 0;
			this.sense[6] = smell_scale * this.nutrients[3] || 0;
			this.sense[7] = smell_scale * this.nutrients[4] || 0;
			this.sense[8] = smell_scale * this.nutrients[5] || 0;
			this.sense[9] = smell_scale * this.nutrients[6] || 0;
			this.sense[10] = smell_scale * this.nutrients[7] || 0;
			this.sense[11] = smell_scale * (this.complexity || 0) / 5;
		}

	}
	Export( as_JSON=false ) {
		let output = {};
		let datakeys = ['x','y','value','age','lifespan','seed','max_germ_density','germ_distance','frictionless','sense','nutrients','complexity'];		
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
			// chance to live a while longer
			if ( Math.random() < 0.003 ) {		
				this.Kill();
				return;
			}
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
				globalThis.vc.tank.viscosity +
				( Math.min(Math.abs(this.vx) + Math.abs(this.vy),200) / 200 ) +
				( Math.min(this.r,200) / 200 )
			) / 3;
			drag *= Math.pow( delta, 0.12 ); // magic tuning number
			drag = 1 - drag;
			this.vx *= drag;
			this.vy *= drag;
		}
		// stay in tank
		this.x = utils.clamp( this.x, 0, globalThis.vc.tank.width );
		this.y = utils.clamp( this.y, 0, globalThis.vc.tank.height );
		// update the object in space
		this.r = Math.sqrt( 2 * this.value / Math.PI );
		this.collision.radius = this.r;
		// collision detection with obstacles
		// things i might collide with:
		let candidates = globalThis.vc.tank.grid.GetObjectsByBox( 
			this.x - this.r,
			this.y - this.r,
			this.x + this.r,
			this.y + this.r,
			o => o instanceof Rock
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
			if ( this.x < 0 || this.x > globalThis.vc.tank.width ) { this.Kill(); return; };
			if ( this.y < 0 || this.y > globalThis.vc.tank.height ) { this.Kill(); return; };
		}
		// plant a seed
		if ( touching_rock && this.seed && this.age > 5 && Math.random() > 0.9999 && 
			globalThis.vc.tank.plants.length < globalThis.vc.simulation.settings.num_plants ) {
			// only plant the seed if there are not too many other plants in the local area
			let plant_the_seed = true;
			if ( this.max_germ_density && this.germ_distance ) {
				// [1] plants are not in the collision detection space, so we need to check all of them for now ;-(
				let found = 0;
				const csqrd = this.germ_distance * this.germ_distance;
				for ( let p of globalThis.vc.tank.plants ) {
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
				// plant.geo.position.x = this.x; // this is really ugly
				// plant.geo.position.y = this.y;
				plant.age = 0; // shim
				globalThis.vc.tank.plants.push(plant);
				// [!] inconsistent behavior with rocks which automatically place themselves
				// globalThis.vc.AddShapeToRenderLayer( plant.geo, 0 );			
				this.Kill();
			}
		}
		// drawing
		else {
			// this.geo.position.x = this.x;
			// this.geo.position.y = this.y;
			// // limit expensive redraws
			// let radius = Math.max(this.r,5)
			// if ( radius != this.geo.radius ) {
			// 	this.geo.radius = radius;
			// 	// Natural style represents specific number of dots on the circle
			// 	if ( globalThis.vc.render_style == 'Natural' ) {
			// 		let circ = radius * 2 * Math.PI;
			// 		let points = this.complexity+2;
			// 		points = points >= 7 ? 8 : points;
			// 		let segment = circ / ( points * 2 );
			// 		this.geo.linewidth = radius/2;
			// 		this.geo.dashes = [segment,segment];				
			// 	}
			// }
			// // fade out
			// if ( globalThis.vc.animate_plants && !this.permafood && this.age > this.lifespan - 1 ) {
			// 	let pct = this.age - (this.lifespan-1);
			// 	this.geo.opacity = 1-pct;
			// }
		}
	}
	// returns the amount eaten
	Eat(amount) { 
		if ( this.dead || !this.value ) { return 0; }
		const eaten = Math.min( this.value, amount );
		if ( !this.permafood && !this.phantomfood ) { this.value -= eaten; }
		if ( this.value <= 0 ) { this.Kill(); }
		return eaten;
	}
	Kill() {
		// this.geo.remove();
		this.dead = true;
	}
	// returns TRUE if the food is edible by the boid
	IsEdibleBy( boid ) {
		if ( this.edibility >= 1 ) { return true; } // legacy hack for simulations
		return (1 << (this.complexity-1)) & boid.traits.food_mask;
	}		
	UpdateGeometry() {

		// if ( this.geo ) { this.geo.remove(); }

		// // rendering
		// let points = this.complexity+2;
		// if ( this.complexity==5 ) { points=8 } // unicode doesnt have heptagons ;-( 
		// else if ( this.complexity==6 ) { points=12; } // getting hard to discern at this point 
				
			
		// // colors hardcoded mostly for aesthetics. you could change them.
		// let colors = [
		// 	'#C42452',
		// 	'#EB9223',
		// 	'#EBE313',
		// 	'#5DD94D',
		// 	'#2CAED4',
		// 	'#1F4BE3',
		// 	'#991FE3',
		// 	'#FF70E5',
		// 	'#FFFFFF',
		// 	'#666666',
		// ];
		
		// // sort nutrients by contribution
		// let components = [];
		// for ( let i=0; i < this.nutrients.length; i++ ) {
		// 	if ( this.nutrients[i] ) {
		// 		components.push({
		// 			color: colors[i],
		// 			pct: this.nutrients[i],
		// 		});
		// 	}
		// }
		// components.sort( (a,b) => a.pct - b.pct );
		
		// // Vector style - single color polygon
		// if ( globalThis.vc.render_style == 'Vector' ) {
		// 	this.geo = globalThis.two.makePolygon(this.x,this.y,this.r,points);
		// 	// const maincolor =  components[components.length-1].color;
		// 	// const secondcolor = components.length > 1 ? components[components.length-2].color : maincolor;
		// 	// let rgb = utils.HexColorToRGBArray(maincolor);
		// 	// let hsl = utils.rgb2hsl( rgb[0]/255, rgb[1]/255, rgb[2]/255 );
		// 	// this.geo.fill = `hsl(${hsl[0]*255},${hsl[1]*100}%,${hsl[2]*80}%)`;
		// 	// this.geo.stroke = maincolor;
		// 	this.geo.fill = 'transparent';
		// 	this.geo.stroke = '#F99';
		// 	this.geo.linewidth = 4;
		// }
		
		// // Zen white style - 
		// else if ( globalThis.vc.render_style == 'Zen' ) {
		// 	this.geo = globalThis.two.makePolygon(this.x,this.y,this.r,points);
		// 	this.geo.fill = 'transparent';
		// 	this.geo.stroke = '#666';
		// 	this.geo.linewidth = 4;
		// }
		
		// // Grey style - uses colors
		// else if ( globalThis.vc.render_style == 'Grey' ) {
		// 	this.geo = globalThis.two.makePolygon(this.x,this.y,this.r,points);
		// 	const maincolor =  components[components.length-1].color;
		// 	const secondcolor = components.length > 1 ? components[components.length-2].color : maincolor;
		// 	let rgb = utils.HexColorToRGBArray(maincolor);
		// 	let hsl = utils.rgb2hsl( rgb[0]/255, rgb[1]/255, rgb[2]/255 );
		// 	this.geo.fill = `hsl(${hsl[0]*255},${hsl[1]*100}%,${hsl[2]*80}%)`;
		// 	this.geo.stroke = maincolor;
		// 	this.geo.linewidth = 4;
		// }
		
		// // Natural style - 2-color dashed circle
		// else {
		// 	this.geo = globalThis.two.makeCircle(this.x,this.y,this.r);
		// 	// only show the two primary ingredients to keep it simple
		// 	const maincolor =  components[components.length-1].color;
		// 	const secondcolor = components.length > 1 ? components[components.length-2].color : maincolor;
		// 	let rgb = utils.HexColorToRGBArray(maincolor);
		// 	let hsl = utils.rgb2hsl( rgb[0]/255, rgb[1]/255, rgb[2]/255 );
		// 	this.geo.fill = `hsl(${hsl[0]*255},${hsl[1]*100}%,${hsl[2]*80}%)`;
		// 	this.geo.stroke = secondcolor;
		// 	// make dash pattern create a number of "pips" to represent food complexity.
		// 	// this is aesthetically better than using polygons to represent complexity.
		// 	let circ = this.r * 2 * Math.PI;
		// 	let segment = circ / ( points * 2 );
		// 	this.geo.linewidth = this.r/2;
		// 	this.geo.dashes = [segment,segment];
		// }
		
		// this.geo.rotation = Math.random() * Math.PI; // aesthetic rotation
		// globalThis.vc.AddShapeToRenderLayer(this.geo,1); // main layer	
	}
}