import Two from "two.js";
import Delaunator from 'delaunator';
import * as utils from '../util/utils.js'
import SpaceGrid from '../classes/class.SpaceGrid.js'
import DataGrid from '../classes/class.DataGrid.js'
import Rock from '../classes/class.Rock.js'

export default class Tank {

	constructor( w, h ) {
		this.width = w;
		this.height = h;
		// this.responsive = true; // snap to window size on resize events
		this.responsive = false; // snap to window size on resize events
		this.viscosity = 0.5;
		this.boids = [];
		this.foods = [];
		this.threats = [];
		this.obstacles = [];
		this.plants = [];
		this.whirls = []; // defined later for generating currents
		this.grid = new SpaceGrid(w,h,300);
		this.CreateDataGrid(w,h);
	}
	
	CreateDataGrid(w,h) {
		const gridsize = 300;
		this.datagrid = new DataGrid(w,h,gridsize);
		const largest_dim = Math.max( w, h );
		// create a few whirlpool points
		// if ( !this.whirls.length ) { // don't make new ones
			const num_whirls = utils.RandomInt(1,5);
			this.whirls = [];
			for ( let n=0; n < num_whirls; n++ ) {
				this.whirls.push( { 
					x: w * Math.random(),
					y: h * Math.random(),
					strength: Math.random(),
					dir: (Math.random() > 0.5) ? 1 : 0, // direction CW / CCW 
					locality: utils.RandomFloat(0.18, 0.80, 0.5, 0.5 ), // locality exponent (smaller is more local effect)
					// note: use 0.5 for a perfectly circular current. Use 0.5..1.0 for a whirlpool effect.
					pull: utils.RandomFloat(0.3, 0.7) // 0.5=neutral, <0.5=inward, >0.5=outward
				} );
			}
		// }
		// create vector field
		for ( let x=0; x < this.datagrid.cells_x; x++ ) {
			for ( let y=0; y < this.datagrid.cells_y; y++ ) {
				const cell = this.datagrid.CellAt(x*this.datagrid.cellsize, y*this.datagrid.cellsize) ;
				cell.current_x = 0;
				cell.current_y = 0;
				const cell_x = x * gridsize + gridsize * 0.5;
				const cell_y = y * gridsize + gridsize * 0.5;
				for ( let n=0; n < this.whirls.length; n++ ) {
					const diff_x = this.whirls[n].x - cell_x;
					const diff_y = this.whirls[n].y - cell_y;
					const arctan = Math.atan( diff_y / diff_x ) + ( diff_x < 0 ? Math.PI : 0 );
					// const deflection = ( this.whirls[n].pull + utils.RandomFloat(0.3, 0.7) ) / 2; // local jitter
					const deflection = utils.RandomFloat(0.3, 0.7); // local jitter
					const angle = ( arctan + Math.PI * deflection ) % ( Math.PI * 2 );
					const dist = Math.sqrt( diff_x * diff_x + diff_y * diff_y ); 
					cell.current_x += (this.whirls[n].dir ? 1 : -1) * Math.cos(angle) * ( 1 - Math.pow( dist / largest_dim, this.whirls[n].locality ) ) * this.whirls[n].strength;
					cell.current_y += (this.whirls[n].dir ? 1 : -1) * Math.sin(angle) * ( 1 - Math.pow( dist / largest_dim, this.whirls[n].locality ) ) * this.whirls[n].strength;
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
		this.grid = new SpaceGrid(w,h,300);
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
		// return;
		if ( this.bg ) { this.bg.remove(); }
		this.bg = window.two.makeGroup();
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
		// const x_strength = Math.random() * 2 -1;
		// const y_strength = Math.random() * 2 -1;
		// const x_focus = this.width * 0.5; // ( Math.random() * 0.9 + 0.05 );
		// const y_focus = this.height * 0.5; // ( Math.random() * 0.9 + 0.05 );
		// for ( let p of bgpts ) {
		// 	p[0] = utils.SigMap( p[0], 0, this.width, 0, this.width, x_focus, x_strength );
		// 	p[1] = utils.SigMap( p[1], 0, this.height, 0, this.height, y_focus, y_strength );
		// }
		
		let color_schemes = [
			['#352619','#2E1D06','#2E2A1D','#473120','#2c0b04','#492f05','#6c7471','transparent','transparent'
			,'transparent','transparent','transparent','transparent','transparent','transparent'], // shipwreck
			['#352619','#2E1D06','#2E2A1D','#473120','#2c0b04','#492f05'], // mudstone
			['#4b4b48','#4B4E50','#6c7471','transparent','transparent'], // Wavebreak
			['#1C4D44'], // copper oxide
			['#1C4D44','#1C4D44','#1C4D44','#3b4b30','#18270B','#1C4D44','#1C4D44','#1C4D44','#3b4b30','#18270B','#656b5c'], // Serpentine
			['#070808','#4B4E50','#070808','#4B4E50','#070808','#4B4E50','#070808','#4B4E50','#394b57'], // speckled granite
			['#301A30','#4E2237','#2b0a36'], // sunrise
			['#333333','#383533'], // basalt
			['#0a0a0a','#111111','#1a1a1a'], // obsidian
			['#07290C','#001B04','transparent'], // kelpgarden
			['#07290C','#001B04','#0C1F01'], // mossgarden
			['#001C41','#001C41','#00355e','#05080f','#001C41','#001C41','#00355e','#05080f','#004b9b'], // moonlight
			['#081212','#2D1F04','#3A2905','#2D2908','#1F132B','#140C1C','#0F2222','#132C2C'], // crushed grape
			['#09FFFF09','#10FFFF0D','#20FFFF14','2DEEEE2D'],
			['#FFFFFF04','#FFFFFF08','#FFFFFF0C','#FFFFFF10'],
		];
		
		// randomized color schemes 
		for ( let n=0; n < 5; n++ ) {
			const colors = [];
			const num_colors = utils.RandomInt(2,5,3,0.5);
			for ( let c=0; c < num_colors; c++ ){
				const color = utils.RandomColor( true, false, false, true );
				colors.push(color);
			}
			color_schemes.push(colors);
		}
		
		const delaunay = Delaunator.from(bgpts);
		let triangles = delaunay.triangles;
		let bgcolors = color_schemes[ Math.trunc( Math.random() * color_schemes.length ) ];
		for (let i = 0; i < triangles.length; i += 3) {
			let c = bgcolors[ Math.trunc( Math.random() * bgcolors.length ) ]; 
			
			// fades up the tank 
			// const color_variance = 0.05;
			const color_variance = Math.random();
			let center = (bgpts[triangles[i]][1] + bgpts[triangles[i+1]][1] + bgpts[triangles[i+2]][1]) / 3;
			const r = (0.5-(center/this.height)) * color_variance + (Math.random()*color_variance*0.5-0.5); 
			c = utils.adjustColor(c,r);
			
			// random shift
			// const color_variance = 0.2;
			// const r = Math.random() * color_variance;
			// c = utils.adjustColor(c, 2 * r - r); // +/- the amount
			
			let t = window.two.makePath(
				bgpts[triangles[i]][0], 
				bgpts[triangles[i]][1], 
				bgpts[triangles[i+1]][0], 
				bgpts[triangles[i+1]][1], 
				bgpts[triangles[i+2]][0], 
				bgpts[triangles[i+2]][1] 
				);
			t.linewidth = 0;
			t.fill = c;
			t.stroke = 'transparent';
			this.bg.add(t);
		}
		if ( window.vc.bg_opacity ) {	
			if ( window.vc.bg_opacity == 'random' ) {	
				window.vc.bg_opacity = Math.random()
				this.bg.opacity = window.vc.bg_opacity;
			}
			else {
				this.bg.opacity = window.vc.bg_opacity;
			}
		}
		// window.vc.AddShapeToRenderLayer(this.bg, -2);
		window.vc.AddShapeToRenderLayer(this.bg, 'backdrop');
		this.ScaleBackground();
	}
	
	ScaleBackground() {
		if ( this.bg ) { 
			this.bg.scale = 1; // reset to one
			const rect = this.bg.getBoundingClientRect(true);
			// this.bg.scale /= Math.min(  rect.width / this.width, rect.height / this.height );
			this.bg.scale /= Math.min(  rect.width / window.vc.width, rect.height / window.vc.height );
		}
		if ( this.debug_geo ) {			
			this.DrawDebugBoundaryRectangle();
		}
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
				h: max_height,
				force_corners: true,
				complexity: 16,
				color_scheme: 'sandstone'
			}),
		);		
		
	}


}