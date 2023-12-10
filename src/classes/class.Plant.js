
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
		this.next_fruit = this.fruit_interval / ( window.vc?.simulation?.settings?.fruiting_speed || 1 );
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
			this.next_fruit += this.fruit_interval / ( window.vc?.simulation?.settings?.fruiting_speed || 1 );
			if ( window.vc.tank.foods.length < 300 ) {
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
		if ( window.vc.animate_plants && !window.vc.simulation.turbo ) {
			const cell = window.vc.tank.datagrid.CellAt( this.x, this.y );
			const strength = Math.sqrt( cell.current_x * cell.current_x + cell.current_y * cell.current_y ); 
			const cycle_time = utils.clamp( 3 * (1-strength), 1, 3);
			this.geo.skewX = strength * Math.PI/9 * Math.cos( ( window.vc.simulation.stats.round.time ) / cycle_time );
			this.geo.skewY = strength * Math.PI/9 * Math.sin( ( window.vc.simulation.stats.round.time ) / cycle_time );
		}
	}
} 

export class VectorGrass extends Plant {
	constructor(x=0, y=0) {
		super(x,y);
		this.fruit_interval = utils.RandomInt(20,30);
		this.next_fruit = this.fruit_interval / ( window.vc?.simulation?.settings?.fruiting_speed || 1 );
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
			this.next_fruit += this.fruit_interval / ( window.vc?.simulation?.settings?.fruiting_speed || 1 );
			if ( window.vc.tank.foods.length < 300 ) {
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
		// wave the grass
		if ( window.vc.animate_plants && !window.vc.simulation.turbo ) {
			const cell = window.vc.tank.datagrid.CellAt( this.x, this.y );
			const strength = Math.sqrt( cell.current_x * cell.current_x + cell.current_y * cell.current_y ); 
			const cycle_time = utils.clamp( 3 * (1-strength), 1, 3);
			for ( let i=0; i < this.geo.children.length; i++ ) {
				const child = this.geo.children[i];
				child.rotation = strength * 0.2 * Math.cos( ( i + window.vc.simulation.stats.round.time ) / cycle_time );
			}
		}		
	}	
} 

export class WaveyVectorGrass extends Plant {
	constructor(x=0, y=0) {
		super(x,y);
		this.fruit_interval = utils.RandomInt(45,60);
		this.next_fruit = this.fruit_interval / ( window.vc?.simulation?.settings?.fruiting_speed || 1 );
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
			this.next_fruit += this.fruit_interval / ( window.vc?.simulation?.settings?.fruiting_speed || 1 );
			if ( window.vc.tank.foods.length < 300 ) {
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
		// wave the grass
		if ( window.vc.animate_plants && !window.vc.simulation.turbo ) {
			const cell = window.vc.tank.datagrid.CellAt( this.x, this.y );
			const strength = Math.sqrt( cell.current_x * cell.current_x + cell.current_y * cell.current_y ); 
			const cycle_time = utils.clamp( 3 * (1-strength), 1, 3);			
			for ( let i=0; i < this.geo.children.length; i++ ) {
				const child = this.geo.children[i];
				const radius = (child.vertices[0].y - child.vertices[child.vertices.length-1].y) / 2;
				const effect = strength * 0.10 * Math.cos( ( i + window.vc.simulation.stats.round.time ) / cycle_time );
				const angle = effect; 
				child.rotation = angle;
				if ( !child.x_offset ) { // stash for repeated calls
					const dims = child.getBoundingClientRect(true);
					child.x_offset = ( dims.right + dims.left ) / 2;
				}
				child.position.x = ( Math.sin(angle) * radius ) + child.x_offset;
				child.position.y = -( Math.cos(angle) * radius );	
			}
		}
		// this code wiggles the vertices, but slaughters frame rate. maybe someday.
		// if ( !window.vc.simulation.turbo ) {
		// 	const cycle_time = 2;
		// 	for ( let child of this.geo.children ) {
		// 		for ( let vi=1; vi < child.vertices.length; vi++ ) {
		// 			const effect = Math.cos( ( vi + window.vc.simulation.stats.round.time ) / cycle_time );
		// 			let v = child.vertices[vi];
		// 			if ( !v.origin ) { 
		// 				v.origin = new Two.Vector().copy(v); 
		// 				v.xoff = (0.1 + Math.random()) * 0.25 * 250 * vi * (Math.random() > 0.5 ? 1 : -1 );
		// 				v.yoff = (0.1 + Math.random()) * 0.25 * 20 * vi * (Math.random() > 0.5 ? 1 : -1 );
		// 			}
		// 			v.x = v.origin.x + v.xoff * effect;
		// 			v.y = v.origin.y + v.yoff * effect;
		// 		}
		// 	}
		// }
							
	}	
} 

export class PointCloudPlant extends Plant {
	constructor(x=0, y=0) {
		super(x,y);
		this.fruit_interval = utils.RandomInt(30,120);
		this.next_fruit = this.fruit_interval / ( window.vc?.simulation?.settings?.fruiting_speed || 1 );
		this.fruit_hue = Math.random();
		this.lifespan = utils.RandomFloat(30, 300);
		this.growth_overlap_mod = Math.random();
		this.maturity_age = utils.RandomFloat( 0.1 * this.lifespan, 0.5 * this.lifespan );
		
		// TODO: IMMORTALITY FOR TESTING  
		this.age = this.maturity_age;
		
		// create point cloud
		this.radius = utils.RandomInt( 100, 350 );
		// this.radius = 200;
		this.points = [];
		// const num_points = utils.RandomInt( 5, 12 );
		const num_points = 10;
		for ( let i=0; i < num_points; i++ ) {
			this.points.push( [
				utils.RandomInt( -this.radius, this.radius ),
				utils.RandomInt( -this.radius, this.radius )
			]);
		}
		
		// point sorting
		this.smeth = Math.random();
		if ( this.smeth < 0.0 ) { this.smeth = null; }
		else if ( this.smeth < 0.25 ) { this.smeth = this.SortByX; }
		else if ( this.smeth < 0.50 ) { this.smeth = this.SortByY; }
		else { this.smeth = this.SortByAngle; }
		if ( this.smeth ) {
			this.points.sort( this.smeth );
		}
		
		this.curved = Math.random() > 0.75;
		
		// `discreet` creates many individual shapes. continuous create a single shape.
		this.discreet = Math.random() > 0.35;
		
		// slur the points around
		// TODO: there are lots of fun ways we could do this in the future
		if ( Math.random() > 0.35 ) {
			this.points = this.points.map( p => [ p[0], p[1] - this.radius * 2 ] );
		}
		
		// label all of the points with an ID number - we can use this to animate growth later
		for ( let i=0; i < this.points.length; i++ ) { this.points[i][2] = i+1; }
		
		// if the shape is "centered", it threads all points back through the center
		// when creating individual sub-shapes (petals), creating an aster-like pattern.
		this.centered = true; //Math.random() > 0.5;
		
		// if the shape is NOT centered, use the center point as a starting point
		if ( !this.centered ) {
			this.points.unshift([0,0,0]);
		}
		
		// if the shape is "centered", we automatically insert the center point
		// to begin each shape. Center points are in addition to existing points,
		// so we need to conditionally subtract one from many of the following calculations.
		const subtract_one = this.centered ? 1 : 0;
		
		// points per shape only applies if we are going to create individual shapes
		this.points_per_shape = utils.RandomInt(2,Math.min(4,this.points.length));
		
		// point increments determines how many indexes to skip when iterating through the point array.
		// skipping fewer points creates overlapping shapes. Skipping more creates separate, discontinuous shapes.
		this.point_increment = utils.RandomInt(1,this.points_per_shape-(subtract_one+1)); // use pps-1 to prevent discontinuous shapes
		
		// create shapes by iterating over points in different ways
		const shapes = [];
		
		// create discreet shapes
		if ( this.discreet ) {
			for ( let i=0; i < this.points.length - (this.points_per_shape-subtract_one); i += this.point_increment ) {
				const slice = this.points.slice( i, i + ( this.points_per_shape - subtract_one ) );
				slice.sort( this.SortByAngle ); // not required but usually aesthetically better
				if ( this.centered ) { slice.unshift([0,0,0]); } // start from zero on every shape
				shapes.push(slice);
			}
		}
		
		// create a single continuous shape
		else {
			shapes[0] = [];
			// one big glob
			if ( Math.random() > 0.5 ) { 
				this.points_per_shape = this.points.length;
				this.point_increment = this.points.length;
			}
			for ( let i=0; i < this.points.length - (this.points_per_shape-(1+subtract_one)); i += this.point_increment ) {
				const slice = this.points.slice( i, i + ( this.points_per_shape - subtract_one ) );
				if ( this.centered ) { slice.unshift([0,0,0]); } // start from zero on every loop
				shapes[0].push(...slice);
			}
		}
		
		// when points_per_shape == 2, individual shapes are composed of single lines.
		// we may wish to handle these differently
		const is_linear = this.points_per_shape == 2;
				
		// colors and features			
		this.linewidth = utils.RandomInt(1,this.radius/6); 
		this.fill = this.RandomGradient();							
		this.stroke = this.RandomGradient();						
		if ( Math.random() > 0.46 ) {
			const dash = utils.BiasedRandInt(2,this.linewidth*2,3,0.95);
			this.dashes =  [dash,dash];
		}
		if ( Math.random() > 0.6 ) {
			this.cap = 'round';
		}
		const color_roll = Math.random();
		// remove fill
		if ( color_roll < 0.33 ) {
			this.fill = 'transparent';
		}
		// remove stroke
		else if ( color_roll < 0.66 && !(is_linear && !this.curved) ) {
			this.stroke = 'transparent';
			this.linewidth = 0;
		}
		
		// if the shape is composed of line segments, turn off curves (which just look like giant ovals)
		// TODO: we can keep curves if we want to fiddle with bezier handles later.
		if ( is_linear ) { 
			// this.curved = false; 
			this.linewidth *= 3;
		}
				
		this.animation_method = (this.centered && this.discreet) ? 'sway' : 'skew';
					
		// create the final SVG shape(s)
		for ( let points of shapes ) {
			let anchors = points.map( p => new Two.Anchor( p[0], p[1] ) );
			// TODO: add back when full plant lifecycle implemented
			// let anchors = points.map( p => new Two.Anchor( 0, 0 ) );
			let shape = window.two.makePath(anchors);
			// label the vertices for animation later
			for ( let i=0; i < shape.vertices.length; i++ ) {
				shape.vertices[i].label = points[i][2];
			}
			shape.fill = this.fill;
			shape.stroke = this.stroke;
			shape.linewidth = this.linewidth;
			shape.curved = this.curved;
			if ( this.dashes ) shape.dashes = this.dashes;		
			if ( this.cap ) shape.cap = this.cap;		
			this.geo.add( shape );
		}
			
	}
	Kill() {
		this.geo.remove();
		this.dead = true;
	}	
	Update( delta ) {
		this.age += delta;
		
		// TODO: IMMORTALITY FOR TESTING  
		// if ( this.age >= this.lifespan ) {
		// 	this.geo.remove();
		// 	this.Kill();
		// 	return false;
		// }
		
		// make berries
		if ( this.age > this.next_fruit ) {
			this.next_fruit += this.fruit_interval / ( window.vc?.simulation?.settings?.fruiting_speed || 1 );
			if ( window.vc.tank.foods.length < 300 ) {
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
		
		// TODO: limit calls to save frame rate
		// this.UpdatePointsByGrowth();
		
		// wave the grass
		if ( window.vc.animate_plants && !window.vc.simulation.turbo ) {
			// sway individual shapes
			// FIXME: make blades wave from base - need to do rotate-around-point math
			if ( this.animation_method == 'sway' ) {		
				const cell = window.vc.tank.datagrid.CellAt( this.x, this.y );
				const strength = Math.sqrt( cell.current_x * cell.current_x + cell.current_y * cell.current_y ); 
				const cycle_time = utils.clamp( 3 * (1-strength), 1, 3);			
				for ( let i=0; i < this.geo.children.length; i++ ) {
					const child = this.geo.children[i];
					const radius = (child.vertices[0].y - child.vertices[child.vertices.length-1].y) / 2;
					const effect = strength * 0.10 * Math.cos( ( i + window.vc.simulation.stats.round.time ) / cycle_time );
					const angle = effect; 
					child.rotation = angle;
					if ( !child.x_offset ) { // stash for repeated calls
						const dims = child.getBoundingClientRect(true);
						child.x_offset = ( dims.right + dims.left ) / 2;
					}
					child.position.x = ( Math.sin(angle) * radius ) + child.x_offset;
				}
			}
			// simpler skew animation
			else {
				const cell = window.vc.tank.datagrid.CellAt( this.x, this.y );
				let strength = Math.sqrt( cell.current_x * cell.current_x + cell.current_y * cell.current_y ); 
				const cycle_time = utils.clamp( 3 * (1-strength), 1, 3);
				strength *= Math.PI/10 * ( 1.15-(this.radius/500) );
				this.geo.skewX = strength * Math.cos( ( window.vc.simulation.stats.round.time ) / cycle_time );
				this.geo.skewY = strength * Math.sin( ( window.vc.simulation.stats.round.time ) / cycle_time );			
			}
		}				
	}
	UpdatePointsByGrowth( force=false ) {
		if ( this.age > this.maturity_age && !force ) { return; } 
		const maturity = this.maturity_age / this.lifespan;
		const age = this.age / this.lifespan;
		const growth = (age >= maturity) ? 1 : (age / maturity);
		const n = this.points.length;
		// create a map of where each point should be right now
		const pts = this.points.map( (p,i) => {
			const start = (1/n) * i * this.growth_overlap_mod;
			const end = start + (1/n) / this.growth_overlap_mod;
			const at = utils.Clamp( (growth - start) / (end - start), 0, 1);
			const x = p[0] * at;
			const y = p[1] * at;
			return [x,y];
		});
		if ( pts[0][0] || pts[0][1] ) { pts.unshift([0,0,0]); } 
		// adjust the points in the actual geometry - there may be multiple occurrences
		for ( let s of this.geo.children ) {
			for ( let v of s.vertices ) {
				if ( v.label ) {
					v.x = pts[ v.label ][0];
					v.y = pts[ v.label ][1];
				}
			}
		}
	}	
	SortByY(a,b) {
		return b[1] - a[1];
	}
	SortByX(a,b) {
		return b[0] - a[0];
	}
	SortByAngle(a,b) {
		Math.atan2(b) - Math.atan2(a);
	}
	RandomShadeOfGreen() {
		let hue = utils.RandomInt(55,200);		
		let saturation = utils.RandomInt(20,60);			
		let lightness = utils.RandomInt(20,55);			
		let transp = utils.RandomFloat( 0.5, 1.0 );
		return `hsla(${hue},${saturation}%,${lightness}%,${transp})`;	
	}
	RandomGradient() {
		const c1 = this.RandomShadeOfGreen();
		const c2 = this.RandomShadeOfGreen();
		const c3 = Math.random() > 0.8 
			? utils.RandomColor(true,true,false) 
			: ( Math.random() > 0.6 ? this.RandomShadeOfGreen() : c2 );
		const stops = [ 
			new Two.Stop(0, c1),
			new Two.Stop(utils.BiasedRand(0.1,1.0,0.8,0.8), c2),
			new Two.Stop(1, c3),
		]
		if ( Math.random() > 0.7 ) {
			const scale = utils.BiasedRand( 0.1, 0.9, 0.4, 0.5 );
			for ( let stop of stops ) {
				stop.offset *= scale;
			}
		}
		const grad = window.two.makeRadialGradient(0.5, 1, 1, ...stops );
		grad.units = Math.random > 0.5 ? 'userSpaceOnUse' : 'objectBoundingBox';
		const spreadNum = Math.random();
		grad.spread = (spreadNum > 0.66) ? 'pad' : ( spreadNum > 0.33 ? 'reflect' : 'repeat' );	
		return grad;
	}
	
}

const plantPicker = new utils.RandomPicker( [
	[ PointCloudPlant, 	20 ],
	[ PendantLettuce, 	50 ],
	[ VectorGrass, 		150 ],
	[ WaveyVectorGrass, 50 ],
] );

export function RandomPlant(x=0,y=0) {
	const type = plantPicker.Pick();
	return new type(x,y);
}
	