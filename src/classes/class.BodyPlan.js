import Two from "two.js";
import * as utils from '../util/utils.js'

export default class BodyPlan {

	constructor( dna ) {
		// sane defaults
		this.length = 30; // collision size, must fit inside genomic boundary
		this.width = 20; // collision size, must fit inside genomic boundary
		this.mass = this.length * this.width;
		this.max_length = 30; // genomic boundary
		this.max_width = 20; // genomic boundary
		this.min_length = 30; // genomic boundary
		this.min_width = 20; // genomic boundary
		this.points = [];
		this.linewidth = 2;
		this.stroke = "#AEA";
		this.fill = 'transparent'; // "#AEA";
		this.dashes = [];
		this.curved = false;
		
		// setup
		this.length = dna.biasedRandInt( 0xE3892763, 8,120,25,0.9);
		this.width = dna.biasedRandInt( 0x92640AE4, 8,70,17,0.9);
		this.mass = this.length * this.width;
		this.max_length = this.length * dna.biasedRand( 0x99DF7776, 1,1.5,1.1,0.3);
		this.max_width = this.width * dna.biasedRand( 0x84670788, 1,1.5,1.1,0.3);
		this.min_length = this.length * dna.biasedRand( 0xD204AD99, 0.6,1,0.9,0.3);
		this.min_width = this.width * dna.biasedRand( 0x001D3F8D, 0.6,1,0.9,0.3);
		this.curved = dna.biasedRand( 0x657E00CC, 0, 1, 0.5, 0.1 ) > 0.7; // once a pointy, always a pointy
		if ( dna.biasedRand( 0x16DB6814, 0,1,0.4,0.1) > 0.92 ) {
			this.dashes = [];
			this.dashes.push( dna.biasedRandInt( 0x813871F3, 0,10, 4, 0.5) );
			this.dashes.push( dna.biasedRandInt( 0x0B92214C, 0,10, 4, 0.5) );	
		}
		
		// colors
		// TODO: we want to guarantee bright colors on all lines and fill-only's 
		const colors = [
			'#' + Math.trunc( dna.shapedNumber( [0x91E44CB, 0xA925A5B, 0x578F286], 0, 0xFFFFFF) ).toString(16).padStart(6,0), // line
			'#' + Math.trunc( dna.shapedNumber( [0x824E854, 0xCDC44DF, 0x6879812], 0, 0xFFFFFF) ).toString(16).padStart(6,0), // fill
			'#' + Math.trunc( dna.shapedNumber( [0x033C2CB, 0xE103B1F, 0x8C6D170], 0, 0xFFFFFF) ).toString(16).padStart(6,0), // TBD
			'#' + Math.trunc( dna.shapedNumber( [0xE49A196, 0x39A2170, 0x0E5F975], 0, 0xFFFFFF) ).toString(16).padStart(6,0), // TBD
			'#' + Math.trunc( dna.shapedNumber( [0x05A9F17, 0x799193E, 0x4850BE7], 0, 0xFFFFFF) ).toString(16).padStart(6,0), // TBD
		];

		// chance for transparency
		if ( dna.biasedRand( 0x5B962440, 0, 1, 0.5, 0.5) > 0.65 ) {
			// one or the other but not both
			const i = ( dna.biasedRand( 0xB789477E, 0, 1, 0.5, 0.5) > 0.5 ) ? 1 : 0;
			colors[i] = 'transparent';
		}
		this.linewidth = dna.biasedRandInt( 0x61406630, 2,8,2,0.8);
		this.stroke = colors[0];
		this.fill = colors[1]==='transparent' ? colors[1] : `${colors[1]}AA`;
			
		const MakeGradient = (label, req_color, transp='FF') => {
			const stops = [ new Two.Stop(0, req_color+transp), new Two.Stop(1, req_color+transp) ];
			const num_stops = dna.biasedRandInt(dna.geneFor(`${label} gradient num_stops`), 0, 5, 1, 1);
			for ( let n=0; n < num_stops; n++ ) {
				const pct = dna.biasedRand( dna.geneFor(`${label} gradient stop pct n`) );
				const index = dna.biasedRandInt(dna.geneFor(`${label} gradient stop index n`), 0, colors.length-1);
				stops.push( new Two.Stop(pct, colors[index]+transp));
			}
			stops.sort( (a,b) => a.offset - b.offset );
			const longest_dim = Math.max(this.width,this.length);
			let xoff = dna.biasedRand( dna.geneFor(`${label} gradient xoff`), -this.length/2, this.length/2 );
			let yoff = 0;
			let radius = dna.biasedRand( dna.geneFor(`${label} gradient radius`), longest_dim/10, longest_dim, longest_dim, 0.8 );
			const gtype = dna.biasedRand( dna.geneFor(`${label} gradient type`) ) < 0.4 ? 'linear' : 'radial';
			const flip = dna.biasedRand( dna.geneFor(`${label} gradient axis flip`) ) < 0.33;
			let grad = null;
			if ( gtype == 'radial' ) {
				grad = window.two.makeRadialGradient(xoff, yoff, radius, ...stops );
			}
			else {
				let xoff2 = xoff+radius;
				let yoff2 = 0;
				// random axis flip
				if ( flip ) {
					yoff = 0;
					yoff2 = radius;
					xoff = 0;
					xoff2 = 0;
				}
				grad = window.two.makeLinearGradient(xoff, yoff, xoff2, yoff2, ...stops );
			}
			grad.units = 'userSpaceOnUse'; // super important
			const spreadNum = dna.biasedRand( dna.geneFor(`${label} gradient repeat`) );
			grad.spread = (spreadNum > 0.66) ? 'pad' : ( spreadNum > 0.33 ? 'reflect' : 'repeat' );	
			if ( flip ) { grad.spread = 'reflect'; }	
			return grad;
		};
		
		// chance for gradients
		if ( colors[0] !== 'transparent' && dna.shapedNumber( [0xE6062539, 0xAF88FAD4], 0, 1, 0.5, 0.5) > 0.65 ) {
			this.stroke = MakeGradient('stroke',colors[0]);
		}
		if ( colors[1] !== 'transparent' && dna.shapedNumber( [0x2712267A, 0xAF77DEAD], 0, 1, 0.5, 0.5) > 0.65 ) {
			this.fill = MakeGradient('fill',colors[1],'BB');
		}
		
		// average the first two color indexes to get a unified color we can use for vision calculations
		this.sensor_colors = [0,0,0];
		for ( let i=0; i < 2; i++ ) {
			if ( colors[i] !== 'transparent' ) {
				const c = utils.HexColorToRGBArray(colors[i]);
				for ( let color_index=0; color_index < 3; color_index++ ) {
					this.sensor_colors[color_index] += c[color_index];
				}
			}
		}
		const sensor_color_divisor = ( colors[0] === 'transparent' || colors[1] === 'transparent' ) ? 1 : 2;
		this.sensor_colors = this.sensor_colors.map( c => Math.round(c/sensor_color_divisor) );
		
		// path points
		let pts = []; 
		for ( let n=0; n < 7; n++ ) {
			// first point is guaranteed. everything else has random chance to shoot a blank
			if ( n > 0 ) {
				const blank = dna.shapedNumber( [dna.geneFor(`body point ${n} blank`)], 0, 1 );
				if ( blank < 0.75 ) { continue; }
			}
			const geneX1A = dna.geneFor(`body point ${n} x 1 A`, false, true);
			const geneX2A = dna.geneFor(`body point ${n} x 2 A`);
			const geneY1A = dna.geneFor(`body point ${n} y 1 A`, false, true);
			const geneY2A = dna.geneFor(`body point ${n} y 2 A`);
			const geneX1B = dna.geneFor(`body point ${n} x 1 B`, false, true);
			const geneX2B = dna.geneFor(`body point ${n} x 2 B`);
			const geneY1B = dna.geneFor(`body point ${n} y 1 B`, false, true);
			const geneY2B = dna.geneFor(`body point ${n} y 2 B`);
			let x1 = dna.shapedNumber( [geneX1A, geneX1B], -this.length/2, this.length/2 );
			let x2 = 0.25 * dna.shapedNumber( [geneX2A, geneX2B], -this.length/2, this.length/2 );
			let px = x1 + x2;
			let y1 = dna.shapedNumber( [geneY1A, geneY1B], 0, this.width/2 );
			let y2 = dna.shapedNumber( [geneY2A, geneY2B], 0, this.width/2 );
			let py = y1 + y2;
			pts.push([px,py]);
		}
		// sorting gives a cleaner look which is sometimes wanted, but not always
		if ( dna.shapedNumber( [0x0F430043], 0, 1 ) > 0.7 ) { pts.sort( (a,b) => b[0] - a[0] ); }
		// make complimentary points on other side of body
		let new_pts = pts.map( p => [ p[0], -p[1] ] );
		// random chance for extra point in the back
		if ( dna.shapedNumber( [0x0F600017], 0, 1 ) > 0.5 ) { 
			const x = dna.shapedNumber( [0x0F998877,0xA8808513], -this.length/2, 0 )
			new_pts.push( [ x, 0] );
		}
		pts.push( ...new_pts.reverse() );
		// standard forward nose point required for all body plans
		pts.unshift( [this.length/2, 0] );
		this.points = pts;
		
		this.RescaleShape();		
		this.UpdateGeometry();
	}
	
	OppositePoint(i, num_points) {
		return i==0 ? 0 : (num_points - i);
	}
		
	UpdateGeometry() {
		if ( this.points ) {
			// recenter the vertices
			let minx = null; // do not start at zero!
			let maxx = null; // do not start at zero!
			let miny = null; // do not start at zero!
			let maxy = null; // do not start at zero!
			for ( let p of this.points ) {
				minx = Math.min( p[0], minx ?? p[0] );
				maxx = Math.max( p[0], maxx ?? p[0] );
				miny = Math.min( p[1], miny ?? p[1] );
				maxy = Math.max( p[1], maxy ?? p[1] );
			}
			let w = Math.abs(maxx - minx);
			let h = Math.abs(maxy - miny);
			let x_adj = -w*0.5 - minx;
			let y_adj = -h*0.5 - miny;
			for ( let p of this.points ) {
				p[0] += x_adj;
				p[1] += y_adj;
			}
			// build the shape
			let anchors = this.points.map( p => new Two.Anchor( p[0], p[1] ) );
			if ( !this.geo ) { 
				this.geo = window.two.makePath(anchors);
			}
			else {
				// technical: two.js has update hooks connected to splice function
				this.geo.vertices.splice(0, this.geo.vertices.length, ...anchors);
			}
			this.geo.linewidth = this.linewidth;
			this.geo.stroke = this.stroke;
			this.geo.fill = this.fill;
			this.geo.curved = this.curved;
			this.geo.dashes = this.dashes;
		}
	}
	
	ShapeWidth() {
		let min = null; // do not start at zero!
		let max = null; // do not start at zero!
		for ( let p of this.points ) {
			min = Math.min( p[0], min ?? p[0] );
			max = Math.max( p[0], max ?? p[0] );
		}
		return Math.abs(max - min);
	}
	
	ShapeHeight() {
		let min = null; // do not start at zero!
		let max = null; // do not start at zero!
		for ( let p of this.points ) {
			min = Math.min( p[1], min ?? p[1] );
			max = Math.max( p[1], max ?? p[1] );
		}
		return Math.abs(max - min);
	}
	
	RescaleShape() {
		let shape_w = this.ShapeWidth();
		let shape_h = this.ShapeHeight();
		// scale up to fill the box
		let xscale = 1;
		let yscale = 1;
		if ( shape_w > this.max_length ) { xscale = this.max_length / shape_w; }
		else if ( shape_w < this.min_length ) { xscale = this.min_length / shape_w; }
		if ( shape_h > this.max_width ) { yscale = this.max_width / shape_h; }
		else if ( shape_h < this.min_width ) { yscale = this.min_width / shape_h; }
		if ( xscale !== 1 || yscale !== 1 ) {
			for ( let p of this.points ) {
				p[0] *= xscale;
				p[1] *= yscale;
			}
		}
		this.width = this.ShapeHeight(); // terminology mismatch, but actually correct
		this.length = this.ShapeWidth();
		this.mass = this.length * this.width;
	}
}		
