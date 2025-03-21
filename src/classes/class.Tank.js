import Two from "two.js";
import Delaunator from 'delaunator';
import * as utils from '../util/utils.js';
import SpaceGrid from '../classes/class.SpaceGrid.js';
import DataGrid from '../classes/class.DataGrid.js';
import Rock from '../classes/class.Rock.js';
import {Circle, Polygon, Result, Collisions} from 'collisions';

export default class Tank {

	static backdrop_themes = [
		// reserved for special rendering styles
		{ name: 'White', class: 'bg-theme-white', omitFromRandom:true },
		{ name: 'Black', class: 'bg-theme-black', omitFromRandom:true },
		{ name: 'Grey', class: 'bg-theme-grey', omitFromRandom:true },
		// generally available
		{ name: 'Abysmal', class: 'bg-theme-abysmal' },
		{ name: 'Deepwater', class: 'bg-theme-deepwater' },
		{ name: 'Algae', class: 'bg-theme-algae' },
		{ name: 'Bleak', class: 'bg-theme-bleak' },
		{ name: 'Rainstorm', class: 'bg-theme-rainstorm' },
		{ name: 'Reactor', class: 'bg-theme-reactor' },
		{ name: 'Hades', class: 'bg-theme-hades' },
		{ name: 'Thermal Vent', class: 'bg-theme-thermal-vent' },
		{ name: 'Asteroid', class: 'bg-theme-asteroid' },
		{ name: 'Blue Eye', class: 'bg-theme-blue-eye' },
		{ name: 'Aquamarine', class: 'bg-theme-aquamarine' },
		{ name: 'Nightmare', class: 'bg-theme-nightmare' },
		{ name: 'Tropical', class: 'bg-theme-tropical' },
		{ name: 'Hope', class: 'bg-theme-hope' },
		{ name: 'Leather', class: 'bg-theme-leather' },
	];
				
	static background_themes = {
		'Shipwreck': ['#352619','#2E1D06','#2E2A1D','#473120','#2c0b04','#492f05','#6c7471','transparent','transparent' ,'transparent','transparent','transparent','transparent','transparent','transparent'],
		'Mudstone': ['#352619','#2E1D06','#2E2A1D','#473120','#2c0b04','#492f05'],
		'Wavebreak': ['#4b4b48','#4B4E50','#6c7471','transparent','transparent'],
		'Copper Oxide': ['#1C4D44'],
		'Serpentine': ['#1C4D44','#1C4D44','#1C4D44','#3b4b30','#18270B','#1C4D44','#1C4D44','#1C4D44','#3b4b30','#18270B','#656b5c'],
		'Speckled Granite': ['#070808','#4B4E50','#070808','#4B4E50','#070808','#4B4E50','#070808','#4B4E50','#394b57'],
		'Sunrise': ['#301A30','#4E2237','#2b0a36'],
		'Basalt': ['#333333','#383533'],
		'Obsidian': ['#0a0a0a','#111111','#1a1a1a'],
		'Kelp': ['#07290C','#001B04','#112902','transparent'],
		'Moss Garden': ['#07290C','#001B04','#0C1F01'],
		'Moonlight': ['#001C41','#001C41','#00355e','#05080f','#001C41','#001C41','#00355e','#05080f','#004b9b'],
		'Crushed Grapes': ['#081212','#2D1F04','#3A2905','#2D2908','#1F132B','#140C1C','#0F2222','#132C2C'],
	};
						
	constructor( w, h ) {
		this.oid = ++globalThis.vc.next_object_id;
		this.width = w;
		this.height = h;
		this.turbulence = Math.random() * 0.7;
		this.mutate_whirls_every = 200;
		this.viscosity = 0.5;
		this.boids = [];
		this.foods = [];
		this.obstacles = [];
		this.plants = [];
		this.marks = [];
		this.whirls = []; // defined later for generating currents
		this.bg_opacity = -1; // -1 == 'random', zero, or 0..1
		this.bg_visible = true;
		this.bg_theme = 'random';
		// first param can be JSON to rehydrate entire object from save
		if ( w && typeof w === 'object' ) {
			Object.assign(this,w);
			this.MakeBackground();
		}
		this.grid = new SpaceGrid(this.width,this.height,300);
		this.CreateDataGrid(this.width,this.height);
	}

	Export( as_JSON=false ) {
		let output = {};
		let datakeys = ['width','height','whirls','viscosity','background_triangles',
			'bg_opacity', 'bg_visible', 'bg_theme', 'mutate_whirls_every', 'turbulence'];		
		for ( let k of datakeys ) { output[k] = this[k]; }
		if ( as_JSON ) { output = JSON.stringify(output); }
		return output;
	}
		
	Kill() {
		for ( let r of this.obstacles ) { r.Kill(); }
		this.Sterilize();
	}

	Sterilize() {
		this.boids.forEach( x => x.Kill('sterilized') );
		this.boids.length = 0;
		this.foods.forEach( x => x.Kill() );
		this.foods.length = 0;
		this.plants.forEach( x => x.Kill() );
		this.plants.length = 0;
		this.marks.forEach( x => x.Kill() );
		this.marks.length = 0;
	}
		
	MakeWhirlpool() {
		this.whirls.push( { 
			x: this.width * Math.random(),
			y: this.height * Math.random(),
			strength: Math.random(),
			dir: (Math.random() > 0.5) ? 1 : 0, // direction CW / CCW 
			locality: utils.RandomFloat(0.18, 0.80 ), // locality exponent (smaller is more local effect)
			// note: use 0.5 for a perfectly circular current. Use 0.5..1.0 for a whirlpool effect.
			pull: utils.RandomFloat(0.3, 0.7) // 0.5=neutral, <0.5=inward, >0.5=outward
		} );
	}
		
	MakeWhirlpools() {
		const num_whirls = utils.RandomInt(1,5);
		this.whirls = [];
		for ( let n=0; n < num_whirls; n++ ) {
			this.MakeWhirlpool();
		}	
	}
		
	MutateWhirlpools() {
		// random chance to remove
		this.whirls = this.whirls.filter( w => Math.random() < 0.98 );
		
		// random chance to add
		if ( this.whirls.length <= 5 && ( !this.whirls.length || Math.random() >= (0.80 + this.whirls.length * 0.04) ) ) {
			this.MakeWhirlpool();
		}
		
		// random chance to tweak stats
		for ( let w of this.whirls ) {
			if ( Math.random() > 0.35 ) {
				w.x = utils.Clamp( w.x + ( ( this.width * 0.2 * Math.random() ) - ( ( this.width * 0.1 ))  ), 0, this.width);
				w.y = utils.Clamp( w.y + ( ( this.height * 0.2 * Math.random() ) - ( ( this.height * 0.1 ))  ), 0, this.height);
				w.strength = ( w.strength + Math.random() ) / 2;
				w.locality = ( w.locality + utils.RandomFloat(0.18, 0.80) ) / 2;
				w.pull = ( w.pull + utils.RandomFloat(0.3, 0.7) ) / 2; 
			}
		}
		
		// update the actual data grid
		this.CreateDataGrid(this.width,this.height);
	}
		
	CreateDataGrid(w,h) {
		let gridcell_area = (w*h) / 400; // arbitrary number
		let gridsize = Math.max( 300, Math.sqrt( gridcell_area ) );
		this.datagrid = new DataGrid(w,h,gridsize);
		const largest_dim = Math.max( w, h );
		// create a few whirlpool points
		if ( !this.whirls.length ) { // don't make new ones
			this.MakeWhirlpools();
		}
		// create vector field
		for ( let x=0; x < this.datagrid.cells_x; x++ ) {
			for ( let y=0; y < this.datagrid.cells_y; y++ ) {
				const cell = this.datagrid.CellAt(x*this.datagrid.cellsize, y*this.datagrid.cellsize);
				if ( cell ) {
					cell.current_x = 0;
					cell.current_y = 0;
					const cell_x = x * this.datagrid.cellsize + this.datagrid.cellsize * 0.5;
					const cell_y = y * this.datagrid.cellsize + this.datagrid.cellsize * 0.5;
					for ( let n=0; n < this.whirls.length; n++ ) {
						const diff_x = this.whirls[n].x - cell_x;
						const diff_y = this.whirls[n].y - cell_y;
						const arctan = Math.atan( diff_y / diff_x ) + ( diff_x < 0 ? Math.PI : 0 );
						// const deflection = ( this.whirls[n].pull + utils.RandomFloat(0.3, 0.7) ) / 2; // local jitter
						const deflection = 0.5 + ( ( Math.random() - 0.5 ) * this.turbulence ); // local jitter
						const angle = ( arctan + Math.PI * deflection ) % ( Math.PI * 2 );
						const dist = Math.sqrt( diff_x * diff_x + diff_y * diff_y ); 
						cell.current_x += (this.whirls[n].dir ? 1 : -1) * Math.cos(angle) * ( 1 - Math.pow( dist / largest_dim, this.whirls[n].locality ) ) * this.whirls[n].strength;
						cell.current_y += (this.whirls[n].dir ? 1 : -1) * Math.sin(angle) * ( 1 - Math.pow( dist / largest_dim, this.whirls[n].locality ) ) * this.whirls[n].strength;
					}
				}
			}
		}
		// normalize the vectors
		let max = 0;
		this.datagrid.cells.forEach( cell => { // some would say this is bad OOP
			const length = Math.sqrt( cell.current_x * cell.current_x + cell.current_y * cell.current_y );
			max = Math.max(length,max);
		} );
		this.datagrid.cells.forEach( cell => {
			const length = Math.sqrt( cell.current_x * cell.current_x + cell.current_y * cell.current_y );
			const ratio = max ? ( length / max ) : 1;
			const angle = Math.atan2(-cell.current_y, -cell.current_x);
			cell.current_x = Math.cos(angle) * ratio;
			cell.current_y = Math.sin(angle) * ratio;
		} );
		
	}
	
	Resize(w,h) {
		this.width = w;
		this.height = h;
		let gridcell_area = (w*h) / 200; // arbitrary number
		let gridcell_size = Math.max( 300, Math.sqrt( gridcell_area ) );
		this.grid = new SpaceGrid(w,h,gridcell_size);
		this.CreateDataGrid(w,h);
	}
	
	DrawDebugBoundaryRectangle( on = true ) {
		// if ( this.debug_geo ) {
		// 	this.debug_geo.remove();
		// 	delete this.debug_geo;
		// }
		// if ( !on ) { return; }
		// this.debug_geo = globalThis.two.makeGroup();
		// globalThis.vc.AddShapeToRenderLayer(this.debug_geo, +2);	
		// // boundary rectangle
		// const debug_rect = globalThis.two.makeRectangle(this.width/2, this.height/2, this.width, this.height );
		// debug_rect.stroke = "orange";
		// debug_rect.linewidth = '2';
		// debug_rect.fill = 'transparent';		
		// this.debug_geo.add( debug_rect );
		// // current flow / vector field
		// if ( this.datagrid?.cells?.length ) {
		// 	const max_line_length = 0.75 * this.datagrid.cellsize;
		// 	for ( let x=0; x < this.datagrid.cells_x; x++ ) {
		// 		for ( let y=0; y < this.datagrid.cells_y; y++ ) {
		// 			const center_x = x * this.datagrid.cellsize + (this.datagrid.cellsize * 0.5);
		// 			const center_y = y * this.datagrid.cellsize + (this.datagrid.cellsize * 0.5);
		// 			const cell = this.datagrid.CellAt(center_x,center_y);			
		// 			if ( cell ) {
		// 				// center post
		// 				const rect_w = this.datagrid.cellsize / 20;
		// 				const rect = globalThis.two.makeRectangle(center_x, center_y, rect_w, rect_w);
		// 				rect.stroke = "lime";
		// 				rect.linewidth = '2';
		// 				rect.fill = 'transparent';
		// 				rect.rotation = Math.PI / 4; // diamonds are kool
		// 				this.debug_geo.add( rect );
		// 				// magnitude line
		// 				const target_x = center_x + -cell.current_x * max_line_length;
		// 				const target_y = center_y + -cell.current_y * max_line_length;
		// 				const line = globalThis.two.makeLine(center_x, center_y, target_x, target_y);
		// 				line.stroke = "lime";
		// 				line.linewidth = '2';
		// 				line.fill = 'transparent';
		// 				this.debug_geo.add( line );
		// 			}
		// 		}
		// 	}
		// }
		// // whirls
		// if ( this.whirls.length ) {
		// 	for ( let w of this.whirls ) {
		// 		const c = globalThis.two.makeCircle( w.x, w.y, w.locality*1000 );
		// 		c.stroke = "orange";
		// 		c.linewidth = w.strength * 10;
		// 		c.fill = 'transparent';
		// 		this.debug_geo.add( c );
		// 	}
		// }
	}
	
	SetBGTheme( name, save=true ) {
		// if no arguments, set to self or default
		if ( !name ) {
			name = this.bg_theme || 'Deepwater';
		}
		let bg_theme;
		if ( name == 'random' ) { 
			bg_theme = Tank.backdrop_themes.filter( x => !x.omitFromRandom ).pickRandom();
		}
		else if ( name ) {
			bg_theme = Tank.backdrop_themes.find( x => x.name == name );
		}
		if ( !bg_theme ) {
			bg_theme = Tank.backdrop_themes.filter( x => !x.omitFromRandom ).pickRandom();
		}
		if ( save ) { this.bg_theme = bg_theme.name; }
	}
	
	// background layer
	MakeBackground() {
		this.SetBGTheme();
		
		// random delauney background
		if ( !this.background_triangles ) {
			this.background_triangles = [];
			let bgnumpts = Math.trunc(Math.random() * 100) + 20;
			let bgpts = [];
			// sprinkle some points around the exact edges
			bgpts.push( [0, 0] );
			bgpts.push( [this.width, 0] );
			bgpts.push( [0, this.height] );
			bgpts.push( [this.width, this.height] );
			for ( let x=0; x < bgnumpts*0.1; x++ ) {
				bgpts.push( [Math.trunc(Math.random() * this.width), 0] );
				bgpts.push( [Math.trunc(Math.random() * this.width), this.height] );
			}
			for ( let x=0; x < bgnumpts*0.1; x++ ) {
				bgpts.push( [0, Math.trunc(Math.random() * this.height)] );
				bgpts.push( [this.width, Math.trunc(Math.random() * this.height) ] );
			}
			// the interior points can use a number of different strategies
			// blotches
			if ( Math.random() > 0.5 ) {
				let num_blotches = utils.RandomInt( 2, 5 );
				const blotches = [];
				const xmin = this.width * 0.1;
				const xmax = this.width * 0.9;
				const ymin = this.height * 0.1;
				const ymax = this.height * 0.9;
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
					let exp = utils.RandomFloat( 0.97, 1.0 );
					blotches.push({ x, y, r, exp });
				}
				// make points
				let num_points = bgnumpts*0.8;
				let max_attempts = num_points*5;
				for ( let i=0; i<num_points && max_attempts; i++, max_attempts-- ) {
					let blotch = blotches.pickRandom();
					let angle = Math.random() * Math.PI * 2;
					let radius = Math.pow( Math.random() * blotch.r, blotch.exp );
					let x = blotch.x + Math.cos(angle) * radius;
					let y = blotch.y + Math.sin(angle) * radius;
					// make sure the point is in bounds, otherwise roll again
					if ( x < xmin || x > xmax || y < ymin || y > ymax ) { i--; continue; }
					bgpts.push([x,y]);
				}
			}
			// x/y gravity
			else {
				const x_strength = utils.BiasedRand( 0.5, 5, 1, 0.8 );
				const y_strength = utils.BiasedRand( 0.5, 5, 1, 0.8 );
				const x_focus = utils.RandomFloat( 0.1, 0.9 );
				const y_focus = utils.RandomFloat( 0.1, 0.9 );
				for ( let x=0; x < bgnumpts*0.8; x++ ) {
					let p = [Math.trunc(Math.random() * this.width), Math.trunc(Math.random() * this.height)];
					p[0] = utils.shapeNumber( p[0], 0, this.width, x_focus, x_strength );
					p[1] = utils.shapeNumber( p[1], 0, this.height, y_focus, y_strength );
					bgpts.push(p);
				}
			}
			
			// randomized color schemes 
			for ( let n=0; n < 5; n++ ) {
				const colors = [];
				const num_colors = utils.RandomInt(2,5,3,0.5);
				for ( let c=0; c < num_colors; c++ ){
					const color = utils.RandomColor( true, false, false, true );
					colors.push(color);
				}
				Tank.background_themes[`random-${n}`] = colors;
			}
			
			// color tinting points from more interesting variations
			let tint_points = [];
			const num_tint_points = utils.RandomInt(0,5);
			for ( let i=0; i < num_tint_points; i++ ) {
				tint_points.push({
					x: this.width * Math.random(), 
					y: this.height * Math.random(), 
					v: ( Math.random() - 0.68 ), // more dark than light
					r: Math.min(this.width,this.height) * Math.random()
				});
			}
			
			const delaunay = Delaunator.from(bgpts);
			let triangles = delaunay.triangles;
			
			// multiple themes at once? are you crazy?
			let themes = [];
			let num_themes = utils.RandomInt(1,4);
			for ( let i = 0; i < num_themes; i++ ) {
				themes.push({
					x: utils.shapeNumber( this.width * Math.random(), 0, this.width, 0.5, 0.6 ), 
					y: utils.shapeNumber( this.height * Math.random(), 0, this.height, 0.5, 0.6 ), 
					theme: Object.values(Tank.background_themes).pickRandom()
				});
			}
			for (let i = 0; i < triangles.length; i += 3) {
				
				// tint the triangle based on its location
				let tri_x = (bgpts[triangles[i]][0] + bgpts[triangles[i+1]][0] + bgpts[triangles[i+2]][0]) / 3;
				let tri_y = (bgpts[triangles[i]][1] + bgpts[triangles[i+1]][1] + bgpts[triangles[i+2]][1]) / 3;
				
				// decide which theme we want to pull colors out of	
				let bgcolors = themes[0].theme; // default
				if ( themes.length > 1 ) { 
					let distances = themes.map( t => {
						return 1 / ( ( t.x - tri_x ) * ( t.x - tri_x ) + ( t.y - tri_y ) * ( t.y - tri_y ) );
					});
					let total_distances = distances.reduce( (a,c) => a+c, 0 );
					let roll = Math.random() * total_distances;
					let roll_thresh = 0;
					for ( let t=0; t < themes.length; t++ ) {
						roll_thresh += distances[t];
						if ( roll <= roll_thresh ) {
							bgcolors = themes[t].theme;
							break;
						}
					}
				}
				
				// single-theme settings just pick a random color from the theme
				let c = bgcolors[ Math.trunc( Math.random() * bgcolors.length ) ]; 
				
				// color tinting based on triangle location
				let adjustment = 0;
				
				// fade up the tank 
				let center = (bgpts[triangles[i]][1] + bgpts[triangles[i+1]][1] + bgpts[triangles[i+2]][1]) / 3;
				const color_variance = Math.random();
				adjustment = (0.5-(center/this.height)) * color_variance + (Math.random()*color_variance*0.5-0.5); 
				
				// 3DFX
				for ( let tp of tint_points ) {
					const d = Math.abs( Math.sqrt( 
						( tp.x - tri_x ) * ( tp.x - tri_x ) + 
						( tp.y - tri_y ) * ( tp.y - tri_y )
					) );
					adjustment += tp.v * ( Math.max( 0, tp.r - d ) / tp.r );
				}
				
				// final color tint
				adjustment = utils.Clamp( adjustment, -1, 1 );
				c = utils.adjustColor(c,adjustment);
				
				// save triangle data for later
				this.background_triangles.push( [
					bgpts[triangles[i]][0], 
					bgpts[triangles[i]][1], 
					bgpts[triangles[i+1]][0], 
					bgpts[triangles[i+1]][1], 
					bgpts[triangles[i+2]][0], 
					bgpts[triangles[i+2]][1],
					c
				]); 
			}
		}
		if ( this.bg_opacity < 0 ) {	
			this.bg_opacity = 0.15 + Math.random() * 0.7;
		}
				
	}
	
	GeoData() {
		return {
			triangles: this.background_triangles,
			bg_theme_class: Tank.backdrop_themes.find( x => x.name == this.bg_theme ).class,
			width: this.width,
			height: this.height,
			bg_opacity: this.bg_opacity
		};
	}
	
	MakePrettyDecor() {
		const max_height = Math.min(this.height*0.05, 500);
		// random rocks
		const num_rocks = utils.RandomInt(1,5);
		for ( let n=0; n < num_rocks; n++ ) {
			const h = utils.RandomFloat( this.height * 0.25, this.height * 0.9 );
			const w = utils.RandomFloat( this.width * 0.15, this.width * 0.5 );
			const x = Math.random() * ( this.width * 1.5 - this.width * 0.75 );
			const y = this.height - h*0.75;
			this.obstacles.push(
				new Rock( { 
					x,
					y,
					w,
					h,
					force_corners: false,
					complexity: utils.RandomInt(5,12),
					new_points_respect_hull: false,
				}),
			);		
		}
		// substrate				
		this.obstacles.push(
			new Rock( { 
				x: 0,
				y: ( this.height - max_height ),
				w: this.width,
				h: max_height * 2.1,
				force_corners: true,
				complexity: 16,
				color_scheme: 'Sandstone'
			}),
		);		
		
	}
	
	Update( delta ) {
		this.mutate_cycle = ( this.mutate_cycle ?? 0 ) + delta;
		if ( this.mutate_cycle > this.mutate_whirls_every ) { 
			this.MutateWhirlpools();
			this.mutate_cycle -= this.mutate_whirls_every; 
		}
	}

	SeparateRocks( padding=0 ) {
		if ( !this.obstacles.length ) { return; }
		const system = new Collisions();
		const result = system.createResult(); // recycled on each collision check
		// provide temporary geometry info
		for ( let i = 0; i < this.obstacles.length; i++ ) {
			this.obstacles[i].collider = new Polygon(this.obstacles[i].x, this.obstacles[i].y, this.obstacles[i].collision.hull)
			this.obstacles[i].collider.scale_x = ( this.obstacles[i].x2 + padding ) / this.obstacles[i].x2;
			this.obstacles[i].collider.scale_y = ( this.obstacles[i].y2 + padding ) / this.obstacles[i].y2;			
			system.insert(this.obstacles[i].collider);
		}
		// move them apart
		let attempts = 10;
		while ( attempts-- ) {
			system.update();
			this.obstacles.shuffle();
			let num_collisions = 0;
			for (let i = 0; i < this.obstacles.length; i++) {
				let rock = this.obstacles[i];
				let potentials = rock.collider.potentials();
				for ( const body of potentials ) {
					if (rock.collider.collides(body, result)) {
						num_collisions++;
						rock.x -= ( result.overlap * result.overlap_x );
						rock.y -= ( result.overlap * result.overlap_y );
						// stay in bounds. TODO: a rock.Move() function would be helpful. this is messy
						if (rock.x < 0 + padding) {rock.x = padding;};
						if (rock.y < 0 + padding) {rock.y = padding;};
						if (rock.x + rock.x2 > globalThis.vc.tank.width - padding) {
							rock.x = (globalThis.vc.tank.width - rock.x2) - padding;
						};
						if (rock.y + rock.y2 > globalThis.vc.tank.height - padding) {
							rock.y = (globalThis.vc.tank.height - rock.y2) - padding;
						};
						// update dependant info
						rock.collider.x = rock.x;
						rock.collider.y = rock.y;
					}
				}
			}
			if (!num_collisions) {break;}
		}
		// cleanup
		for ( let i = 0; i < this.obstacles.length; i++ ) {
			delete this.obstacles[i].collider;
		}		
	}
	
	FindSafeZones() {
		// [!]HACKY - in order to get collision detection to work with recently added rocks, 
		// we have to insert the rocks into the system temporarily here. Grid data
		// will be automatically cleared and reset on the next frame anyway.
		this.grid.Clear();
		for ( let o of this.obstacles ) { this.grid.Add(o); }
		// find safe points using a grid pattern
		this.safe_pts = [];
		let steps = 6;
		let x_step = this.width / steps;
		let y_step = this.height / steps;
		for ( let x = x_step*0.5; x < this.width; x += x_step ) {
			for ( let y = y_step*0.5; y < this.height; y += y_step ) {
				let r = utils.RandomInt( 125, 600 );
				let my_x = utils.Clamp( x + ( Math.random() * x_step - x_step/2 ), r, this.width - r );
				let my_y =  utils.Clamp( y + ( Math.random() * y_step - y_step/2 ), r, this.height - r );
				// look for collisions
				const result = new Result();
				let touching = false;
				let attempts = 3;
				do {
					touching = false;
					let candidates = this.grid.GetObjectsByBox( my_x - r, my_y - r, my_x + r, my_y + r, o => o instanceof Rock );
					for ( let o of candidates ) {
						const circle  = new Circle(my_x, my_y, r);
						const polygon = new Polygon(o.x, o.y, o.collision.hull);
						let gotcha = circle.collides(polygon, result);
						// response
						if ( gotcha ) {
							my_x -= result.overlap * result.overlap_x;
							my_y -= result.overlap * result.overlap_y;
							// stay in the box
							if ( my_x < r ) { my_x = r; }
							else if ( my_x > this.width - r ) { my_x = this.width - r; }
							if ( my_y < r ) { my_y = r; }
							else if ( my_y > this.height - r ) { my_y = this.height - r; }
						}
						touching = touching || gotcha;
					}					
				} while ( touching && attempts-- )
				if ( !touching ) {
					this.safe_pts.push( [my_x, my_y, r] );
				}
			} 
		} 
		// debug visualization
		// if ( this.spgeo ) { this.spgeo.remove(); }
		// this.spgeo = globalThis.two.makeGroup();
		// for ( let p of this.safe_pts ) {
		// 	let c = globalThis.two.makeCircle( p[0], p[1], p[2] );
		// 	c.fill = 'transparent';
		// 	c.stroke = 'red';
		// 	c.linewidth = 5;
		// 	this.spgeo.add( c );
		// }
		// globalThis.vc.AddShapeToRenderLayer(this.spgeo, +2);	
	}	

}