import Two from "two.js";
import * as utils from '../util/utils.js'

export default class BodyPlan {

	constructor( points ) {
		// param is actually JSON to rehydrate
		if ( typeof points === 'object' && 'points' in points ) {
			Object.assign(this,points);
		}
		else {
			this.length = 30; // collision size, must fit inside genomic boundary
			this.width = 20; // collision size, must fit inside genomic boundary
			this.max_length = 30; // genomic boundary
			this.max_width = 20; // genomic boundary
			this.min_length = 30; // genomic boundary
			this.min_width = 20; // genomic boundary
			this.points = points;
			this.linewidth = 2;
			this.stroke = "#AEA";
			this.fill = 'transparent'; // "#AEA";
			this.dashes = [];
			this.complexity_factor = 0.3; // 0..1
			this.max_jitter_pct = 0.1; // max deviation percentage from current width/height
			this.augmentation_pct = 0.1; // chance of adding and removing points
			this.curved = false;
		}
		this.UpdateGeometry();
	}
	
	Copy() {
		let bp = new BodyPlan( this.points.map( x => [ x[0], x[1] ] ) );
		bp.length = this.length;
		bp.width = this.width;		
		bp.max_length = this.max_length;
		bp.max_width = this.max_width;		
		bp.min_length = this.min_length;
		bp.min_width = this.min_width;		
		bp.linewidth = this.linewidth;
		bp.stroke = this.stroke;
		bp.fill = this.fill;
		bp.dashes = this.dashes;
		bp.complexity_factor = this.complexity_factor;
		bp.max_jitter_pct = this.max_jitter_pct;
		bp.augmentation_pct = this.augmentation_pct;
		bp.curved = this.curved;
		bp.UpdateGeometry();
		return bp;
	}
	
	RandomizePoints() {
		let num_extra_pts = Math.ceil( this.complexity_factor * 5 );
		let pts = []; 
		for ( let n=0; n < num_extra_pts; n++ ) {
			let px = utils.RandomFloat( -this.length/2, this.length/2 );
			let py = utils.RandomFloat( 0 /* -this.width/8 */, this.width/2 );
			pts.push([px,py]);
		}
		// sorting gives a cleaner look which is sometimes wanted, but not always
		if ( Math.random() > 0.7 ) { pts.sort( (a,b) => b[0] - a[0] ); }
		// make complimentary points on other side of body
		let new_pts = pts.map( p => [ p[0], -p[1] ] );
		// random chance for extra point in the back
		if ( Math.random() > 0.5 ) { 
			new_pts.push( [ utils.RandomFloat( -this.length/2, 0 ), 0] );
		}
		pts.push( ...new_pts.reverse() );
		// standard forward nose point required for all body plans
		pts.unshift( [this.length/2, 0] );
		this.points = pts;
		this.RescaleShape();
		this.UpdateGeometry();
	}
	
	// 0..1, basically corresponds to num_points = complexity * 20
	static Random( complexity=null ) {
		// setup
		let bp = new BodyPlan();
		complexity = utils.Clamp( complexity||Math.random(), 0, 1 );
		bp.complexity_factor = utils.Clamp( complexity||0.1, 0, 1 );
		bp.length = utils.BiasedRandInt(8,100,20,0.9);
		bp.width = utils.BiasedRandInt(8,60,14,0.9);
		bp.max_length = bp.length * utils.BiasedRand(1,1.5,1.1,0.3);
		bp.max_width = bp.width * utils.BiasedRand(1,1.5,1.1,0.3);
		bp.min_length = bp.length * utils.BiasedRand(0.6,1,0.9,0.3);
		bp.min_width = bp.width * utils.BiasedRand(0.6,1,0.9,0.3);
		bp.max_jitter_pct = utils.BiasedRand(0,0.2,0.05,0.8);
		bp.augmentation_pct = utils.BiasedRand(0,0.04,0.01,0.9);
		bp.curved = Math.random() > 0.7;
		if ( Math.random() > 0.92 ) {
			bp.dashes = [];
			let num_dashes = utils.RandomInt(2,7);
			for ( let n=0; n < num_dashes; n++ ) {
				bp.dashes.push( utils.RandomInt(0,10) );
			}		
		}
		
		// colors
		const color_roll = Math.random();
		if ( color_roll < 0.33 ) { // just line
			bp.linewidth = Math.random() > 0.5 ? utils.BiasedRandInt(2,8,2,0.8) : 2;
			bp.stroke = utils.RandomColor( true, false, true );
			bp.fill = 'transparent';
		}
		else if ( color_roll > 0.67 ) { // just fill
			bp.linewidth = 0;
			bp.stroke = 'transparent';
			bp.fill =  utils.RandomColor( true, false, true ) + 'AA';
		}
		else { // line and fill
			bp.linewidth = Math.random() > 0.5 ? utils.BiasedRandInt(2,8,2,0.8) : 2;
			bp.stroke = utils.RandomColor( true, false, true );
			bp.fill =  utils.RandomColor( true, false, false ) + 'AA'; // don't need bright interiors if we also have line
		}
		
		// let stops = [ new Two.Stop(0, '#000'), new Two.Stop(1, '#FFF') ];
		// bp.stroke = window.two.makeRadialGradient(0, 0, 30, ...stops );
		// bp.stroke.units = 'userSpaceOnUse'; // super important
		
		// points
		bp.RandomizePoints(); // includes update
		
		return bp;
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
	
	JitterPoints() {
		let i1 = this.PickJitterPoint();
		let i2 = this.OppositePoint(i1,this.points.length);
		let max_jitter_dist = Math.max( this.ShapeWidth(), this.ShapeHeight() );
		let jitter_dist = max_jitter_dist * this.max_jitter_pct * Math.random();
		let angle = utils.RandomFloat(0,Math.PI*2);
		let jitter_x = Math.cos(angle) * jitter_dist;
		let jitter_y = Math.sin(angle) * jitter_dist;
		this.points[i1][0] += jitter_x;
		// maintain symmetry on reflected nodes
		if ( i1 != i2 ) {
			this.points[i1][1] += jitter_y;
			this.points[i2][0] += jitter_x;
			this.points[i2][1] += -jitter_y;
		}
	}

	PickJitterPoint() {
		return utils.RandomInt(0, Math.trunc((this.points.length)/2));
	}
	
	OppositePoint(i, num_points) {
		return i==0 ? 0 : (num_points - i);
	}
	
	SplitSegments() {
		let i1 = this.PickJitterPoint();
		// we can't start on the center point of odd-numbers collections
		if ( i1 == this.points.length/2 ) { i1--; }
		let i2 = i1 + 1;
		// split first segment
		let p1x = this.points[i1][0]; 
		let p1y = this.points[i1][1]; 
		let p2x = this.points[i2][0]; 
		let p2y = this.points[i2][1]; 
		let p3x = (p2x + p1x)/2;
		let p3y = (p2y + p1y)/2;
		// maintain symmetry on two opposing segments
		if ( i2 <= this.points.length/2 ) {
			let i3 = this.OppositePoint(i2, this.points.length);
			let i4 = this.OppositePoint(i1, this.points.length);
			let p4x = this.points[i3][0]; 
			let p4y = this.points[i3][1]; 
			let p5x = this.points[i4][0]; 
			let p5y = this.points[i4][1]; 
			let p6x = (p5x + p4x)/2;
			let p6y = (p5y + p4y)/2;
			this.points.splice( i3+1, 0, [p6x,p6y]); // insert second point
		}
		this.points.splice( i1+1, 0, [p3x,p3y]); // insert first point
	}

	Mutate() {
		let x = Math.random();
		let jitter_chance = 1 - this.augmentation_pct;
		let delete_chance = this.augmentation_pct * (this.points.length / (this.complexity_factor*20)) * 0.5; // magic numbers for balance
		if ( x < delete_chance ) {
			this.DeletePoints();	
		}
		else if ( x < this.augmentation_pct ) {
			this.SplitSegments();
		}
		else {
			this.JitterPoints();	
		}
		// Rescaling on mutation keeps the organism within a safe bounding box.
		// Remove this if you want to let nature take its course (and spiral out of control).
		// random chance to alter genomic shape
		this.max_length *= 1 + 0.01 * Math.random();
		this.max_width *= 1 + 0.01 * Math.random();
		this.min_length *= 1 + 0.01 * Math.random();
		this.min_width *= 1 + 0.01 * Math.random();
		this.max_length = utils.Clamp( this.max_length, this.min_length, 300 ); // sanity
		this.max_width = utils.Clamp( this.max_width, this.min_width, 300 );		
		this.min_length = utils.Clamp( this.min_length, 5, this.max_length );
		this.min_width = utils.Clamp( this.min_width, 5, this.max_width );	
		this.RescaleShape();
		this.UpdateGeometry();
	}
	
	DeletePoints() {
		if ( this.points.length <= 4 ) { return; }
		let i1 = this.PickJitterPoint();
		if ( i1===0 ) { i1++; } // weird stuff happens when you delete the zero
		let i2 = this.OppositePoint(i1,this.points.length);
		if ( i1 != i2 ) { this.points.splice( i2, 1 ); }
		this.points.splice( i1, 1 );
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
		let maxscalex = this.max_length / shape_w; // be careful - not a typo
		let maxscaley = this.max_width / shape_h; 
		let minscalex = this.min_length / shape_w;
		let minscaley = this.min_width / shape_h;
		
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
	}
}		
