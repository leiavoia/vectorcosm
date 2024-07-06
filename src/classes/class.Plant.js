
import Two from "two.js";
import * as utils from '../util/utils.js'
import Food from '../classes/class.Food.js'
import DNA from '../classes/class.DNA.js'

export default class Plant {
	static PlantTypes = new Map;
	constructor(x=0,y=0) {
		this.type = 'Plant'; // avoids JS classname mangling
		this.x = 0;
		this.y = 0;
		this.dna = 128; // random chars
		this.generation = 1;
		this.dead = false;
		this.age = 0;
		this.lifespan = 100000000;
		this.fruit_interval = 30; // sane defaults
		this.next_fruit = 30; // sane defaults
		this.fruit_hue = 0.5; // 0 .. 1
		// first param can be JSON to rehydrate entire object from save
		if ( x && typeof x === 'object' ) {
			Object.assign(this,x);
		}
		else {
			this.x = x;
			this.y = y;
		}
		this.geo = window.two.makeGroup();
		this.geo.position.x = this.x;
		this.geo.position.y = this.y;
	}
	Kill() {
		this.geo.remove();
		this.dead = true;
	}	
	Update( delta ) {
		this.age += delta;
		if ( this.age >= this.lifespan ) {
			this.Kill();
			return false;
		}
	}
	Export( as_JSON=false ) {
		let output = { classname: this.type };
		let datakeys = ['x','y','fruit_interval','age','lifespan','fruit_hue',
			'next_fruit','maturity_age','growth_overlap_mod','dna','generation'];		
		for ( let k of datakeys ) { 
			if ( this.hasOwnProperty(k) ) { 
				output[k] = this[k];
			} 
 		}
		if ( as_JSON ) { output = JSON.stringify(output); }
		return output;
	}		
}

export class DNAPlant extends Plant {
	constructor(x=0,y=0) {
		super(x,y);
		this.type = 'DNAPlant'; // avoids JS classname mangling
		this.dna = new DNA( this.dna ); // will either be number of chars, or full string if rehydrating
		this.RehydrateFromDNA();
		this.CreateBody();
		this.UpdatePointsByGrowth(true);
	}
	Update(delta) {
		super.Update(delta);
		if ( this.dead ) { return; }
		
		// current plant class has hacks in to ignore death
		if ( !this.perma && this.age >= this.lifespan ) {
			this.Kill();
			return false;
		}
		
		// make berries
		if ( this.age > this.traits.maturity_age && this.age > this.next_fruit ) {
			let max_fudge = this.fruit_interval * 0.10;
			let fudge = ( Math.random() * max_fudge ) - ( max_fudge / 2 );
			this.next_fruit = this.age + fudge + ( this.fruit_interval / ( window.vc?.simulation?.settings?.fruiting_speed || 1 ) );
			if ( window.vc.tank.foods.length < 300 ) {
				// pick a random vertex to spawn from
				let vertex = this.geo.children.pickRandom().vertices.pickRandom();
				const f = new Food( this.x + vertex.x, this.y + vertex.y, { 
					value: ( this.traits.fruit_size * ( 1 - (Math.random() * 0.1 ) ) ), 
					hue: this.traits.fruit_hue, 
					colorval: 1, // does nothing right now
					edibility: this.traits.fruit_edibility, 
					lifespan: ( this.traits.fruit_lifespan * ( 1 - (Math.random() * 0.1 ) ) ),
					vx: utils.RandomFloat(100,1000), // boing!
					vy: utils.RandomFloat(100,1000),
					} );
				// if there is room for more plants in the tank, make it a viable seed
				if ( window.vc.tank.plants.length < window.vc.simulation.settings.num_plants ) {
					let seed = new DNA(	this.dna.str );
					seed.mutate( 2, false );
					f.seed = seed.str;
					f.max_germ_density = this.traits.max_germ_density;
					f.germ_distance = this.traits.germ_distance;
				}
				window.vc.tank.foods.push(f);
			}
		}
		
		// TODO: limit calls to save frame rate, fade in, or use staggered growth spurts
		this.UpdatePointsByGrowth();
		
		// wave the grass
		if ( window.vc.animate_plants && !window.vc.simulation.turbo ) {
			// sway individual shapes
			// FIXME: make blades wave from base - need to do rotate-around-point math
			if ( this.traits.animation_method == 'sway' ) {		
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
				strength *= Math.PI/10 * ( 1.15-(this.traits.radius/500) );
				this.geo.skewX = strength * Math.cos( ( window.vc.simulation.stats.round.time ) / cycle_time );
				this.geo.skewY = strength * Math.sin( ( window.vc.simulation.stats.round.time ) / cycle_time );			
			}
		}		
	}
	
	MakeGeneticColor( whatfor, colors ) {
		let gn1 = this.dna.geneFor(`plant ${whatfor} num colors gene 1`);
		let gn2 = this.dna.geneFor(`plant ${whatfor} num colors gene 2`);
		let num_colors = Math.round( this.dna.mix( [gn1,gn2], 0, colors.length ) );
		
		// transparent
		if ( num_colors===0 ) {
			return 'transparent';
		}
		
		// single color
		if ( num_colors===1 ) {
			let g1 = this.dna.geneFor(`plant ${whatfor} color index 0 gene 1`);
			let g2 = this.dna.geneFor(`plant ${whatfor} color index 0 gene 2`);
			let index = Math.round( this.dna.mix( [g1,g2], 0, colors.length-1 ) );
			return colors[index];
		}
		
		// gradient
		let stops = [];
		for ( let i=0; i < num_colors; i++ ) {
			let g1 = this.dna.geneFor(`plant ${whatfor} color index ${i} gene 1`);
			let g2 = this.dna.geneFor(`plant ${whatfor} color index ${i} gene 2`);
			let g3 = this.dna.geneFor(`plant ${whatfor} stop index ${i} gene 1`);
			let g4 = this.dna.geneFor(`plant ${whatfor} stop index ${i} gene 2`);
			let index = Math.round( this.dna.mix( [g1,g2], 0, colors.length-1 ) );
			let stop_at = this.dna.mix( [g3,g4], 0, 1 );
			let stop = new Two.Stop( stop_at, colors[index] );
			stops.push(stop);		
		}
		
		// sort the stops by ascending stop value
		stops.sort( (a,b) => a.offset - b.offset );
		
		// make sure we have stops on 0 and 1
		stops[0].offset = 0;
		stops[ stops.length-1 ].offset = 1;
		
		// whacky stuff we copied from boid BodyPlans
		const length = this.dna.biasedRand( this.dna.geneFor(`${whatfor} gradient length`), 100, 1000 );
		const width = this.dna.biasedRand( this.dna.geneFor(`${whatfor} gradient width`), 100, 1000 );
		const longest_dim = Math.max(length,width);
		let xoff = this.dna.biasedRand( this.dna.geneFor(`${whatfor} gradient xoff`), -length/2, length/2 );
		let yoff = 0;
		let radius = this.dna.biasedRand( this.dna.geneFor(`${whatfor} gradient radius`), longest_dim/10, longest_dim, longest_dim, 0.8 );
		const flip = this.dna.biasedRand( this.dna.geneFor(`${whatfor} gradient axis flip`) ) < 0.33;
		let grad = null;
		// radial gradients only - linear looks wrong for plants unless you can orient it per-leaf
		grad = window.two.makeRadialGradient(xoff, yoff, radius, ...stops );
		// finishing touches
		grad.units = 'userSpaceOnUse'; // super important. alt: 'objectBoundingBox'
		const spreadNum = this.dna.biasedRand( this.dna.geneFor(`${whatfor} gradient repeat`) );
		grad.spread = (spreadNum > 0.66) ? 'pad' : ( spreadNum > 0.33 ? 'reflect' : 'repeat' );	
		if ( flip ) { grad.spread = 'reflect'; }
		return grad;
	}
	
	// this mines the DNA for data
	RehydrateFromDNA() {
		this.traits = {};
		// create a color palette
		this.traits.colors = [];
		const num_colors = 5;
		for ( let i=0; i < num_colors; i++ ) {
			const genes = [];
			for ( let j=0; j < 12; j++ ) {
				genes.push( this.dna.geneFor(`plant color ${i} gene ${j}`) );
			}
			const hue = ( this.dna.mix( genes.slice(0,1), 0.15, 0.55 ) + this.dna.mix( genes.slice(2,3), 0.15, 0.55 ) ) / 2;
			const saturation = this.dna.mix( genes.slice(3,6), 0.20, 0.50 );			
			const lightness = this.dna.mix( genes.slice(6,9), 0.20, 0.55 );			
			const transp = this.dna.mix( genes.slice(9,12), 0.5, 1.0 );
			let arr = utils.hsl2rgb(hue, saturation, lightness);
			arr.push(transp);
			arr = arr.map( c => Math.trunc(c * 255) );
			const color = utils.RGBArrayToHexColor( arr );
			this.traits.colors.push( color );
		}
		
		// fill and stroke colors
		this.traits.fill = this.MakeGeneticColor( 'fill', this.traits.colors );
		this.traits.stroke = this.MakeGeneticColor( 'stroke', this.traits.colors );
		// sane default if we got double transparent
		if ( this.traits.fill == this.traits.stroke ) {
			this.traits.fill = this.traits.colors[0];
			this.traits.stroke = this.traits.colors[1];
		}
				
		// determine the other traits
		this.traits.fruit_hue = this.dna.shapedNumber( [0xBF6670, 0xEC02EA, 0x0A9FB4], 0, 1 );
		this.traits.fruit_size = this.dna.mix( [0xF4F609, 0x04BC7F, 0x25D6B9], 5, 500 );
		this.traits.fruit_interval = this.dna.shapedInt( [0xBABA44, 0x9A1234], 10, 60, 30, 0.5 );
		this.traits.fruit_interval *= 1 + ( this.traits.fruit_size / 150 ); // big fruit takes longer
		this.traits.fruit_edibility = this.dna.mix( [0xC8FC97, 0xFA8070], 0.01, 0.4 );
		this.traits.fruit_lifespan = this.dna.mix( [0x26E100, 0xBACEAB], 20, 150 );
		this.traits.fruit_lifespan *= 1 + ( this.traits.fruit_size / 250 ); // big fruit lasts longer
		this.traits.lifespan = this.dna.shapedInt( [0x9708BE, 0x083DE2, 0x9988AE], 3000, 30000, 10000, 0.1 );
		// this.traits.lifespan = this.dna.shapedInt( [0x9708BE, 0x083DE2, 0x9988AE], 300, 3000, 1000, 0.5 ); // faster for testing
		this.traits.maturity_age_pct = this.dna.shapedNumber( [0xAB8DE9, 0x5591A1], 0, 1, 0.1, 0.5 );
		this.traits.maturity_age = Math.trunc( this.traits.lifespan * this.traits.maturity_age_pct );
		this.traits.max_germ_density = this.dna.shapedNumber( [0xB53691, 0x1FE002], 0, 10, 4, 0.5 );
		this.traits.germ_distance = this.dna.shapedNumber( [0xF3FD38, 0xDAAC47], 10, 1000, 200, 0.5 );
		this.traits.linewidth = this.dna.shapedInt( [0x0C66EA, 0x3D9210], 0, 10 );
		this.traits.growth_overlap_mod = this.dna.shapedNumber( [0x193793, 0x3A9ABB] );
		this.traits.radius = this.dna.shapedInt( [0x2FDDFF, 0x6EB952], 100, 350 );
		this.traits.num_points = this.dna.shapedInt( [0xAAE45D, 0xCFF6A3], 5, 12 );
		this.traits.curved = this.dna.shapedNumber( [0xA4BA9E, 0x425B5C] ) > 0.75;
		this.traits.discreet = this.dna.shapedNumber( [0x8CDCAF, 0xE81243] ) > 0.35;
		this.traits.centered = this.dna.shapedNumber( [0x44C21D, 0x25125F] ) > 0.2;
		this.traits.globular = this.dna.shapedNumber( [0xC02FF0, 0x701C7E] ) > 0.5;
		this.traits.points_slur = this.dna.shapedNumber( [0x62CDEB, 0x101D1C] ) > 0.3;
		this.traits.points_per_shape = this.dna.shapedInt( [0x25C8FB, 0x704D8B], 2, Math.min(4,this.traits.num_points) );
		this.traits.point_increment = this.dna.shapedInt( [0x7716A3, 0xCF3E1D], 1, (this.traits.points_per_shape - ( (this.traits.centered?1:0) + 1)) || 1 );
		this.traits.cap = this.dna.shapedNumber( [0x70D0C5, 0xC3C665] ) > 0.6 ? 'round' : '';
		this.traits.dash1 = this.dna.shapedInt( [0x900F25, 0x8CCD12], 0, 10, 3, 0.95 );
		this.traits.dash2 = this.dna.shapedInt( [0xB07AA4, 0x400FD3], 0, 10, 3, 0.95 );
		this.traits.dashes = [ this.traits.dash1, this.traits.dash2 ];
		this.traits.smeth = this.dna.shapedNumber( [0x1163CD, 0x30FA56] );
		if ( this.traits.smeth < 0.25 ) { this.traits.smeth = 'x'; }
		else if ( this.traits.smeth < 0.5 ) { this.traits.smeth = 'y'; }
		else if ( this.traits.smeth < 0.90 ) { this.traits.smeth = 'a'; }
		else { this.traits.smeth = ''; }
		this.traits.animation_method = (this.traits.centered && this.traits.discreet) ? 'sway' : 'skew';
		
		// when points_per_shape == 2, individual shapes are composed of single lines.
		// we may wish to handle these differently
		const is_linear = this.traits.points_per_shape == 2;
		
		// linear segments may not be transparent - entire plant would disappear
		if ( is_linear && this.traits.stroke === 'transparent' ) {
			this.traits.stroke = this.traits.fill;
			this.traits.fill = 'transparent';
		} 
		
		// if the shape is composed of line segments, turn off curves (which just look like giant ovals)
		// TODO: we can keep curves if we want to fiddle with bezier handles later.
		if ( this.traits.linewidth && is_linear ) { 
			const multiplier = Math.round( this.dna.mix( [0xA23456], 2, 6 ) );
			this.traits.linewidth *= multiplier;
		}
				
		this.points = [];
		this.shapes = [];
		
		// shimmed in to make it work. eventually move everything to "traits" data structure
		this.maturity_age = this.traits.maturity_age;
		this.lifespan = this.traits.lifespan;
		this.fruit_hue = this.traits.fruit_hue;
		this.fruit_interval = this.traits.fruit_interval;
	}	
	CreateBody() {
		const t = this.traits; // alias for cleanliness
		
		// create shapes by iterating over points in different ways
		const shapes = [];
				
		// points are truly random, not derived from DNA
		for ( let i=0; i < t.num_points; i++ ) {
			this.points.push( [
				utils.RandomInt( -t.radius, t.radius ),
				utils.RandomInt( -t.radius, t.radius )
			]);
		}	
		
		// point sorting
		if ( t.smeth == 'x' ) { this.points.sort( this.SortByX ); }
		else if ( t.smeth == 'y' ) { this.points.sort( this.SortByX ); }
		else if ( t.smeth == 'a' ) { this.points.sort( this.SortByAngle ); }
				
		// if the shape is "centered", it threads all points back through the center
		// when creating individual sub-shapes (petals), creating an aster-like pattern.
		
		// slur the points around.
		// TODO: there are lots of fun ways we could do this in the future.
		// For now, "slur" just means shift all points upwards to make an upright plant.
		if ( t.points_slur ) {
			this.points = this.points.map( p => [ p[0], p[1] - t.radius * 2 ] );
		}
		
		// label all of the points with an ID number - we can use this to animate growth later
		for ( let i=0; i < this.points.length; i++ ) { this.points[i][2] = i+1; }
		
		// if the shape is NOT centered, use the center point as a starting point
		if ( !t.centered ) { this.points.unshift([0,0,0]); }
		
		// if the shape is "centered", we automatically insert the center point
		// to begin each shape. Center points are in addition to existing points,
		// so we need to conditionally subtract one from many of the following calculations.
		const subtract_one = t.centered ? 1 : 0;
		
		// points per shape only applies if we are going to create individual shapes
		
		// point increments determines how many indexes to skip when iterating through the point array.
		// skipping fewer points creates overlapping shapes. Skipping more creates separate, discontinuous shapes.
		
		// create discreet shapes
		if ( t.discreet ) {
			for ( let i=0; i < this.points.length - (t.points_per_shape-subtract_one); i += t.point_increment ) {
				const slice = this.points.slice( i, i + ( t.points_per_shape - subtract_one ) );
				slice.sort( this.SortByAngle ); // not required but usually aesthetically better
				if ( t.centered ) { slice.unshift([0,0,0]); } // start from zero on every shape
				shapes.push(slice);
			}
		}
		
		// create a single continuous shape
		else {
			shapes[0] = [];
			const points_per_shape = t.globular ? this.points.length : t.points_per_shape ;
			const point_increment = t.globular ? this.points.length : t.point_increment ;
			for ( let i=0; i < this.points.length - (points_per_shape-(1+subtract_one)); i += point_increment ) {
				const slice = this.points.slice( i, i + ( points_per_shape - subtract_one ) );
				if ( t.centered ) { slice.unshift([0,0,0]); } // start from zero on every loop
				shapes[0].push(...slice);
			}
		}
				
		// create the final SVG shape(s)
		for ( let points of shapes ) {
			let anchors = points.map( p => new Two.Anchor( p[0], p[1] ) );
			let shape = window.two.makePath(anchors);
			// label the vertices for animation later
			for ( let i=0; i < shape.vertices.length; i++ ) {
				shape.vertices[i].label = points[i][2];
			}
			shape.fill = t.fill;
			shape.stroke = t.stroke;
			shape.linewidth = t.linewidth;
			shape.curved = t.curved;
			if ( t.dashes ) shape.dashes = t.dashes;		
			if ( t.cap ) shape.cap = t.cap;		
			this.geo.add( shape );
		}
	}
	UpdatePointsByGrowth( force=false ) {
		if ( !window.vc.animate_plants || window.vc.simulation.turbo ) { return; }
		// if plant is near end of lifespan, start fading out
		const old_age_pct = 0.98;
		if ( this.age > this.lifespan * old_age_pct ) {
			let diff = this.age - ( this.lifespan * old_age_pct );
			let pct = diff / ( this.lifespan * (1-old_age_pct) );
			this.geo.opacity = 1-pct;
			return;
		}
		if ( this.age > this.maturity_age && !force ) { return; }
		if ( !this.last_growth_update ) { this.last_growth_update = this.age; }
		if ( this.age - this.last_growth_update < window.vc.plant_growth_animation_step ) { return; }
		this.last_growth_update = this.age;
		const maturity = this.maturity_age / this.lifespan;
		const age = this.age / this.lifespan;
		const growth = (age >= maturity) ? 1 : (age / maturity);
		if ( window.vc.plant_intro_method == 'grow' ) { 
			const n = this.points.length;
			// create a map of where each point should be right now
			const pts = this.points.map( (p,i) => {
				const start = (1/n) * i * this.traits.growth_overlap_mod;
				const end = start + (1/n) / this.traits.growth_overlap_mod;
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
		// fade in
		else {
			this.geo.opacity = growth;
		}
	}	
	SortByY(a,b) { return b[1] - a[1]; }
	SortByX(a,b) { return b[0] - a[0]; }
	SortByAngle(a,b) { Math.atan2(b[1],b[0]) - Math.atan2(a[1],[0]); }
	RandomizeAge() {
		this.age = this.lifespan * Math.random();
		this.next_fruit = Math.floor( this.age + this.fruit_interval * Math.random() );
		this.UpdatePointsByGrowth(true);
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
		const c3 = utils.RandomColor(true,true,false) ;
		const stops = [ 
			new Two.Stop(0, c1),
			new Two.Stop(utils.BiasedRand(0.1,1.0,0.8,0.8), c2),
			new Two.Stop(1, c3),
		]
		const grad = window.two.makeRadialGradient(0.5, 1, 1, ...stops );
		grad.units = 'objectBoundingBox'; // userSpaceOnUse
		return grad;
	}	
}
Plant.PlantTypes.DNAPlant = DNAPlant;

export class PendantLettuce extends Plant {
	constructor(x=0, y=0) {
		super(x,y);
		this.type = 'PendantLettuce'; // avoids JS classname mangling
		if ( !this.fruit_interval ) { this.fruit_interval = utils.RandomInt(30,40); }
		if ( !this.next_fruit ) { this.next_fruit = this.fruit_interval / ( window.vc?.simulation?.settings?.fruiting_speed || 1 ); }
		if ( !this.fruit_hue ) { this.fruit_hue = utils.RandomFloat(0.25,0.35);	}
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
			this.next_fruit = this.age + this.fruit_interval / ( window.vc?.simulation?.settings?.fruiting_speed || 1 );
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
Plant.PlantTypes.PendantLettuce = PendantLettuce;

export class VectorGrass extends Plant {
	constructor(x=0, y=0) {
		super(x,y);
		this.type = 'VectorGrass'; // avoids JS classname mangling
		if ( !this.fruit_interval ) { this.fruit_interval = utils.RandomInt(20,30); }
		if ( !this.next_fruit ) { this.next_fruit = this.fruit_interval / ( window.vc?.simulation?.settings?.fruiting_speed || 1 ); }
		if ( !this.fruit_hue ) { this.fruit_hue = utils.RandomFloat(0.55,0.8); }
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
			this.next_fruit = this.age + this.fruit_interval / ( window.vc?.simulation?.settings?.fruiting_speed || 1 );
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
Plant.PlantTypes.VectorGrass = VectorGrass;

export class WaveyVectorGrass extends Plant {
	constructor(x=0, y=0) {
		super(x,y);
		this.type = 'WaveyVectorGrass'; // avoids JS classname mangling
		if ( !this.fruit_interval ) { this.fruit_interval = utils.RandomInt(45,60); }
		if ( !this.next_fruit ) { this.next_fruit = this.fruit_interval / ( window.vc?.simulation?.settings?.fruiting_speed || 1 ); }
		if ( !this.fruit_hue ) { this.fruit_hue = utils.RandomFloat(0.05,0.20); }
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
			this.next_fruit = this.age + this.fruit_interval / ( window.vc?.simulation?.settings?.fruiting_speed || 1 );
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
Plant.PlantTypes.WaveyVectorGrass = WaveyVectorGrass;

export class PointCloudPlant extends Plant {
	constructor(x=0, y=0) {
		super(x,y);
		this.type = 'PointCloudPlant'; // avoids JS classname mangling
		if ( !this.fruit_interval ) { this.fruit_interval = utils.RandomInt(30,120); }
		if ( !this.next_fruit ) { this.next_fruit = this.fruit_interval / ( window.vc?.simulation?.settings?.fruiting_speed || 1 ); }
		if ( !this.fruit_hue ) { this.fruit_hue = Math.random(); }
		if ( !this.lifespan ) { this.lifespan = utils.RandomFloat(30, 300); }
		if ( !this.growth_overlap_mod ) { this.growth_overlap_mod = Math.random(); }
		if ( !this.maturity_age ) { this.maturity_age = utils.RandomFloat( 0.1 * this.lifespan, 0.5 * this.lifespan ); }
		
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
			this.next_fruit = this.age + this.fruit_interval / ( window.vc?.simulation?.settings?.fruiting_speed || 1 );
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
Plant.PlantTypes.PointCloudPlant = PointCloudPlant;

const plantPicker = new utils.RandomPicker( [
	[ PendantLettuce, 	50 ],
	[ VectorGrass, 		150 ],
	[ WaveyVectorGrass, 50 ],
	[ DNAPlant, 250 ],
] );

export function RandomPlant(x=0,y=0) {
	const type = plantPicker.Pick();
	return new type(x,y);
}
	