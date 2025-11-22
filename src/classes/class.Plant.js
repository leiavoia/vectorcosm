import * as utils from '../util/utils.js'
import Food from '../classes/class.Food.js'
import DNA from '../classes/class.DNA.js'

export default class Plant {
	static PlantTypes = new Map;
	constructor(params) {
		this.oid = ++globalThis.vc.next_object_id;
		this.type = 'Plant'; // avoids JS classname mangling
		this.x = 0;
		this.y = 0;
		this.dna = 128; // random chars
		this.generation = 1;
		this.dead = false;
		this.age = 0;
		this.perma = false;
		this.lifespan = 100000000;
		this.fruit_interval = 30; // sane defaults
		this.next_fruit = 30; // sane defaults
		// first param can be JSON to rehydrate entire object from save
		if ( typeof params === 'object' ) {
			Object.assign(this,params);
		}
	}
	Kill() {
		// this.geo.remove();
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
		let datakeys = ['x','y','fruit_interval','age','lifespan',
			'next_fruit','maturity_age','growth_overlap_mod','dna','generation'];		
		for ( let k of datakeys ) { 
			if ( this.hasOwnProperty(k) ) { 
				output[k] = this[k];
			} 
 		}
		if ( as_JSON ) { output = JSON.stringify(output); }
		return output;
	}
	PlantIsInFrame() { true; }
	Animate( delta ) {}		
	CreateGeometricBody( points ) {}
	GeoData() {
		return {
			type:'rect',
			fill: 'transparent',
			stroke: 'lime',
			linewidth: 2,
			w:100,
			h:100,
			rotation: Math.PI/4
		};
	}
}

export class DNAPlant extends Plant {
	constructor(params) {
		super(params);
		this.type = 'DNAPlant'; // avoids JS classname mangling
		this.dna = new DNA( this.dna ); // will either be number of chars, or full string if rehydrating
		this.RehydrateFromDNA();
		this.CreateBody();
	}
	Update(delta) {
		super.Update(delta);
		if ( this.dead ) { return; }
		
		// current plant class has hacks in to ignore death
		if ( !this.perma && this.age >= this.lifespan ) {
			// chance to live a while longer
			if ( Math.random() < 0.002 ) {
				this.Kill();
				return false;
			}
		}
		
		// make berries
		if ( this.age > this.traits.maturity_age && this.age > this.next_fruit ) {
			let max_fudge = this.fruit_interval * 0.20;
			let fudge = ( Math.random() * max_fudge ) - ( max_fudge / 2 );
			this.next_fruit = this.age + fudge + ( this.fruit_interval / ( globalThis.vc?.simulation?.settings?.fruiting_speed || 1 ) );
			if ( globalThis.vc.tank.foods.length < globalThis.vc.max_foods ) {
				// pick a random vertex to spawn from
				for ( let n=0; n < this.traits.fruit_num; n++ ) {
					// let vertex = this.geo.children.pickRandom().vertices.pickRandom();
					// const f = new Food( this.x + ( vertex.x * 0.35 ) , this.y + ( vertex.y * 0.35 ) , { 
					const f = new Food( this.x, this.y, { 
						value: ( this.traits.fruit_size * ( 1 - (Math.random() * 0.1 ) ) ), 
						lifespan: ( this.traits.fruit_lifespan * ( 1 - (Math.random() * 0.2 ) ) ),
						buoy_start: this.traits.fruit_buoy_start + ( 100 - (200 * Math.random()) ),
						buoy_end: this.traits.fruit_buoy_end + ( 100 - (200 * Math.random()) ),
						nutrients: this.traits.fruit_nutrients,
						complexity: this.traits.fruit_complexity,
						vx: utils.RandomFloat(100,1000), // boing!
						vy: utils.RandomFloat(100,1000),
						} );
					// if there is room for more plants in the tank, make it a viable seed
					if ( globalThis.vc.tank.plants.length < globalThis.vc.simulation.settings.num_plants ) {
						let seed = new DNA(	this.dna.str );
						seed.mutate( 2, false );
						f.seed = seed.str;
						f.max_germ_density = this.traits.max_germ_density;
						f.germ_distance = this.traits.germ_distance;
					}
					globalThis.vc.tank.foods.push(f);
				}
			}
		}
		
		this.Animate(delta);	
	}
		
	MakeGeneticColor( whatfor, colors ) {
		let num_colors = Math.round( this.dna.mix( this.dna.genesFor(`plant ${whatfor} num colors gene 2`,2,1), 0, colors.length ) );
		
		// transparent
		if ( num_colors===0 ) {
			return 'transparent';
		}
		
		// single color
		if ( num_colors===1 ) {
			let index = Math.round( this.dna.mix( this.dna.genesFor(`plant ${whatfor} color index 0 `,2,1), 0, colors.length-1 ) );
			return colors[index];
		}
		
		// gradient
		let stops = [];
		for ( let i=0; i < num_colors; i++ ) {
			let index = Math.round( this.dna.mix( this.dna.genesFor(`plant ${whatfor} color index ${i}`,2,1), 0, colors.length-1 ) );
			let stop_at = this.dna.mix( this.dna.genesFor(`plant ${whatfor} stop index ${i}`,2,1), 0, 1 );
			let stop = [stop_at, colors[index]];
			stops.push(stop);		
		}
		
		// sort the stops by ascending stop value
		stops.sort( (a,b) => a[0] - b[0] );
		
		// make sure we have stops on 0 and 1
		stops[0][0] = 0;
		stops[ stops.length-1 ][0] = 1;
		
		// whacky stuff we copied from boid BodyPlans
		const length = this.dna.shapedNumber( this.dna.genesFor(`${whatfor} gradient length`,2,1), 100, 1000 );
		const width = this.dna.shapedNumber( this.dna.genesFor(`${whatfor} gradient width`,2,1), 100, 1000 );
		const longest_dim = Math.max(length,width);
		let xoff = this.dna.shapedNumber( this.dna.genesFor(`${whatfor} gradient xoff`,2,1), -length/2, length/2 );
		let yoff = 0;
		let radius = this.dna.shapedNumber( this.dna.genesFor(`${whatfor} gradient radius`,2,1), longest_dim/10, longest_dim, longest_dim, 2.5 );
		const flip = this.dna.shapedNumber( this.dna.genesFor(`${whatfor} gradient axis flip`,2,1) ) < 0.33;
		// radial gradients only - linear looks wrong for plants unless you can orient it per-leaf
		let grad = {type:'radial', xoff, yoff, radius, stops, units:'userSpaceOnUse' };
		const spreadNum = this.dna.shapedNumber( this.dna.genesFor(`${whatfor} gradient repeat`,2,1) );
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
			const genes = this.dna.genesFor(`plant color ${i} g`, 12);
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
		const total_fruit_mass = Math.round( 0.5 * ( 
			this.dna.shapedInt( this.dna.genesFor('total_fruit_mass_1',2), 10, 1000, 120, 3 ) +
			this.dna.shapedInt( this.dna.genesFor('total_fruit_mass_2',1), 10, 1000, 120, 5 ) ) );
		this.traits.fruit_num = this.dna.shapedInt( this.dna.genesFor('fruit_num',1), 1, 10, 1, 4 );
		this.traits.fruit_size = Math.round( total_fruit_mass / this.traits.fruit_num );
		this.traits.fruit_interval = this.dna.shapedInt( this.dna.genesFor('fruit_interval',2), 10, 120, 30, 6 );
		this.traits.fruit_interval = Math.round( this.traits.fruit_interval * (total_fruit_mass / 100) ); // more fruit takes longer
		this.traits.fruit_lifespan = this.dna.mix( this.dna.genesFor('fruit_lifespan',2), 20, 100 );
		this.traits.fruit_lifespan = Math.round( this.traits.fruit_lifespan * (total_fruit_mass / 100) ); // more fruit lasts longer
		this.traits.fruit_buoy_start = this.dna.mix( this.dna.genesFor('fruit_buoy_start',2), -100, 100 );
		this.traits.fruit_buoy_end = this.dna.mix( this.dna.genesFor('fruit_buoy_end',2), -100, 100 );
		this.traits.fruit_complexity = Math.ceil( this.dna.shapedInt( 0x08000000 | this.dna.genesFor('fruit_complexity',1,true), 0, 599, 150, 1.5 ) / 100 );
		this.traits.fruit_nutrients = [
			Math.max( 0, this.dna.mix( this.dna.genesFor('fruit nutrient 1',2,1), -15, 10 ) ),
			Math.max( 0, this.dna.mix( this.dna.genesFor('fruit nutrient 2',2,1), -15, 10 ) ),
			Math.max( 0, this.dna.mix( this.dna.genesFor('fruit nutrient 3',2,1), -15, 10 ) ),
			Math.max( 0, this.dna.mix( this.dna.genesFor('fruit nutrient 4',2,1), -15, 10 ) ),
			Math.max( 0, this.dna.mix( this.dna.genesFor('fruit nutrient 5',2,1), -15, 10 ) ),
			Math.max( 0, this.dna.mix( this.dna.genesFor('fruit nutrient 6',2,1), -15, 10 ) ),
			Math.max( 0, this.dna.mix( this.dna.genesFor('fruit nutrient 7',2,1), -15, 10 ) ),
			Math.max( 0, this.dna.mix( this.dna.genesFor('fruit nutrient 8',2,1), -15, 10 ) ),
		];
		this.traits.lifespan = this.dna.shapedInt( this.dna.genesFor('lifespan',3,1), 3000, 30000, 10000, 2.2 );
		this.traits.maturity_age_pct = this.dna.shapedNumber( this.dna.genesFor('maturity_age_pct',2,1), 0, 1, 0.1, 2 );
		this.traits.maturity_age = Math.trunc( this.traits.lifespan * this.traits.maturity_age_pct );
		this.traits.max_germ_density = this.dna.shapedNumber( this.dna.genesFor('max_germ_density',2,1), 0, 10, 4, 2 );
		this.traits.germ_distance = this.dna.shapedNumber( this.dna.genesFor('germ_distance',2,1), 10, 1000, 200, 2 );
		this.traits.linewidth = this.dna.shapedInt( this.dna.genesFor('linewidth',2,1), 0, 10 );
		this.traits.growth_overlap_mod = this.dna.shapedNumber( this.dna.genesFor('growth_overlap_mod',2,1) );
		this.traits.radius = this.dna.shapedInt( this.dna.genesFor('radius',2,1), 100, 350 );
		this.traits.num_points = this.dna.shapedInt( this.dna.genesFor('num_points',2,1), 5, 12 );
		this.traits.curved = this.dna.shapedNumber( this.dna.genesFor('curved',2,1) ) > 0.75;
		this.traits.discreet = this.dna.shapedNumber( this.dna.genesFor('discreet',2,1) ) > 0.35;
		this.traits.centered = this.dna.shapedNumber( this.dna.genesFor('centered',2,1) ) > 0.2;
		this.traits.globular = this.dna.shapedNumber( this.dna.genesFor('globular',2,1) ) > 0.5;
		this.traits.points_slur = this.dna.shapedNumber( this.dna.genesFor('points_slur',2,1) ) > 0.3;
		this.traits.points_per_shape = this.dna.shapedInt( this.dna.genesFor('points_per_shape',2,1), 2, Math.min(4,this.traits.num_points) );
		this.traits.point_increment = this.dna.shapedInt( this.dna.genesFor('point_increment',2,1), 1, (this.traits.points_per_shape - ( (this.traits.centered?1:0) + 1)) || 1 );
		this.traits.cap = this.dna.shapedNumber( this.dna.genesFor('cap',2,1) ) > 0.6 ? 'round' : '';
		this.traits.dash1 = this.dna.shapedInt( this.dna.genesFor('dash1',1), 0, 10, 3, 2 );
		this.traits.dash2 = this.dna.shapedInt( this.dna.genesFor('dash2',1), 0, 10, 3, 2 );
		this.traits.dashes = [ this.traits.dash1, this.traits.dash2 ];
		if ( this.dna.shapedNumber( this.dna.genesFor('has dashes',2,1), 0, 1 ) > 0.65 ) {
			this.traits.dashes = null;
			this.traits.dash1 = null;
			this.traits.dash2 = null;
		}
		this.traits.smeth = this.dna.shapedNumber( this.dna.genesFor('smeth',2,1) );
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
			const multiplier = Math.round( this.dna.mix( this.dna.genesFor('LWM'), 2, 6 ) );
			this.traits.linewidth *= multiplier;
		}

		// shimmed in to make it work. eventually move everything to "traits" data structure
		this.maturity_age = this.traits.maturity_age;
		this.lifespan = this.traits.lifespan;
		this.fruit_interval = this.traits.fruit_interval;
	}	
	GeoData() {
		return this.geo;
	}		
	CreateBody() {
		const t = this.traits; // alias for cleanliness
		
		// if ( this.geo ) { this.geo.remove( this.geo.children ); }
		
		if ( !this.shapes?.length ) { 
				
			this.points = [];
			this.shapes = [];
			
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
					this.shapes.push(slice);
				}
			}
			
			// create a single continuous shape
			else {
				this.shapes[0] = [];
				const points_per_shape = t.globular ? this.points.length : t.points_per_shape ;
				const point_increment = t.globular ? this.points.length : t.point_increment ;
				for ( let i=0; i < this.points.length - (points_per_shape-(1+subtract_one)); i += point_increment ) {
					const slice = this.points.slice( i, i + ( points_per_shape - subtract_one ) );
					if ( t.centered ) { slice.unshift([0,0,0]); } // start from zero on every loop
					this.shapes[0].push(...slice);
				}
			}
		
		}
			
		// create the final shape
		this.geo = { type:'group', children: [], animation_method:this.traits.animation_method };
		for ( let points of this.shapes ) {
			let shape = { 
				type: 'path',
				points:points,
				fill: t.fill,
				linewidth: t.linewidth,
				stroke: t.stroke,
				curved: t.curved,
			};
			if ( t.dashes ) shape.dashes = t.dashes;		
			if ( t.cap ) shape.cap = t.cap;		
			this.geo.children.push(shape);
		}
	}
	SortByY(a,b) { return b[1] - a[1]; }
	SortByX(a,b) { return b[0] - a[0]; }
	SortByAngle(a,b) { Math.atan2(b[1],b[0]) - Math.atan2(a[1],a[0]); }
	RandomizeAge() {
		this.age = this.lifespan * Math.random();
		this.next_fruit = Math.floor( this.age + this.fruit_interval * Math.random() );
	}	
}
Plant.PlantTypes.DNAPlant = DNAPlant;

export class PendantLettuce extends Plant {
	constructor(params) {
		super(params);
		this.type = 'PendantLettuce'; // avoids JS classname mangling
		this.perma = true; // ignore lifecycle
		this.age = 30; // dodges animation effects
		if ( !this.fruit_interval ) { this.fruit_interval = utils.RandomInt(60,120); }
		if ( !this.next_fruit ) { this.next_fruit = this.fruit_interval / ( globalThis.vc?.simulation?.settings?.fruiting_speed || 1 ); }
		this.CreateBody();
	}
	GeoData() {
		return this.geo;
	}	
	CreateBody() {
		this.geo = { type:'group', children: [], animation_method:'skew' };
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
		const linewidth = utils.BiasedRandInt( 1, 6, 2, 0.95 );
		const tip_hue = utils.RandomFloat(0.25,0.85);
		const tip_color = `hsl(${tip_hue*255},50%,40%)`;
		const stops = [ [0, '#174D1F'], [1, tip_color] ];		
		const grad = { type:'radial', xoff:0, yoff:1, r, stops, units:'userSpaceOnUse' };
		this.geo.children.push({ 
			type: 'path',
			points:pts,
			fill: grad,
			linewidth: linewidth,
			stroke: 'transparent',
			closed:true
		});
		// make the veins
		const dashes = [];
		let num_dashes = utils.RandomInt(0,3);
		for ( let i=0; i < num_dashes; i++ ) {
			dashes.push( utils.RandomInt(linewidth*0,linewidth*10) );
			dashes.push( utils.RandomInt(linewidth*0,linewidth*10) );
		}			
		const vein_stops = [ [0, tip_color], [1, '#66997799'] ];
		const vein_grad = { type:'radial', xoff:0, yoff:1, r, stops:vein_stops, units:'userSpaceOnUse' };
		for ( let p of pts ) { 
			this.geo.children.push({ 
				type: 'line',
				x1:0,
				y1:0,
				x2:p[0],
				y2:p[1],
				fill: 'transparent',
				linewidth: linewidth,
				stroke: vein_grad,
				dashes: dashes,
			});		
		}
		return this.geo;
	}
	Update(delta) {
		super.Update(delta);
		if ( this.dead ) { return; }
		// make berries
		if ( this.age > this.next_fruit ) {
			let max_fudge = this.fruit_interval * 0.20;
			let fudge = ( Math.random() * max_fudge ) - ( max_fudge / 2 );
			this.next_fruit = this.age + fudge + this.fruit_interval / ( globalThis.vc?.simulation?.settings?.fruiting_speed || 1 );
			if ( globalThis.vc.tank.foods.length < globalThis.vc.max_foods ) {
				const f = new Food( this.x, this.y, { 
					value: 120, 
					lifespan: (80 + utils.RandomInt(0,20)),
					vx: utils.RandomFloat(0,25),
					vy: utils.RandomFloat(0,25),
					nutrients: [10,20,25,0,0,0,5,0],
					buoy_start: (100 - ( 200 * Math.random() )),
					buoy_end: (100 - ( 200 * Math.random() )),
					complexity: 3
					} );
				globalThis.vc.tank.foods.push(f);
			}
		}
		this.Animate(delta);
	}
} 
Plant.PlantTypes.PendantLettuce = PendantLettuce;

export class VectorGrass extends Plant {
	constructor(params) {
		super(params);
		this.type = 'VectorGrass'; // avoids JS classname mangling
		this.perma = true; // ignore lifecycle
		this.age = 30; // dodges animation effects
		if ( !this.fruit_interval ) { this.fruit_interval = utils.RandomInt(20,30); }
		if ( !this.next_fruit ) { this.next_fruit = this.fruit_interval / ( globalThis.vc?.simulation?.settings?.fruiting_speed || 1 ); }
		this.CreateBody();
	}
	GeoData() {
		return this.geo;
	}	
	CreateBody() {
		const tip_hue = utils.RandomFloat(0.55,0.8);
		const tip_color = `hsl(${tip_hue*255},85%,75%)`;
		const stops = [ [0, '#697'], [0.68, '#697'], [1, tip_color] ];		
		const grad = { xoff:0, yoff:1, xoff2:0, yoff2:0, stops, units:'objectBoundingBox' };
		const dashes = [2,2];
		// make the unique shapes		
		const n = utils.BiasedRandInt( 1, 5, 3, 0.8 );
		const r = utils.BiasedRandInt( 100, 500, 180, 0.6);
		const max_variance = r*0.3; 
		const spread = 0.25 * Math.PI; 
		const blades = [];
		for ( let i=0; i < n; i++ ) {
			const l = r + utils.RandomInt( -max_variance, max_variance );
			const a = 1.5*Math.PI + utils.BiasedRand( -spread, spread, 0, 0.65 ) ;
			const blade = { 
				type: 'line',
				x1: 0, 
				y1: 0, 
				x2: l * Math.cos(a), 
				y2: l * Math.sin(a), 
				r,
				stroke: grad,
				linewidth: r * utils.BiasedRand( 0.04, 0.2, 0.08, 0.5 ),
				fill: 'transparent',
				dashes: dashes,
			};
			blades.push(blade);
		}
		this.geo = {
			type:'group',
			children: blades,
			animation_method:'legacy_sway'
		};
		return this.geo;
	}
	Update(delta) {
		super.Update(delta);
		if ( this.dead ) { return; }
		// make berries
		if ( this.age > this.next_fruit ) {
			let max_fudge = this.fruit_interval * 0.20;
			let fudge = ( Math.random() * max_fudge ) - ( max_fudge / 2 );
			this.next_fruit = this.age + fudge + this.fruit_interval / ( globalThis.vc?.simulation?.settings?.fruiting_speed || 1 );
			if ( globalThis.vc.tank.foods.length < globalThis.vc.max_foods ) {
				// for ( const b of this.blades ) {
				const num_fruits = utils.RandomInt(1,5);
				for ( let i=0; i < num_fruits; i++ ) {
					const f = new Food( 
						this.x, 
						this.y, 
						{ 
						value: utils.RandomInt(20,50), 
						lifespan: (40 + utils.RandomInt(0,15)),
						nutrients: [0,0,5,20,15,0,0,0],
						complexity: 1,
						vx: utils.RandomFloat(0,25),
						vy: utils.RandomFloat(0,25),
						buoy_start: (100 - ( 200 * Math.random() )),
						buoy_end: (100 - ( 200 * Math.random() )),
						} 
						);
					globalThis.vc.tank.foods.push(f);
				}
			}
		}
		this.Animate(delta);		
	}	
} 
Plant.PlantTypes.VectorGrass = VectorGrass;

export class WaveyVectorGrass extends Plant {
	constructor(params) {
		super(params);
		this.type = 'WaveyVectorGrass'; // avoids JS classname mangling
		this.perma = true; // ignore lifecycle
		this.age = 30; // dodges animation effects
		if ( !this.fruit_interval ) { this.fruit_interval = utils.RandomInt(45,60); }
		if ( !this.next_fruit ) { this.next_fruit = this.fruit_interval / ( globalThis.vc?.simulation?.settings?.fruiting_speed || 1 ); }
		this.CreateBody();
	}
	GeoData() {
		return this.geo;
	}		
	CreateBody() {
		const tip_hue = utils.RandomFloat(0.05,0.20);
		const tip_color = `hsl(${tip_hue*255},85%,75%)`;
		const stops = [ [0, '#243'], [0.68, '#726'], [1, tip_color] ];		
		const grad = { xoff:0, yoff:1, xoff2:0, yoff2:0, stops, units:'objectBoundingBox' };
		const dashes = [2,2];	
		const n = utils.BiasedRandInt( 1, 5, 3, 0.8 );
		const r = utils.BiasedRandInt( 500, 2000, 900, 0.6 );
		const max_variance = r*0.3; 
		const spread = 0.25 * Math.PI; 
		const blades = [];
		for ( let i=0; i < n; i++ ) {
			const l = r + utils.RandomInt( -max_variance, max_variance );
			const a = 1.5*Math.PI + utils.BiasedRand( -spread, spread, 0, 0.65 ) ;
			// create points
			const num_points = utils.RandomInt(3,5);
			const points = [];
			for ( let n=0; n<num_points; n++ ) {
				let l2 = (l/num_points) * n;
				let a2 = 1.5*Math.PI + utils.BiasedRand( -spread/(n||1), spread/(n||1), 0, 0.65 ) ;
				points.push([ l2 * Math.cos(a2), l2 * Math.sin(a2) ]);
			}
			blades.push({ 
				type: 'path',
				points: points,
				stroke: grad,
				linewidth: r * utils.BiasedRand( 0.02, 0.1, 0.03, 0.5 ),
				fill: 'transparent',
				dashes: dashes,
				closed: false,
				curved: true,
			});
		}
		this.geo = {
			type:'group',
			children: blades,
			animation_method:'sway'
		};
		return this.geo;
	}
	Update(delta) {
		super.Update(delta);
		if ( this.dead ) { return; }
		// make berries
		if ( this.age > this.next_fruit ) {
			let max_fudge = this.fruit_interval * 0.20;
			let fudge = ( Math.random() * max_fudge ) - ( max_fudge / 2 );
			this.next_fruit = this.age + fudge + this.fruit_interval / ( globalThis.vc?.simulation?.settings?.fruiting_speed || 1 );
			if ( globalThis.vc.tank.foods.length < globalThis.vc.max_foods ) {
				// for ( const b of this.blades ) {
				const num_fruits = utils.RandomInt(1,5);
				for ( let i=0; i < num_fruits; i++ ) {
					const f = new Food( 
						this.x, 
						this.y, 
						{ 
						value: utils.RandomInt(40,80), 
						lifespan: (40 + utils.RandomInt(0,15)),
						nutrients: [20,0,5,0,0,5,0,50],
						complexity: 2,
						vx: utils.RandomFloat(0,25),
						vy: utils.RandomFloat(0,25),
						buoy_start: (100 - ( 200 * Math.random() )),
						buoy_end: (100 - ( 200 * Math.random() )),
						} 
						);
					globalThis.vc.tank.foods.push(f);
				}
			}
		}
		this.Animate(delta);				
	}	
} 
Plant.PlantTypes.WaveyVectorGrass = WaveyVectorGrass;

const plantPicker = new utils.RandomPicker( [
	[ PendantLettuce, 	50 ],
	[ VectorGrass, 		150 ],
	[ WaveyVectorGrass, 50 ],
	[ DNAPlant, 250 ],
] );

// buffer that holds plants for random remixing to create samey-looking plantscapes
const motherplants = [];

export function RandomPlant(x=0,y=0) {
	const type = plantPicker.Pick();
	// legacy hardcoded plants are like you know whatever
	if ( Plant.PlantTypes.DNAPlant !== type ) { return new type({x,y}); }
	// fun! if we choose DNAPlant, try to make variations on a theme instead of completely random ones
	else {
		let plant;
		let reuse = 0.65;
		// grab a used plant
		if ( motherplants.length && Math.random() < reuse ) { 
			let mother = motherplants.pickRandom();
			let dna = new DNA( mother.dna.str );
			dna.mutate( 2, false );
			plant = new type({dna, x, y}); 
		}
		// create a new plant from scratch
		else {
			plant = new type({x,y}); 
		}
		// cache the plant for reuse
		if ( !motherplants.length || Math.random() > reuse ) { // note inverted comparison
			motherplants.push(plant);
			if ( motherplants.length > 10 ) {
				motherplants.unshift();
			}
		}
		return plant;
	}
}
	