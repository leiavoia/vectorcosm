import Two from "two.js";
import Delaunator from 'delaunator';
import * as utils from '../util/utils.js'
import SpaceGrid from '../classes/class.SpaceGrid.js'

export default class Tank {

	constructor( w, h ) {
		this.width = w;
		this.height = h;
		this.scale_to_window = 1; // helpful for UI
		this.responsive = true; // snap to window size on resize events
		this.viscosity = 0.5;
		this.boids = [];
		this.foods = [];
		this.threats = [];
		this.grid = new SpaceGrid(w,h,200);
	}
	
	Resize(w,h) {
		this.width = w;
		this.height = h;
		this.grid = new SpaceGrid(w,h,200);
		this.ScaleBackground();
	}
	
	// background layer
	MakeBackground() {
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
		// let randscale = Math.cbrt( Math.random() * 99 + 1 ); // TODO: weighted random
		// let xory = Math.random() > 0.5;
		// this.bg.scale = new Two.Vector( xory ? randscale : 1.5, xory ? 1.5 : randscale );
		window.vc.AddShapeToRenderLayer(this.bg, -2);
		this.ScaleBackground();
	}
	
	ScaleBackground() {
		// scale the background until it covers the scene - should look static
		this.bg.scale = 1; // reset to one
		const rect = this.bg.getBoundingClientRect(true);
		const to_scale = 1 / Math.min(  rect.width / this.width, rect.height / this.height );
		this.bg.scale = to_scale;
	}


}