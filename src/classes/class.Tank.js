import Two from "two.js";
import Delaunator from 'delaunator';
import * as utils from '../util/utils.js';
import SpaceGrid from '../classes/class.SpaceGrid.js';
import DataGrid from '../classes/class.DataGrid.js';
import Rock from '../classes/class.Rock.js';
import {Polygon, Collisions} from 'collisions';

export default class Tank {

	static backdrop_themes = [
		{ name: 'Deepwater', class: 'bg-theme-deepwater' },
		{ name: 'Algae', class: 'bg-theme-algae' },
		{ name: 'Bleak', class: 'bg-theme-bleak' },
		{ name: 'Rainstorm', class: 'bg-theme-rainstorm' },
		{ name: 'Reactor', class: 'bg-theme-reactor' },
		{ name: 'Hades', class: 'bg-theme-hades' },
		{ name: 'Thermal Vent', class: 'bg-theme-thermal-vent' },
		{ name: 'Asteroid', class: 'bg-theme-asteroid' },
		{ name: 'Blue Eye', class: 'bg-theme-blue-eye' },
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
		'Kelp': ['#07290C','#001B04','transparent'],
		'Moss Garden': ['#07290C','#001B04','#0C1F01'],
		'Moonlight': ['#001C41','#001C41','#00355e','#05080f','#001C41','#001C41','#00355e','#05080f','#004b9b'],
		'Crushed Grapes': ['#081212','#2D1F04','#3A2905','#2D2908','#1F132B','#140C1C','#0F2222','#132C2C'],
		// 'Emeralds': ['#09FFFF09','#10FFFF0D','#20FFFF14','2DEEEE2D'],
		// 'Glass': ['#FFFFFF04','#FFFFFF08','#FFFFFF0C','#FFFFFF10'],
	};
						
	constructor( w, h ) {
		this.width = w;
		this.height = h;
		this.turbulence = Math.random() * 0.7;
		this.mutate_whirls_every = 200;
		this.viscosity = 0.5;
		this.boids = [];
		this.foods = [];
		this.obstacles = [];
		this.plants = [];
		this.whirls = []; // defined later for generating currents
		this.bg_opacity = 'random'; // 'random', zero, or 0..1
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
		let datakeys = ['width','height','whirls','viscosity','background_triangles','bg_opacity', 'bg_visible', 'bg_theme'];		
		for ( let k of datakeys ) { output[k] = this[k]; }
		if ( as_JSON ) { output = JSON.stringify(output); }
		return output;
	}
		
	Kill() {
		if ( this.bg ) { this.bg.remove(); }
		if ( this.tankframe ) { this.tankframe.remove(); }
		this.DrawDebugBoundaryRectangle(false);
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
	}
		
	MakeWhirlpool() {
		this.whirls.push( { 
			x: this.width * Math.random(),
			y: this.height * Math.random(),
			strength: Math.random(),
			dir: (Math.random() > 0.5) ? 1 : 0, // direction CW / CCW 
			locality: utils.RandomFloat(0.18, 0.80, 0.5, 0.5 ), // locality exponent (smaller is more local effect)
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
				w.locality = ( w.locality + utils.RandomFloat(0.18, 0.80, 0.5, 0.5 ) ) / 2;
				w.pull = ( w.pull + utils.RandomFloat(0.3, 0.7) ) / 2; 
			}
		}
		
		// update the actual data grid
		this.CreateDataGrid(this.width,this.height);
		
		// update visualization if its currently on
		if ( this.debug_geo ) {
			this.DrawDebugBoundaryRectangle(true);
		}
				
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
		this.ScaleBackground();
	}
	
	DrawDebugBoundaryRectangle( on = true ) {
		if ( this.debug_geo ) {
			this.debug_geo.remove();
			delete this.debug_geo;
		}
		if ( !on ) { return; }
		this.debug_geo = window.two.makeGroup();
		window.vc.AddShapeToRenderLayer(this.debug_geo, +2);	
		// boundary rectangle
		const debug_rect = window.two.makeRectangle(this.width/2, this.height/2, this.width, this.height );
		debug_rect.stroke = "orange";
		debug_rect.linewidth = '2';
		debug_rect.fill = 'transparent';		
		this.debug_geo.add( debug_rect );
		// current flow / vector field
		if ( this.datagrid?.cells?.length ) {
			const max_line_length = 0.75 * this.datagrid.cellsize;
			for ( let x=0; x < this.datagrid.cells_x; x++ ) {
				for ( let y=0; y < this.datagrid.cells_y; y++ ) {
					const center_x = x * this.datagrid.cellsize + (this.datagrid.cellsize * 0.5);
					const center_y = y * this.datagrid.cellsize + (this.datagrid.cellsize * 0.5);
					const cell = this.datagrid.CellAt(center_x,center_y);			
					if ( cell ) {
						// center post
						const rect_w = this.datagrid.cellsize / 20;
						const rect = window.two.makeRectangle(center_x, center_y, rect_w, rect_w);
						rect.stroke = "lime";
						rect.linewidth = '2';
						rect.fill = 'transparent';
						rect.rotation = Math.PI / 4; // diamonds are kool
						this.debug_geo.add( rect );
						// magnitude line
						const target_x = center_x + -cell.current_x * max_line_length;
						const target_y = center_y + -cell.current_y * max_line_length;
						const line = window.two.makeLine(center_x, center_y, target_x, target_y);
						line.stroke = "lime";
						line.linewidth = '2';
						line.fill = 'transparent';
						this.debug_geo.add( line );
					}
				}
			}
		}
		// whirls
		if ( this.whirls.length ) {
			for ( let w of this.whirls ) {
				const c = window.two.makeCircle( w.x, w.y, w.locality*1000 );
				c.stroke = "orange";
				c.linewidth = w.strength * 10;
				c.fill = 'transparent';
				this.debug_geo.add( c );
			}
		}
	}
	
	// background layer
	MakeBackground() {
		
		// backdrop theme
		let bg_theme;
		if ( this.bg_theme == 'random' ) { 
			bg_theme = Tank.backdrop_themes.pickRandom()
		}
		else {
			bg_theme = Tank.backdrop_themes.find( x => x.name == this.bg_theme );
		}
		if ( !bg_theme ) { bg_theme = Tank.background_themes; }
		this.bg_theme = bg_theme.name;
		
		document.body.setAttribute("class", document.body.getAttribute("class").replace(/\s*bg-theme-\w+/, '') + ' ' + bg_theme.class );
		
		// tank frame
		this.tankframe = window.two.makeRectangle(this.width/2, this.height/2, this.width, this.height );
		this.tankframe.stroke = "#888888";
		this.tankframe.linewidth = '2';
		this.tankframe.fill = 'transparent';		
		window.vc.AddShapeToRenderLayer(this.tankframe, '-2');
						
		// return;
		
		if ( this.bg ) { this.bg.remove(); }
		this.bg = window.two.makeGroup();
		
		// random delauney background
		if ( !this.background_triangles ) {
			this.background_triangles = [];
			let bgnumpts = Math.trunc(Math.random() * 200) + 10;
			let bgpts = [];
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
			for ( let x=0; x < bgnumpts*0.8; x++ ) {
				bgpts.push( [ Math.trunc(Math.random() * this.width), Math.trunc(Math.random() * this.height)] );
			}

			// random edge gravity
			const x_strength = Math.random() * 2 - 1;
			const y_strength = Math.random() * 2 - 1;
			// const x_strength = Math.random() * 3;
			// const y_strength = Math.random() * 3;
			const x_focus = this.width * 0.5; // ( Math.random() * 0.9 + 0.05 );
			const y_focus = this.height * 0.5; // ( Math.random() * 0.9 + 0.05 );			
			// const x_focus = Math.random() * 0.8 + 0.1;
			// const y_focus = Math.random() * 0.8 + 0.1;
			for ( let p of bgpts ) {
				p[0] = utils.SigMap( p[0], 0, this.width, 0, this.width, x_focus, x_strength );
				p[1] = utils.SigMap( p[1], 0, this.height, 0, this.height, y_focus, y_strength );
				// p[0] = utils.shapeNumber( p[0], 0, this.width, x_focus, x_strength );
				// p[1] = utils.shapeNumber( p[1], 0, this.height, y_focus, y_strength );
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
		// geometry for two.js
		for ( let t of this.background_triangles ) {
			let p = window.two.makePath( ...t.slice(null, -1) );
			p.linewidth = 0;
			p.fill = t[6];
			p.stroke = 'transparent'; // t[6];
			this.bg.add(p);
		}		
		if ( this.bg_opacity ) {	
			if ( this.bg_opacity == 'random' ) {	
				this.bg_opacity = 0.15 + Math.random() * 0.7;
				this.bg.opacity = this.bg_opacity;
			}
			else {
				this.bg.opacity = this.bg_opacity;
			}
		}
		this.bg.visible = this.bg_visible;
		// window.vc.AddShapeToRenderLayer(this.bg, -2);
		window.vc.AddShapeToRenderLayer(this.bg, 'backdrop');
		this.ScaleBackground();
	}
	
	ScaleBackground() {
		// scale background layer
		if ( this.bg ) { 
			this.bg.scale = 1; // reset to one
			const rect = this.bg.getBoundingClientRect(true);
			this.bg.scale = new Two.Vector( 
				(this.width * window.vc.scale) / rect.width, 
				(this.height * window.vc.scale) / rect.height 
			);
		}
		// scale debug geometry (fluid currents, etc)
		if ( this.debug_geo ) {			
			this.DrawDebugBoundaryRectangle();
		}
		// remake the cosmetic tank frame
		if ( this.tankframe ) { this.tankframe.remove(); }
		this.tankframe = window.two.makeRectangle(this.width/2, this.height/2, this.width, this.height );
		this.tankframe.stroke = "#888888";
		this.tankframe.linewidth = '2';
		this.tankframe.fill = 'transparent';		
		window.vc.AddShapeToRenderLayer(this.tankframe, '-2');
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
						if (rock.x + rock.x2 > window.vc.tank.width - padding) {
							rock.x = (window.vc.tank.width - rock.x2) - padding;
						};
						if (rock.y + rock.y2 > window.vc.tank.height - padding) {
							rock.y = (window.vc.tank.height - rock.y2) - padding;
						};
						// update dependant info
						rock.collider.x = rock.x;
						rock.collider.y = rock.y;
						rock.geo.position.x = rock.x;
						rock.geo.position.y = rock.y;
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


}