import Two from "two.js";
import * as utils from '../util/utils.js'

export default class BodyPlan {

	constructor( points ) {
		this.points = points;
		this.linewidth = 2;
		this.stroke = "#AEA";
		this.fill = 'transparent'; // "#AEA";
		this.complexity_factor = 0.3; // 0..1
		this.max_jitter_pct = 0.1; // max deviation percentage from current width/height
		this.augmentation_pct = 0.1; // chance of adding and removing points
		this.UpdateGeometry();
	}
	
	Copy() {
		let bp = new BodyPlan( this.points.map( x => [ x[0], x[1] ] ) );
		bp.linewidth = this.linewidth;
		bp.stroke = this.stroke;
		bp.fill = this.fill;
		bp.complexity_factor = this.complexity_factor;
		bp.max_jitter_pct = this.max_jitter_pct;
		bp.UpdateGeometry();
		return bp;
	}
	
	UpdateGeometry() {
		if ( this.points ) {
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
			this.geo.center(); // not sure if this does anything useful
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
		this.RescaleShape(30, 30); // TODO: EXTERNALIZE
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
	
	RescaleShape(maxw, maxh) {
		let scalex = maxw / this.ShapeWidth();
		let scaley = maxh / this.ShapeHeight();
		// scale up to fill the box
		let scale = Math.min(scaley,scalex);
		// if either scale is overflowing the max, scale both down
		if ( scalex < 1 || scaley < 1 ) {
			scale = Math.min(scaley,scalex);
		}
		for ( let p of this.points ) {
			p[0] *= scale;
			p[1] *= scale;
		}
	}
}		
