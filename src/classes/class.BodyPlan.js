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
		this.length = dna.shapedInt( dna.genesFor('body length',3,2), 8,120,25,3);
		this.width = dna.shapedInt( dna.genesFor('body width',3,2), 8,70,17,3);
		this.mass = this.length * this.width;
		this.max_length = this.length * dna.shapedNumber( dna.genesFor('max_length',2,true), 1,1.5,1.1,1.4);
		this.max_width = this.width * dna.shapedNumber( dna.genesFor('body max_width',2,true), 1,1.5,1.1,1.4);
		this.min_length = this.length * dna.shapedNumber( dna.genesFor('body min_length',2,true), 0.6,1,0.9,1.4);
		this.min_width = this.width * dna.shapedNumber( dna.genesFor('body min_width',2,true), 0.6,1,0.9,1.4);
		this.curved = dna.shapedNumber( dna.genesFor('body curved',2,true), 0, 1, 0.5, 1.5 ) > 0.7; // once a pointy, always a pointy
		if ( dna.shapedNumber( dna.genesFor('has dashes',2,1), 0,1,0.4,1.3) > 0.92 ) {
			this.dashes = [];
			this.dashes.push( dna.shapedInt( dna.genesFor('body dashes 1 ',2,1), 0, 10, 4, 2) );
			this.dashes.push( dna.shapedInt( dna.genesFor('body dashes 2 ',2,1), 0, 10, 4, 2) );	
		}
		
		// colors
		const colors = [
			'#' + Math.trunc( dna.shapedNumber( dna.genesFor(`color ${1}`,3,2), 0, 0xFFFFFF) ).toString(16).padStart(6,'0'), // line
			'#' + Math.trunc( dna.shapedNumber( dna.genesFor(`color ${2}`,3,2), 0, 0xFFFFFF) ).toString(16).padStart(6,'0'), // fill
			'#' + Math.trunc( dna.shapedNumber( dna.genesFor(`color ${3}`,3,1), 0, 0xFFFFFF) ).toString(16).padStart(6,'0'), // TBD
			'#' + Math.trunc( dna.shapedNumber( dna.genesFor(`color ${4}`,3,1), 0, 0xFFFFFF) ).toString(16).padStart(6,'0'), // TBD
			'#' + Math.trunc( dna.shapedNumber( dna.genesFor(`color ${5}`,3,1), 0, 0xFFFFFF) ).toString(16).padStart(6,'0'), // TBD
		];

		// chance for transparency
		if ( dna.shapedNumber( dna.genesFor('transparency',2,1), 0, 1 ) > 0.75 ) {
			// one or the other but not both
			const i = ( dna.shapedNumber( dna.genesFor('transparency flip',2,true), 0, 1 ) > 0.5 ) ? 1 : 0;
			colors[i] = 'transparent';
		}
		this.linewidth = dna.shapedInt( dna.genesFor('line-width'), 2, 12, 2, 2.5 );
		this.stroke = colors[0];
		this.fill = colors[1]==='transparent' ? colors[1] : `${colors[1]}AA`;
			
		const MakeGradient = (label, req_color, transp='FF') => {
			const stops = [ [0, req_color+transp], [1, req_color+transp] ];
			const num_stops = dna.shapedInt(dna.genesFor(`${label} gradient num_stops`), 0, 5, 1, 3);
			for ( let n=0; n < num_stops; n++ ) {
				const pct = dna.shapedNumber( dna.genesFor(`${label} gradient stop pct n`) );
				const index = dna.shapedInt(dna.genesFor(`${label} gradient stop index n`), 0, colors.length-1);
				stops.push( [pct, colors[index]+transp] );
			}
			stops.sort( (a,b) => a[0] - b[0] );
			
			const longest_dim = Math.max(this.width,this.length);
			let xoff = dna.shapedNumber( dna.genesFor(`${label} gradient xoff`), -this.length/2, this.length/2 );
			let yoff = 0;
			let radius = dna.shapedNumber( dna.genesFor(`${label} gradient radius`), longest_dim/10, longest_dim, longest_dim, 2.5 );
			const gtype = dna.shapedNumber( dna.genesFor(`${label} gradient type`) ) < 0.4 ? 'linear' : 'radial';
			const flip = dna.shapedNumber( dna.genesFor(`${label} gradient axis flip`) ) < 0.33;
			let grad = {type:'radial', xoff, yoff, radius, stops, units:'userSpaceOnUse' };
			const spreadNum = dna.shapedNumber( dna.genesFor(`${label} gradient repeat`) );
			grad.spread = (spreadNum > 0.66) ? 'pad' : ( spreadNum > 0.33 ? 'reflect' : 'repeat' );	
			if ( flip ) { grad.spread = 'reflect'; }	
			if ( gtype != 'radial' ) {
				let xoff2 = xoff+radius;
				let yoff2 = 0;
				// random axis flip
				if ( flip ) {
					yoff = 0;
					yoff2 = radius;
					xoff = 0;
					xoff2 = 0;
				}
				grad.type = 'linear';
				grad.xoff = xoff;
				grad.yoff = yoff;
				grad.xoff2 = xoff2;
				grad.yoff2 = yoff2;
			}
			return grad;
		};
		
		// chance for gradients
		if ( colors[0] !== 'transparent' && dna.shapedNumber( dna.genesFor('grad chance stroke',2,1), 0, 1) > 0.65 ) {
			this.stroke = MakeGradient('stroke',colors[0]);
		}
		if ( colors[1] !== 'transparent' && dna.shapedNumber( dna.genesFor('grad chance fill',2,1), 0, 1) > 0.65 ) {
			this.fill = MakeGradient('fill',colors[1],'BB');
		}
		
		// average the first two color indexes to get a unified color we can use for vision calculations
		this.sensor_colors = [0,0,0];
		for ( let i=0; i < 2; i++ ) {
			if ( colors[i] !== 'transparent' ) {
				const c = utils.HexColorToRGBArray(colors[i]);
				for ( let color_index=0; color_index < 3; color_index++ ) {
					this.sensor_colors[color_index] += c[color_index] / 256;
				}
			}
		}
		const sensor_color_divisor = ( colors[0] === 'transparent' || colors[1] === 'transparent' ) ? 1 : 2;
		this.sensor_colors = this.sensor_colors.map( c => c/sensor_color_divisor );
		
		// path points
		let pts = []; 
		let max_num_points = 22;
		for ( let n=1; n <= max_num_points; n++ ) {
			// first point is guaranteed. everything else has random chance to shoot a blank
			const roll = dna.shapedNumber( dna.genesFor(`body point ${n} blank`), 0, 1 );
			const gotcha = roll <= 1/n; // guaranteed first point
			if ( !gotcha ) { continue; }
			if ( n===1 && roll < 0.005 ) { max_num_points = 200; } // rare chance for a real wingding
			const gX1 = dna.genesFor(`body point ${n} x1`, 2, 1);
			const gX2 = dna.genesFor(`body point ${n} x2`, 2, 1);
			const gY1 = dna.genesFor(`body point ${n} y1`, 2, 1);
			const gY2 = dna.genesFor(`body point ${n} y2`, 2, 1);
			let x1 = dna.shapedNumber( gX1, -this.length/2, this.length/2 );
			let x2 = 0.25 * dna.shapedNumber( gX2, -this.length/2, this.length/2 );
			let px = x1 + x2;
			let y1 = dna.shapedNumber( gY1, 0, this.width/2 );
			let y2 = dna.shapedNumber( gY2, 0, this.width/2 );
			let py = y1 + y2;
			pts.push([px,py]);
		}

		// sorting gives a cleaner look which is sometimes wanted, but not always
		if ( dna.shapedNumber( dna.genesFor('sort points',2,true), 0, 1 ) > 0.7 ) { pts.sort( (a,b) => b[0] - a[0] ); }
		// make complimentary points on other side of body
		let new_pts = pts.map( p => [ p[0], -p[1] ] );
		// random chance for extra point in the back
		if ( dna.shapedNumber( dna.genesFor('has butt point',1,true), 0, 1 ) > 0.5 ) { 
			const x = dna.shapedNumber( dna.genesFor('butt point x',2), -this.length/2, 0 )
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
			// // build the shape
			// let anchors = this.points.map( p => new Two.Anchor( p[0], p[1] ) );
			// if ( !this.geo ) { 
			// 	this.geo = globalThis.two.makePath(anchors);
			// }
			// else {
			// 	// technical: two.js has update hooks connected to splice function
			// 	this.geo.vertices.splice(0, this.geo.vertices.length, ...anchors);
			// }
			
			// // Vector style
			// if ( globalThis.vc.render_style == 'Vector' ) {
			// 	// vectrex mode
			// 	this.geo.linewidth = 2;
			// 	this.geo.stroke = '#6cf';
			// 	this.geo.fill = 'transparent';
			// }
			// // Zen white
			// else if ( globalThis.vc.render_style == 'Zen' ) {
			// 	// vectrex mode
			// 	this.geo.linewidth = 2;
			// 	this.geo.stroke = '#000';
			// 	this.geo.fill = 'transparent';
			// }
			// // Grey
			// // else if ( globalThis.vc.render_style == 'Grey' ) {
			// // 	// vectrex mode
			// // 	this.geo.linewidth = 2;
			// // 	this.geo.stroke = '#FFF';
			// // 	this.geo.fill = 'transparent';
			// // }
			// // Natural style
			// else {
			// 	this.geo.linewidth = this.linewidth;
			// 	this.geo.stroke = this.stroke;
			// 	this.geo.fill = this.fill;
			// 	this.geo.curved = this.curved;
			// 	this.geo.dashes = this.dashes;
			// }
			
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
