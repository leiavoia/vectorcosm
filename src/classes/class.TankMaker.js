import Two from "two.js";
import * as utils from '../util/utils.js';
import Rock from '../classes/class.Rock.js';
import Delaunator from 'delaunator';
import {forEachVoronoiCell, trimPolygon} from '../util/utils.delaunay.js';

export default class TankMaker {
	
	constructor( tank, settings ) {
		this.tank = tank;
		this.settings = {
			rock_strat: [/* 'individual', */'voronoi'].pickRandom(),
			individual_num_rocks: utils.RandomInt( 3, 15 ),
			individual_blunt: (Math.random() > 0.7),
			individual_margin: 150,
			individual_separate: (Math.random() > 0.5),
			individual_max_complexity: 2,
			voronoi_points: null,
			voronoi_mask_strat: ['radial','zone','xzone','random','hole','burg','sine','depth','cave','trench'].pickRandom(),
			voronoi_sine_freq: utils.RandomFloat(0.5,20),
			voronoi_sine_amplitude: utils.RandomFloat(0.05,0.4),
			voronoi_sine_vshift: utils.RandomFloat(0.0,0.45),
			voronoi_sine_hshift: utils.RandomFloat(0,1),
			voronoi_radial_cycles: utils.RandomInt(1,7),
			voronoi_radial_spin: Math.random(),
			voronoi_radial_center_x: Math.random(), // 0..1
			voronoi_radial_center_y: Math.random(), // 0..1
			voronoi_mask_random_chance: 0.26,
			voronoi_max_complexity: 2,
			voronoi_point_strategy: ['blotch','random','square','hex'].pickRandom(),
			voronoi_point_slur: (Math.random() > 0.5), // enables number shaping. it rolls random numbers by itself
			voronoi_point_jitter: (Math.random() * 0.7), // geometric shapes break down over 0.5
			scale_x: utils.RandomFloat( 0.5, 5 ),
			scale_y: utils.RandomFloat( 0.5, 5 ),
			max_rotation: 0.2,
			crazytown_chance: 0.3,
			max_crazyness: 0.4,
			skew_x: (Math.random() > 0.75 ? Math.random()*2 : 0),
			max_rock_shrinkage: 0.72,
			rock_shrinkage_chance: 0.34,
			rock_color_schemes: [],
			add_centerpiece_rocks: false,
			add_substrate: false,
			visualize: false
		};
		Object.assign( this.settings, settings );
	}
	
	Make() {
		// if no rock themes selected, pick a few
		if ( !this.settings.rock_color_schemes.length ) {
			// how many do we want?
			const num_schemes = utils.RandomInt( 1, 5 );
			// pick random schemes
			this.settings.rock_color_schemes = [];
			for ( let i=0; i<num_schemes; i++ ) {
				let scheme = Object.keys(Rock.color_schemes).pickRandom();
				this.settings.rock_color_schemes.push(scheme); // duplicates okay
			}
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
		if ( globalThis.vc.simulation ) {
			globalThis.vc.simulation.SetNumPlants(globalThis.vc.simulation.settings.num_plants || 0);	
		}
	}
	
	PickRandomRockColor() {
		// rock theme randomly selected from pre-chosen list.
		if ( this.settings.rock_color_schemes.length===1 ) { 
			this.settings.rock_color_schemes[0];	
		}
		// we select an index with a weighted random number.
		// each successive index has a lower chance of being selected.
		const rock_theme_index = utils.BiasedRandInt(0, this.settings.rock_color_schemes.length-1, 0, 1);
		return this.settings.rock_color_schemes[rock_theme_index];	
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
					color_scheme: this.PickRandomRockColor()
				})
				this.tank.obstacles.push(rock);
			}
			if ( this.settings.individual_separate ) {
				this.tank.SeparateRocks(margin); // TODO: move this to TankMaker
			}
		}
	}
	
	MakeVoronoiRocks() {
		// increase the point complexity based on tank volume
		const volume = this.tank.width * this.tank.height;
		const min_num_points = Math.max( 20, Math.ceil( Math.sqrt(volume / 5500 ) ) );
		const max_num_points = Math.max( 80, min_num_points * 3 );
		let num_points = this.settings.voronoi_points;
		if ( !num_points ) {
			num_points = utils.RandomInt( min_num_points, max_num_points );
		}
		// Delaunator does not extend boundaries around the outside to the edge of the tank. 
		// Instead of doing math, just make the point space bigger than the tank space.
		const margin = 0.1;
		let xmin = -( this.tank.width * margin );
		let xmax =  ( this.tank.width * margin ) + (this.settings.scale_x * this.tank.width);
		let ymin = -( this.tank.height * margin );
		let ymax =  ( this.tank.height * margin ) + (this.settings.scale_y * this.tank.height);
		// geometric point strategies need a little extra room on the ends for overrun
		if ( ['square','hex'].contains(this.settings.voronoi_point_strategy) ) {
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
		
		// blotch
		else if ( this.settings.voronoi_point_strategy == 'blotch' ) {
			let num_blotches = utils.RandomInt( 2, 5 );
			// create a number of circular regions (blotches).
			// each blotch has an x, y, radius, and exponent.
			// Create all of the random points within the bounds 
			// of a random blotch, with higher chance of occurring near 
			// the center of the blotch selected.
			const blotches = [];
			for ( let i=0; i<num_blotches; i++ ) {
				// blotch #2 is always an inversion of blotch #1 to help evenly distribute points
				if ( i===1 ) {
					let b = blotches[0];
					blotches.push({ x: xmax - b.x, y: ymax - b.y, r: b.r, exp: b.exp });
				}
				// the rest are random
				let x = utils.RandomInt( xmin, xmax );
				let y = utils.RandomInt( ymin, ymax );
				let min_dim = Math.min( xmax-xmin, ymax-ymin );
				let r = utils.RandomInt( min_dim*0.2, min_dim*0.8 );
				let exp = utils.RandomFloat( 0.94, 1.0 );
				blotches.push({ x, y, r, exp });
			}
			// draw the blotch as a yellow circle using two.js
			if ( this.settings.visualize ) {
				for ( let b of blotches ) { 
					let c = globalThis.two.makeCircle( b.x, b.y, b.r );
					c.fill = 'transparent';
					c.stroke = 'yellow';
					c.linewidth = 20;
				}
			}
			// make points
			let max_attempts = num_points*5;
			for ( let i=0; i<num_points && max_attempts; i++, max_attempts-- ) {
				let blotch = blotches.pickRandom();
				let angle = Math.random() * Math.PI * 2;
				let radius = Math.pow( Math.random() * blotch.r, blotch.exp );
				let x = blotch.x + Math.cos(angle) * radius;
				let y = blotch.y + Math.sin(angle) * radius;
				// make sure the point is in bounds, otherwise roll again
				if ( x < xmin || x > xmax || y < ymin || y > ymax ) { i--; continue; }
				pts.push([x,y]);
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
				let c = globalThis.two.makeCircle( p[0], p[1], 10);
				c.fill = 'orange';
				c.stroke = 'transparent';
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
			radial: ( px, py ) => {
				let center_x = xmin + (xmax-xmin) * this.settings.voronoi_radial_center_x;
				let center_y = ymin + (ymax-ymin) * this.settings.voronoi_radial_center_y;
				// hyperextension - center point does not need to be inside tank
				center_x = center_x * 2 - center_x * 0.5;
				center_y = center_y * 2 - center_y * 0.5;
				const dx = px - center_x;
				const dy = py - center_y;
				const angle = Math.atan2(dy, dx) + Math.PI;
				const chance = Math.abs( Math.sin( angle * this.settings.voronoi_radial_cycles + this.settings.voronoi_radial_spin ) );
				const fudge = 0.15;
				const hit =  Math.random() > chance + fudge;
				return hit;
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
		
		// get a rotation matrix we can apply later
		let rotation = Math.random() * this.settings.max_rotation * 2 - this.settings.max_rotation;
		let matrix = getCenteredRotationCoverMatrix(this.tank.width, this.tank.height, rotation);
		
		// not for the faint of heart, but left here as an option
		if ( this.settings.crazytown_chance ) {
			// if its a number, interpret as a dice roll
			if ( this.settings.crazytown_chance===true || Math.random() <= parseFloat(this.settings.crazytown_chance) ) {
				const crazyness = Math.max( 0.05, Math.random() * this.settings.max_crazyness );
				matrix = CreateCoverMatrix(
					this.tank.width, 
					this.tank.height, 
					3 * Math.random() * crazyness, 
					2 * Math.random() * crazyness, 
					2 * Math.random() * crazyness, 
					1 + Math.random() * 2 * crazyness, 
					1 + Math.random() * 2 * crazyness
				);
			}
		}

		// create rocks from each voronoi cell according to mask
		let cells =[];
		forEachVoronoiCell(pts, delaunay, ( vertices, px, py ) => {
			
			// optional voronoi visualization
			if ( this.settings.visualize ) {
				let anchors = vertices.map( p => new Two.Anchor( p[0], p[1] ) );
				let path = globalThis.two.makePath(anchors);
				path.fill = 'transparent';
				path.stroke = utils.RandomColor( true, false, true ); 
				path.linewidth = 20;		
			}
			
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
			vertices = vertices.map( v => 
				ApplyMatrixToPoint(matrix, v[0]/this.settings.scale_x, v[1]/this.settings.scale_y ) 
			);
			
			// keep rocks entirely within bounds
			const w = this.tank.width;
			const h = this.tank.height;
			vertices = trimPolygon( vertices, 0, h, 0, 0 ); // up
			vertices = trimPolygon( vertices, w, h, 0, h ); // left
			vertices = trimPolygon( vertices, w, 0, w, h ); // down
			vertices = trimPolygon( vertices, 0, 0, w, 0 ); // right
			if ( !vertices.length ) { return false; }
			
			// rock shrinkage / fracturing
			if ( this.settings.max_rock_shrinkage ) {
				if ( Math.random() <= this.settings.rock_shrinkage_chance ) {
					// compute the center of the polygon
					let center_x = 0;
					let center_y = 0;
					for ( let v of vertices ) {
						center_x += v[0];
						center_y += v[1];
					}
					center_x /= vertices.length;
					center_y /= vertices.length;
					// move each vertex towards the center by a random amount up to the max shrinkage
					const shrinkage = Math.random() * this.settings.max_rock_shrinkage;
					vertices = vertices.map( v => {
						const dx = v[0] - center_x;
						const dy = v[1] - center_y;
						const dist = Math.sqrt( dx*dx + dy*dy );
						const angle = Math.atan2( dy, dx );
						const shrink = dist * Math.max( 0.15, shrinkage );
						return [
							v[0] - Math.cos(angle) * shrink,
							v[1] - Math.sin(angle) * shrink
						]
					});
				}
			}
			
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
					color_scheme: this.PickRandomRockColor()
				}),
			);
		})
		
	}
}

/**
 * Multiplies two 2D transformation matrices (represented as [a, b, c, d, e, f]).
 * @param {number[]} m1 The first matrix.
 * @param {number[]} m2 The second matrix.
 * @returns {number[]} The resulting matrix.
 */
function multiplyMatrices(m1, m2) {
	const a1 = m1[ 0 ], b1 = m1[ 1 ], c1 = m1[ 2 ], d1 = m1[ 3 ], e1 = m1[ 4 ], f1 = m1[ 5 ];
	const a2 = m2[ 0 ], b2 = m2[ 1 ], c2 = m2[ 2 ], d2 = m2[ 3 ], e2 = m2[ 4 ], f2 = m2[ 5 ];

	return [
		a1 * a2 + c1 * b2,
		b1 * a2 + d1 * b2,
		a1 * c2 + c1 * d2,
		b1 * c2 + d1 * d2,
		a1 * e2 + c1 * f2 + e1,
		b1 * e2 + d1 * f2 + f1,
	];
}

/**
 * Transforms a point [x, y] by a matrix.
 * @param {number[]} matrix The transformation matrix.
 * @param {number} x The x-coordinate of the point.
 * @param {number} y The y-coordinate of the point.
 * @returns {number[]} The transformed point [x', y'].
 */
function ApplyMatrixToPoint(matrix, x, y) {
	const a = matrix[ 0 ], b = matrix[ 1 ], c = matrix[ 2 ], d = matrix[ 3 ], e = matrix[ 4 ], f = matrix[ 5 ];
	return [
		a * x + c * y + e,
		b * x + d * y + f,
	];
}

/**
 * Generates a transformation matrix for a canvas context that centers and covers
 * the screen based on the provided transform parameters.
 *
 * @param {number} width The width of the canvas.
 * @param {number} height The height of the canvas.
 * @param {number} rotation The rotation angle in radians.
 * @param {number} skewX The X-axis skew angle in radians.
 * @param {number} skewY The Y-axis skew angle in radians.
 * @param {number} scaleX The X-axis scale factor.
 * @param {number} scaleY The Y-axis scale factor.
 * @returns {number[]} An array of 6 numbers representing the final matrix.
 */
function CreateCoverMatrix(width, height, rotation, skewX, skewY, scaleX, scaleY) {
	const centerX = width / 2;
	const centerY = height / 2;
	let matrix = [ 1, 0, 0, 1, 0, 0 ]; // Identity matrix

	// 1. Translate to the center
	const translationToCenter = [ 1, 0, 0, 1, centerX, centerY ];
	matrix = multiplyMatrices(matrix, translationToCenter);

	// 2. Apply scale, skew, and rotation sequentially
	const skewMatrix = [ 1, Math.tan(skewY), Math.tan(skewX), 1, 0, 0 ];
	matrix = multiplyMatrices(matrix, skewMatrix);

	const scaleMatrix = [ scaleX, 0, 0, scaleY, 0, 0 ];
	matrix = multiplyMatrices(matrix, scaleMatrix);

	const cos = Math.cos(rotation);
	const sin = Math.sin(rotation);
	const rotationMatrix = [ cos, sin, -sin, cos, 0, 0 ];
	matrix = multiplyMatrices(matrix, rotationMatrix);

	// 3. Translate back from the center
	const translationFromCenter = [ 1, 0, 0, 1, -centerX, -centerY ];
	matrix = multiplyMatrices(matrix, translationFromCenter);

	// 4. Get the matrix components to use in the cover scale calculation
	const [ a, b, c, d ] = matrix;

	// 5. Calculate the additional scale to ensure covering using the new technique
	const transformedWidth = Math.abs(a * width) + Math.abs(c * height);
	const transformedHeight = Math.abs(b * width) + Math.abs(d * height);
	const coverScale = Math.max(width / transformedWidth, height / transformedHeight);

	// 6. Apply the final covering scale from the center
	const finalCoverScaleMatrix = [ coverScale, 0, 0, coverScale, 0, 0 ];

	const coverTranslationMatrix = multiplyMatrices(
		[ 1, 0, 0, 1, centerX, centerY ],
		multiplyMatrices(finalCoverScaleMatrix, [ 1, 0, 0, 1, -centerX, -centerY ])
	);

	return multiplyMatrices(coverTranslationMatrix, matrix);
}

function getCenteredRotationCoverMatrix(width, height, rotation) {
	const centerX = width / 2;
	const centerY = height / 2;

	// Calculate the rotation matrix
	const cos = Math.cos(rotation);
	const sin = Math.sin(rotation);
	const rotationMatrix = [ cos, sin, -sin, cos, 0, 0 ];

	// Calculate the dimensions of the rotated bounding box
	const transformedWidth = Math.abs(cos * width) + Math.abs(sin * height);
	const transformedHeight = Math.abs(sin * width) + Math.abs(cos * height);

	// Calculate the required cover scale
	const coverScale = Math.max(width / transformedWidth, height / transformedHeight);
	const coverScaleMatrix = [ coverScale, 0, 0, coverScale, 0, 0 ];

	// Combine the matrices in the correct order
	// 1. Translate to center
	// 2. Rotate
	// 3. Scale to cover
	// 4. Translate back
	let finalMatrix = [ 1, 0, 0, 1, centerX, centerY ];
	finalMatrix = multiplyMatrices(finalMatrix, rotationMatrix);
	finalMatrix = multiplyMatrices(finalMatrix, coverScaleMatrix);
	finalMatrix = multiplyMatrices(finalMatrix, [ 1, 0, 0, 1, -centerX, -centerY ]);

	return finalMatrix;
}