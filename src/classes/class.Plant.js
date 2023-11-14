
import Two from "two.js";
import * as utils from '../util/utils.js'
import Food from '../classes/class.Food.js'

export default class Plant {
	constructor(x=0,y=0) {
		this.x = x;
		this.y = y;
		this.dead = false;
		this.geo = two.makeGroup();
		this.geo.position.x = x;
		this.geo.position.y = y;
		this.age = 0;
		this.lifespan = 10000000;
		this.fruit_interval = 10;
		this.next_fruit = 10;
		this.fruit_hue = 0.3;
	}
	Kill() {
		this.geo.remove();
		this.dead = true;
	}	
	Update( delta ) {
		this.age += delta;
		if ( this.age >= this.lifespan ) {
			this.geo.remove();
			this.Kill();
			return false;
		}
	}
}

export class PendantLettuce extends Plant {
	constructor(x=0, y=0) {
		super(x,y);
		this.fruit_interval = utils.RandomInt(30,40);
		this.next_fruit = this.fruit_interval;
		this.fruit_hue = utils.RandomFloat(0.25,0.35);	
		// make the unique shape	
		const n = utils.BiasedRandInt( 3, 16, 8, 0.8 );
		const r = utils.BiasedRandInt( 50, 200, 100, 0.6);
		const max_variance = r*0.3; 
		const seglength = (2*Math.PI) / n;
		const pts = [];
		for ( let i=0; i < n; i++ ) {
			const l = r + utils.RandomInt( -max_variance, max_variance );
			const a = i * seglength + utils.BiasedRand( -seglength/2, seglength/2, 0, 0.8 ) ;
			pts.push([ l * Math.cos(a), l * Math.sin(a) ]);
		}
		// make the main body shape
		const lw = utils.BiasedRandInt( 1, 6, 2, 0.95 );
		let shape = window.two.makePath( pts.map( p => new Two.Anchor( p[0], p[1] ) ) );
		// leaf coloring
		const tip_color = `hsl(${this.fruit_hue*255},85%,75%)`;
		const stops = [ new Two.Stop(0, '#174D1F'), new Two.Stop(1, '#23682D')/* , new Two.Stop(1, tip_color) */ ];
		shape.fill = window.two.makeRadialGradient(0, 0, r, ...stops );
		shape.fill.units = 'userSpaceOnUse'; // super important
		shape.linewidth = lw;
		shape.stroke = 'transparent';
		this.geo.add(shape);
		// dash pattern
		const dashes = [];
		let num_dashes = utils.RandomInt(0,3);
		for ( let i=0; i < num_dashes; i++ ) {
			dashes.push( utils.RandomInt(lw*0,lw*10) );
			dashes.push( utils.RandomInt(lw*0,lw*10) );
		}			
		// make the veins
		const vein_stops = [ new Two.Stop(0, tip_color), new Two.Stop(1, '#66997799'), ];
		const vein_grad = window.two.makeRadialGradient(0, 0, r, ...vein_stops );
		for ( let p of pts ) { 
			const l = window.two.makeLine( 0, 0, p[0], p[1] );
			l.stroke = vein_grad; //tip_color;
			l.stroke.units = 'userSpaceOnUse'; // super important
			l.linewidth = lw;
			if ( dashes.length ) { l.dashes = dashes; }
			// l.cap = 'round';
			this.geo.add(l);
		}
	}
	Update(delta) {
		super.Update(delta);
		if ( this.dead ) { return; }
		// make berries
		if ( this.age > this.next_fruit ) {
			this.next_fruit += this.fruit_interval;
			if ( window.vc.tank.foods.length < 60 ) {
				const f = new Food( this.x, this.y, { 
					value: 50, 
					hue: this.fruit_hue, 
					colorval: 1, 
					edibility: 0.3, 
					lifespan: 80,
					vx: utils.RandomFloat(0,25),
					vy: utils.RandomFloat(0,25),
					} );
				window.vc.tank.foods.push(f);
			}
		}
	}
} 

export class VectorGrass extends Plant {
	constructor(x=0, y=0) {
		super(x,y);
		this.fruit_interval = utils.RandomInt(20,30);
		this.next_fruit = this.fruit_interval;
		this.fruit_hue = utils.RandomFloat(0.55,0.8);
		// leaf coloring
		const tip_color = `hsl(${this.fruit_hue*255},85%,75%)`;
		const stops = [ new Two.Stop(0, '#697'), new Two.Stop(0.68, '#697'), new Two.Stop(1, tip_color) ];		
		const grad = window.two.makeLinearGradient(0, 1, 0, 0, ...stops );
		// make the unique shape		
		const n = utils.BiasedRandInt( 1, 5, 3, 0.8 );
		const r = utils.BiasedRandInt( 100, 500, 180, 0.6);
		const max_variance = r*0.3; 
		const spread = 0.25 * Math.PI; 
		// const dashes = [20,20];
		const dashes = [2,2];
		this.blades = [];
		for ( let i=0; i < n; i++ ) {
			const l = r + utils.RandomInt( -max_variance, max_variance );
			const a = 1.5*Math.PI + utils.BiasedRand( -spread, spread, 0, 0.65 ) ;
			const blade = { x1: 0, y1: 0, x2: l * Math.cos(a), y2: l * Math.sin(a) };
			this.blades.push(blade);
			const line = window.two.makeLine( blade.x1, blade.y1, blade.x2, blade.y2 );
			line.stroke = grad;
			line.stroke.units = 'objectBoundingBox'; // super important
			line.linewidth = r * utils.BiasedRand( 0.04, 0.2, 0.08, 0.5 );
			line.fill = 'transparent';
			// line.cap = 'round';
			if ( dashes.length ) { line.dashes = dashes; }
			this.geo.add(line);
		}
	}
	Update(delta) {
		super.Update(delta);
		if ( this.dead ) { return; }
		// make berries
		if ( this.age > this.next_fruit ) {
			this.next_fruit += this.fruit_interval;
			if ( window.vc.tank.foods.length < 200 ) {
				for ( const b of this.blades ) {
					const f = new Food( 
						this.x + b.x2, 
						this.y + b.y2, 
						{ 
						value: utils.RandomInt(10,20), 
						hue: this.fruit_hue, 
						colorval: 1, 
						edibility: 0.3,
						lifespan: 40,
						vx: utils.RandomFloat(0,25),
						vy: utils.RandomFloat(0,25),
						} 
						);
					window.vc.tank.foods.push(f);
				}
			}
		}
	}	
} 

export class WaveyVectorGrass extends Plant {
	constructor(x=0, y=0) {
		super(x,y);
		this.fruit_interval = utils.RandomInt(45,60);
		this.next_fruit = this.fruit_interval;
		this.fruit_hue = utils.RandomFloat(0.05,0.20);
		// leaf coloring
		const tip_color = `hsl(${this.fruit_hue*255},85%,75%)`;
		const stops = [ new Two.Stop(0, '#243'), new Two.Stop(0.86, '#726'), new Two.Stop(1, tip_color) ];		
		const grad = window.two.makeLinearGradient(0, 1, 0, 0, ...stops );
		// make the unique shape		
		const blades = utils.BiasedRandInt( 1, 5, 3, 0.8 );
		const avglength = utils.BiasedRandInt( 500, 2000, 900, 0.6);
		const max_variance = length*0.3; 
		const spread = 0.25 * Math.PI; 
		this.blades = [];
		for ( let i=0; i < blades; i++ ) {
			const length = avglength + utils.RandomInt( -max_variance, max_variance );
			const width = length * utils.BiasedRand( 0.02, 0.1, 0.03, 0.5 );
			// const dashes = [width,width*0.8];
			const dashes = [2,2];
			const blade = [];
			// create points
			const num_points = utils.RandomInt(3,5);
			for ( let n=0; n<num_points; n++ ) {
				let l = (length/num_points) * n;
				let a2 = 1.5*Math.PI + utils.BiasedRand( -spread/(n||1), spread/(n||1), 0, 0.65 ) ;
				blade.push([ l * Math.cos(a2), l * Math.sin(a2) ]);
			}
			this.blades.push(blade);
			// make the geometry
			const anchors = blade.map( p => new Two.Anchor( p[0], p[1] ) );
			const line = window.two.makePath(anchors);
			line.stroke = grad;
			line.stroke.units = 'objectBoundingBox'; // super important
			line.linewidth = width;
			line.fill = 'transparent';
			line.closed = false;
			line.curved = true;
			// line.cap = 'round';
			line.dashes = dashes;
			this.geo.add(line);
		}
	}
	Update(delta) {
		super.Update(delta);
		if ( this.dead ) { return; }
		// make berries
		if ( this.age > this.next_fruit ) {
			this.next_fruit += this.fruit_interval;
			if ( window.vc.tank.foods.length < 200 ) {
				for ( const b of this.blades ) {
					const f = new Food( 
						this.x + b[b.length-1][0], 
						this.y + b[b.length-1][1], 
						{ 
						value: utils.RandomInt(100,120), 
						hue: this.fruit_hue, 
						colorval: 1, 
						edibility: 0.3,
						lifespan: 40,
						vx: utils.RandomFloat(0,25),
						vy: utils.RandomFloat(0,25),
						} 
						);
					window.vc.tank.foods.push(f);
				}
			}
		}
	}	
} 

// export default class Plant {
// 	constructor(x=0,y=0,scale=1) {
// 		scale = utils.clamp(scale,0.1,10);
// 		this.x = x;
// 		this.y = y;
// 		let leaves = Math.trunc( Math.random() * 2 ) + 2;
// 		this.geo = two.makeGroup();
// 		for ( let i=0; i < leaves; i++ ) {
// 			let h = Math.random()*400*scale + 200;
// 			let w = Math.random()*300*scale + 200;
// 			let tip_x = x + ((w * Math.random() * 0.6) - (w * Math.random() * 0.3));
// 			let points = [
// 				(x + (Math.random() * 60 * scale)) - (30*scale), // root
// 				y+50,
// 				Math.max(x,tip_x) + Math.random() * w / 2,
// 				y - (Math.random() * h/2 + h/2),
// 				tip_x,
// 				y-h,
// 				Math.min(x,tip_x) - Math.random() * w / 2,
// 				y - (Math.random() * h/2 + h/2)
// 			];
// 			let path = two.makePath(...points);
// 			path.linewidth = 2;
// 			path.stroke = utils.adjustColor('#AEA1',0.1);
// 			path.fill = utils.adjustColor('#AEA2',0.1);
// 			this.geo.add( path );
// 		}
// 	}
// }
