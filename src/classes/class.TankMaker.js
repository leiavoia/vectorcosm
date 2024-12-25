import Two from "two.js";
import * as utils from '../util/utils.js';
import Rock from '../classes/class.Rock.js';
import Delaunator from 'delaunator';
import {forEachVoronoiCell, trimPolygon} from '../util/utils.delaunay.js';

export default class TankMaker {
	
	constructor( tank, settings ) {
		this.tank = tank;
		this.settings = {
			rock_strat: ['individual','voronoi'].pickRandom(),
			individual_num_rocks: utils.RandomInt( 3, 15 ),
			individual_blunt: (Math.random() > 0.7),
			individual_margin: 150,
			individual_separate: (Math.random() > 0.5),
			individual_max_complexity: 2,
			voronoi_points: utils.RandomInt( 20, 80 ),
			voronoi_mask_strat: ['zone','xzone','random','hole','burg','sine','depth','cave','trench'].pickRandom(),
			voronoi_sine_freq: utils.RandomFloat(0.5,20),
			voronoi_sine_amplitude: utils.RandomFloat(0.05,0.4),
			voronoi_sine_vshift: utils.RandomFloat(0.0,0.45),
			voronoi_sine_hshift: utils.RandomFloat(0,1),
			voronoi_mask_random_chance: 0.26,
			voronoi_max_complexity: 2,
			voronoi_point_strategy: ['random','square','hex'].pickRandom(),
			voronoi_point_slur: (Math.random() > 0.5), // enables number shaping. it rolls random numbers by itself
			voronoi_point_jitter: (Math.random() * 0.7), // geometric shapes break down over 0.5
			scale_x: utils.RandomFloat( 0.5, 5 ),
			scale_y: utils.RandomFloat( 0.5, 5 ),
			skew_x: (Math.random() > 0.75 ? Math.random()*2 : 0),
			rock_color_scheme: null,
			add_centerpiece_rocks: false,
			add_substrate: false,
			visualize: false
		};
		Object.assign( this.settings, settings );
	}
	
	Make() {
		// if the rock theme is null, chance to pick a homogenous theme
		if ( this.settings.rock_color_scheme === null && Math.random() > 0.7 ) {
			this.settings.rock_color_scheme = Object.keys(Rock.color_schemes).pickRandom();
		}
		
		// make rocks according to general strategy selected. If nothing selected, pick one at random.
		const rock_strats = {
			voronoi: this.MakeVoronoiRocks,
			individual: this.MakeIndividualRocks,
		}
		let rock_strat = this.settings.rock_strat;
		if ( !(rock_strat in rock_strats) ) { rock_strat = 'random'; }
		if ( !this.settings.rock_strat || this.settings.rock_strat==='random' ) {
			rock_strat = Object.keys(rock_strats).pickRandom();
		}
		rock_strats[rock_strat].call(this);
		
		// make sure we got something. fall back to something we know produces results
		if ( this.tank.obstacles.length==0 ) {
			this.MakeIndividualRocks();
		}
		
		// substrate
		if ( this.settings.add_substrate ) {
			this.tank.MakePrettyDecor();
		}
		
		// centerpiece rocks
		if ( this.settings.add_centerpiece_rocks ) {
			this.tank.MakePrettyDecor();
		}
		
		// find safe spawning points for plants and boids
		this.tank.FindSafeZones();
		
		// plants grow on rocks, so resetting rocks resets plants too
		if ( window.vc.simulation ) {
			window.vc.simulation.SetNumPlants(window.vc.simulation.settings.num_plants || 0);	
		}
	}
	
	MakeIndividualRocks() {
		const num_rocks = this.settings.individual_num_rocks;
		this.tank.obstacles.forEach( x => x.Kill() );
		this.tank.obstacles.length = 0;	
		if ( num_rocks ) {
			let margin = this.settings.individual_margin ?? 150;
			const xscale = utils.RandomFloat(0.2,1.2);
			const yscale = 1.4-xscale;
			const blunt = this.settings.individual_blunt;
			const max_size = Math.min( this.tank.width*0.6, this.tank.height*0.6 );
			const min_size = Math.max( max_size * 0.05, 150 );
			for ( let i =0; i < num_rocks; i++ ) {
				let rock = new Rock( {
					x: utils.RandomInt(margin,this.tank.width-margin)-200, 
					y: utils.RandomInt(margin,this.tank.height-margin)-150, 
					w: xscale * utils.MapToRange( utils.shapeNumber( Math.random(), 0, 1, 0.75, 1.5 ), 0, 1, min_size, max_size ), 
					h: yscale * utils.MapToRange( utils.shapeNumber( Math.random(), 0, 1, 0.5, 1.5 ), 0, 1, min_size, max_size ), 
					complexity: utils.RandomInt(0,this.settings.individual_max_complexity),
					new_points_respect_hull: false,
					blunt,
					color_scheme: this.settings.rock_color_scheme
				})
				this.tank.obstacles.push(rock);
			}
			if ( this.settings.individual_separate ) {
				this.tank.SeparateRocks(margin); // TODO: move this to TankMaker
			}
		}
	}
	
	MakeVoronoiRocks() {
		// Delaunator does not extend boundaries around the outside to the edge of the tank. 
		// Instead of doing math, just make the point space bigger than the tank space.
		const num_points = this.settings.voronoi_points;
		const margin = 0.1;
		let xmin = -( this.tank.width * margin );
		let xmax =  ( this.tank.width * margin ) + (this.settings.scale_x * this.tank.width);
		let ymin = -( this.tank.height * margin );
		let ymax =  ( this.tank.height * margin ) + (this.settings.scale_y * this.tank.height);
		// geometric point strategies need a little extra room on the ends for overrun
		if ( this.settings.voronoi_point_strategy!='random' ) {
			xmax += this.tank.width * margin;
			ymax += this.tank.height * margin;
		}
		const x_focus = Math.random();
		const y_focus = Math.random();
		const x_expo = utils.RandomFloat( 0.4, 2.0 );
		const y_expo = utils.RandomFloat( 0.4, 2.0 );
		let pts = [];
		
		// random points
		if ( this.settings.voronoi_point_strategy == 'random' ) {
			// guaranteed corners produce more uniform results
			pts.push([xmin,ymin]);
			pts.push([xmax,ymin]);
			pts.push([xmax,ymax]);
			pts.push([xmin,ymax]);
			for ( let i=0; i<num_points; i++ ) {
				pts.push([ 
					utils.shapeNumber( xmin + Math.random() * (xmax-xmin), xmin, xmax, x_focus, x_expo ),
					utils.shapeNumber( ymin + Math.random() * (ymax-ymin), ymin, ymax, y_focus, y_expo ) 
				]);
			}
		}
		
		// square geometric points
		else if ( this.settings.voronoi_point_strategy == 'square' ) {
			let total_volume =  (ymax-ymin) * (xmax-xmin);
			let cell_volume = total_volume / ( num_points * 1.5 ); // 1.5 accounts for padding - we could be more accurate but whatever
			let size = Math.sqrt(cell_volume);
			let xnum = Math.ceil( (xmax-xmin) / size );
			let ynum = Math.ceil( (ymax-ymin) / size );
			let maxjitter = utils.Clamp( this.settings.voronoi_point_jitter, 0, 0.5 );
			for ( let i=0; i<xnum; i++ ) {
				for ( let j=0; j<ynum; j++ ) {
					let xjitter = Math.random() * maxjitter * ( (xmax-xmin) / xnum );
					let yjitter = Math.random() * maxjitter * ( (ymax-ymin) / ynum );
					pts.push([ 
						( xmin + (i/xnum) * (xmax-xmin) ) + xjitter,
						( ymin + (j/ynum) * (ymax-ymin) ) + yjitter 
					]);
				}
			}
		}
		
		// hexagonal points
		else if ( this.settings.voronoi_point_strategy == 'hex' ) {
			let total_volume =  (ymax-ymin) * (xmax-xmin);
			let cell_volume = total_volume / ( num_points * 2 );
			let xsize = Math.sqrt(cell_volume) * ( (xmax-xmin) / (ymax-ymin) );
			let ysize = Math.sqrt(cell_volume) * ( (ymax-ymin) / (xmax-xmin) );
			let xnum = Math.ceil( (xmax-xmin) / (xsize) );
			let ynum = Math.ceil( (ymax-ymin) / (ysize) );
			let maxjitter = utils.Clamp( this.settings.voronoi_point_jitter, 0, 0.5 );
			const spacing = Math.max( (xmax-xmin) / xnum, (ymax-ymin) / ynum );
			const verticalSpacing = Math.sqrt(3) / 2 * spacing;
			xnum = (xmax-xmin) / spacing;
			ynum = (ymax-ymin) / verticalSpacing + 1;
			for (let y = 0; y < ynum; y++) {
				for (let x = 0; x < xnum; x++) {
					// if ( Math.random() < maxjitter * 0.5 ) { continue; } // shoot a blank
					const xOffset = (y % 2 === 0) ? 0 : spacing / 2; // Stagger every second row
					const pointX = xmin + x * spacing + xOffset;
					const pointY = ymin + y * verticalSpacing;
					const xjitter = Math.random() * maxjitter * ( (xmax-xmin) / xnum );
					const yjitter = Math.random() * maxjitter * ( (ymax-ymin) / ynum );
					pts.push([ 
						pointX + xjitter,
						pointY + yjitter
					]);
				}
			}
		}

		// remove points out of bounds
		pts = pts.filter( p => p[0] >= xmin && p[0] <= xmax && p[1] >= ymin && p[1] <= ymax );
		
		// slur the points
		if ( this.settings.voronoi_point_slur ) {
			for ( let i=0; i<pts.length; i++ ) {
				if ( pts[i][0] > xmin && pts[i][0] < xmax ) {
					pts[i][0] = utils.shapeNumber( pts[i][0], xmin, xmax, x_focus, x_expo );
				}
				if ( pts[i][1] > ymin && pts[i][1] < ymax ) {
					pts[i][1] = utils.shapeNumber( pts[i][1], ymin, ymax, y_focus, y_expo );
				}
			}
		}
			
		// points visualization
		if ( this.settings.visualize ) {
			pts.forEach( p => {
				let c = window.two.makeCircle( p[0], p[1], 10);
				c.fill = 'orange';
				c.stroke = 'transparent';
				window.vc.AddShapeToRenderLayer(c, +2);	
			});
		}
		
		// define cell masking strategies for artistic effect
		const cellMaskFuncs = {
			random: ( px, py ) => {
				return Math.random() < this.settings.voronoi_mask_random_chance;
			},
			sine: ( px, py ) => {
				const x = (px-xmin) / (xmax-xmin);
				const y = (py-ymin) / (ymax-ymin);
				let z = Math.sin( ( ( x + this.settings.voronoi_sine_hshift ) * ( this.settings.voronoi_sine_freq ) ) )
					* this.settings.voronoi_sine_amplitude + this.settings.voronoi_sine_vshift;
				return (1-z) < y;
			},
			depth: ( px, py ) => {
				const y = (py-ymin) / (ymax-ymin);
				return Math.pow( Math.random(), 0.5 ) < y;
			},
			cave: ( px, py ) => {
				let y = (py-ymin) / (ymax-ymin);
				y = Math.abs( y - 0.5 ) * 2;
				return Math.pow( Math.random(), 0.5 ) < y;
			},
			trench: ( px, py ) => {
				let x = (px-xmin) / (xmax-xmin);
				x = Math.abs( x - 0.5 ) * 2;
				return Math.pow( Math.random(), 0.5 ) < x;
			},
			burg: ( px, py ) => {
				let y = (py-ymin) / ((ymax-( this.tank.width * margin * 0.5 ))-ymin);
					y = Math.abs( y - 0.5 ) * 2;
				let x = (px-xmin) / ((xmax-( this.tank.width * margin * 0.5 ))-xmin);
					x = Math.abs( x - 0.5 ) * 2;
				let r = 1 - 5 * Math.pow( (y+x)/2, 1.8 );
				r += ( Math.random() * 0.7 ) - 0.35;
				return y < r && x < r;
			},
			hole: ( px, py ) => {
				let y = (py-ymin) / ((ymax-( this.tank.width * margin * 0.5 ))-ymin);
					y = Math.abs( y - 0.5 ) * 2;
				let x = (px-xmin) / ((xmax-( this.tank.width * margin * 0.5 ))-xmin);
					x = Math.abs( x - 0.5 ) * 2;
				let r = 1 - 5 * Math.pow( (y+x)/2, 3 );
				r += ( Math.random() * 0.7 ) - 0.35;
				return !(y < r && x < r);
			},
			zone: ( px, py ) => {
				if ( !this.zone_boxes ) {
					this.zone_boxes = [];
					let n = utils.RandomInt(2,4);
					const tankw = xmax - xmin;
					const tankh = ymax - ymin;
					for ( let i=0; i<n; i++ ) {
						let m = 0.28;
						let r = Math.random() * m;
						let w = ( tankw * r ) + tankw * 0.2 ;
						let h = ( tankh * m-r ) + tankh * 0.2 ;
						this.zone_boxes.push({
							x: ( tankw * Math.random() ) - ( w * 0.5 ),
							y: ( tankh * Math.random() ) - ( h * 0.5 ),
							w,
							h
						});
					}
				}
				const veto_chance = 0.3;
				if ( Math.random() < veto_chance ) { return Math.random() > 0.5; }
				for ( let box of this.zone_boxes ) {
					let inside = px >= box.x && px <= box.x + box.w && py >= box.y && py <= box.y + box.h;
					if ( inside ) { return true; }
				}
				return false;
			},
			xzone: ( px, py ) => {
				if ( !this.zone_boxes ) {
					this.zone_boxes = [];
					let n = utils.RandomInt(5,8);
					const tankw = xmax - xmin;
					const tankh = ymax - ymin;
					for ( let i=0; i<n; i++ ) {
						let m = 0.4;
						let r = Math.random() * m;
						let w = ( tankw * r ) + tankw * 0.2 ;
						let h = ( tankh * m-r ) + tankh * 0.2 ;
						this.zone_boxes.push({
							x: ( tankw * Math.random() ) - ( w * 0.5 ),
							y: ( tankh * Math.random() ) - ( h * 0.5 ),
							w,
							h
						});
					}
				}
				const veto_chance = 0.1;
				if ( Math.random() < veto_chance ) { return Math.random() > 0.5; }
				for ( let box of this.zone_boxes ) {
					let inside = px >= box.x && px <= box.x + box.w && py >= box.y && py <= box.y + box.h;
					if ( inside ) { return false; }
				}
				return true;
			}
		};
		
		// choose the cell mask strategy
		let cellMaskFunc = cellMaskFuncs.random;
		if ( this.settings.voronoi_mask_strat in cellMaskFuncs ) {
			cellMaskFunc = cellMaskFuncs[this.settings.voronoi_mask_strat];
		}
			
		// calculate voronoi cells
		const delaunay = Delaunator.from(pts);
		
		// create rocks from each voronoi cell according to mask
		let cells =[];
		forEachVoronoiCell(pts, delaunay, ( vertices, px, py ) => {

			// apply cell mask to determine if it becomes a rock
			if ( !cellMaskFunc(px,py) ) { return false; }
						
			// discard hairline artifact shapes too small to see clearly
			let least_x = 1000000000;
			let most_x = -1000000000;
			let least_y = 1000000000;
			let most_y = -1000000000;
			for ( let v of vertices ) {
				if ( v[0] < least_x ) { least_x = v[0]; }
				if ( v[0] > most_x ) { most_x = v[0]; }
				if ( v[1] < least_y ) { least_y = v[1]; }
				if ( v[1] > most_y ) { most_y = v[1]; }
			}
			if ( Math.abs( most_x - least_x ) < 10 ) { return; }
			if ( Math.abs( most_y - least_y ) < 10 ) { return; }

			// hack: if using hex strategy, discard ugly artifact shapes
			if ( this.settings.voronoi_point_strategy == 'hex' ) {
				if ( vertices.length <= 3 ) { return false; }
			}
					
			// apply skew
			vertices = vertices.map( v => {
				const depth = 1 - ( (v[1]-ymin) / (ymax-ymin) ); // bottom stays, top moves
				const max_shift = Math.min( (ymax-ymin), (xmax-xmin) ) * this.settings.skew_x;
				const scale = Math.abs( ( (xmax-xmin) + max_shift ) / (xmax-xmin) );
				const skew = max_shift * depth;
				return [ 
					v[0] * scale + skew - max_shift, 
					v[1]
				] } 
			);
			
			// rescale vertices back to normal tank dimensions, undoing previous stretching
			vertices = vertices.map( v => [ 
				v[0]/this.settings.scale_x, 
				v[1]/this.settings.scale_y
			] );
			
			// optional voronoi visualization
			if ( this.settings.visualize ) {
				let anchors = vertices.map( p => new Two.Anchor( p[0], p[1] ) );
				let path = window.two.makePath(anchors);
				path.fill = 'transparent';
				path.stroke = utils.RandomColor( true, false, true ); 
				path.linewidth = 20;		
				window.vc.AddShapeToRenderLayer(path, +2);	
			}
			
			// keep rocks entirely within bounds
			const w = this.tank.width;
			const h = this.tank.height;
			vertices = trimPolygon( vertices, 0, h, 0, 0 ); // up
			vertices = trimPolygon( vertices, w, h, 0, h ); // left
			vertices = trimPolygon( vertices, w, 0, w, h ); // down
			vertices = trimPolygon( vertices, 0, 0, w, 0 ); // right
			if ( !vertices.length ) { return false; }
			
			cells.push(vertices);
		});
		
		// create rocks and insert into tank
		cells.forEach( vertices => {
			// find the left and topmost points, and give the rock x/y offset
			let leftmost = this.tank.width;
			let topmost = this.tank.height;
			for ( let v of vertices ) {
				if ( v[0] < leftmost ) { leftmost = v[0]; }
				if ( v[1] < topmost ) { topmost = v[1]; }
			}
			vertices = vertices.map( v => [ v[0]-leftmost, v[1]-topmost ] );
			// insert
			this.tank.obstacles.push(
				new Rock( { 
					x: leftmost,
					y: topmost,
					hull: vertices,
					force_corners: false,
					complexity: utils.RandomInt(0,this.settings.voronoi_max_complexity),
					new_points_respect_hull: true,
					color_scheme: this.settings.rock_color_scheme
				}),
			);
		})
		
	}
}
