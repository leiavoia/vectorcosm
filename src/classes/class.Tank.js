import Two from "two.js";
import Delaunator from 'delaunator';
import * as utils from '../util/utils.js'
import SpaceGrid from '../classes/class.SpaceGrid.js'
import DataGrid from '../classes/class.DataGrid.js'

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
		this.grid = new SpaceGrid(w,h,300);
		this.CreateDataGrid(w,h);
		// this.CreateDebugBoundaryRectangle();
	}
	
	CreateDataGrid(w,h) {
		const gridsize = 300;
		this.datagrid = new DataGrid(w,h,gridsize);
		const center_x = w * 0.5;
		const center_y = h * 0.5;
		const current_base_strength = 500;
		for ( let x=0; x < w; x += gridsize ) {
			for ( let y=0; y < h; y += gridsize ) {
				const cell = this.datagrid.CellAt(x,y);
				const cell_x = x + gridsize * 0.5;
				const cell_y = y + gridsize * 0.5;
				const diff_x = center_x - cell_x;
				const diff_y = center_y - cell_y;
				const arctan = Math.atan( diff_y / diff_x ) + ( diff_x < 0 ? Math.PI : 0 );
				// note: use 0.5 for a perfectly circular current. Use 0.5..1.0 for a whirlpool effect.
				const angle = ( arctan + Math.PI * 0.52 ) % ( Math.PI * 2 );
				const dist = Math.sqrt( diff_x * diff_x + diff_y * diff_y ); 
				const turbulence = Math.random();
				const dist_pow_scaler = 0.35;
				cell.current_x = Math.cos(angle) * Math.pow( dist / (w*0.5), dist_pow_scaler ) * current_base_strength * utils.RandomFloat( 1-turbulence, 1+turbulence);
				cell.current_y = Math.sin(angle) * Math.pow( dist / (h*0.5), dist_pow_scaler ) * current_base_strength * utils.RandomFloat( 1-turbulence, 1+turbulence);
			}
		}
		// console.log(this.datagrid);
	}
	
	Resize(w,h) {
		this.width = w;
		this.height = h;
		this.grid = new SpaceGrid(w,h,300);
		this.CreateDataGrid(w,h);
		this.ScaleBackground();
		// this.CreateDebugBoundaryRectangle();
	}
	
	CreateDebugBoundaryRectangle() {
		if ( this.debug_rect ) {
			this.debug_rect.remove();
			delete this.debug_rect;
		}
		this.debug_rect = window.two.makeRectangle(this.width/2, this.height/2, this.width, this.height );
		this.debug_rect.stroke = "orange";
		this.debug_rect.linewidth = '2';
		this.debug_rect.fill = 'transparent';		
		window.vc.AddShapeToRenderLayer(this.debug_rect, -2);	
	}
	
	// background layer
	MakeBackground() {
		if ( this.bg ) { this.bg.remove(); }
		this.bg = window.two.makeGroup();
		// return;
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

		let color_schemes = [
			['#352619','#2E1D06','#2E2A1D','#473120','#2c0b04','#492f05','#6c7471','transparent','transparent'
			,'transparent','transparent','transparent','transparent','transparent','transparent'], // shipwreck
			['#352619','#2E1D06','#2E2A1D','#473120','#2c0b04','#492f05'], // mudstone
			['#4b4b48','#4B4E50','#6c7471','transparent','transparent'], // Wavebreak
			['#1C4D44'], // copper oxide
			['#1C4D44','#1C4D44','#1C4D44','#3b4b30','#18270B','#1C4D44','#1C4D44','#1C4D44','#3b4b30','#18270B','#656b5c'], // Serpentine
			['#070808','#4B4E50','#070808','#4B4E50','#070808','#4B4E50','#070808','#4B4E50','#9ba1a5'], // speckled granite
			['#301A30','#4E2237','#2b0a36'], // sunrise
			['#333333','#383533'], // basalt
			['#0a0a0a','#111111','#1a1a1a'], // obsidian
			['#07290C','#001B04','transparent'], // kelpgarden
			['#07290C','#001B04','#0C1F01'], // mossgarden
			['#001C41','#001C41','#00355e','#05080f','#001C41','#001C41','#00355e','#05080f','#004b9b'], // moonlight
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
			const color_variance = 0.9;
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
			t.linewidth = 1;
			t.fill = c;
			t.stroke = c;
			this.bg.add(t);
		}		
		// this.bg.add( bounds );		
		// let randscale = Math.cbrt( Math.random() * 99 + 1 ); // TODO: weighted random
		// let xory = Math.random() > 0.5;
		// this.bg.scale = new Two.Vector( xory ? randscale : 1.5, xory ? 1.5 : randscale );
		window.vc.AddShapeToRenderLayer(this.bg, -2);
		this.ScaleBackground();
	}
	
	ScaleBackground() {
		// return;
		// scale the background until it covers the scene - should look static
		this.bg.scale = 1; // reset to one
		const rect = this.bg.getBoundingClientRect(true);
		const to_scale = 1 / Math.min(  rect.width / this.width, rect.height / this.height );
		this.bg.scale = to_scale;
	}


}